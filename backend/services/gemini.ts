import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { toolManager } from "./mcp/manager.js";
import { ToolStatusEvent } from "./mcp/types.js";
import dotenv from "dotenv";

dotenv.config();

import { apiKeyManager } from "./apiKeys.js";

// Initialize GoogleGenAI instance with active managed key
export function getGeminiClient(customKey?: string): { client: GoogleGenAI; key: string } {
  const apiKey = customKey || apiKeyManager.getActiveKey("gemini") || process.env.GEMINI_API_KEY || "";
  return {
    client: new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "flaw-ai-ultra",
        },
      },
    }),
    key: apiKey,
  };
}



export function buildSystemPrompt(fridayMode: boolean, aiMode: string): string {
  let prompt = "";

  if (fridayMode || aiMode === "FRIDAY") {
    prompt += `You are F.R.I.D.A.Y., a highly efficient, calm, confident, and articulate AI assistant. 
Use natural phrases like "On it.", "Give me a moment.", "Done.", "Here's what I found." 
Keep responses concise, clear, and direct without fluff. Respond with high intelligence and precision.`;
  } else {
    prompt += `You are Flaw AI Ultra, an advanced multimodal AI assistant. Provide helpful, accurate, highly professional, and nicely formatted responses using markdown, code blocks, tables, and lists.`;
  }

  prompt += `\nWhen the user asks for a flowchart, workflow, decision tree, or system architecture diagram, always generate an accurate Mermaid diagram enclosed in a \`\`\`mermaid ... \`\`\` code block so it renders visually.
When asked for code, provide clean, idiomatic code with syntax highlighting, clear inline comments, expected output, and edge cases.`;

  switch (aiMode) {
    case "CODING":
      prompt += `\nFocus heavily on software engineering, clean architecture, performance optimization, unit tests, and edge case handling.`;
      break;
    case "RESEARCH":
      prompt += `\nFocus on deep synthesis, cite reputable sources, present comparative tables, and evaluate nuanced viewpoints.`;
      break;
    case "VISION":
      prompt += `\nAnalyze attached images and screenshots with high fidelity. Describe UI elements, extract text/error messages, and explain visual structures accurately.`;
      break;
    case "VOICE":
      prompt += `\nFormat responses to sound clear, natural, and conversational when spoken out loud. Keep paragraphs bite-sized.`;
      break;
    case "CREATIVE":
      prompt += `\nBe imaginative, engaging, dynamic, and inventive while maintaining factual coherence.`;
      break;
  }

  return prompt;
}

// Compact long conversation history to preserve context and optimize tokens
export function compactConversationHistory(messages: any[]): any[] {
  if (messages.length <= 8) return messages;

  const olderMessages = messages.slice(0, messages.length - 6);
  const recentMessages = messages.slice(messages.length - 6);

  const topicsSummary = olderMessages
    .map((m: any) => {
      const roleStr = m.role === "user" ? "User asked" : "AI advised";
      const snippet = (m.content || "").replace(/\n+/g, " ").slice(0, 140);
      return `- ${roleStr}: ${snippet}${m.content && m.content.length > 140 ? "..." : ""}`;
    })
    .join("\n");

  const summaryMessage = {
    role: "user",
    content: `[System Context: Summarized Prior Discussion History]\n${topicsSummary}\n[End of Prior Summary - Continuing Active Consultation]`,
  };

  const acknowledgement = {
    role: "model",
    content: "Understood. I have absorbed the prior discussion context and will continue our consultation smoothly.",
  };

  return [summaryMessage, acknowledgement, ...recentMessages];
}

// Exponential backoff retry handler for AI operations
export async function withExponentialBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  maxRetries: number = 2,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation(attempt);
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200;
        console.warn(`[Retry Handler] Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// Dynamic Tool Declarations getter for Gemini
export async function getDynamicGeminiTools(userId?: string | null, aiMode?: string): Promise<any[]> {
  return await toolManager.getGeminiToolDeclarations(userId, aiMode);
}

// Tool Execution Dispatcher delegating to Central Tool Manager
export async function executeToolCall(
  name: string,
  args: any,
  options?: {
    userId?: string | null;
    conversationId?: string | null;
    onStatus?: (event: ToolStatusEvent) => void;
  }
): Promise<{ result: any; sources?: any[]; offerWorldMonitor?: boolean; error?: string }> {
  return await toolManager.executeTool(name, args, options);
}
