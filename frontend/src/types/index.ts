export type AIMode = 
  | "GENERAL" 
  | "CODING" 
  | "RESEARCH" 
  | "VISION" 
  | "VOICE" 
  | "FRIDAY" 
  | "CREATIVE";

export type VoiceMode = "chat" | "voice" | "hands-free";

export interface SourceItem {
  title: string;
  domain: string;
  url: string;
  snippet?: string;
}

export interface AttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  extractedText?: string;
  isImage?: boolean;
}

export interface ToolActivity {
  id: string;
  name: string;
  userFacingStatus: string;
  details?: string;
  timestamp: number;
  completed?: boolean;
}

export interface Message {
  id: string;
  role: "user" | "model" | "assistant";
  content: string;
  imagery?: string[]; // Multiple images support
  attachments?: AttachmentItem[]; // Documents: PDF, DOCX, TXT, CSV, Code, etc.
  timestamp: number;
  toolActivities?: ToolActivity[];
  sources?: SourceItem[];
  offerWorldMonitor?: boolean;
  audioUrl?: string;
  isStreaming?: boolean;
  modelUsed?: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  isPinned?: boolean;
  mode?: AIMode;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AIProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  models: string[];
}

export type VoiceInputStatus = "idle" | "listening" | "processing" | "transcribing" | "done" | "error";

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

export interface SystemCapabilityStatus {
  gemini: "ready" | "unavailable" | "not_configured";
  voiceInput: "ready" | "unavailable" | "not_configured";
  sarvam?: {
    configured: boolean;
    model?: string;
  };
  voiceOutput: "ready" | "unavailable" | "not_configured";
  mcp: "ready" | "unavailable" | "not_configured";
  livekit: "ready" | "unavailable" | "not_configured";
  webSearch: "ready" | "unavailable" | "not_configured";
  providers?: Record<string, AIProviderStatus>;
}

export interface UserSettings {
  voiceInputEnabled: boolean;
  voiceOutputEnabled: boolean;
  autoRead: boolean;
  selectedVoice: string;
  speechSpeed: number; // 0.5 to 2.0
  volume: number; // 0 to 1
  selectedMicId: string;
  speechLanguage?: string;
  selectedModel: string;
  selectedProvider: "AUTO" | "gemini" | "qwen" | "openai";
  webSearchEnabled: boolean;
  mcpEnabled: boolean;
  fridayMode: boolean;
  theme: "dark" | "midnight" | "cyberpunk";
  animationIntensity: "low" | "medium" | "high";
  show3DAssistant?: boolean;
}

export interface WorldNewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  category: "World" | "Technology" | "Science" | "Business" | "AI";
  location?: string;
  publishedAt: string;
}

export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  error?: string;
  executionTimeMs?: number;
  testResults?: {
    testNumber: number;
    passed: boolean;
    input: string;
    expected: string;
    actual: string;
  }[];
}

export interface MCPServerItem {
  id: string;
  name: string;
  description?: string;
  transport: "sse" | "stdio";
  endpoint: string;
  args?: string[];
  enabled: boolean;
  status: "connected" | "connecting" | "disconnected" | "error";
  timeoutMs?: number;
  toolCount?: number;
  tools?: any[];
  hasAuth?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UnifiedToolItem {
  id: string;
  name: string;
  description: string;
  source: "builtin" | "mcp";
  serverId?: string;
  serverName?: string;
  permission: "AUTO" | "ASK" | "BLOCK";
  enabled: boolean;
  inputSchema?: Record<string, any>;
}

export interface ToolExecutionLogItem {
  id: string;
  user_id?: string;
  conversation_id?: string;
  tool_name: string;
  server_id?: string;
  server_name?: string;
  source: string;
  status: string;
  duration_ms: number;
  error_message?: string;
  metadata?: any;
  created_at: string;
}

