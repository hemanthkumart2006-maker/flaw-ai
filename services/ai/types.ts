import { UnifiedTool } from "../mcp/types.js";

export type AIProviderId = "gemini" | "qwen" | "openai" | string;

export interface AIModelInfo {
  id: string;
  name: string;
  providerId: AIProviderId;
  supportsVision?: boolean;
  supportsTools?: boolean;
}

export interface AIChatMessage {
  role: "user" | "assistant" | "model" | "system";
  content: string;
  imagery?: string[]; // Base64 data URLs
  attachments?: Array<{
    filename: string;
    extractedText?: string;
    mimeType?: string;
  }>;
  functionCalls?: Array<{
    id?: string;
    name: string;
    args: Record<string, any>;
  }>;
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, any>;
  };
}

export interface AIToolCall {
  id?: string;
  name: string;
  args: Record<string, any>;
}

export interface AIGenerationOptions {
  model?: string;
  systemInstruction?: string;
  aiMode?: string;
  fridayMode?: boolean;
  useSearch?: boolean;
  temperature?: number;
  maxTokens?: number;
  tools?: any[]; // Provider-specific tool declarations
  userId?: string | null;
  conversationId?: string | null;
}

export interface AIStreamChunk {
  text?: string;
  toolCalls?: AIToolCall[];
  sources?: Array<{
    title: string;
    domain: string;
    url: string;
    snippet?: string;
  }>;
  error?: string;
}

export interface AIProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  models: string[];
}

export interface AIProvider {
  readonly id: AIProviderId;
  readonly name: string;
  isConfigured(): boolean;
  getModels(): string[];
  supportsStreaming(): boolean;
  supportsTools(): boolean;
  supportsVision(): boolean;
  getToolDeclarations(tools: UnifiedTool[], useSearch?: boolean): any[];
  generateStream(
    messages: AIChatMessage[],
    options: AIGenerationOptions
  ): AsyncGenerator<AIStreamChunk, void, unknown>;
}
