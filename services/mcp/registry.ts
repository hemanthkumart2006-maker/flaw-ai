import { MCPServerConfig, MCPToolSummary, MCPServerStatus } from "./types.js";
import { MCPClientInstance } from "./client.js";

export class MCPServerRegistry {
  private instances: Map<string, MCPClientInstance> = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Register or update an MCP server.
   */
  public registerServer(config: MCPServerConfig): MCPClientInstance {
    // If instance already exists, disconnect old one first
    if (this.instances.has(config.id)) {
      const existing = this.instances.get(config.id)!;
      existing.disconnect().catch(() => {});
    }

    const instance = new MCPClientInstance(config);
    this.instances.set(config.id, instance);
    return instance;
  }

  /**
   * Remove an MCP server from registry.
   */
  public async unregisterServer(serverId: string): Promise<void> {
    const existing = this.instances.get(serverId);
    if (existing) {
      const timer = this.reconnectTimers.get(serverId);
      if (timer) {
        clearTimeout(timer);
        this.reconnectTimers.delete(serverId);
      }
      await existing.disconnect();
      this.instances.delete(serverId);
    }
  }

  /**
   * Get an instance by ID.
   */
  public getInstance(serverId: string): MCPClientInstance | undefined {
    return this.instances.get(serverId);
  }

  /**
   * Get all registered servers matching optional user filter.
   */
  public getServers(userId?: string | null): MCPServerConfig[] {
    const configs: MCPServerConfig[] = [];
    for (const instance of this.instances.values()) {
      const cfg = instance.getConfig();
      if (!userId || !cfg.userId || cfg.userId === userId) {
        configs.push(cfg);
      }
    }
    return configs;
  }

  /**
   * Connect all enabled servers for a user or globally.
   */
  public async connectAll(userId?: string | null): Promise<void> {
    const servers = this.getServers(userId);
    await Promise.allSettled(
      servers.map(async (server) => {
        if (server.enabled) {
          const instance = this.instances.get(server.id);
          if (instance) {
            await instance.connect();
          }
        }
      })
    );
  }

  /**
   * Connect a specific server and discover its tools.
   */
  public async connectServer(serverId: string): Promise<{ success: boolean; tools: MCPToolSummary[]; error?: string }> {
    const instance = this.instances.get(serverId);
    if (!instance) {
      return { success: false, tools: [], error: `Server with ID '${serverId}' not found in registry.` };
    }

    const connected = await instance.connect();
    if (!connected) {
      return {
        success: false,
        tools: [],
        error: instance.getLastError() || "Failed to connect to MCP server",
      };
    }

    const tools = await instance.discoverTools();
    return { success: true, tools };
  }

  /**
   * Ensure enabled MCP servers are connected and their tools discovered.
   */
  public async ensureConnected(userId?: string | null): Promise<void> {
    for (const instance of this.instances.values()) {
      const cfg = instance.getConfig();
      if (cfg.enabled && (!userId || !cfg.userId || cfg.userId === userId)) {
        if (instance.getStatus() !== "connected" || instance.getTools().length === 0) {
          try {
            await instance.connect();
          } catch (e: any) {
            console.warn(`[MCPRegistry] Auto-connect server '${cfg.name}' warning:`, e.message);
          }
        }
      }
    }
  }

  /**
   * Get all discovered tools across all connected and enabled MCP servers for a user.
   */
  public getAllTools(userId?: string | null): MCPToolSummary[] {
    const allTools: MCPToolSummary[] = [];
    for (const instance of this.instances.values()) {
      const cfg = instance.getConfig();
      if (cfg.enabled && (!userId || !cfg.userId || cfg.userId === userId)) {
        allTools.push(...instance.getTools());
      }
    }
    return allTools;
  }

  /**
   * Find the client instance and server ID that provides a given tool.
   */
  public findServerForTool(toolName: string, userId?: string | null): { instance: MCPClientInstance; serverConfig: MCPServerConfig } | null {
    const target = toolName.toLowerCase();
    for (const instance of this.instances.values()) {
      const cfg = instance.getConfig();
      if (cfg.enabled && (!userId || !cfg.userId || cfg.userId === userId)) {
        const hasTool = instance.getTools().some((t) => 
          t.name.toLowerCase() === target ||
          (t.id && t.id.toLowerCase() === target) ||
          t.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() === target
        );
        if (hasTool) {
          return { instance, serverConfig: cfg };
        }
      }
    }
    return null;
  }

  /**
   * Clean up all servers upon application shutdown.
   */
  public async shutdown(): Promise<void> {
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    const disconnectPromises = Array.from(this.instances.values()).map((inst) => inst.disconnect());
    await Promise.allSettled(disconnectPromises);
    this.instances.clear();
  }
}

export const mcpRegistry = new MCPServerRegistry();
