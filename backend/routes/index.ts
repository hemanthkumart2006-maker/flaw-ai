/**
 * Backend API Routes Registry
 * 
 * Endpoints hosted on server:
 * - /api/auth/*: Authentication (register, login, me)
 * - /api/system/*: System status, provider configuration
 * - /api/ai/*: AI Models, configuration
 * - /api/chat: Multi-turn streaming chat with dynamic tool dispatch & CentralToolManager
 * - /api/mcp/*: MCP server registration, tools discovery, permissions, execution logs
 * - /api/stt: Speech-to-Text (Sarvam AI)
 * - /api/tts: Text-to-Speech (OpenAI / Edge)
 * - /api/livekit/*: LiveKit realtime audio rooms
 * - /api/execute-code: Sandboxed code execution
 * - /api/attachments/*: Secure file upload & extraction
 * - /api/conversations/*: PostgreSQL conversations & messages storage
 * - /api/settings: User settings persistence
 */

export const API_ROUTE_PREFIXES = {
  AUTH: "/api/auth",
  SYSTEM: "/api/system",
  AI: "/api/ai",
  CHAT: "/api/chat",
  MCP: "/api/mcp",
  STT: "/api/stt",
  TTS: "/api/tts",
  LIVEKIT: "/api/livekit",
  CODE: "/api/execute-code",
  ATTACHMENTS: "/api/attachments",
  CONVERSATIONS: "/api/conversations",
  SETTINGS: "/api/settings",
} as const;
