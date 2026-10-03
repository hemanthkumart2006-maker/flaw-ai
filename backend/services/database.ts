import pg from "pg";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { ENCRYPTION_SECRET, IS_PRODUCTION } from "../config/env.js";

const { Pool } = pg;

// AES-256-GCM Encryption for API Keys
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(ENCRYPTION_SECRET)
  .digest(); // 32 bytes

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptSecret(encryptedPayload: string): string {
  try {
    const [ivHex, authTagHex, encryptedHex] = encryptedPayload.split(":");
    if (!ivHex || !authTagHex || !encryptedHex) return "";
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decryption failed:", err);
    return "";
  }
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationRecord {
  id: string;
  user_id: string | null;
  title: string;
  pinned: boolean;
  mode: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  id: string;
  conversation_id: string;
  role: "user" | "model" | "assistant";
  content: string;
  model?: string;
  metadata?: any;
  created_at: string;
}

export interface AttachmentRecord {
  id: string;
  user_id?: string | null;
  conversation_id: string;
  message_id?: string | null;
  filename: string;
  mime_type: string;
  size: number;
  storage_path: string;
  extracted_text?: string;
  created_at: string;
}

export interface UsageRecord {
  id: string;
  user_id?: string | null;
  provider: string;
  model?: string;
  tokens_used?: number;
  duration_ms?: number;
  success: boolean;
  error_message?: string;
  created_at: string;
}

// Memory / Local File Store Fallback
interface StoreData {
  users: UserRecord[];
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  attachments: AttachmentRecord[];
  api_keys: any[];
  user_settings: Record<string, any>;
  usage_logs: UsageRecord[];
  mcp_servers: any[];
  mcp_tools: any[];
  tool_permissions: any[];
  tool_execution_logs: any[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "db_store.json");

let isPostgresAvailable = false;
let pgPool: pg.Pool | null = null;

function loadLocalStore(): StoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        users: parsed.users || [],
        conversations: parsed.conversations || [],
        messages: parsed.messages || [],
        attachments: parsed.attachments || [],
        api_keys: parsed.api_keys || [],
        user_settings: parsed.user_settings || {},
        usage_logs: parsed.usage_logs || [],
        mcp_servers: parsed.mcp_servers || [],
        mcp_tools: parsed.mcp_tools || [],
        tool_permissions: parsed.tool_permissions || [],
        tool_execution_logs: parsed.tool_execution_logs || [],
      };
    }
  } catch (err) {
    console.warn("Failed to load local store file:", err);
  }
  return {
    users: [],
    conversations: [],
    messages: [],
    attachments: [],
    api_keys: [],
    user_settings: {},
    usage_logs: [],
    mcp_servers: [],
    mcp_tools: [],
    tool_permissions: [],
    tool_execution_logs: [],
  };
}

function saveLocalStore(data: StoreData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save local store file:", err);
  }
}

let localStore: StoreData = loadLocalStore();

export async function initDatabase(): Promise<{ isPostgres: boolean; message: string }> {
  const dbUrl = process.env.DATABASE_URL;

  // In production, reject startup if database credentials are not configured
  if (IS_PRODUCTION && !dbUrl && !process.env.PGHOST && !process.env.PGUSER) {
    throw new Error(
      "[Database Fatal] DATABASE_URL (or PGHOST/PGUSER) is required in production mode. Refusing to boot with in-memory fallback."
    );
  }

  // Attempt PostgreSQL connection if DATABASE_URL or PG environment is configured
  if (dbUrl || process.env.PGHOST || process.env.PGUSER) {
    try {
      pgPool = new Pool({
        connectionString: dbUrl,
        host: process.env.PGHOST,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        port: Number(process.env.PGPORT) || 5432,
        connectionTimeoutMillis: 3000,
      });

      // Test connection
      const client = await pgPool.connect();
      try {
        await client.query("SELECT 1");
        // Run all migration schemas in sorted order
        let migrationsDir = path.join(process.cwd(), "database", "migrations");
        if (!fs.existsSync(migrationsDir)) {
          migrationsDir = path.resolve(__dirname, "../../database/migrations");
        }
        if (fs.existsSync(migrationsDir)) {
          const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
          for (const file of files) {
            const sqlPath = path.join(migrationsDir, file);
            const sql = fs.readFileSync(sqlPath, "utf-8");
            await client.query(sql);
            console.log(`[Database] Migration applied: ${file}`);
          }
        }
        isPostgresAvailable = true;
        return { isPostgres: true, message: "PostgreSQL database ready and migrated" };
      } finally {
        client.release();
      }
    } catch (err: any) {
      if (IS_PRODUCTION) {
        console.error("[Database Fatal] PostgreSQL connection or migration failed in production:", err.message);
        throw new Error(`[Database Fatal] Production database unavailable: ${err.message}`);
      }
      console.warn("[Database] PostgreSQL connection failed. Falling back to persistent storage engine:", err.message);
      isPostgresAvailable = false;
      pgPool = null;
    }
  } else {
    console.log("[Database] No DATABASE_URL specified. Initializing persistent file-backed database engine (development mode only).");
  }

  if (IS_PRODUCTION) {
    throw new Error("[Database Fatal] PostgreSQL connection could not be established in production mode.");
  }

  isPostgresAvailable = false;
  return { isPostgres: false, message: "Persistent DB store ready (PostgreSQL fallback)" };
}

