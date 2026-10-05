/**
 * Flaw AI Ultra - MCP Protocol Integration
 * Re-exports the unified MCP architecture while maintaining backward compatibility.
 */

import { mcpRegistry } from "./mcp/registry.js";
import { toolManager } from "./mcp/manager.js";
import { getMCPServersFromDB } from "./database.js";
import { MCPServerConfig } from "./mcp/types.js";

export * from "./mcp/types.js";
export * from "./mcp/client.js";
export * from "./mcp/registry.js";
export * from "./mcp/manager.js";
export * from "./mcp/security.js";
export * from "./mcp/transport.js";

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
}

export type MCPSystemStatus = "ready" | "unavailable" | "not_configured";

export interface MCPStatusResult {
  status: MCPSystemStatus;
  isConfigured: boolean;
  totalServersCount: number;
  activeServersCount: number;
  connectedCount: number;
  readyServersCount: number;
  toolsCount: number;
  url: string | null;
}

export function computeMCPStatus(
  servers: MCPServerConfig[],
  url?: string | null
): MCPStatusResult {
  const hasEnvUrl = Boolean(url && url.trim().length > 0);
  const totalServersCount = servers.length;
  const isConfigured = totalServersCount > 0 || hasEnvUrl;

  if (!isConfigured) {
    return {
      status: "not_configured",
      isConfigured: false,
      totalServersCount: 0,
      activeServersCount: 0,
      connectedCount: 0,
      readyServersCount: 0,
      toolsCount: 0,
      url: url || null,
    };
  }

  // Filter enabled servers
  const enabledServers = servers.filter((s) => s.enabled);
  const connectedServers = enabledServers.filter((s) => s.status === "connected");

  // Count discovered tools across connected servers
  let toolsCount = 0;
  for (const s of connectedServers) {
    toolsCount += (s.tools || []).length;
  }

  // Ready: at least one enabled server is connected and its tools are available
  const isReady = connectedServers.length > 0 && toolsCount > 0;

  return {
    status: isReady ? "ready" : "unavailable",
    isConfigured: true,
    totalServersCount,
    activeServersCount: enabledServers.length,
    connectedCount: connectedServers.length,
    readyServersCount: isReady ? connectedServers.length : 0,
    toolsCount,
    url: url || null,
  };
}

export function getMCPStatus(userId?: string | null): MCPStatusResult {
  const servers = mcpRegistry.getServers(userId);
  return computeMCPStatus(servers, process.env.MCP_SERVER_URL);
}

export async function getMCPStatusAsync(userId?: string | null): Promise<MCPStatusResult> {
  let servers = mcpRegistry.getServers(userId);

  // If memory registry has no servers for this query, check PostgreSQL
  // to avoid false "not_configured" during early startup or after restart
  if (servers.length === 0) {
    try {
      const dbServers = await getMCPServersFromDB(userId);
      if (dbServers.length > 0) {
        for (const s of dbServers) {
          if (!mcpRegistry.getInstance(s.id)) {
            mcpRegistry.registerServer(s);
          }
        }
        servers = mcpRegistry.getServers(userId);
      }
    } catch (err: any) {
      console.warn("[getMCPStatusAsync] Error reading servers from DB:", err.message);
    }
  }

  return computeMCPStatus(servers, process.env.MCP_SERVER_URL);
}

export async function fetchMCPTools(): Promise<MCPToolDefinition[]> {
  const tools = await toolManager.getAvailableTools();
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export async function executeMCPTool(toolName: string, args: Record<string, any>): Promise<any> {
  const execution = await toolManager.executeTool(toolName, args);
  if (execution.error) {
    throw new Error(execution.error);
  }
  return execution.result;
}
