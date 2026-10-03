import dotenv from "dotenv";
dotenv.config();

export interface ManagedKey {
  id: string;
  provider: "gemini" | "openai" | "qwen" | "sarvam" | "livekit";
  key: string;
  priority: number;
  isActive: boolean;
  failureCount: number;
  lastUsedAt?: number;
  lastFailureAt?: number;
  lastError?: string;
}

class ApiKeyManager {
  private keys: Map<string, ManagedKey[]> = new Map();

  constructor() {
    this.initFromEnv();
  }

  private initFromEnv() {
    // Gemini keys
    const geminiEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    this.parseAndRegisterKeys("gemini", geminiEnv);

    // Qwen / DashScope keys
    const qwenEnv = process.env.QWEN_API_KEYS || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || "";
    this.parseAndRegisterKeys("qwen", qwenEnv);

    // OpenAI keys
    const openaiEnv = process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY || "";
    this.parseAndRegisterKeys("openai", openaiEnv);

    // Sarvam keys
    const sarvamEnv = process.env.SARVAM_API_KEYS || process.env.SARVAM_API_KEY || "";
    this.parseAndRegisterKeys("sarvam", sarvamEnv);

    // LiveKit keys
    const livekitEnv = process.env.LIVEKIT_API_KEY || "";
    if (livekitEnv) {
      this.parseAndRegisterKeys("livekit", livekitEnv);
    }
  }

  public parseAndRegisterKeys(provider: ManagedKey["provider"], rawKeysString: string) {
    if (!rawKeysString) return;
    const split = rawKeysString
      .split(/[,;\n]/)
      .map(k => k.trim())
      .filter(k => k.length > 5 && !k.startsWith("YOUR_"));

    const existing = this.keys.get(provider) || [];
    split.forEach((key, index) => {
      // Check if already registered
      if (!existing.some(k => k.key === key)) {
        existing.push({
          id: `${provider}-${existing.length + 1}`,
          provider,
          key,
          priority: index,
          isActive: true,
          failureCount: 0,
        });
      }
    });

    this.keys.set(provider, existing);
  }

  public registerKey(provider: ManagedKey["provider"], key: string, priority: number = 0) {
    if (!key || key.length < 5) return;
    const list = this.keys.get(provider) || [];
    const exists = list.find(k => k.key === key);
    if (!exists) {
      list.push({
        id: `${provider}-${list.length + 1}`,
        provider,
        key,
        priority,
        isActive: true,
        failureCount: 0,
      });
      this.keys.set(provider, list);
    }
  }

  public getActiveKey(provider: ManagedKey["provider"]): string | null {
    const list = this.keys.get(provider) || [];
    const activeKeys = list
      .filter(k => k.isActive)
      .sort((a, b) => {
        // First sort by failure count (fewer failures preferred)
        if (a.failureCount !== b.failureCount) {
          return a.failureCount - b.failureCount;
        }
        // Then sort by priority
        return a.priority - b.priority;
      });

    if (activeKeys.length === 0) return null;

    const chosen = activeKeys[0];
    chosen.lastUsedAt = Date.now();
    return chosen.key;
  }

  public getAllKeysForProvider(provider: ManagedKey["provider"]): string[] {
    const list = this.keys.get(provider) || [];
    return list.filter(k => k.isActive).map(k => k.key);
  }

  public reportKeyFailure(provider: ManagedKey["provider"], failedKey: string, errorMsg: string) {
    const list = this.keys.get(provider) || [];
    const target = list.find(k => k.key === failedKey);
    if (target) {
      target.failureCount += 1;
      target.lastFailureAt = Date.now();
      target.lastError = errorMsg;

      // If failure count is high (e.g. 5 repeated errors), temporarily disable or deprioritize
      if (target.failureCount >= 5) {
        console.warn(`[ApiKeyManager] Deprioritizing ${provider} key ending in ...${target.key.slice(-4)} due to multiple failures.`);
      }
    }
  }

  public reportKeySuccess(provider: ManagedKey["provider"], key: string) {
    const list = this.keys.get(provider) || [];
    const target = list.find(k => k.key === key);
    if (target && target.failureCount > 0) {
      target.failureCount = Math.max(0, target.failureCount - 1);
    }
  }

  public getSanitizedStatus() {
    const status: Record<string, { totalKeys: number; activeKeys: number; hasHealthyKey: boolean }> = {};
    for (const [provider, list] of this.keys.entries()) {
      const active = list.filter(k => k.isActive);
      status[provider] = {
        totalKeys: list.length,
        activeKeys: active.length,
        hasHealthyKey: active.some(k => k.failureCount < 3),
      };
    }
    return status;
  }
}

export const apiKeyManager = new ApiKeyManager();
