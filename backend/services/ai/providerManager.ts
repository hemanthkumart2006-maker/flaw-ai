import { AIProvider, AIProviderStatus, AIProviderId } from "./types.js";
import { GeminiProvider } from "./providers/gemini.js";
import { QwenProvider } from "./providers/qwen.js";
import { OpenAIProvider } from "./providers/openai.js";

export class AIProviderManager {
  private providers: Map<string, AIProvider> = new Map();

  constructor() {
    this.registerDefaultProviders();
  }

  private registerDefaultProviders() {
    this.registerProvider(new GeminiProvider());
    this.registerProvider(new QwenProvider());
    this.registerProvider(new OpenAIProvider());
  }

  public registerProvider(provider: AIProvider): void {
    this.providers.set(provider.id.toLowerCase(), provider);
  }

  public getProvider(id: string): AIProvider | undefined {
    return this.providers.get(id.toLowerCase());
  }

  public getAllProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  public getConfiguredProviders(): AIProvider[] {
    return this.getAllProviders().filter((p) => p.isConfigured());
  }

  /**
   * Resolves the active provider based on user request or AUTO selection.
   * If requestedId is "AUTO", selects the first configured provider.
   */
  public getActiveProvider(requestedId?: string | null): {
    provider: AIProvider | null;
    resolvedId: string;
    error?: string;
  } {
    const configured = this.getConfiguredProviders();

    // AUTO selection mode
    if (!requestedId || requestedId.toUpperCase() === "AUTO") {
      if (configured.length > 0) {
        return {
          provider: configured[0],
          resolvedId: configured[0].id,
        };
      }

      return {
        provider: null,
        resolvedId: "none",
        error: "NO_AI_PROVIDER_AVAILABLE: No AI provider is configured. Add an API key on the server (GEMINI_API_KEY, QWEN_API_KEY, or OPENAI_API_KEY) to enable AI responses.",
      };
    }

    // Explicit provider requested
    const target = this.getProvider(requestedId);
    if (!target) {
      return {
        provider: null,
        resolvedId: requestedId,
        error: `AI_PROVIDER_NOT_FOUND: Unknown AI provider '${requestedId}'. Available providers: ${Array.from(this.providers.keys()).join(", ")}`,
      };
    }

    if (!target.isConfigured()) {
      return {
        provider: null,
        resolvedId: target.id,
        error: `AI_PROVIDER_NOT_CONFIGURED: AI provider '${target.name}' is not configured on the server. Please add its API key to the server environment.`,
      };
    }

    return {
      provider: target,
      resolvedId: target.id,
    };
  }

  /**
   * Get health/configuration status for all registered providers.
   * Never exposes raw API keys.
   */
  public getProviderStatuses(): Record<string, AIProviderStatus> {
    const statuses: Record<string, AIProviderStatus> = {};
    for (const provider of this.providers.values()) {
      statuses[provider.id] = {
        id: provider.id,
        name: provider.name,
        configured: provider.isConfigured(),
        models: provider.getModels(),
      };
    }
    return statuses;
  }

  /**
   * Get all models across all registered providers.
   */
  public getAllAvailableModels(): Array<{ id: string; name: string; providerId: string; configured: boolean }> {
    const models: Array<{ id: string; name: string; providerId: string; configured: boolean }> = [];
    for (const provider of this.providers.values()) {
      const isConfig = provider.isConfigured();
      for (const modelId of provider.getModels()) {
        models.push({
          id: modelId,
          name: `${modelId} (${provider.name})`,
          providerId: provider.id,
          configured: isConfig,
        });
      }
    }
    return models;
  }
}

export const providerManager = new AIProviderManager();
