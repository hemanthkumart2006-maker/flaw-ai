import { SystemCapabilityStatus, WorldNewsItem, CodeExecutionResult, AttachmentItem, User, Chat } from "../types";

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("flaw_ai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchSystemStatus(): Promise<SystemCapabilityStatus> {
  try {
    const res = await fetch("/api/system/status");
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn("Failed to fetch system status:", err);
  }
  return {
    gemini: "ready",
    voiceInput: "ready",
    voiceOutput: "ready",
    mcp: "not_configured",
    livekit: "not_configured",
    webSearch: "ready",
  };
}

export async function transcribeAudio(
  audioData: string, 
  mimeType: string = "audio/webm",
  languageCode?: string
): Promise<string> {
  const res = await fetch("/api/stt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioData, mimeType, languageCode }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `STT Request failed (${res.status})` }));
    throw new Error(err.error || `Transcription failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.transcript || "";
}

export async function generateSpeech(text: string, voice: string = "nova", speed: number = 1.0): Promise<Blob> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, speed }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "TTS Request failed" }));
    throw new Error(err.error || "TTS failed");
  }

  return await res.blob();
}

export async function fetchWorldNews(category?: string): Promise<WorldNewsItem[]> {
  try {
    const url = category ? `/api/news?category=${encodeURIComponent(category)}` : "/api/news";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return data.news || [];
    }
  } catch (err) {
    console.warn("Failed to fetch world news:", err);
  }
  return [];
}

export async function runCode(
  code: string, 
  language: string, 
  testCases?: { input: string; expectedOutput: string }[]
): Promise<CodeExecutionResult> {
  const res = await fetch("/api/execute-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, language, testCases }),
  });

  if (!res.ok) {
    throw new Error("Code execution request failed");
  }

  return await res.json();
}

// Upload document or image attachment to server
export async function uploadAttachment(
  filename: string,
  mimeType: string,
  base64Content: string,
  conversationId?: string
): Promise<AttachmentItem> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ filename, mimeType, base64Content, conversationId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error || "Attachment upload failed");
  }

  return await res.json();
}

// Auth API
export async function registerUser(name: string, email: string, password: string): Promise<{ user: User; token: string }> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Registration failed" }));
    throw new Error(err.error || "Registration failed");
  }

  const data = await res.json();
  localStorage.setItem("flaw_ai_token", data.token);
  return data;
}

export async function loginUser(email: string, password: string): Promise<{ user: User; token: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error || "Login failed");
  }

  const data = await res.json();
  localStorage.setItem("flaw_ai_token", data.token);
  return data;
}

export async function fetchCurrentUser(): Promise<User | null> {
  const token = localStorage.getItem("flaw_ai_token");
  if (!token) return null;

  try {
    const res = await fetch("/api/auth/me", {
      headers: { ...getAuthHeader() },
    });
    if (res.ok) {
      const data = await res.json();
      return data.user;
    }
  } catch (e) {
    console.warn("Failed to fetch user session:", e);
  }
  return null;
}

export function logoutUser(): void {
  localStorage.removeItem("flaw_ai_token");
}

// User Settings Persistence API
export async function fetchUserSettings(): Promise<any> {
  try {
    const res = await fetch("/api/user/settings", {
      headers: { ...getAuthHeader() },
    });
    if (res.ok) {
      const data = await res.json();
      return data.settings || {};
    }
  } catch (e) {
    console.warn("Failed to fetch user settings from server:", e);
  }
  return null;
}

export async function saveUserSettings(settings: any): Promise<boolean> {
  try {
    const res = await fetch("/api/user/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify({ settings }),
    });
    return res.ok;
  } catch (e) {
    console.warn("Failed to save user settings to server:", e);
    return false;
  }
}

// User API Keys API
export async function fetchUserApiKeys(): Promise<{ provider: string; active: boolean; preview: string; priority: number }[]> {
  try {
    const res = await fetch("/api/user/keys", {
      headers: { ...getAuthHeader() },
    });
    if (res.ok) {
      const data = await res.json();
      return data.keys || [];
    }
  } catch (e) {
    console.warn("Failed to fetch user API keys from server:", e);
  }
  return [];
}

export async function saveUserApiKey(provider: string, apiKey: string, priority: number = 0): Promise<boolean> {
  try {
    const res = await fetch("/api/user/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify({ provider, apiKey, priority }),
    });
    return res.ok;
  } catch (e) {
    console.warn("Failed to save user API key to server:", e);
    return false;
  }
}

// Server Chat Database Synchronization
export async function fetchServerConversations(): Promise<Chat[]> {
  try {
    const res = await fetch("/api/chats", {
      headers: { ...getAuthHeader() },
    });
    if (res.ok) {
      const data = await res.json();
      return data.conversations.map((c: any) => ({
        id: c.id,
        title: c.title,
        messages: [],
        updatedAt: new Date(c.updated_at).getTime(),
        isPinned: c.pinned,
        mode: c.mode,
      }));
    }
  } catch (e) {
    console.warn("Failed to fetch server conversations:", e);
  }
  return [];
}

export async function fetchConversationMessages(
  chatId: string, 
  options?: { limit?: number; offset?: number }
): Promise<{ messages: any[]; total: number; hasMore: boolean }> {
  try {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const res = await fetch(`/api/chats/${chatId}/messages?limit=${limit}&offset=${offset}`, {
      headers: { ...getAuthHeader() },
    });
    if (res.ok) {
      const data = await res.json();
      return {
        messages: data.messages || [],
        total: data.total || 0,
        hasMore: Boolean(data.hasMore),
      };
    }
  } catch (e) {
    console.warn("Failed to fetch conversation messages:", e);
  }
  return { messages: [], total: 0, hasMore: false };
}

export async function syncServerChat(chat: Chat) {
  try {
    await fetch("/api/chats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify({
        id: chat.id,
        title: chat.title,
        mode: chat.mode,
      }),
    });
  } catch (e) {
    console.warn("Failed to sync chat to server:", e);
  }
}

export async function updateServerChat(chatId: string, updates: { title?: string; pinned?: boolean; mode?: string }) {
  try {
    await fetch(`/api/chats/${chatId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify(updates),
    });
  } catch (e) {
    console.warn("Failed to update chat on server:", e);
  }
}

