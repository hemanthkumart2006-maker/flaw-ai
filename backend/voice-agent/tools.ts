/**
 * LiveKit Voice Agent - Tool Integration Bridge
 * Connects the LiveKit AI Voice Agent directly to CentralToolManager & MCP architecture.
 * Reuses existing CentralToolManager, MCP Registry, permissions, security, and logging.
 */

import { toolManager } from "../services/mcp/manager.js";
import { UnifiedTool, ToolExecutionResult, ToolStatusEvent } from "../services/mcp/types.js";

export interface VoiceToolExecutionContext {
  userId?: string | null;
  conversationId?: string | null;
  onToolStatus?: (event: ToolStatusEvent) => void;
}

export class VoiceToolManager {
  /**
   * Retrieves all enabled and permitted tools (built-in and MCP) for the user.
   */
  public async getAvailableTools(userId?: string | null): Promise<UnifiedTool[]> {
    return await toolManager.getAvailableTools(userId);
  }

  /**
   * Generates Gemini / OpenAI / universal tool declarations for the voice agent LLM.
   */
  public async getToolDeclarations(
    provider: { getToolDeclarations: (tools: UnifiedTool[], useSearch?: boolean) => any[] },
    userId?: string | null,
    aiMode?: string,
    useSearch: boolean = true
  ): Promise<any[]> {
    return await toolManager.getToolDeclarationsForProvider(provider, userId, aiMode, useSearch);
  }

  /**
   * Executes a tool through CentralToolManager with security policies, permission checks,
   * database logging, and speech-friendly result summarization.
   */
  public async executeTool(
    toolName: string,
    args: Record<string, any> = {},
    context: VoiceToolExecutionContext = {}
  ): Promise<{
    rawResult: any;
    spokenSummary: string;
    error?: string;
  }> {
    const { userId, conversationId, onToolStatus } = context;

    try {
      const execution: ToolExecutionResult = await toolManager.executeTool(toolName, args, {
        userId,
        conversationId,
        onStatus: onToolStatus,
      });

      if (execution.error) {
        return {
          rawResult: execution.result,
          spokenSummary: `The tool ${toolName} encountered an error: ${execution.error}`,
          error: execution.error,
        };
      }

      // Format result into a concise, voice-friendly summary for the LLM to speak
      const spokenSummary = this.formatResultForSpeech(toolName, execution.result);

      return {
        rawResult: execution.result,
        spokenSummary,
      };
    } catch (err: any) {
      const errorMessage = err.message || "Unknown error executing tool";
      return {
        rawResult: { error: errorMessage },
        spokenSummary: `I could not complete the ${toolName} action due to an error: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  /**
   * Formats tool output so the voice agent speaks naturally without reading out
   * huge raw JSON blobs or confusing brackets.
   */
  private formatResultForSpeech(toolName: string, result: any): string {
    if (!result) return "No information was returned.";

    if (typeof result === "string") {
      return result.length > 800 ? `${result.slice(0, 800)}... (truncated for speech)` : result;
    }

    if (toolName === "get_current_time") {
      return `The current time is ${result.formatted || result.time || JSON.stringify(result)}.`;
    }

    if (toolName === "get_system_info") {
      return `System info: Platform is ${result.platform || "unknown"}, CPU cores: ${result.cpus || "unknown"}, free memory: ${result.freeMemory || "unknown"}.`;
    }

    if (toolName === "get_world_news" && Array.isArray(result.news_items)) {
      const headlines = result.news_items
        .slice(0, 3)
        .map((item: any, i: number) => `${i + 1}: ${item.title} (from ${item.source})`)
        .join(". ");
      return `Top headlines: ${headlines}`;
    }

    if (toolName === "web_search" && Array.isArray(result.results)) {
      const topResults = result.results
        .slice(0, 3)
        .map((item: any) => `${item.title}: ${item.snippet}`)
        .join(" | ");
      return `Search findings: ${topResults}`;
    }

    // Default serialization
    try {
      const jsonStr = JSON.stringify(result);
      return jsonStr.length > 500 ? `${jsonStr.slice(0, 500)}...` : jsonStr;
    } catch {
      return String(result);
    }
  }
}

export const voiceToolManager = new VoiceToolManager();