// User CRUD operations
export async function createUser(name: string, email: string, passwordHash: string): Promise<UserRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  if (isPostgresAvailable && pgPool) {
    const res = await pgPool.query(
      `INSERT INTO users (id, name, email, password_hash, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, name, email.toLowerCase(), passwordHash, now, now]
    );
    return res.rows[0];
  }

  const user: UserRecord = {
    id,
    name,
    email: email.toLowerCase(),
    password_hash: passwordHash,
    created_at: now,
    updated_at: now,
  };
  localStore.users.push(user);
  saveLocalStore(localStore);
  return user;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  if (isPostgresAvailable && pgPool) {
    const res = await pgPool.query(`SELECT * FROM users WHERE email = $1 LIMIT 1`, [email.toLowerCase()]);
    return res.rows[0] || null;
  }
  return localStore.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  if (isPostgresAvailable && pgPool) {
    const res = await pgPool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
    return res.rows[0] || null;
  }
  return localStore.users.find(u => u.id === id) || null;
}

// Conversation CRUD operations
export async function getConversations(userId?: string | null): Promise<ConversationRecord[]> {
  if (isPostgresAvailable && pgPool) {
    const res = userId
      ? await pgPool.query(`SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC`, [userId])
      : await pgPool.query(`SELECT * FROM conversations ORDER BY updated_at DESC`);
    return res.rows;
  }

  let list = localStore.conversations;
  if (userId) {
    list = list.filter(c => c.user_id === userId);
  }
  return [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export async function createConversation(data: { id: string; userId?: string | null; title: string; mode?: string }): Promise<ConversationRecord> {
  const now = new Date().toISOString();
  if (isPostgresAvailable && pgPool) {
    const res = await pgPool.query(
      `INSERT INTO conversations (id, user_id, title, pinned, mode, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.id, data.userId || null, data.title, false, data.mode || "GENERAL", now, now]
    );
    return res.rows[0];
  }

  const conv: ConversationRecord = {
    id: data.id,
    user_id: data.userId || null,
    title: data.title,
    pinned: false,
    mode: data.mode || "GENERAL",
    created_at: now,
    updated_at: now,
  };
  localStore.conversations.unshift(conv);
  saveLocalStore(localStore);
  return conv;
}

export async function updateConversation(id: string, updates: Partial<{ title: string; pinned: boolean; mode: string }>): Promise<boolean> {
  const now = new Date().toISOString();
  if (isPostgresAvailable && pgPool) {
    const fields: string[] = ["updated_at = $1"];
    const values: any[] = [now];
    let idx = 2;

    if (updates.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(updates.title);
    }
    if (updates.pinned !== undefined) {
      fields.push(`pinned = $${idx++}`);
      values.push(updates.pinned);
    }
    if (updates.mode !== undefined) {
      fields.push(`mode = $${idx++}`);
      values.push(updates.mode);
    }
    values.push(id);
    await pgPool.query(`UPDATE conversations SET ${fields.join(", ")} WHERE id = $${idx}`, values);
    return true;
  }

  const conv = localStore.conversations.find(c => c.id === id);
  if (conv) {
    if (updates.title !== undefined) conv.title = updates.title;
    if (updates.pinned !== undefined) conv.pinned = updates.pinned;
    if (updates.mode !== undefined) conv.mode = updates.mode;
    conv.updated_at = now;
    saveLocalStore(localStore);
    return true;
  }
  return false;
}

