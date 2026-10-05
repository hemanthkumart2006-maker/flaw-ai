/**
 * LiveKit AI Voice Agent - Worker Service
 * Joins LiveKit rooms, manages LiveKitVoiceSessions, connects to room audio streams,
 * and coordinates STT, LLM, TTS, MCP tools, and data channels.
 */

import dotenv from "dotenv";
import { AccessToken, RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";
import { getLiveKitConfigStatus } from "../services/livekit.js";
import { LiveKitVoiceSession, VoiceSessionContext, LiveKitVoiceState } from "./session.js";

dotenv.config();

export class VoiceAgentService {
  private activeSessions: Map<string, LiveKitVoiceSession> = new Map();
  private roomService: RoomServiceClient | null = null;
  private isInitialized: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initializes LiveKit RoomServiceClient if credentials are configured.
   */
  public initialize(): boolean {
    const { isConfigured, url } = getLiveKitConfigStatus();
    if (!isConfigured || !url) {
      console.log("[LiveKit Voice Agent] Status: Not Configured (missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET)");
      this.isInitialized = false;
      return false;
    }

    try {
      const apiKey = process.env.LIVEKIT_API_KEY!.trim();
      const apiSecret = process.env.LIVEKIT_API_SECRET!.trim();
      
      // Convert ws/wss to http/https for LiveKit REST RoomServiceClient API
      const httpUrl = url.replace(/^ws(s)?:\/\//, "http$1://");
      this.roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      this.isInitialized = true;
      console.log("[LiveKit Voice Agent] Status: Ready (Connected to LiveKit Server)");
      return true;
    } catch (err: any) {
      console.warn("[LiveKit Voice Agent] Warning during initialization:", err.message);
      this.isInitialized = false;
      return false;
    }
  }

  public isReady(): boolean {
    return this.isInitialized && Boolean(this.roomService);
  }

  /**
   * Creates an agent token to join a room with full publishing and subscribing permissions.
   */
  public async createAgentToken(roomName: string): Promise<string> {
    const { isConfigured } = getLiveKitConfigStatus();
    if (!isConfigured) {
      throw new Error("LiveKit credentials not configured.");
    }

    const apiKey = process.env.LIVEKIT_API_KEY!.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET!.trim();

    const at = new AccessToken(apiKey, apiSecret, {
      identity: `flaw-voice-agent-${roomName}`,
      name: "fLAW AI Voice Agent",
      ttl: "2h",
      metadata: JSON.stringify({ role: "agent", system: "fLAW-AI-Realtime" }),
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      hidden: false,
    });

    return await at.toJwt();
  }

  /**
   * Ensures an active VoiceSession is attached to a given room.
   */
  public async ensureAgentInRoom(roomName: string, context: Omit<VoiceSessionContext, "roomName">): Promise<LiveKitVoiceSession> {
    if (this.activeSessions.has(roomName)) {
      return this.activeSessions.get(roomName)!;
    }

    const fullContext: VoiceSessionContext = {
      ...context,
      roomName,
    };

    console.log(`[LiveKit Voice Agent] Launching voice session for room '${roomName}'`);

    const session = new LiveKitVoiceSession(fullContext, {
      onStateChange: (state: LiveKitVoiceState) => {
        this.broadcastRoomData(roomName, { type: "STATE_CHANGE", state });
      },
      onDataBroadcast: (data: any) => {
        this.broadcastRoomData(roomName, data);
      },
      onAudioOutput: (audio: Buffer | ArrayBuffer, format: string) => {
        this.publishAudioToRoom(roomName, audio, format);
      },
    });

    this.activeSessions.set(roomName, session);
    session.start();

    return session;
  }

  /**
   * Broadcasts data packets to all participants in the room via LiveKit RoomServiceClient.
   */
  public async broadcastRoomData(roomName: string, payload: Record<string, any>): Promise<void> {
    if (!this.roomService) return;

    try {
      const dataBuffer = Buffer.from(JSON.stringify(payload));
      await this.roomService.sendData(roomName, dataBuffer, DataPacket_Kind.RELIABLE);
    } catch (err: any) {
      // Room might be empty or inactive
      console.warn(`[LiveKit Voice Agent] Notice broadcasting to room '${roomName}':`, err.message);
    }
  }

  /**
   * Dispatches synthesized audio to the room.
   */
  public async publishAudioToRoom(roomName: string, audioData: Buffer | ArrayBuffer, format: string): Promise<void> {
    const buffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
    
    // Broadcast audio packet notification for client playback
    await this.broadcastRoomData(roomName, {
      type: "AUDIO_PAYLOAD",
      mimeType: format,
      audioBase64: buffer.toString("base64"),
    });
  }

  /**
   * Passes incoming user microphone audio buffer to the room's session.
   */
  public async handleUserAudio(roomName: string, audioBuffer: Buffer, mimeType: string = "audio/webm"): Promise<void> {
    const session = this.activeSessions.get(roomName);
    if (session) {
      await session.handleUserAudio(audioBuffer, mimeType);
    }
  }

  /**
   * Handles user barge-in / speech interruption for a room.
   */
  public handleInterruption(roomName: string): void {
    const session = this.activeSessions.get(roomName);
    if (session) {
      session.handleInterruption();
    }
  }

  /**
   * Removes an agent session when room closes or participant leaves.
   */
  public removeAgentFromRoom(roomName: string): void {
    const session = this.activeSessions.get(roomName);
    if (session) {
      session.close();
      this.activeSessions.delete(roomName);
      console.log(`[LiveKit Voice Agent] Closed session for room '${roomName}'`);
    }
  }

  public getSession(roomName: string): LiveKitVoiceSession | undefined {
    return this.activeSessions.get(roomName);
  }
}

export const voiceAgentService = new VoiceAgentService();

// Standalone execution support: tsx backend/voice-agent/agent.ts
if (process.argv[1]?.includes("agent.ts")) {
  console.log("==========================================");
  console.log("fLAW AI - LiveKit Voice Agent Worker");
  console.log("==========================================");

  const status = getLiveKitConfigStatus();
  if (status.isConfigured) {
    console.log(`LiveKit URL: ${status.url}`);
    console.log("LiveKit Voice Agent Worker is listening for active rooms...");
  } else {
    console.log("LiveKit is NOT configured in environment.");
    console.log("To configure, add to your .env file:");
    console.log("  LIVEKIT_URL=wss://your-project.livekit.cloud");
    console.log("  LIVEKIT_API_KEY=your_key");
    console.log("  LIVEKIT_API_SECRET=your_secret");
    console.log("Worker running in idle standby mode.");
  }
}
