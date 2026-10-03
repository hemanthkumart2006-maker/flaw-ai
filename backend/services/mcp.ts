/**
 * Flaw AI Ultra - MCP Protocol Integration
 * Re-exports the unified MCP architecture while maintaining backward compatibility.
 */

import { mcpRegistry } from "./mcp/registry.js";
import { toolManager } from "./mcp/manager.js";

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

export function getMCPStatus() {
  const activeServers = mcpRegistry.getServers();
  const connectedCount = activeServers.filter((s) => s.status === "connected").length;
  const configured = activeServers.length > 0 || Boolean(process.env.MCP_SERVER_URL);

  return {
    isConfigured: configured,
    activeServersCount: activeServers.length,
    connectedCount,
    url: process.env.MCP_SERVER_URL || null,
  };
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