export async function deleteConversation(id: string, userId?: string | null): Promise<boolean> {
  if (isPostgresAvailable && pgPool) {
    if (userId) {
      await pgPool.query(`DELETE FROM conversations WHERE id = $1 AND user_id = $2`, [id, userId]);
    } else {
      await pgPool.query(`DELETE FROM conversations WHERE id = $1`, [id]);
    }
    return true;
  }

  const prevLen = localStore.conversations.length;
  localStore.conversations = localStore.conversations.filter(c => c.id !== id);
  localStore.messages = localStore.messages.filter(m => m.conversation_id !== id);
  saveLocalStore(localStore);
  return localStore.conversations.length < prevLen;
}

// Message CRUD operations with Pagination Support
export async function getMessages(
  conversationId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ messages: MessageRecord[]; total: number; hasMore: boolean }> {
  const limit = options?.limit !== undefined ? options.limit : 50;
  const offset = options?.offset !== undefined ? options.offset : 0;

  if (isPostgresAvailable && pgPool) {
    const countRes = await pgPool.query(
      `SELECT COUNT(*)::int as total FROM messages WHERE conversation_id = $1`,
      [conversationId]
    );
    const total = countRes.rows[0]?.total || 0;

    const res = await pgPool.query(
      `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );

    return {
      messages: res.rows,
      total,
      hasMore: offset + res.rows.length < total,
    };
  }

  const allFiltered = localStore.messages
    .filter(m => m.conversation_id === conversationId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const total = allFiltered.length;
  const paged = allFiltered.slice(offset, offset + limit);

  return {
    messages: paged,
    total,
    hasMore: offset + paged.length < total,
  };
}

export async function createMessage(data: {
  id: string;
  conversationId: string;
  role: "user" | "model" | "assistant";
  content: string;
  model?: string;
  metadata?: any;
}): Promise<MessageRecord> {
  const now = new Date().toISOString();
  if (isPostgresAvailable && pgPool) {
    const res = await pgPool.query(
      `INSERT INTO messages (id, conversation_id, role, content, model, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.id, data.conversationId, data.role, data.content, data.model || null, JSON.stringify(data.metadata || {}), now]
    );
    // Touch conversation updated_at
    await pgPool.query(`UPDATE conversations SET updated_at = $1 WHERE id = $2`, [now, data.conversationId]);
    return res.rows[0];
  }

  const msg: MessageRecord = {
    id: data.id,
    conversation_id: data.conversationId,
    role: data.role,
    content: data.content,
    model: data.model,
    metadata: data.metadata,
    created_at: now,
  };
  localStore.messages.push(msg);

  const conv = localStore.conversations.find(c => c.id === data.conversationId);
  if (conv) conv.updated_at = now;

  saveLocalStore(localStore);
  return msg;
}

