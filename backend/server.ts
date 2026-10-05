import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { GenerateContentResponse } from "@google/genai";

import { 
  getGeminiClient, 
  buildSystemPrompt, 
  executeToolCall, 
  compactConversationHistory, 
  withExponentialBackoff, 
  getDynamicGeminiTools
} from "./services/gemini.js";
import { providerManager, AIChatMessage } from "./services/ai/index.js";
import { transcribeAudioWithSarvam } from "./services/speech.js";
import { generateSpeechWithOpenAI } from "./services/tts.js";
import { getLiveKitConfigStatus, createLiveKitToken, generateVoiceRoomName } from "./services/livekit.js";
import { voiceAgentService } from "./voice-agent/agent.js";
import { 
  getMCPStatus, 
  getMCPStatusAsync,
  fetchMCPTools, 
  mcpRegistry, 
  toolManager, 
  validateEndpointUrl, 
  validateStdioCommand 
} from "./services/mcp.js";
import { getWorldNews, performWebSearch, fetchUrlContent, getSafeSystemInformation, getCurrentFormattedTime } from "./services/web.js";
import { executeCodeSafely } from "./services/code.js";
import { apiKeyManager } from "./services/apiKeys.js";
import { processUploadedAttachment } from "./services/attachments.js";
import { 
  initDatabase, 
  createUser, 
  findUserByEmail, 
  findUserById, 
  getConversations, 
  createConversation, 
  updateConversation, 
  deleteConversation, 
  getMessages, 
  createMessage, 
  createAttachmentRecord, 
  logUsage,
  getUserSettings,
  saveUserSettings,
  saveEncryptedApiKey,
  getUserApiKeys,
  getMCPServersFromDB,
  createMCPServerInDB,
  updateMCPServerInDB,
  deleteMCPServerFromDB,
  syncMCPToolsInDB,
  getToolPermissions,
  setToolPermission,
  getToolExecutionLogsFromDB
} from "./services/database.js";

import { JWT_SECRET, PORT, IS_PRODUCTION } from "./config/env.js";
import { authenticateToken, requireAuth } from "./middleware/auth.js";
import { authRateLimiter, chatRateLimiter } from "./middleware/rateLimiter.js";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve uploaded attachments statically
const uploadsDir = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadsDir));

app.use(authenticateToken);

// ==========================================
// 1. Authentication Endpoints
// ==========================================

