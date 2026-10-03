import { 
  UnifiedTool, 
  ToolExecutionResult, 
  ToolPermissionLevel, 
  ToolStatusEvent, 
  MCPToolSummary 
} from "./types.js";
import { mcpRegistry } from "./registry.js";
import { 
  evaluateToolPermission, 
  validateToolArguments, 
  normalizeAndTruncateResult, 
  sanitizeMetadata, 
  DEFAULT_TOOL_TIMEOUT_MS 
} from "./security.js";
import { 
  getWorldNews, 
  performWebSearch, 
  fetchUrlContent, 
  getSafeSystemInformation, 
  getCurrentFormattedTime 
} from "../web.js";
import { executeCodeSafely } from "../code.js";
import { logToolExecution, getToolPermissions } from "../database.js";

export class CentralToolManager {
  /**
   * Returns list of built-in tool definitions with schemas.
   */
  public getBuiltinTools(): UnifiedTool[] {
    return [
      {
        id: "builtin:get_world_news",
        name: "get_world_news",
        description: "Retrieve current breaking news headlines, world news, and daily briefings across categories.",
        source: "builtin",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "Optional topic category (World, Technology, Science, Business, AI)",
            },
          },
        },
        permission: "AUTO",
        enabled: true,
        timeoutMs: 10000,
      },
      {
        id: "builtin:web_search",
        name: "web_search",
        description: "Search the web for real-time information, documentation, news, facts, and live updates.",
        source: "builtin",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query string",
            },
          },
          required: ["query"],
        },
        permission: "AUTO",
        enabled: true,
        timeoutMs: 15000,
      },
      {
        id: "builtin:fetch_url",
        name: "fetch_url",
        description: "Fetch and extract text content from a target HTTP/HTTPS website URL.",
        source: "builtin",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The webpage URL to read",
            },
          },
          required: ["url"],
        },
        permission: "AUTO",
        enabled: true,
        timeoutMs: 15000,
      },
      {
        id: "builtin:get_current_time",
        name: "get_current_time",
        description: "Get the current time, date, day of the week, and timezone.",
        source: "builtin",
        inputSchema: {
          type: "object",
          properties: {},
        },
        permission: "AUTO",
        enabled: true,
        timeoutMs: 3000,
      },
      {
        id: "builtin:get_system_info",
        name: "get_system_info",
        description: "Get safe system information (OS platform, CPU cores, memory, server uptime).",
        source: "builtin",
        inputSchema: {
          type: "object",
          properties: {},
        },
        permission: "AUTO",
        enabled: true,
        timeoutMs: 3000,
      },
      {
        id: "builtin:execute_code",
        name: "execute_code",
        description: "Safely execute code in a sandboxed runtime with timeout protection and test evaluation.",
        source: "builtin",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "The source code to execute safely",
            },
            language: {
              type: "string",
              description: "The programming language (javascript, typescript, python, etc.)",
            },
          },
          required: ["code"],
        },
        permission: "ASK",
        enabled: true,
        timeoutMs: 15000,
      },
    ];
  }

  /**
   * Get all tools (built-in + MCP) available to the specified user, merged with user permissions.
   */
  public async getAvailableTools(userId?: string | null): Promise<UnifiedTool[]> {
    await mcpRegistry.ensureConnected(userId);

    const builtins = this.getBuiltinTools();
    const userPermissions = userId ? await getToolPermissions(userId) : {};

    // Apply permissions to builtins
    const processedBuiltins: UnifiedTool[] = builtins.map((t) => ({
      ...t,
      permission: userPermissions[t.name] || t.permission,
    }));

    // Get discovered tools from connected MCP servers
    const mcpTools = mcpRegistry.getAllTools(userId);
    const processedMCPTools: UnifiedTool[] = mcpTools.map((mcpTool: MCPToolSummary) => ({
      id: mcpTool.id || `mcp:${mcpTool.name}`,
      name: mcpTool.name,
      description: mcpTool.description || `MCP Tool from ${mcpTool.serverName || "MCP Server"}`,
      source: "mcp" as const,
      serverId: mcpTool.serverId,
      serverName: mcpTool.serverName,
      inputSchema: mcpTool.inputSchema || { type: "object", properties: {} },
      permission: userPermissions[mcpTool.name] || "AUTO",
      enabled: mcpTool.enabled !== false,
      timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    }));

    return [...processedBuiltins, ...processedMCPTools];
  }

  /**
   * Convert JSON schema types to Gemini Function Declaration format.
   */
  private convertSchemaToGemini(schema: any): any {
    if (!schema || typeof schema !== "object") {
      return { type: "OBJECT" };
    }

    const typeMapping: Record<string, string> = {
      object: "OBJECT",
      string: "STRING",
      number: "NUMBER",
      integer: "INTEGER",
      boolean: "BOOLEAN",
      array: "ARRAY",
    };

    const rawType = String(schema.type || (schema.properties ? "object" : "string")).toLowerCase();
    const geminiType = typeMapping[rawType] || "OBJECT";
    const result: any = { type: geminiType };

    if (schema.description) {
      result.description = schema.description;
    }

    if (schema.properties && typeof schema.properties === "object") {
      result.properties = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        result.properties[key] = this.convertSchemaToGemini(propSchema);
      }
    }

    if (Array.isArray(schema.required) && schema.required.length > 0) {
      if (result.properties) {
        const validRequired = schema.required.filter((key: string) =>
          Object.prototype.hasOwnProperty.call(result.properties, key)
        );
        if (validRequired.length > 0) {
          result.required = validRequired;
        }
      }
    }

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      result.enum = schema.enum.map(String);
    }

    if (geminiType === "ARRAY") {
      if (schema.items && typeof schema.items === "object") {
        result.items = this.convertSchemaToGemini(schema.items);
      } else {
        result.items = { type: "STRING" };
      }
    }

    return result;
  }

  /**
   * Build Gemini function declarations array for all active tools.
   */
  public async getGeminiToolDeclarations(userId?: string | null, aiMode?: string): Promise<any[]> {
    const allTools = await this.getAvailableTools(userId);

    // Filter tools based on enabled state and permissions
    const activeTools = allTools.filter((t) => t.enabled && t.permission !== "BLOCK");

    // Optional Mode filtering
    const filteredTools = activeTools.filter((t) => {
      if (aiMode === "CODING" && t.name === "get_world_news") {
        // Less relevant in pure coding mode, but still allowable
        return true;
      }
      return true;
    });

    const declarations = filteredTools.map((tool) => {
      const geminiParams = this.convertSchemaToGemini(tool.inputSchema);
      const hasProperties = geminiParams.properties && Object.keys(geminiParams.properties).length > 0;
      return {
        name: tool.name.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 64),
        description: tool.description || `Tool ${tool.name}`,
        parameters: hasProperties ? geminiParams : undefined,
      };
    });

    if (declarations.length === 0) {
      return [];
    }

    return [{ functionDeclarations: declarations }];
  }

  /**
   * Universal tool declarations generator delegating format conversion to provider adapter.
   */
  public async getToolDeclarationsForProvider(
    provider: { getToolDeclarations: (tools: UnifiedTool[], useSearch?: boolean) => any[] },
    userId?: string | null,
    aiMode?: string,
    useSearch: boolean = true
  ): Promise<any[]> {
    const allTools = await this.getAvailableTools(userId);
    return provider.getToolDeclarations(allTools, useSearch);
  }

  /**
   * Central execution dispatcher for both built-in tools and MCP tools.
   */
  public async executeTool(
    name: string,
    args: Record<string, any> = {},
    options?: {
      userId?: string | null;
      conversationId?: string | null;
      onStatus?: (event: ToolStatusEvent) => void;
    }
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const userId = options?.userId || null;
    const conversationId = options?.conversationId || null;
    const onStatus = options?.onStatus || (() => {});

    console.log(`[ToolManager] Dispatching '${name}' with args:`, sanitizeMetadata(args));

    // 1. Check user permission
    const userPermissions = userId ? await getToolPermissions(userId) : {};
    const userPerm = userPermissions[name] as ToolPermissionLevel | undefined;
    const permEval = evaluateToolPermission(name, userPerm);

    if (!permEval.allowed) {
      onStatus({
        toolStatus: "Tool blocked",
        toolName: name,
        details: "Tool execution blocked by security policy.",
      });

      await logToolExecution({
        userId,
        conversationId,
        toolName: name,
        source: "builtin",
        status: "blocked",
        durationMs: Date.now() - startTime,
        errorMessage: "Execution blocked by user or system permission policy",
      });

      return {
        result: { error: `Tool '${name}' is blocked by security policy.` },
        error: `Tool '${name}' is blocked by security policy.`,
      };
    }

    // 2. Built-in tool execution
    const builtinTool = this.getBuiltinTools().find((t) => t.name === name);
    if (builtinTool) {
      onStatus({
        toolStatus: "Running...",
        toolName: name,
        details: `Executing built-in ${name}`,
      });

      try {
        let executionResult: ToolExecutionResult;

        if (name === "get_world_news") {
          const news = await getWorldNews(args?.category);
          const sources = news.map((n) => ({
            title: n.title,
            domain: n.source,
            url: n.url,
            snippet: n.summary,
          }));
          executionResult = {
            result: { news_items: news, total: news.length },
            sources,
            offerWorldMonitor: true,
          };
        } else if (name === "web_search") {
          const results = await performWebSearch(args?.query || "");
          const sources = results.map((r) => ({
            title: r.title,
            domain: r.domain,
            url: r.url,
            snippet: r.snippet,
          }));
          executionResult = {
            result: { search_results: results },
            sources,
          };
        } else if (name === "fetch_url") {
          const pageData = await fetchUrlContent(args?.url || "");
          executionResult = {
            result: pageData,
            sources: [
              {
                title: pageData.title,
                domain: new URL(pageData.url).hostname.replace("www.", ""),
                url: pageData.url,
                snippet: pageData.content.substring(0, 150) + "...",
              },
            ],
          };
        } else if (name === "get_current_time") {
          const timeData = getCurrentFormattedTime();
          executionResult = { result: timeData };
        } else if (name === "get_system_info") {
          const sysData = getSafeSystemInformation();
          executionResult = { result: sysData };
        } else if (name === "execute_code") {
          const codeRes = await executeCodeSafely(args?.code || "", args?.language || "javascript", args?.testCases);
          executionResult = { result: codeRes };
        } else {
          executionResult = { result: { error: `Unknown built-in tool '${name}'` } };
        }

        onStatus({ toolStatus: "Tool completed", toolName: name });

        await logToolExecution({
          userId,
          conversationId,
          toolName: name,
          source: "builtin",
          status: "success",
          durationMs: Date.now() - startTime,
          metadata: sanitizeMetadata(args),
        });

        return executionResult;
      } catch (err: any) {
        onStatus({ toolStatus: "Tool failed", toolName: name, details: err.message });
        await logToolExecution({
          userId,
          conversationId,
          toolName: name,
          source: "builtin",
          status: "error",
          durationMs: Date.now() - startTime,
          errorMessage: err.message,
          metadata: sanitizeMetadata(args),
        });
        return { result: { error: `Built-in tool ${name} failed: ${err.message}` }, error: err.message };
      }
    }

    // 3. MCP tool execution
    const mcpServerMatch = mcpRegistry.findServerForTool(name, userId);
    if (mcpServerMatch) {
      const { instance, serverConfig } = mcpServerMatch;

      onStatus({
        toolStatus: "Connecting...",
        toolName: name,
        serverName: serverConfig.name,
      });

      try {
        onStatus({
          toolStatus: "Running...",
          toolName: name,
          serverName: serverConfig.name,
        });

        const rawResult = await instance.executeTool(name, args);

        onStatus({
          toolStatus: "Reading...",
          toolName: name,
          serverName: serverConfig.name,
        });

        const normalized = normalizeAndTruncateResult(rawResult);

        onStatus({
          toolStatus: "Tool completed",
          toolName: name,
          serverName: serverConfig.name,
        });

        await logToolExecution({
          userId,
          conversationId,
          toolName: name,
          serverId: serverConfig.id,
          serverName: serverConfig.name,
          source: "mcp",
          status: "success",
          durationMs: Date.now() - startTime,
          metadata: sanitizeMetadata(args),
        });

        return { result: normalized };
      } catch (err: any) {
        onStatus({
          toolStatus: "Tool failed",
          toolName: name,
          serverName: serverConfig.name,
          details: err.message,
        });

        await logToolExecution({
          userId,
          conversationId,
          toolName: name,
          serverId: serverConfig.id,
          serverName: serverConfig.name,
          source: "mcp",
          status: "error",
          durationMs: Date.now() - startTime,
          errorMessage: err.message,
          metadata: sanitizeMetadata(args),
        });

        return {
          result: { error: `MCP tool ${name} on server '${serverConfig.name}' failed: ${err.message}` },
          error: err.message,
        };
      }
    }

    // 4. Fallback if tool is not found
    console.warn(`[ToolManager] Tool '${name}' not found in built-ins or active MCP servers.`);
    return {
      result: { error: `Tool '${name}' is not recognized or available.` },
      error: `Tool '${name}' not found`,
    };
  }
}

export const toolManager = new CentralToolManager();