// Attachments storage & metadata
export async function createAttachmentRecord(data: {
  userId?: string | null;
  conversationId: string;
  messageId?: string | null;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  extractedText?: string;
}): Promise<AttachmentRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  if (isPostgresAvailable && pgPool) {
    const res = await pgPool.query(
      `INSERT INTO attachments (id, user_id, conversation_id, message_id, filename, mime_type, size, storage_path, extracted_text, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, data.userId || null, data.conversationId, data.messageId || null, data.filename, data.mimeType, data.size, data.storagePath, data.extractedText || null, now]
    );
    return res.rows[0];
  }

  const record: AttachmentRecord = {
    id,
    user_id: data.userId || null,
    conversation_id: data.conversationId,
    message_id: data.messageId || null,
    filename: data.filename,
    mime_type: data.mimeType,
    size: data.size,
    storage_path: data.storagePath,
    extracted_text: data.extractedText,
    created_at: now,
  };
  localStore.attachments.push(record);
  saveLocalStore(localStore);
  return record;
}

export async function getAttachments(conversationId: string): Promise<AttachmentRecord[]> {
  if (isPostgresAvailable && pgPool) {
    const res = await pgPool.query(`SELECT * FROM attachments WHERE conversation_id = $1`, [conversationId]);
    return res.rows;
  }
  return localStore.attachments.filter(a => a.conversation_id === conversationId);
}

// Usage logging
export async function logUsage(data: {
  userId?: string | null;
  provider: string;
  model?: string;
  tokensUsed?: number;
  durationMs?: number;
  success: boolean;
  errorMessage?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  if (isPostgresAvailable && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO usage_logs (id, user_id, provider, model, tokens_used, duration_ms, success, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, data.userId || null, data.provider, data.model || null, data.tokensUsed || 0, data.durationMs || 0, data.success, data.errorMessage || null, now]
      );
    } catch (e) {
      console.warn("Usage log write error:", e);
    }
    return;
  }

  localStore.usage_logs.push({
    id,
    user_id: data.userId || null,
    provider: data.provider,
    model: data.model,
    tokens_used: data.tokensUsed || 0,
    duration_ms: data.durationMs || 0,
    success: data.success,
    error_message: data.errorMessage,
    created_at: now,
  });

  // Limit usage logs in memory
  if (localStore.usage_logs.length > 1000) {
    localStore.usage_logs = localStore.usage_logs.slice(-1000);
  }
  saveLocalStore(localStore);
}

// User Settings Persistence
export async function getUserSettings(userId: string): Promise<any> {
  if (isPostgresAvailable && pgPool) {
    try {
      const res = await pgPool.query(`SELECT settings FROM user_settings WHERE user_id = $1`, [userId]);
      return res.rows[0]?.settings || null;
    } catch (e) {
      console.warn("Failed to get user settings from DB:", e);
    }
  }
  return localStore.user_settings[userId] || null;
}

export async function saveUserSettings(userId: string, settings: any): Promise<any> {
  const now = new Date().toISOString();
  if (isPostgresAvailable && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO user_settings (user_id, settings, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = EXCLUDED.updated_at`,
        [userId, JSON.stringify(settings), now]
      );
      return settings;
    } catch (e) {
      console.warn("Failed to save user settings in DB:", e);
    }
  }

  localStore.user_settings[userId] = settings;
  saveLocalStore(localStore);
  return settings;
}

