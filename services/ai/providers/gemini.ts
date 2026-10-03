import { GenerateContentResponse } from "@google/genai";
import { AIProvider, AIChatMessage, AIGenerationOptions, AIStreamChunk } from "../types.js";
import { UnifiedTool } from "../../mcp/types.js";
import { getGeminiClient, withExponentialBackoff, compactConversationHistory } from "../../gemini.js";
import { apiKeyManager } from "../../apiKeys.js";

export class GeminiProvider implements AIProvider {
  public readonly id = "gemini";
  public readonly name = "Google Gemini";

  public isConfigured(): boolean {
    return Boolean(apiKeyManager.getActiveKey("gemini") || process.env.GEMINI_API_KEY);
  }

  public getModels(): string[] {
    return [
      "gemini-2.0-flash",
      "gemini-1.5-pro",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
    ];
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

  public getToolDeclarations(tools: UnifiedTool[], useSearch: boolean = true): any[] {
    const active = tools.filter((t) => t.enabled && t.permission !== "BLOCK");
    const filtered = active.filter((t) => useSearch || t.name !== "web_search");

    const declarations = filtered.map((tool) => {
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

  public async *generateStream(
    messages: AIChatMessage[],
    options: AIGenerationOptions
  ): AsyncGenerator<AIStreamChunk, void, unknown> {
    if (!this.isConfigured()) {
      yield {
        error: "AI_PROVIDER_NOT_CONFIGURED: Google Gemini is not configured. Please set GEMINI_API_KEY on the server.",
      };
      return;
    }

    const availableKey = apiKeyManager.getActiveKey("gemini") || process.env.GEMINI_API_KEY || "";
    const { client: ai } = getGeminiClient(availableKey);

    // Convert AIChatMessage array to Gemini contents
    const compacted = compactConversationHistory(messages);
    const contents = compacted.map((m: any, index: number) => {
      const parts: any[] = [];

      // Vision / Base64 imagery
      if (m.imagery && Array.isArray(m.imagery)) {
        m.imagery.forEach((imgData: string) => {
          if (imgData && imgData.includes(",")) {
            const mime = imgData.split(";")[0].split(":")[1] || "image/jpeg";
            const data = imgData.split(",")[1];
            parts.push({
              inlineData: { mimeType: mime, data },
            });
          }
        });
      }

      // Attached document text
      let combinedText = m.content?.trim() || "";
      if (index === messages.length - 1 && m.attachments && m.attachments.length > 0) {
        const docSummaries = m.attachments
          .filter((a: any) => a.extractedText)
          .map(
            (a: any) =>
              `\n--- [Uploaded Document: ${a.filename}] ---\n${a.extractedText}\n--- [End of Document] ---`
          )
          .join("\n");
        if (docSummaries) {
          combinedText = `${docSummaries}\n\n[User Instruction]:\n${combinedText || "Analyze the uploaded document(s) thoroughly."}`;
        }
      }

      // Check for functionCalls part
      if (m.functionCalls && Array.isArray(m.functionCalls) && m.functionCalls.length > 0) {
        for (const fc of m.functionCalls) {
          parts.push({
            functionCall: {
              name: fc.name,
              args: fc.args,
              ...(fc.id ? { id: fc.id } : {}),
            },
          });
        }
      }

      // Check for functionResponse part
      if (m.functionResponse) {
        parts.push({
          functionResponse: {
            name: m.functionResponse.name,
            response: m.functionResponse.response,
            ...(m.functionResponse.id ? { id: m.functionResponse.id } : {}),
          },
        });
      }

      if (parts.length === 0 || (!m.functionCalls && !m.functionResponse)) {
        parts.push({ text: combinedText || "Hello" });
      }

      const role = m.role === "assistant" ? "model" : m.role === "system" ? "user" : m.role;
      return { role, parts };
    });

    try {
      const model = options.model || "gemini-2.0-flash";
      const streamResponse = await withExponentialBackoff(async () => {
        return await ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: options.systemInstruction,
            tools: options.tools && options.tools.length > 0 ? options.tools : undefined,
          },
        });
      }, 2, 600);

      apiKeyManager.reportKeySuccess("gemini", availableKey);

      for await (const chunk of streamResponse) {
        const c = chunk as GenerateContentResponse;
        const resultChunk: AIStreamChunk = {};

        if (c.text) {
          resultChunk.text = c.text;
        }

        // Intercept function calls
        if (c.functionCalls && c.functionCalls.length > 0) {
          resultChunk.toolCalls = c.functionCalls.map((fc) => ({
            name: fc.name,
            args: (fc.args as Record<string, any>) || {},
            id: (fc as any).id,
          }));
        } else {
          const parts = (c as any).candidates?.[0]?.content?.parts || [];
          const foundCalls = parts
            .filter((p: any) => p.functionCall)
            .map((p: any) => ({
              name: p.functionCall.name,
              args: p.functionCall.args || {},
              id: p.functionCall.id,
            }));
          if (foundCalls.length > 0) {
            resultChunk.toolCalls = foundCalls;
          }
        }

        // Grounding sources
        if ((c as any).candidates?.[0]?.groundingMetadata?.groundingChunks) {
          const grounding = (c as any).candidates[0].groundingMetadata.groundingChunks;
          const sources: any[] = [];
          grounding.forEach((chk: any) => {
            if (chk.web) {
              sources.push({
                title: chk.web.title || "Search Result",
                domain: new URL(chk.web.uri).hostname.replace("www.", ""),
                url: chk.web.uri,
              });
            }
          });
          if (sources.length > 0) {
            resultChunk.sources = sources;
          }
        }

        yield resultChunk;
      }
    } catch (err: any) {
      apiKeyManager.reportKeyFailure("gemini", availableKey, err.message);
      yield { error: `Gemini Generation Error: ${err.message}` };
    }
  }
}
