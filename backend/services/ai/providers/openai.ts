import { AIProvider, AIChatMessage, AIGenerationOptions, AIStreamChunk } from "../types.js";
import { UnifiedTool } from "../../mcp/types.js";
import { apiKeyManager } from "../../apiKeys.js";

export class OpenAIProvider implements AIProvider {
  public readonly id = "openai";
  public readonly name = "OpenAI";

  public isConfigured(): boolean {
    return Boolean(apiKeyManager.getActiveKey("openai") || process.env.OPENAI_API_KEY);
  }

  public getModels(): string[] {
    return ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"];
  }

  public supportsStreaming(): boolean {
    return true;
  }

  public supportsTools(): boolean {
    return true;
  }

  public supportsVision(): boolean {
    return true;
  }

  public getToolDeclarations(tools: UnifiedTool[], useSearch: boolean = true): any[] {
    const active = tools.filter((t) => t.enabled && t.permission !== "BLOCK");
    const filtered = active.filter((t) => useSearch || t.name !== "web_search");

    return filtered.map((tool) => ({
      type: "function",
      function: {
        name: tool.name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64),
        description: tool.description || `Tool ${tool.name}`,
        parameters:
          tool.inputSchema && typeof tool.inputSchema === "object"
            ? tool.inputSchema
            : { type: "object", properties: {} },
      },
    }));
  }

  public async *generateStream(
    messages: AIChatMessage[],
    options: AIGenerationOptions
  ): AsyncGenerator<AIStreamChunk, void, unknown> {
    if (!this.isConfigured()) {
      yield {
        error: "AI_PROVIDER_NOT_CONFIGURED: OpenAI is not configured. Please set OPENAI_API_KEY on the server.",
      };
      return;
    }

    const apiKey = apiKeyManager.getActiveKey("openai") || process.env.OPENAI_API_KEY || "";
    const model = options.model || "gpt-4o";

    const formattedMessages: any[] = [];

    // Optional System Instruction
    if (options.systemInstruction) {
      formattedMessages.push({
        role: "system",
        content: options.systemInstruction,
      });
    }

    // Convert messages
    for (const msg of messages) {
      if (msg.functionResponse) {
        formattedMessages.push({
          role: "tool",
          tool_call_id: msg.functionResponse.id || `call_${msg.functionResponse.name}`,
          content: JSON.stringify(msg.functionResponse.response),
        });
        continue;
      }

      if (msg.functionCalls && msg.functionCalls.length > 0) {
        formattedMessages.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.functionCalls.map((fc) => ({
            id: fc.id || `call_${fc.name}`,
            type: "function",
            function: {
              name: fc.name,
              arguments: JSON.stringify(fc.args || {}),
            },
          })),
        });
        continue;
      }

      const role = msg.role === "model" ? "assistant" : msg.role;
      let content: any = msg.content || "";

      // Attachments & Vision
      if (msg.imagery && msg.imagery.length > 0) {
        const parts: any[] = [{ type: "text", text: content || "Analyze this image." }];
        for (const img of msg.imagery) {
          parts.push({
            type: "image_url",
            image_url: { url: img },
          });
        }
        content = parts;
      }

      formattedMessages.push({ role, content });
    }

    try {
      const body: any = {
        model,
        messages: formattedMessages,
        stream: true,
      };

      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools;
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        apiKeyManager.reportKeyFailure("openai", apiKey, errText);
        yield { error: `OpenAI API Error (${response.status}): ${errText}` };
        return;
      }

      apiKeyManager.reportKeySuccess("openai", apiKey);

      const reader = response.body?.getReader();
      if (!reader) {
        yield { error: "OpenAI stream unavailable." };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      const pendingToolCalls: Map<number, { id: string; name: string; argsText: string }> = new Map();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data: ")) continue;

          const dataStr = trimmed.replace(/^data:\s*/, "");
          if (dataStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              yield { text: delta.content };
            }

            if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const index = tc.index ?? 0;
                const existing = pendingToolCalls.get(index) || { id: "", name: "", argsText: "" };
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) existing.argsText += tc.function.arguments;
                pendingToolCalls.set(index, existing);
              }
            }
          } catch {
            // Ignore incomplete chunk parse errors
          }
        }
      }

      // If tool calls were accumulated across chunks
      if (pendingToolCalls.size > 0) {
        const toolCalls: any[] = [];
        for (const call of pendingToolCalls.values()) {
          let parsedArgs = {};
          try {
            parsedArgs = call.argsText ? JSON.parse(call.argsText) : {};
          } catch {
            parsedArgs = { raw: call.argsText };
          }
          toolCalls.push({
            id: call.id || `call_${call.name}`,
            name: call.name,
            args: parsedArgs,
          });
        }
        yield { toolCalls };
      }
    } catch (err: any) {
      apiKeyManager.reportKeyFailure("openai", apiKey, err.message);
      yield { error: `OpenAI Stream Exception: ${err.message}` };
    }
  }
}