// User Encrypted API Keys Persistence
export async function saveEncryptedApiKey(
  userId: string,
  provider: string,
  plainKey: string,
  priority: number = 0
): Promise<boolean> {
  const encrypted = encryptSecret(plainKey);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  if (isPostgresAvailable && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO api_keys (id, user_id, provider, encrypted_key, active, priority, failure_count, created_at)
         VALUES ($1, $2, $3, $4, TRUE, $5, 0, $6)`,
        [id, userId, provider.toLowerCase(), encrypted, priority, now]
      );
      return true;
    } catch (e) {
      console.warn("Failed to save API key to DB:", e);
    }
  }

  localStore.api_keys.push({
    id,
    user_id: userId,
    provider: provider.toLowerCase(),
    encrypted_key: encrypted,
    active: true,
    priority,
    failure_count: 0,
    created_at: now,
  });
  saveLocalStore(localStore);
  return true;
}

export async function getUserApiKeys(
  userId: string
): Promise<{ provider: string; active: boolean; preview: string; priority: number }[]> {
  if (isPostgresAvailable && pgPool) {
    try {
      const res = await pgPool.query(
        `SELECT provider, encrypted_key, active, priority FROM api_keys WHERE user_id = $1`,
        [userId]
      );
      return res.rows.map(r => {
        const decrypted = decryptSecret(r.encrypted_key);
        const preview = decrypted ? `${decrypted.slice(0, 4)}...${decrypted.slice(-4)}` : "••••••••";
        return {
          provider: r.provider,
          active: r.active,
          preview,
          priority: r.priority,
        };
      });
    } catch (e) {
      console.warn("Failed to get API keys from DB:", e);
    }
  }

  return localStore.api_keys
    .filter(k => k.user_id === userId)
    .map(k => {
      const decrypted = decryptSecret(k.encrypted_key);
      const preview = decrypted ? `${decrypted.slice(0, 4)}...${decrypted.slice(-4)}` : "••••••••";
      return {
        provider: k.provider,
        active: k.active,
        preview,
        priority: k.priority,
      };
    });
}

// ==========================================
// MCP Servers Persistence
// ==========================================

export async function getMCPServersFromDB(userId?: string | null): Promise<any[]> {
  if (isPostgresAvailable && pgPool) {
    try {
      const res = userId
        ? await pgPool.query(
            `SELECT id, user_id, name, description, transport, endpoint, args, env_vars, enabled, status, timeout_ms, created_at, updated_at
             FROM mcp_servers WHERE user_id = $1 OR user_id IS NULL ORDER BY created_at ASC`,
            [userId]
          )
        : await pgPool.query(
            `SELECT id, user_id, name, description, transport, endpoint, args, env_vars, enabled, status, timeout_ms, created_at, updated_at
             FROM mcp_servers ORDER BY created_at ASC`
          );

      return res.rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        name: r.name,
        description: r.description,
        transport: r.transport,
        endpoint: r.endpoint,
        args: Array.isArray(r.args) ? r.args : (r.args ? JSON.parse(r.args) : []),
        envVars: r.env_vars ? JSON.parse(decryptSecret(r.env_vars) || "{}") : {},
        enabled: r.enabled,
        status: r.status,
        timeoutMs: r.timeout_ms,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (err: any) {
      console.warn("Failed to get MCP servers from DB:", err.message);
    }
  }

  let list = localStore.mcp_servers || [];
  if (userId) {
    list = list.filter(s => !s.userId || s.userId === userId);
  }
  return list.map(s => ({
    ...s,
    envVars: s.encryptedEnvVars ? JSON.parse(decryptSecret(s.encryptedEnvVars) || "{}") : (s.envVars || {}),
  }));
}

export async function createMCPServerInDB(data: {
  userId?: string | null;
  name: string;
  description?: string;
  transport: string;
  endpoint: string;
  args?: string[];
  envVars?: Record<string, string>;
  enabled?: boolean;
  timeoutMs?: number;
}): Promise<any> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const encryptedEnv = data.envVars && Object.keys(data.envVars).length > 0 
    ? encryptSecret(JSON.stringify(data.envVars)) 
    : null;

  if (isPostgresAvailable && pgPool) {
    try {
      const res = await pgPool.query(
        `INSERT INTO mcp_servers (id, user_id, name, description, transport, endpoint, args, env_vars, enabled, status, timeout_ms, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'disconnected', $10, $11, $11)
         RETURNING *`,
        [
          id,
          data.userId || null,
          data.name,
          data.description || null,
          data.transport || "sse",
          data.endpoint,
          JSON.stringify(data.args || []),
          encryptedEnv,
          data.enabled !== false,
          data.timeoutMs || 15000,
          now,
        ]
      );
      const r = res.rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        name: r.name,
        description: r.description,
        transport: r.transport,
        endpoint: r.endpoint,
        args: Array.isArray(r.args) ? r.args : (r.args ? JSON.parse(r.args) : []),
        envVars: data.envVars || {},
        enabled: r.enabled,
        status: r.status,
        timeoutMs: r.timeout_ms,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    } catch (err: any) {
      console.error("Failed to create MCP server in DB:", err.message);
      throw err;
    }
  }

  const record = {
    id,
    userId: data.userId || null,
    name: data.name,
    description: data.description,
    transport: data.transport || "sse",
    endpoint: data.endpoint,
    args: data.args || [],
    encryptedEnvVars: encryptedEnv,
    envVars: data.envVars || {},
    enabled: data.enabled !== false,
    status: "disconnected",
    timeoutMs: data.timeoutMs || 15000,
    createdAt: now,
    updatedAt: now,
  };

  localStore.mcp_servers = localStore.mcp_servers || [];
  localStore.mcp_servers.push(record);
  saveLocalStore(localStore);
  return record;
}

export async function updateMCPServerInDB(
  id: string,
  updates: any,
  userId?: string | null
): Promise<boolean> {
  const now = new Date().toISOString();
  let encryptedEnv: string | undefined = undefined;
  if (updates.envVars !== undefined) {
    encryptedEnv = updates.envVars && Object.keys(updates.envVars).length > 0
      ? encryptSecret(JSON.stringify(updates.envVars))
      : "";
  }

  if (isPostgresAvailable && pgPool) {
    try {
      const sets: string[] = ["updated_at = $2"];
      const values: any[] = [id, now];
      let idx = 3;

      if (updates.name !== undefined) {
        sets.push(`name = $${idx++}`);
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        sets.push(`description = $${idx++}`);
        values.push(updates.description);
      }
      if (updates.transport !== undefined) {
        sets.push(`transport = $${idx++}`);
        values.push(updates.transport);
      }
      if (updates.endpoint !== undefined) {
        sets.push(`endpoint = $${idx++}`);
        values.push(updates.endpoint);
      }
      if (updates.args !== undefined) {
        sets.push(`args = $${idx++}`);
        values.push(JSON.stringify(updates.args));
      }
      if (encryptedEnv !== undefined) {
        sets.push(`env_vars = $${idx++}`);
        values.push(encryptedEnv || null);
      }
      if (updates.enabled !== undefined) {
        sets.push(`enabled = $${idx++}`);
        values.push(updates.enabled);
      }
      if (updates.status !== undefined) {
        sets.push(`status = $${idx++}`);
        values.push(updates.status);
      }
      if (updates.timeoutMs !== undefined) {
        sets.push(`timeout_ms = $${idx++}`);
        values.push(updates.timeoutMs);
      }

      let query = `UPDATE mcp_servers SET ${sets.join(", ")} WHERE id = $1`;
      if (userId) {
        query += ` AND (user_id = $${idx++} OR user_id IS NULL)`;
        values.push(userId);
      }

      const res = await pgPool.query(query, values);
      return (res.rowCount ?? 0) > 0;
    } catch (err: any) {
      console.warn("Failed to update MCP server in DB:", err.message);
      return false;
    }
  }

  const server = (localStore.mcp_servers || []).find(
    s => s.id === id && (!userId || !s.userId || s.userId === userId)
  );
  if (!server) return false;

  Object.assign(server, updates, { updatedAt: now });
  if (encryptedEnv !== undefined) {
    server.encryptedEnvVars = encryptedEnv;
  }
  saveLocalStore(localStore);
  return true;
}

export async function deleteMCPServerFromDB(id: string, userId?: string | null): Promise<boolean> {
  if (isPostgresAvailable && pgPool) {
    try {
      const res = userId
        ? await pgPool.query(`DELETE FROM mcp_servers WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`, [id, userId])
        : await pgPool.query(`DELETE FROM mcp_servers WHERE id = $1`, [id]);
      return (res.rowCount ?? 0) > 0;
    } catch (err: any) {
      console.warn("Failed to delete MCP server from DB:", err.message);
      return false;
    }
  }

  const initialLen = (localStore.mcp_servers || []).length;
  localStore.mcp_servers = (localStore.mcp_servers || []).filter(
    s => !(s.id === id && (!userId || !s.userId || s.userId === userId))
  );
  // Also clean up tools for this server
  localStore.mcp_tools = (localStore.mcp_tools || []).filter(t => t.server_id !== id);
  saveLocalStore(localStore);
  return localStore.mcp_servers.length < initialLen;
}

// ==========================================
// MCP Discovered Tools Persistence
// ==========================================

export async function syncMCPToolsInDB(serverId: string, tools: any[]): Promise<void> {
  if (isPostgresAvailable && pgPool) {
    try {
      // Clear existing tools for this server and re-insert discovered set
      await pgPool.query(`DELETE FROM mcp_tools WHERE server_id = $1`, [serverId]);
      for (const t of tools) {
        await pgPool.query(
          `INSERT INTO mcp_tools (id, server_id, name, description, input_schema, enabled)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, TRUE)
           ON CONFLICT (server_id, name) DO UPDATE SET description = EXCLUDED.description, input_schema = EXCLUDED.input_schema`,
          [serverId, t.name, t.description || null, JSON.stringify(t.inputSchema || {})]
        );
      }
    } catch (err: any) {
      console.warn("Failed to sync MCP tools to DB:", err.message);
    }
    return;
  }

  localStore.mcp_tools = (localStore.mcp_tools || []).filter(t => t.server_id !== serverId);
  for (const t of tools) {
    localStore.mcp_tools.push({
      id: crypto.randomUUID(),
      server_id: serverId,
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema || {},
      enabled: true,
      discovered_at: new Date().toISOString(),
    });
  }
  saveLocalStore(localStore);
}

// ==========================================
// Tool Permissions Persistence
// ==========================================

export async function getToolPermissions(userId: string): Promise<Record<string, "AUTO" | "ASK" | "BLOCK">> {
  if (isPostgresAvailable && pgPool) {
    try {
      const res = await pgPool.query(
        `SELECT tool_name, permission_level FROM tool_permissions WHERE user_id = $1`,
        [userId]
      );
      const map: Record<string, "AUTO" | "ASK" | "BLOCK"> = {};
      for (const row of res.rows) {
        map[row.tool_name] = row.permission_level;
      }
      return map;
    } catch (err: any) {
      console.warn("Failed to fetch tool permissions from DB:", err.message);
    }
  }

  const map: Record<string, "AUTO" | "ASK" | "BLOCK"> = {};
  const perms = (localStore.tool_permissions || []).filter(p => p.user_id === userId);
  for (const p of perms) {
    map[p.tool_name] = p.permission_level;
  }
  return map;
}

export async function setToolPermission(
  userId: string,
  toolName: string,
  permission: "AUTO" | "ASK" | "BLOCK"
): Promise<boolean> {
  const now = new Date().toISOString();
  if (isPostgresAvailable && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO tool_permissions (id, user_id, tool_name, permission_level, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $4)
         ON CONFLICT (user_id, tool_name) DO UPDATE SET permission_level = EXCLUDED.permission_level, updated_at = EXCLUDED.updated_at`,
        [userId, toolName, permission, now]
      );
      return true;
    } catch (err: any) {
      console.warn("Failed to set tool permission in DB:", err.message);
      return false;
    }
  }

  localStore.tool_permissions = localStore.tool_permissions || [];
  const existing = localStore.tool_permissions.find(p => p.user_id === userId && p.tool_name === toolName);
  if (existing) {
    existing.permission_level = permission;
    existing.updated_at = now;
  } else {
    localStore.tool_permissions.push({
      id: crypto.randomUUID(),
      user_id: userId,
      tool_name: toolName,
      permission_level: permission,
      created_at: now,
      updated_at: now,
    });
  }
  saveLocalStore(localStore);
  return true;
}