app.post("/api/auth/register", authRateLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const user = await createUser(name, email, passwordHash);

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token,
    });
  } catch (error: any) {
    console.error("Register Error:", error.message);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token,
    });
  } catch (error: any) {
    console.error("Login Error:", error.message);
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/auth/me", requireAuth, async (req: any, res) => {
  try {
    const user = await findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

// ==========================================
// 2. Database Chat History & Persistence Endpoints
// ==========================================

app.get("/api/chats", async (req: any, res) => {
  try {
    const userId = req.user ? req.user.userId : null;
    const conversations = await getConversations(userId);
    res.json({ conversations });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

app.post("/api/chats", async (req: any, res) => {
  try {
    const { id, title = "New Conversation", mode = "GENERAL" } = req.body;
    const userId = req.user ? req.user.userId : null;
    const conversationId = id || crypto.randomUUID();

    const conv = await createConversation({ id: conversationId, userId, title, mode });
    res.json({ conversation: conv });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

app.put("/api/chats/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, pinned, mode } = req.body;
    const success = await updateConversation(id, { title, pinned, mode });
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to update conversation" });
  }
});

app.patch("/api/chats/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, pinned, mode } = req.body;
    const success = await updateConversation(id, { title, pinned, mode });
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to update conversation" });
  }
});

// User Settings Persistence Endpoints
app.get("/api/user/settings", requireAuth, async (req: any, res) => {
  try {
    const settings = await getUserSettings(req.user.userId);
    res.json({ settings: settings || {} });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch user settings" });
  }
});

app.post("/api/user/settings", requireAuth, async (req: any, res) => {
  try {
    const { settings } = req.body;
    const saved = await saveUserSettings(req.user.userId, settings || {});
    res.json({ settings: saved });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to save user settings" });
  }
});

// User API Keys Configuration Endpoints (Encrypted, Zero Plaintext in DB)
app.get("/api/user/keys", requireAuth, async (req: any, res) => {
  try {
    const keys = await getUserApiKeys(req.user.userId);
    res.json({ keys });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch user API keys" });
  }
});

app.post("/api/user/keys", requireAuth, async (req: any, res) => {
  try {
    const { provider, apiKey, priority } = req.body;
    if (!provider || !apiKey) {
      return res.status(400).json({ error: "Provider and apiKey are required" });
    }
    await saveEncryptedApiKey(req.user.userId, provider, apiKey, priority || 0);
    apiKeyManager.registerKey(provider, apiKey, priority || 0);
    res.json({ success: true, provider });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to store encrypted API key" });
  }
});

app.delete("/api/chats/:id", async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.userId : null;
    const success = await deleteConversation(id, userId);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

app.get("/api/chats/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const result = await getMessages(id, { limit, offset });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

app.post("/api/chats/:id/messages", async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const { id, role, content, model, metadata } = req.body;
    const msg = await createMessage({
      id: id || crypto.randomUUID(),
      conversationId,
      role,
      content,
      model,
      metadata,
    });
    res.json({ message: msg });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to record message" });
  }
});

// ==========================================
// 3. Document / Image / Screenshot Upload Endpoint
// ==========================================

app.post("/api/upload", async (req: any, res) => {
  try {
    const { filename, mimeType, base64Content, conversationId, messageId } = req.body;
    if (!filename || !base64Content) {
      return res.status(400).json({ error: "filename and base64Content are required" });
    }

    const processed = await processUploadedAttachment(
      filename,
      mimeType || "application/octet-stream",
      base64Content
    );

    // Save record to database if conversationId is provided
    if (conversationId) {
      await createAttachmentRecord({
        userId: req.user ? req.user.userId : null,
        conversationId,
        messageId,
        filename: processed.filename,
        mimeType: processed.mimeType,
        size: processed.size,
        storagePath: processed.storagePath,
        extractedText: processed.extractedText,
      });
    }

    res.json({
      id: processed.id,
      filename: processed.filename,
      mimeType: processed.mimeType,
      size: processed.size,
      storagePath: `/uploads/${path.basename(processed.storagePath)}`,
      extractedText: processed.extractedText,
      isImage: processed.isImage,
    });
  } catch (error: any) {
    console.error("Upload Error:", error.message);
    res.status(500).json({ error: "Failed to process file attachment" });
  }
});

// ==========================================
// 4. System Status & Existing Capabilities
// ==========================================

app.get("/api/system/status", async (req, res) => {
  const authenticatedUserId = (req as any).user ? (req as any).user.userId : null;
  const providerStatuses = providerManager.getProviderStatuses();
  const geminiConfigured = providerStatuses.gemini?.configured ?? false;
  const sarvamKey = apiKeyManager.getActiveKey("sarvam") || process.env.SARVAM_API_KEY || "";
  const sarvamConfigured = Boolean(sarvamKey && sarvamKey.trim().length > 5 && !sarvamKey.startsWith("YOUR_"));
  const openAIConfigured = Boolean(apiKeyManager.getActiveKey("openai") || process.env.OPENAI_API_KEY);
  const livekitConfig = getLiveKitConfigStatus();
  const mcpConfig = await getMCPStatusAsync(authenticatedUserId);

  res.json({
    gemini: geminiConfigured ? "ready" : "not_configured",
    voiceInput: sarvamConfigured ? "ready" : "not_configured",
    sarvam: {
      configured: sarvamConfigured,
      model: process.env.SARVAM_MODEL || "saaras:v4",
    },
    voiceOutput: openAIConfigured ? "ready" : "unavailable",
    mcp: mcpConfig.status,
    livekit: livekitConfig.isConfigured ? "ready" : "not_configured",
    webSearch: "ready",
    providers: providerStatuses,
    mcpDetails: {
      isConfigured: mcpConfig.isConfigured,
      totalServers: mcpConfig.totalServersCount,
      activeServers: mcpConfig.activeServersCount,
      connectedServers: mcpConfig.connectedCount,
      toolsCount: mcpConfig.toolsCount,
    },
  });
});

app.get("/api/ai/models", async (req, res) => {
  res.json({ models: providerManager.getAllAvailableModels() });
});

// LiveKit Token Endpoint (Realtime Voice Architecture)
app.post("/api/livekit/token", async (req, res) => {
  try {
    const configStatus = getLiveKitConfigStatus();
    if (!configStatus.isConfigured) {
      return res.status(503).json({
        isConfigured: false,
        error: "LiveKit is not configured. Add LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to your server environment.",
      });
    }

    // Authenticated user identity validation
    const authenticatedUser = (req as any).user;
    const authenticatedUserId = authenticatedUser?.userId;
    const { 
      conversationId, 
      roomName: customRoomName, 
      aiMode = "GENERAL", 
      provider = "AUTO", 
      model, 
      fridayMode 
    } = req.body;

    // Secure deterministic room naming & identity
    const userId = authenticatedUserId ? String(authenticatedUserId) : `guest-${Date.now()}`;
    const safeConvId = conversationId ? String(conversationId).replace(/[^a-zA-Z0-9_-]/g, "") : "voice-session";
    const roomName = customRoomName || generateVoiceRoomName(userId, safeConvId);
    const identity = authenticatedUserId ? `user-${authenticatedUserId}` : `guest-${Date.now()}`;
    const displayName = authenticatedUser?.name || authenticatedUser?.email || identity;

    const tokenData = await createLiveKitToken({
      roomName,
      identity,
      name: displayName,
      metadata: {
        userId: authenticatedUserId || null,
        conversationId: safeConvId,
        aiMode,
        provider,
        model,
        fridayMode: Boolean(fridayMode),
      },
      ttlSeconds: 3600, // 1-hour short-lived participant token
    });

    // If Voice Agent service is ready, ensure agent joins room
    if (voiceAgentService.isReady()) {
      voiceAgentService.ensureAgentInRoom(roomName, {
        userId: authenticatedUserId || null,
        conversationId: safeConvId,
        aiMode,
        selectedProvider: provider,
        selectedModel: model,
        fridayMode: Boolean(fridayMode),
      }).catch((agentErr) => {
        console.warn(`[LiveKit Server] Warning attaching agent to room '${roomName}':`, agentErr.message);
      });
    }

    res.json(tokenData);
  } catch (error: any) {
    const statusCode = error.code === "LIVEKIT_NOT_CONFIGURED" ? 503 : 500;
    res.status(statusCode).json({ error: error.message, isConfigured: false });
  }
});

// Speech-to-Text Endpoint (Sarvam Saaras STT)
app.post("/api/stt", async (req, res) => {
  try {
    const { audioData, mimeType = "audio/webm", languageCode, language } = req.body;

    // 1. Validation: audioData exists and is non-empty string
    if (!audioData || typeof audioData !== "string" || !audioData.trim()) {
      return res.status(400).json({ error: "audioData is required and must be a valid base64 or data URL string" });
    }

    // 2. MIME type validation
    const cleanMime = (mimeType || "audio/webm").split(";")[0].toLowerCase().trim();
    const allowedMimes = [
      "audio/webm",
      "audio/wav",
      "audio/x-wav",
      "audio/wave",
      "audio/mp3",
      "audio/mpeg",
      "audio/ogg",
      "audio/m4a",
      "audio/aac",
      "audio/mp4",
      "audio/flac",
    ];

    if (!allowedMimes.includes(cleanMime)) {
      return res.status(400).json({ 
        error: `Unsupported audio MIME type: ${cleanMime}. Allowed formats: webm, wav, mp3, ogg, m4a, aac, flac.` 
      });
    }

    // 3. Extract and parse base64
    const base64Content = audioData.includes(",") ? audioData.split(",")[1] : audioData;
    const buffer = Buffer.from(base64Content, "base64");

    // 4. Validate size limits
    if (buffer.length < 100) {
      return res.status(400).json({ error: "Recorded audio is too short or empty." });
    }
    const maxAudioBytes = 25 * 1024 * 1024; // 25 MB limit
    if (buffer.length > maxAudioBytes) {
      return res.status(413).json({ error: "Audio data exceeds maximum size limit (25MB)." });
    }

    // 5. Check if Sarvam is configured before dispatching
    const sarvamKey = apiKeyManager.getActiveKey("sarvam") || process.env.SARVAM_API_KEY;
    if (!sarvamKey || sarvamKey.trim().length <= 5 || sarvamKey.startsWith("YOUR_")) {
      return res.status(503).json({ 
        error: "Sarvam Saaras STT is not configured on the server. Please set SARVAM_API_KEY in .env." 
      });
    }

    // 6. Transcribe using Sarvam STT service
    const selectedLanguage = languageCode || language;
    const transcript = await transcribeAudioWithSarvam(buffer, mimeType, {
      languageCode: selectedLanguage,
    });

    res.json({ transcript: transcript || "" });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    // Log sanitized error message without exposing keys or credentials
    console.error(`[STT Endpoint Error] (${statusCode}):`, error.message);

    // Return safe user-facing message
    res.status(statusCode).json({ 
      error: error.message || "Failed to transcribe audio. Please try again." 
    });
  }
});

// Text-to-Speech Endpoint (OpenAI TTS)
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice = "nova", speed = 1.0 } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    const audioArrayBuffer = await generateSpeechWithOpenAI({ text, voice, speed });
    const buffer = Buffer.from(audioArrayBuffer);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (error: any) {
    console.error("TTS Endpoint error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// World News Feed Endpoint
app.get("/api/news", async (req, res) => {
  try {
    const category = req.query.category as string;
    const news = await getWorldNews(category);
    res.json({ news });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Safe Code Execution Endpoint (Sandboxed)
app.post("/api/execute-code", async (req, res) => {
  try {
    const { code, language = "javascript", testCases } = req.body;
    if (!code) {
      return res.status(400).json({ error: "code parameter is required" });
    }

    const result = await executeCodeSafely(code, language, testCases);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 4.5. Complete Model Context Protocol (MCP) Architecture Endpoints
// ==========================================

// Get user's MCP servers (with real connection status; credentials masked)
app.get("/api/mcp/servers", async (req: any, res) => {
  try {
    const userId = req.user ? req.user.userId : null;
    const dbServers = await getMCPServersFromDB(userId);
    
    // Merge DB records with live connection instances in mcpRegistry
    const serversWithStatus = dbServers.map((server) => {
      let liveInstance = mcpRegistry.getInstance(server.id);
      if (!liveInstance && server.enabled) {
        liveInstance = mcpRegistry.registerServer(server);
      }
      const liveStatus = liveInstance ? liveInstance.getStatus() : server.status;
      const liveTools = liveInstance && liveInstance.getTools().length > 0 
        ? liveInstance.getTools() 
        : (server.tools || []);
      return {
        id: server.id,
        name: server.name,
        description: server.description,
        transport: server.transport,
        endpoint: server.endpoint,
        args: server.args || [],
        enabled: server.enabled,
        status: liveStatus,
        timeoutMs: server.timeoutMs,
        toolCount: liveTools.length,
        tools: liveTools,
        hasAuth: Boolean(server.envVars && Object.keys(server.envVars).length > 0),
        createdAt: server.createdAt,
        updatedAt: server.updatedAt,
      };
    });

    res.json({ servers: serversWithStatus });
  } catch (error: any) {
    console.error("GET /api/mcp/servers error:", error.message);
    res.status(500).json({ error: "Failed to fetch MCP servers" });
  }
});

// Add a new MCP server (Validates security, encrypts secrets, registers instance)
app.post("/api/mcp/servers", async (req: any, res) => {
  try {
    const userId = req.user ? req.user.userId : null;
    const { 
      name, 
      description, 
      transport = "sse", 
      endpoint, 
      args = [], 
      envVars = {}, 
      enabled = true, 
      timeoutMs = 15000 
    } = req.body;

    if (!name || !endpoint) {
      return res.status(400).json({ error: "Server name and endpoint are required" });
    }

    if (!["sse", "stdio"].includes(transport)) {
      return res.status(400).json({ error: "Transport must be 'sse' or 'stdio'" });
    }

    // SSRF / Command injection security validations
    if (transport === "sse") {
      const val = validateEndpointUrl(endpoint);
      if (!val.valid) {
        return res.status(400).json({ error: val.reason });
      }
    } else if (transport === "stdio") {
      const val = validateStdioCommand(endpoint, args);
      if (!val.valid) {
        return res.status(400).json({ error: val.reason });
      }
    }

    // Create server in DB (with AES-256-GCM encrypted secrets)
    const newServer = await createMCPServerInDB({
      userId,
      name,
      description,
      transport,
      endpoint,
      args,
      envVars,
      enabled,
      timeoutMs,
    });

    // Register in MCP runtime registry
    const instance = mcpRegistry.registerServer(newServer);

    // If enabled, connect and discover tools immediately
    let discoveredTools: any[] = [];
    if (enabled) {
      const connectResult = await mcpRegistry.connectServer(newServer.id);
      if (connectResult.success) {
        discoveredTools = connectResult.tools;
        await syncMCPToolsInDB(newServer.id, discoveredTools);
        await updateMCPServerInDB(newServer.id, { status: "connected" }, userId);
      } else {
        await updateMCPServerInDB(newServer.id, { status: "error" }, userId);
      }
    }

    res.json({
      server: {
        id: newServer.id,
        name: newServer.name,
        description: newServer.description,
        transport: newServer.transport,
        endpoint: newServer.endpoint,
        args: newServer.args,
        enabled: newServer.enabled,
        status: instance.getStatus(),
        timeoutMs: newServer.timeoutMs,
        tools: discoveredTools,
      },
    });
  } catch (error: any) {
    console.error("POST /api/mcp/servers error:", error.message);
    res.status(500).json({ error: error.message || "Failed to create MCP server" });
  }
});

// Update an existing MCP server
app.put("/api/mcp/servers/:id", async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.userId : null;
    const { name, description, transport, endpoint, args, envVars, enabled, timeoutMs } = req.body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (transport !== undefined) updates.transport = transport;
    if (endpoint !== undefined) updates.endpoint = endpoint;
    if (args !== undefined) updates.args = args;
    if (envVars !== undefined) updates.envVars = envVars;
    if (enabled !== undefined) updates.enabled = enabled;
    if (timeoutMs !== undefined) updates.timeoutMs = timeoutMs;

    const success = await updateMCPServerInDB(id, updates, userId);
    if (!success) {
      return res.status(404).json({ error: "MCP server not found" });
    }

    // Refresh instance in registry
    const dbServers = await getMCPServersFromDB(userId);
    const updatedServer = dbServers.find((s) => s.id === id);
    if (updatedServer) {
      if (updatedServer.enabled) {
        mcpRegistry.registerServer(updatedServer);
        await mcpRegistry.connectServer(id);
      } else {
        await mcpRegistry.unregisterServer(id);
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("PUT /api/mcp/servers/:id error:", error.message);
    res.status(500).json({ error: "Failed to update MCP server" });
  }
});

// Delete an MCP server
app.delete("/api/mcp/servers/:id", async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.userId : null;

    await mcpRegistry.unregisterServer(id);
    const success = await deleteMCPServerFromDB(id, userId);
    res.json({ success });
  } catch (error: any) {
    console.error("DELETE /api/mcp/servers/:id error:", error.message);
    res.status(500).json({ error: "Failed to delete MCP server" });
  }
});

// Reconnect/test connection and dynamically discover tools
app.post("/api/mcp/servers/:id/connect", async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.userId : null;

    let instance = mcpRegistry.getInstance(id);
    if (!instance) {
      const dbServers = await getMCPServersFromDB(userId);
      const serverCfg = dbServers.find((s) => s.id === id);
      if (!serverCfg) {
        return res.status(404).json({ error: "MCP server not found" });
      }
      instance = mcpRegistry.registerServer(serverCfg);
    }

    const connectResult = await mcpRegistry.connectServer(id);
    if (connectResult.success) {
      await syncMCPToolsInDB(id, connectResult.tools);
      await updateMCPServerInDB(id, { status: "connected" }, userId);
      res.json({
        success: true,
        status: "connected",
        tools: connectResult.tools,
      });
    } else {
      await updateMCPServerInDB(id, { status: "error" }, userId);
      res.status(502).json({
        success: false,
        status: "error",
        error: connectResult.error || "Connection failed",
      });
    }
  } catch (error: any) {
    console.error("POST /api/mcp/servers/:id/connect error:", error.message);
    res.status(500).json({ error: error.message || "Failed to connect to MCP server" });
  }
});

// Get tools discovered from a specific MCP server
app.get("/api/mcp/servers/:id/tools", async (req: any, res) => {
  try {
    const { id } = req.params;
    const instance = mcpRegistry.getInstance(id);
    const tools = instance ? instance.getTools() : [];
    res.json({ tools });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch server tools" });
  }
});

// Get all unified tools (built-in + MCP) available to the user
app.get("/api/mcp/tools", async (req: any, res) => {
  try {
    const userId = req.user ? req.user.userId : null;
    const tools = await toolManager.getAvailableTools(userId);
    res.json({ tools });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch tools" });
  }
});

// Get tool permissions for the user
app.get("/api/mcp/permissions", async (req: any, res) => {
  try {
    const userId = req.user ? req.user.userId : null;
    if (!userId) {
      return res.json({ permissions: {} });
    }
    const permissions = await getToolPermissions(userId);
    res.json({ permissions });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch tool permissions" });
  }
});

// Set tool permission (AUTO / ASK / BLOCK) - enforced on backend
app.post("/api/mcp/permissions", requireAuth, async (req: any, res) => {
  try {
    const { toolName, permission } = req.body;
    if (!toolName || !permission) {
      return res.status(400).json({ error: "toolName and permission are required" });
    }
    if (!["AUTO", "ASK", "BLOCK"].includes(permission)) {
      return res.status(400).json({ error: "permission must be 'AUTO', 'ASK', or 'BLOCK'" });
    }
    await setToolPermission(req.user.userId, toolName, permission);
    res.json({ success: true, toolName, permission });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to update tool permission" });
  }
});

// Get tool execution history logs
app.get("/api/mcp/logs", async (req: any, res) => {
  try {
    const userId = req.user ? req.user.userId : null;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const logs = await getToolExecutionLogsFromDB(userId, limit);
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch tool logs" });
  }
});

// ==========================================
// 5. Main Chat API Endpoint (Multimodal + Attachments + Tools + Fallback)
// ==========================================

app.post("/api/chat", chatRateLimiter, async (req: any, res) => {
  const requestStartTime = Date.now();
  try {
    const { 
      messages = [], 
      model, 
      provider: requestedProvider = "AUTO",
      useSearch = true, 
      fridayMode = false, 
      aiMode = "GENERAL",
      attachments = []
    } = req.body;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Resolve AI Provider (supports AUTO, gemini, qwen, openai)
    const { provider: activeProvider, resolvedId, error: providerError } = providerManager.getActiveProvider(requestedProvider);
    if (!activeProvider) {
      res.write(`data: ${JSON.stringify({ error: providerError || "NO_AI_PROVIDER_AVAILABLE: No AI provider is configured. Add an API key on the server (GEMINI_API_KEY, QWEN_API_KEY, or OPENAI_API_KEY) to enable AI responses." })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    const systemInstruction = buildSystemPrompt(fridayMode, aiMode);

    // Apply conversation compaction for long histories to conserve tokens and preserve context
    const compactedMessages = compactConversationHistory(messages);

    const currentMessages: AIChatMessage[] = compactedMessages.map((m: any, index: number) => {
      let combinedText = m.content?.trim() || "";
      if (index === messages.length - 1 && attachments && attachments.length > 0) {
        const docSummaries = attachments
          .filter((a: any) => a.extractedText)
          .map((a: any) => `\n--- [Uploaded Document: ${a.filename}] ---\n${a.extractedText}\n--- [End of Document] ---`)
          .join("\n");
        if (docSummaries) {
          combinedText = `${docSummaries}\n\n[User Instruction]:\n${combinedText || "Analyze the uploaded document(s) thoroughly."}`;
        }
      }
      return {
        role: m.role === "assistant" || m.role === "model" ? "assistant" : "user",
        content: combinedText || (m.imagery?.length ? "Analyze the attached image(s)." : "Hello"),
        imagery: m.imagery ? (Array.isArray(m.imagery) ? m.imagery : [m.imagery]) : undefined,
      };
    });

    // Check last user query for intelligent tool trigger keywords
    const lastUserMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const userQuery = lastUserMsg ? (lastUserMsg.content || "").toLowerCase().trim() : "";

    let toolActivityResult: any = null;
    let accumulatedSources: any[] = [];
    let offerWorldMonitor = false;

    // Prepare real-time tool execution options and event streaming callback
    const toolDispatchOptions = {
      userId: req.user ? req.user.userId : null,
      conversationId: req.body?.conversationId || null,
      onStatus: (event: any) => {
        res.write(`data: ${JSON.stringify({ 
          toolStatus: event.toolStatus, 
          toolName: event.toolName, 
          serverName: event.serverName,
          details: event.details 
        })}\n\n`);
      },
    };

    // Direct built-in tool fast-path interception
    if (
      userQuery.includes("news") || 
      userQuery.includes("what happened in the world") || 
      userQuery.includes("brief me") ||
      userQuery.includes("headlines") ||
      userQuery.includes("what's happening in the world")
    ) {
      const newsData = await executeToolCall("get_world_news", {}, toolDispatchOptions);
      toolActivityResult = newsData.result;
      if (newsData.sources) accumulatedSources.push(...newsData.sources);
      if (newsData.offerWorldMonitor) offerWorldMonitor = true;
    } else if (
      userQuery.includes("what time") || 
      userQuery.includes("current time") || 
      userQuery.includes("what is the time") ||
      userQuery.includes("what's the time") ||
      userQuery === "time"
    ) {
      const timeData = await executeToolCall("get_current_time", {}, toolDispatchOptions);
      toolActivityResult = timeData.result;
    } else if (
      userQuery.includes("http://") || 
      userQuery.includes("https://") || 
      userQuery.startsWith("read url") || 
      userQuery.startsWith("fetch url")
    ) {
      const matchUrl = userQuery.match(/https?:\/\/[^\s]+/);
      if (matchUrl) {
        const urlData = await executeToolCall("fetch_url", { url: matchUrl[0] }, toolDispatchOptions);
        toolActivityResult = urlData.result;
        if (urlData.sources) accumulatedSources.push(...urlData.sources);
      }
    } else if (
      userQuery.includes("system info") || 
      userQuery.includes("system status") || 
      userQuery.includes("system specs") ||
      userQuery.includes("system information")
    ) {
      const sysData = await executeToolCall("get_system_info", {}, toolDispatchOptions);
      toolActivityResult = sysData.result;
    } else if (
      useSearch && 
      (userQuery.startsWith("search") || userQuery.includes("search the web") || userQuery.includes("latest news on") || userQuery.includes("google search"))
    ) {
      const searchRes = await executeToolCall("web_search", { query: userQuery.replace(/search the web for|search for|search/gi, "").trim() || userQuery }, toolDispatchOptions);
      toolActivityResult = searchRes.result;
      if (searchRes.sources) accumulatedSources.push(...searchRes.sources);
    }

    // Attach pre-retrieved built-in tool result to the active turn if any
    if (toolActivityResult && currentMessages.length > 0) {
      currentMessages[currentMessages.length - 1].content += `\n\n[Retrieved Real-time Tool Information]:\n${JSON.stringify(toolActivityResult, null, 2)}`;
    }

    // Prepare unified dynamic tools configuration for active provider (Built-in + MCP)
    const toolsConfig = await toolManager.getToolDeclarationsForProvider(
      activeProvider,
      req.user ? req.user.userId : null,
      aiMode,
      useSearch && !toolActivityResult
    );

    res.write(`data: ${JSON.stringify({ toolStatus: "Generating..." })}\n\n`);

    try {
      const maxToolTurns = 5; // Support multiple sequential tool calls (safe maximum 5 rounds)
      let turnCount = 0;
      let hasMoreToolTurns = true;

      while (hasMoreToolTurns && turnCount < maxToolTurns) {
        turnCount++;
        hasMoreToolTurns = false;
        const turnFunctionCalls: Array<{ name: string; args: Record<string, any>; id?: string }> = [];

        const stream = activeProvider.generateStream(currentMessages, {
          model: model || activeProvider.getModels()[0],
          systemInstruction,
          aiMode,
          fridayMode,
          useSearch,
          tools: toolsConfig.length > 0 ? toolsConfig : undefined,
          userId: req.user ? req.user.userId : null,
          conversationId: req.body?.conversationId || null,
        });

        for await (const chunk of stream) {
          if (chunk.error) {
            res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`);
          }
          if (chunk.text) {
            res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
          }
          if (chunk.sources && chunk.sources.length > 0) {
            accumulatedSources.push(...chunk.sources);
          }
          if (chunk.toolCalls && chunk.toolCalls.length > 0) {
            for (const tc of chunk.toolCalls) {
              const isDup = turnFunctionCalls.some(
                (existing) => existing.name === tc.name && JSON.stringify(existing.args) === JSON.stringify(tc.args)
              );
              if (!isDup) {
                turnFunctionCalls.push(tc);
              }
            }
          }
        }

        // If provider requested one or more tool calls, dispatch through CentralToolManager
        if (turnFunctionCalls.length > 0) {
          hasMoreToolTurns = true;

          // Record assistant turn with functionCalls
          currentMessages.push({
            role: "assistant",
            content: "",
            functionCalls: turnFunctionCalls,
          });

          // Execute requested tool calls through CentralToolManager
          for (const fc of turnFunctionCalls) {
            res.write(`data: ${JSON.stringify({ 
              toolStatus: "Using MCP tool...", 
              toolName: fc.name 
            })}\n\n`);

            const toolExecution = await executeToolCall(fc.name, fc.args, toolDispatchOptions);
            if (toolExecution.sources && toolExecution.sources.length > 0) {
              accumulatedSources.push(...toolExecution.sources);
            }
            if (toolExecution.offerWorldMonitor) {
              offerWorldMonitor = true;
            }

            const responseData = toolExecution.result !== undefined 
              ? toolExecution.result 
              : { error: toolExecution.error || "Tool execution failed" };

            currentMessages.push({
              role: "user",
              content: "",
              functionResponse: {
                id: fc.id,
                name: fc.name,
                response: typeof responseData === "object" && responseData !== null && !Array.isArray(responseData)
                  ? responseData 
                  : { result: responseData },
              },
            });

            res.write(`data: ${JSON.stringify({ 
              toolStatus: "MCP tool completed", 
              toolName: fc.name 
            })}\n\n`);
          }

          res.write(`data: ${JSON.stringify({ toolStatus: "Generating..." })}\n\n`);
        }
      }

      await logUsage({
        userId: req.user ? req.user.userId : null,
        provider: activeProvider.id,
        model: model || activeProvider.getModels()[0],
        durationMs: Date.now() - requestStartTime,
        success: true,
      });

    } catch (genError: any) {
      console.warn("Chat Stream error:", genError.message);
      res.write(`data: ${JSON.stringify({ error: `AI request error: ${genError.message}` })}\n\n`);
      await logUsage({
        userId: req.user ? req.user.userId : null,
        provider: activeProvider.id,
        model: model || activeProvider.getModels()[0],
        durationMs: Date.now() - requestStartTime,
        success: false,
        errorMessage: genError.message,
      });
    }

    // Send final metadata chunk with sources, provider info, and World Monitor offer flag
    res.write(`data: ${JSON.stringify({ 
      meta: { 
        sources: accumulatedSources.length > 0 ? accumulatedSources : undefined,
        offerWorldMonitor,
        provider: activeProvider.id,
      } 
    })}\n\n`);

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    console.error("Chat API Stream Error:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process chat query" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Communication interrupted" })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
});

// ==========================================
// 6. Server Initialization & Boot
// ==========================================

async function startServer() {
  // Initialize Database
  try {
    const dbStatus = await initDatabase();
    console.log(`[Database Initialized]: ${dbStatus.message}`);
  } catch (err: any) {
    console.error("[Database Init Error]:", err.message);
    if (IS_PRODUCTION) {
      console.error("[FATAL] Production database initialization failed. Exiting process.");
      process.exit(1);
    }
  }

  // Initialize and register MCP servers
  try {
    const savedServers = await getMCPServersFromDB();
    for (const server of savedServers) {
      mcpRegistry.registerServer(server);
    }

    // Check if MCP_SERVER_URL is configured in environment and register as default server if missing
    const defaultMcpUrl = process.env.MCP_SERVER_URL;
    if (defaultMcpUrl && !savedServers.some((s: any) => s.endpoint === defaultMcpUrl)) {
      try {
        const defaultServer = await createMCPServerInDB({
          name: "Default MCP Server",
          description: "System configured MCP server from environment",
          transport: "sse",
          endpoint: defaultMcpUrl,
          enabled: true,
        });
        mcpRegistry.registerServer(defaultServer);
      } catch (e: any) {
        console.warn("Could not register default MCP server from env:", e.message);
      }
    }

    // Reconnect enabled MCP servers automatically on startup
    const enabledServers = mcpRegistry.getServers().filter((s) => s.enabled);
    if (enabledServers.length > 0) {
      console.log(`[MCP Startup]: Reconnecting ${enabledServers.length} enabled MCP server(s)...`);
      const connectPromise = mcpRegistry.connectAll();
      // Allow up to 6 seconds for initial connections to complete so tools are immediately ready on boot
      const timeoutPromise = new Promise<{ total: number; connected: number; failed: number }>((resolve) =>
        setTimeout(() => resolve({ total: enabledServers.length, connected: 0, failed: 0 }), 6000)
      );

      await Promise.race([connectPromise, timeoutPromise]);
      const connectedCount = mcpRegistry.getServers().filter(s => s.status === "connected").length;
      const totalTools = mcpRegistry.getAllTools().length;
      console.log(`[MCP Registry]: Initialized ${mcpRegistry.getServers().length} server(s) (${connectedCount} connected, ${totalTools} tool(s) available).`);

      // Ensure background reconnection finishes cleanly if timeout fired first
      connectPromise
        .then((res) => {
          if (res.connected > connectedCount) {
            console.log(`[MCP Registry]: Background reconnection finished: ${res.connected} connected.`);
          }
        })
        .catch((err) => {
          console.warn("[MCP Registry]: Background connection error:", err.message);
        });
    } else {
      console.log(`[MCP Registry]: Initialized ${mcpRegistry.getServers().length} servers (0 enabled).`);
    }
  } catch (mcpErr: any) {
    console.warn("[MCP Initialization Warning]:", mcpErr.message);
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Flaw AI Ultra Server running on http://localhost:${PORT}`);
  });
}

startServer();
