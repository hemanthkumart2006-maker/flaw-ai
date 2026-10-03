export type MCPServerTransport = "sse" | "stdio";

export type MCPServerStatus = "disconnected" | "connecting" | "connected" | "error";

export type ToolPermissionLevel = "AUTO" | "ASK" | "BLOCK";

export type ToolSource = "builtin" | "mcp";

export interface MCPServerConfig {
  id: string;
  userId?: string | null;
  name: string;
  description?: string;
  transport: MCPServerTransport;
  endpoint: string; // URL for SSE, or executable path / command for stdio
  args?: string[];  // CLI args for stdio
  envVars?: Record<string, string>; // Headers or env variables (kept server-side only)
  enabled: boolean;
  status: MCPServerStatus;
  timeoutMs?: number;
  tools?: MCPToolSummary[];
  errorMessage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MCPToolSummary {
  id?: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
  serverId?: string;
  serverName?: string;
  enabled?: boolean;
}

export interface UnifiedTool {
  id: string;
  name: string;
  description: string;
  source: ToolSource;
  serverId?: string;
  serverName?: string;
  inputSchema: Record<string, any>;
  permission: ToolPermissionLevel;
  enabled: boolean;
  timeoutMs: number;
}

export interface ToolExecutionResult {
  result: any;
  sources?: any[];
  offerWorldMonitor?: boolean;
  error?: string;
}

export interface ToolExecutionLogRecord {
  id: string;
  userId?: string | null;
  conversationId?: string | null;
  toolName: string;
  serverId?: string | null;
  serverName?: string | null;
  source: ToolSource;
  status: "success" | "error" | "blocked" | "timeout";
  durationMs: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface ToolStatusEvent {
  toolStatus: "Connecting..." | "Running..." | "Reading..." | "Tool completed" | "Tool failed" | "Tool blocked" | "Using MCP tool..." | "MCP tool completed";
  toolName: string;
  serverName?: string;
  details?: string;
}