// ==========================================
// Tool Execution Logging
// ==========================================

export async function logToolExecution(data: {
  userId?: string | null;
  conversationId?: string | null;
  toolName: string;
  serverId?: string | null;
  serverName?: string | null;
  source: string;
  status: string;
  durationMs: number;
  errorMessage?: string;
  metadata?: any;
}): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (isPostgresAvailable && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO tool_execution_logs (id, user_id, conversation_id, tool_name, server_id, server_name, source, status, duration_ms, error_message, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          data.userId || null,
          data.conversationId || null,
          data.toolName,
          data.serverId || null,
          data.serverName || null,
          data.source,
          data.status,
          data.durationMs,
          data.errorMessage || null,
          JSON.stringify(data.metadata || {}),
          now,
        ]
      );
      return;
    } catch (err: any) {
      console.warn("Failed to log tool execution to DB:", err.message);
    }
  }

  localStore.tool_execution_logs = localStore.tool_execution_logs || [];
  localStore.tool_execution_logs.push({
    id,
    user_id: data.userId || null,
    conversation_id: data.conversationId || null,
    tool_name: data.toolName,
    server_id: data.serverId || null,
    server_name: data.serverName || null,
    source: data.source,
    status: data.status,
    duration_ms: data.durationMs,
    error_message: data.errorMessage,
    metadata: data.metadata,
    created_at: now,
  });

  // Limit memory log size to last 1000 records
  if (localStore.tool_execution_logs.length > 1000) {
    localStore.tool_execution_logs = localStore.tool_execution_logs.slice(-1000);
  }
  saveLocalStore(localStore);
}

export async function getToolExecutionLogsFromDB(
  userId?: string | null,
  limit: number = 50
): Promise<any[]> {
  if (isPostgresAvailable && pgPool) {
    try {
      const res = userId
        ? await pgPool.query(
            `SELECT * FROM tool_execution_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [userId, limit]
          )
        : await pgPool.query(
            `SELECT * FROM tool_execution_logs ORDER BY created_at DESC LIMIT $1`,
            [limit]
          );
      return res.rows;
    } catch (err: any) {
      console.warn("Failed to get tool execution logs from DB:", err.message);
    }
  }

  let logs = localStore.tool_execution_logs || [];
  if (userId) {
    logs = logs.filter(l => l.user_id === userId);
  }
  return [...logs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
}


