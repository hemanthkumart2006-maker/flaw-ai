import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { MCPServerConfig } from "./types.js";
import { validateEndpointUrl, validateStdioCommand } from "./security.js";

/**
 * Creates and configures the appropriate MCP SDK Transport based on server configuration.
 */
export function createMCPTransport(config: MCPServerConfig): Transport {
  if (config.transport === "sse") {
    const validation = validateEndpointUrl(config.endpoint);
    if (!validation.valid) {
      throw new Error(`SSE Endpoint security validation failed: ${validation.reason}`);
    }

    const url = new URL(config.endpoint);
    const customHeaders: Record<string, string> = { ...(config.envVars || {}) };

    return new SSEClientTransport(url, {
      eventSourceInit: {
        headers: customHeaders,
      } as any,
      requestInit: {
        headers: customHeaders,
      },
    });
  }

  if (config.transport === "stdio") {
    const validation = validateStdioCommand(config.endpoint, config.args);
    if (!validation.valid) {
      throw new Error(`Stdio security validation failed: ${validation.reason}`);
    }

    // Merge safe inherited environment with configured environment variables
    const childEnv: Record<string, string> = {
      PATH: process.env.PATH || "",
      HOME: process.env.HOME || process.env.USERPROFILE || "",
      USERPROFILE: process.env.USERPROFILE || "",
      SystemRoot: process.env.SystemRoot || "C:\\Windows",
      APPDATA: process.env.APPDATA || "",
      LOCALAPPDATA: process.env.LOCALAPPDATA || "",
      COMSPEC: process.env.COMSPEC || "",
      PATHEXT: process.env.PATHEXT || "",
      TEMP: process.env.TEMP || "",
      TMP: process.env.TMP || "",
      NODE_ENV: process.env.NODE_ENV || "development",
      ...(config.envVars || {}),
    };

    return new StdioClientTransport({
      command: config.endpoint,
      args: config.args || [],
      env: childEnv,
      stderr: "pipe",
    });
  }

  throw new Error(`Unsupported MCP transport type: ${(config as any).transport}`);
}
