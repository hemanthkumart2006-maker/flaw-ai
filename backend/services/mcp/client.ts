import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { MCPServerConfig, MCPToolSummary, MCPServerStatus } from "./types.js";
import { createMCPTransport } from "./transport.js";
import { 
  validateToolArguments, 
  normalizeAndTruncateResult, 
  DEFAULT_TOOL_TIMEOUT_MS, 
  DEFAULT_CONNECT_TIMEOUT_MS 
} from "./security.js";

export class MCPClientInstance {
  private config: MCPServerConfig;
  private client: Client | null = null;
  private transport: Transport | null = null;
  private status: MCPServerStatus = "disconnected";
  private tools: MCPToolSummary[] = [];
  private lastError: string | null = null;
  private connectionPromise: Promise<boolean> | null = null;

  constructor(config: MCPServerConfig) {
    this.config = config;
    if (config.tools && Array.isArray(config.tools) && config.tools.length > 0) {
      this.tools = [...config.tools];
    }
  }

  public getConfig(): MCPServerConfig {
    return {
      ...this.config,
      status: this.status,
      tools: this.tools,
      errorMessage: this.lastError || undefined,
    };
  }

  public getStatus(): MCPServerStatus {
    return this.status;
  }

  public getTools(): MCPToolSummary[] {
    return this.tools;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Connect to the MCP Server and discover available tools.
   */
  public async connect(): Promise<boolean> {
    if (this.status === "connected" && this.client) {
      return true;
    }

    if (this.connectionPromise) {
      return await this.connectionPromise;
    }

    this.connectionPromise = this.internalConnect();
    try {
      return await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async internalConnect(): Promise<boolean> {
    this.status = "connecting";
    this.lastError = null;

    try {
      this.transport = createMCPTransport(this.config);

      const client = new Client(
        {
          name: `flaw-ai-${this.config.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
          version: "1.0.0",
        },
        {
          capabilities: {
            roots: { listChanged: true },
            sampling: {},
          },
        }
      );

      const connectTimeout = this.config.timeoutMs || DEFAULT_CONNECT_TIMEOUT_MS;
      
      // Connect with timeout protection
      await Promise.race([
        client.connect(this.transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`MCP server connection timed out after ${connectTimeout}ms`)), connectTimeout)
        ),
      ]);

      this.client = client;
      this.status = "connected";

      // Discover tools immediately upon successful connection
      await this.discoverTools();
      return true;
    } catch (err: any) {
      this.status = "error";
      this.lastError = err.message || "Failed to connect to MCP server";
      console.warn(`[MCPClient:${this.config.name}] Connection failed:`, this.lastError);
      await this.disconnect();
      return false;
    }
  }

  /**
   * Discover tools dynamically exposed by the MCP Server.
   */
  public async discoverTools(): Promise<MCPToolSummary[]> {
    if (!this.client || this.status !== "connected") {
      const connected = await this.connect();
      if (!connected || !this.client) {
        return [];
      }
    }

    try {
      const result = await this.client.listTools();
      const discovered: MCPToolSummary[] = (result.tools || []).map((t: any) => ({
        id: `${this.config.id}:${t.name}`,
        name: t.name,
        description: t.description || `Tool provided by ${this.config.name}`,
        inputSchema: t.inputSchema || {},
        serverId: this.config.id,
        serverName: this.config.name,
        enabled: true,
      }));

      this.tools = discovered;
      return this.tools;
    } catch (err: any) {
      console.warn(`[MCPClient:${this.config.name}] Tool discovery error:`, err.message);
      this.lastError = err.message;
      return [];
    }
  }

  /**
   * Execute an MCP Tool with argument validation, schema enforcement, and timeouts.
   */
  public async executeTool(toolName: string, args: Record<string, any> = {}): Promise<any> {
    if (this.status !== "connected" || !this.client) {
      const connected = await this.connect();
      if (!connected || !this.client) {
        throw new Error(`MCP server '${this.config.name}' is offline or disconnected.`);
      }
    }

    const toolDef = this.tools.find((t) => t.name === toolName);
    if (!toolDef) {
      throw new Error(`Tool '${toolName}' not found on MCP server '${this.config.name}'.`);
    }

    // Validate tool arguments against schema
    if (toolDef.inputSchema) {
      const val = validateToolArguments(toolDef.inputSchema, args);
      if (!val.valid) {
        throw new Error(`Invalid arguments for tool '${toolName}': ${val.errors.join("; ")}`);
      }
    }

    const timeoutMs = this.config.timeoutMs || DEFAULT_TOOL_TIMEOUT_MS;

    try {
      const callPromise = this.client.callTool({
        name: toolName,
        arguments: args,
      });

      const response: any = await Promise.race([
        callPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`MCP tool execution timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      if (response?.isError) {
        const errorText = Array.isArray(response.content)
          ? response.content.map((c: any) => c.text || JSON.stringify(c)).join("\n")
          : "Unknown MCP tool error";
        throw new Error(`MCP Server Error: ${errorText}`);
      }

      // Normalize content array
      if (response && Array.isArray(response.content)) {
        const textParts: string[] = [];
        const structuredParts: any[] = [];

        for (const item of response.content) {
          if (item.type === "text" && item.text) {
            textParts.push(item.text);
          } else if (item.type === "resource" || item.type === "image") {
            structuredParts.push(item);
          } else {
            structuredParts.push(item);
          }
        }

        let finalResult: any;
        if (structuredParts.length === 0 && textParts.length === 1) {
          try {
            // Attempt JSON parse if response is a JSON string
            finalResult = JSON.parse(textParts[0]);
          } catch {
            finalResult = textParts[0];
          }
        } else if (structuredParts.length === 0) {
          finalResult = textParts.join("\n\n");
        } else {
          finalResult = {
            text: textParts.join("\n\n"),
            resources: structuredParts,
          };
        }

        return normalizeAndTruncateResult(finalResult);
      }

      return normalizeAndTruncateResult(response);
    } catch (err: any) {
      console.error(`[MCPClient:${this.config.name}] Execution failed for '${toolName}':`, err.message);
      throw err;
    }
  }

  /**
   * Safely disconnect and clean up resources.
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
      }
    } catch (e) {
      // Ignore close errors
    } finally {
      this.client = null;
      this.transport = null;
      if (this.status !== "error") {
        this.status = "disconnected";
      }
    }
  }
}
