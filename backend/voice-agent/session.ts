/**
 * LiveKit AI Voice Agent - Voice Session Controller
 * Manages the full conversational lifecycle for a single LiveKit room:
 * User Audio -> STT -> LLM with CentralToolManager -> TTS -> Room Audio Output
 * Handles barge-in / interruptions, state transitions, and PostgreSQL persistence.
 */

import crypto from "crypto";
import { providerManager, AIChatMessage, AIProvider } from "../services/ai/index.js";
import { transcribeAudioWithSarvam } from "../services/speech.js";
import { generateSpeechWithOpenAI } from "../services/tts.js";
import { voiceToolManager } from "./tools.js";
import { createMessage, getMessages } from "../services/database.js";
import { apiKeyManager } from "../services/apiKeys.js";

export type LiveKitVoiceState =
  | "IDLE"
  | "CONNECTING"
  | "LISTENING"
  | "PROCESSING"
  | "THINKING"
  | "SPEAKING"
  | "INTERRUPTED"
  | "DISCONNECTED"
  | "ERROR";

export interface VoiceSessionContext {
  userId: string | null;
  conversationId: string;
  roomName: string;
  aiMode?: string;
  selectedProvider?: string;
  selectedModel?: string;
  fridayMode?: boolean;
}

// ==========================================
// STT Provider Architecture
// ==========================================

export interface LiveKitSTTProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): boolean;
  transcribe(audioBuffer: Buffer, mimeType?: string, options?: any): Promise<string>;
}

export class SarvamSTTProvider implements LiveKitSTTProvider {
  readonly id = "sarvam";
  readonly name = "Sarvam Saaras STT";

  isAvailable(): boolean {
    const key = apiKeyManager.getActiveKey("sarvam") || process.env.SARVAM_API_KEY;
    return Boolean(key && key.trim().length > 5 && !key.startsWith("YOUR_"));
  }

  async transcribe(audioBuffer: Buffer, mimeType: string = "audio/webm", options?: any): Promise<string> {
    return await transcribeAudioWithSarvam(audioBuffer, mimeType, options);
  }
}

export class FallbackStreamingSTTProvider implements LiveKitSTTProvider {
  readonly id = "browser-streaming";
  readonly name = "Browser Streaming Fallback";

  isAvailable(): boolean {
    return true;
  }

  async transcribe(_audioBuffer: Buffer): Promise<string> {
    throw new Error("Streaming STT provider interface ready. Plug in a real-time streaming endpoint (e.g., LiveKit Ingress / Deepgram) or configure SARVAM_API_KEY.");
  }
}

export function getSTTProvider(preferredId?: string): LiveKitSTTProvider {
  const sarvam = new SarvamSTTProvider();
  if ((!preferredId || preferredId === "sarvam") && sarvam.isAvailable()) {
    return sarvam;
  }
  return new FallbackStreamingSTTProvider();
}

// ==========================================
// TTS Provider Architecture
// ==========================================

export interface LiveKitTTSProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): boolean;
  synthesize(text: string, options?: any): Promise<Buffer | ArrayBuffer>;
}

export class OpenAITTSProvider implements LiveKitTTSProvider {
  readonly id = "openai";
  readonly name = "OpenAI Realtime TTS";

  isAvailable(): boolean {
    const key = apiKeyManager.getActiveKey("openai") || process.env.OPENAI_API_KEY;
    return Boolean(key && key.trim().length > 5 && !key.startsWith("YOUR_"));
  }

  async synthesize(text: string, options?: any): Promise<ArrayBuffer> {
    return await generateSpeechWithOpenAI({
      text,
      voice: options?.voice || process.env.OPENAI_TTS_VOICE || "nova",
      speed: options?.speed || 1.0,
    });
  }
}

export class BrowserFallbackTTSProvider implements LiveKitTTSProvider {
  readonly id = "browser-fallback";
  readonly name = "Browser Speech Synthesis Fallback";

  isAvailable(): boolean {
    return true;
  }

  async synthesize(_text: string): Promise<Buffer> {
    // When OpenAI TTS is not configured, text is dispatched via data channel
    // and spoken by the frontend using Web Speech Synthesis API.
    return Buffer.alloc(0);
  }
}

export function getTTSProvider(preferredId?: string): LiveKitTTSProvider {
  const openai = new OpenAITTSProvider();
  if ((!preferredId || preferredId === "openai") && openai.isAvailable()) {
    return openai;
  }
  return new BrowserFallbackTTSProvider();
}

// ==========================================
// LiveKit Voice Session Controller
// ==========================================

export class LiveKitVoiceSession {
  private currentState: LiveKitVoiceState = "IDLE";
  private context: VoiceSessionContext;
  private sttProvider: LiveKitSTTProvider;
  private ttsProvider: LiveKitTTSProvider;
  private currentAbortController: AbortController | null = null;
  private onStateChangeCallback?: (state: LiveKitVoiceState) => void;
  private onDataBroadcastCallback?: (data: any) => void;
  private onAudioOutputCallback?: (audio: Buffer | ArrayBuffer, format: string) => void;