export async function deleteServerChat(chatId: string) {
  try {
    await fetch(`/api/chats/${chatId}`, {
      method: "DELETE",
      headers: {
        ...getAuthHeader(),
      },
    });
  } catch (e) {
    console.warn("Failed to delete chat on server:", e);
  }
}

export async function syncServerMessage(chatId: string, message: any) {
  try {
    await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify(message),
    });
  } catch (e) {
    console.warn("Failed to sync message to server:", e);
  }
}

// ==========================================
// MCP Architecture Client APIs
// ==========================================

export async function fetchMCPServers(): Promise<any[]> {
  try {
    const res = await fetch("/api/mcp/servers", {
      headers: { ...getAuthHeader() },
    });
    if (res.ok) {
      const data = await res.json();
      return data.servers || [];
    }
  } catch (e) {
    console.warn("Failed to fetch MCP servers:", e);
  }
  return [];
}

export async function createMCPServer(data: {
  name: string;
  description?: string;
  transport: "sse" | "stdio";
  endpoint: string;
  args?: string[];
  envVars?: Record<string, string>;
  enabled?: boolean;
  timeoutMs?: number;
}): Promise<any> {
  const res = await fetch("/api/mcp/servers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create MCP server" }));
    throw new Error(err.error || "Failed to create MCP server");
  }

  return await res.json();
}

export async function updateMCPServer(id: string, updates: any): Promise<boolean> {
  try {
    const res = await fetch(`/api/mcp/servers/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify(updates),
    });
    return res.ok;
  } catch (e) {
    console.warn("Failed to update MCP server:", e);
    return false;
  }
}

export async function deleteMCPServer(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/mcp/servers/${id}`, {
      method: "DELETE",
      headers: { ...getAuthHeader() },
    });
    return res.ok;
  } catch (e) {
    console.warn("Failed to delete MCP server:", e);
    return false;
  }
}

export async function reconnectMCPServer(id: string): Promise<{ success: boolean; tools?: any[]; error?: string }> {
  try {
    const res = await fetch(`/api/mcp/servers/${id}/connect`, {
      method: "POST",
      headers: { ...getAuthHeader() },
    });
    const data = await res.json();
    return data;
  } catch (e: any) {
    return { success: false, error: e.message || "Failed to connect" };
  }
}

export async function fetchUnifiedTools(): Promise<any[]> {
  try {
    const res = await fetch("/api/mcp/tools", {
      headers: { ...getAuthHeader() },
    });
    if (res.ok) {
      const data = await res.json();
      return data.tools || [];
    }
  } catch (e) {
    console.warn("Failed to fetch unified tools:", e);
  }
  return [];
}

export async function fetchToolPermissions(): Promise<Record<string, "AUTO" | "ASK" | "BLOCK">> {
  try {
    const res = await fetch("/api/mcp/permissions", {
      headers: { ...getAuthHeader() },
    });
    if (res.ok) {
      const data = await res.json();
      return data.permissions || {};
    }
  } catch (e) {
    console.warn("Failed to fetch tool permissions:", e);
  }
  return {};
}

export async function saveToolPermission(toolName: string, permission: "AUTO" | "ASK" | "BLOCK"): Promise<boolean> {
  try {
    const res = await fetch("/api/mcp/permissions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify({ toolName, permission }),
    });
    return res.ok;
  } catch (e) {
    console.warn("Failed to save tool permission:", e);
    return false;
  }
}

export async function fetchToolExecutionLogs(limit: number = 30): Promise<any[]> {
  try {
    const res = await fetch(`/api/mcp/logs?limit=${limit}`, {
      headers: { ...getAuthHeader() },
    });
    if (res.ok) {
      const data = await res.json();
      return data.logs || [];
    }
  } catch (e) {
    console.warn("Failed to fetch tool execution logs:", e);
  }
  return [];
}