  constructor(
    context: VoiceSessionContext,
    callbacks?: {
      onStateChange?: (state: LiveKitVoiceState) => void;
      onDataBroadcast?: (data: any) => void;
      onAudioOutput?: (audio: Buffer | ArrayBuffer, format: string) => void;
    }
  ) {
    this.context = context;
    this.sttProvider = getSTTProvider();
    this.ttsProvider = getTTSProvider();
    this.onStateChangeCallback = callbacks?.onStateChange;
    this.onDataBroadcastCallback = callbacks?.onDataBroadcast;
    this.onAudioOutputCallback = callbacks?.onAudioOutput;
  }

  public getState(): LiveKitVoiceState {
    return this.currentState;
  }

  public setState(state: LiveKitVoiceState) {
    if (this.currentState === state) return;
    this.currentState = state;
    this.broadcast({ type: "STATE_CHANGE", state });
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(state);
    }
  }

  private broadcast(payload: Record<string, any>) {
    if (this.onDataBroadcastCallback) {
      this.onDataBroadcastCallback(payload);
    }
  }

  /**
   * Initializes the session into LISTENING state.
   */
  public start() {
    this.setState("LISTENING");
    this.broadcast({
      type: "SESSION_READY",
      context: {
        userId: this.context.userId,
        conversationId: this.context.conversationId,
        roomName: this.context.roomName,
        aiMode: this.context.aiMode,
      },
    });
  }

  /**
   * Called when user speech is detected or when an audio buffer is received from LiveKit microphone track.
   */
  public async handleUserAudio(audioBuffer: Buffer, mimeType: string = "audio/webm"): Promise<void> {
    if (this.currentState === "SPEAKING" || this.currentState === "THINKING") {
      // Barge-in / interruption
      this.handleInterruption();
    }

    this.setState("PROCESSING");
    this.broadcast({ type: "PROCESSING_START", source: "stt" });

    let transcript = "";
    try {
      if (!this.sttProvider.isAvailable()) {
        throw new Error("No Speech-to-Text provider is configured on the server. Please add SARVAM_API_KEY.");
      }

      transcript = await this.sttProvider.transcribe(audioBuffer, mimeType);
    } catch (sttError: any) {
      console.warn("[VoiceSession STT Error]:", sttError.message);
      this.broadcast({ type: "STT_ERROR", error: sttError.message });
      this.setState("LISTENING");
      return;
    }

    if (!transcript || !transcript.trim()) {
      this.setState("LISTENING");
      return;
    }

    // Process recognized user text
    await this.handleUserText(transcript.trim());
  }

  /**
   * Processes input text through LLM and synthesizes speech.
   */
  public async handleUserText(userText: string): Promise<void> {
    this.setState("THINKING");
    this.broadcast({ type: "TRANSCRIPTION", role: "user", text: userText });

    // 1. Persist user message to PostgreSQL
    try {
      if (this.context.conversationId) {
        await createMessage({
          id: crypto.randomUUID(),
          conversationId: this.context.conversationId,
          role: "user",
          content: userText,
        });
      }
    } catch (err: any) {
      console.warn("[VoiceSession DB] Warning saving user message:", err.message);
    }

    // 2. Setup interruption controller for LLM generation
    this.currentAbortController = new AbortController();
    const abortSignal = this.currentAbortController.signal;

    // 3. Resolve active AI Provider
    const { provider, error: providerError } = providerManager.getActiveProvider(this.context.selectedProvider);

    if (!provider || providerError) {
      const errorMsg = providerError || "AI provider is not configured. Add an API key on the server (GEMINI_API_KEY, QWEN_API_KEY, or OPENAI_API_KEY).";
      this.broadcast({ type: "AI_ERROR", error: errorMsg });
      await this.speakResponse("I apologize, but no AI provider is currently configured on the server. Please check your API keys.", abortSignal);
      this.setState("LISTENING");
      return;
    }

    // 4. Build Conversation History & Voice Prompt
    let history: AIChatMessage[] = [];
    try {
      if (this.context.conversationId) {
        const past = await getMessages(this.context.conversationId, { limit: 10 });
        history = past.messages.map((m: any) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));
      }
    } catch {
      // Continue with empty history if DB fetch fails
    }

    // Append current user message
    history.push({ role: "user", content: userText });

    // Voice-optimized system instructions
    const systemPrompt = this.buildVoiceSystemPrompt();

    // 5. Query LLM with Tool Support (CentralToolManager)
    let fullResponseText = "";
    try {
      const toolDeclarations = await voiceToolManager.getToolDeclarations(
        provider,
        this.context.userId,
        this.context.aiMode,
        true
      );

      const stream = provider.generateStream(history, {
        model: this.context.selectedModel,
        systemInstruction: systemPrompt,
        aiMode: this.context.aiMode,
        fridayMode: this.context.fridayMode,
        useSearch: true,
        tools: toolDeclarations,
        userId: this.context.userId,
        conversationId: this.context.conversationId,
      });

      for await (const chunk of stream) {
        if (abortSignal.aborted) {
          console.log("[VoiceSession] LLM generation aborted due to user interruption");
          return;
        }

        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          for (const tc of chunk.toolCalls) {
            this.broadcast({ type: "TOOL_ACTIVITY", name: tc.name, status: "executing" });
            const toolExec = await voiceToolManager.executeTool(tc.name, tc.args, {
              userId: this.context.userId,
              conversationId: this.context.conversationId,
              onToolStatus: (event) => {
                this.broadcast({ type: "TOOL_STATUS", ...event });
              },
            });

            // Append tool summary to history for follow-up speech
            history.push({
              role: "assistant",
              content: `[Executed ${tc.name}]: ${toolExec.spokenSummary}`,
            });
            this.broadcast({ type: "TOOL_ACTIVITY", name: tc.name, status: "completed" });
          }
        }

        if (chunk.text) {
          fullResponseText += chunk.text;
        }
      }
    } catch (llmErr: any) {
      if (abortSignal.aborted) return;
      console.warn("[VoiceSession LLM Error]:", llmErr.message);
      fullResponseText = "I encountered an issue processing your request. Please try again.";
    }

    if (abortSignal.aborted || !fullResponseText.trim()) {
      if (!abortSignal.aborted) this.setState("LISTENING");
      return;
    }

    // 6. Persist AI assistant message to PostgreSQL
    try {
      if (this.context.conversationId) {
        await createMessage({
          id: crypto.randomUUID(),
          conversationId: this.context.conversationId,
          role: "assistant",
          content: fullResponseText.trim(),
          model: this.context.selectedModel,
          metadata: { isVoice: true, provider: this.context.selectedProvider },
        });
      }
    } catch (err: any) {
      console.warn("[VoiceSession DB] Warning saving assistant message:", err.message);
    }

    // 7. Synthesize Speech & Publish into LiveKit Room
    await this.speakResponse(fullResponseText.trim(), abortSignal);

    if (!abortSignal.aborted) {
      this.setState("LISTENING");
    }
  }

  /**
   * Synthesizes audio using TTS provider and publishes output.
   */
  private async speakResponse(text: string, abortSignal: AbortSignal): Promise<void> {
    this.setState("SPEAKING");
    this.broadcast({ type: "TRANSCRIPTION", role: "assistant", text });

    if (abortSignal.aborted) return;

    try {
      if (this.ttsProvider.isAvailable()) {
        const audioData = await this.ttsProvider.synthesize(text);
        if (abortSignal.aborted) return;

        if (this.onAudioOutputCallback && audioData) {
          this.onAudioOutputCallback(audioData, "audio/mpeg");
        }
        this.broadcast({ type: "SPEAKING_CHUNK", text });
      } else {
        // Fallback: Notify client to speak using Web Speech API or display text
        this.broadcast({
          type: "SPEAK_TEXT_FALLBACK",
          text,
          notice: "Server TTS (OpenAI) not configured. Using browser speech synthesis.",
        });
      }
    } catch (ttsErr: any) {
      console.warn("[VoiceSession TTS Error]:", ttsErr.message);
      this.broadcast({
        type: "TTS_ERROR",
        error: ttsErr.message,
        fallbackText: text,
      });
    }
  }

  /**
   * Handles user barge-in / speech interruption.
   */
  public handleInterruption(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }

    this.setState("INTERRUPTED");
    this.broadcast({ type: "INTERRUPT" });

    // Transition smoothly back to listening
    setTimeout(() => {
      if (this.currentState === "INTERRUPTED") {
        this.setState("LISTENING");
      }
    }, 200);
  }

  /**
   * Gracefully tears down the voice session.
   */
  public close(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.setState("DISCONNECTED");
  }

  private buildVoiceSystemPrompt(): string {
    const isFriday = Boolean(this.context.fridayMode || this.context.aiMode === "FRIDAY");

    if (isFriday) {
      return (
        "You are F.R.I.D.A.Y., a highly sophisticated, calm, articulate, and fiercely loyal AI voice companion. " +
        "You are conversing with the user in REAL-TIME VOICE. " +
        "Guidelines for voice communication:\n" +
        "1. Be natural, concise, and direct. Keep your answers brief (1 to 3 sentences) unless asked for deep detail.\n" +
        "2. Do NOT use markdown symbols, bullet lists, markdown asterisks, or raw URLs—speak in fluid natural language.\n" +
        "3. You have access to real-time tools via CentralToolManager (news, search, system stats, code, and connected MCP servers).\n" +
        "4. Tone: Confident, respectful, mildly warm, professional."
      );
    }

    return (
      "You are fLAW AI, an advanced intelligent AI real-time voice assistant. " +
      "You are speaking directly with the user over a real-time LiveKit audio connection. " +
      "Guidelines for voice responses:\n" +
      "1. Speak conversationally and concisely. Most answers should be 1-3 clear sentences.\n" +
      "2. Never output markdown formatting (no bold **, no hashtags #, no code fences) because your output is read aloud via TTS.\n" +
      "3. You have full access to CentralToolManager tools including web search, world news, system diagnostics, and user MCP servers.\n" +
      "4. Be friendly, helpful, and sharp."
    );
  }
}
