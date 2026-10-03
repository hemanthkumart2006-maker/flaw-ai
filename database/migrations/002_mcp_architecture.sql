-- Flaw AI Ultra - Complete MCP Tool Architecture Schema
-- Migration 002

-- 1. MCP Servers Table
CREATE TABLE IF NOT EXISTS mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  transport VARCHAR(50) NOT NULL DEFAULT 'sse', -- 'sse' or 'stdio'
  endpoint TEXT NOT NULL,                         -- URL for SSE or executable path/command for stdio
  args JSONB DEFAULT '[]'::jsonb,                -- command line arguments for stdio
  env_vars TEXT,                                 -- AES-256-GCM encrypted headers or environment variables
  enabled BOOLEAN DEFAULT TRUE,
  status VARCHAR(50) DEFAULT 'disconnected',     -- 'connected', 'connecting', 'disconnected', 'error'
  timeout_ms INT DEFAULT 15000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. MCP Tools Table (Discovered dynamically from MCP servers)
CREATE TABLE IF NOT EXISTS mcp_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  input_schema JSONB DEFAULT '{}'::jsonb,
  enabled BOOLEAN DEFAULT TRUE,
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_server_tool_name UNIQUE (server_id, name)
);

-- 3. Tool Permissions Table (Server-side enforced)
CREATE TABLE IF NOT EXISTS tool_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_name VARCHAR(255) NOT NULL,
  permission_level VARCHAR(50) NOT NULL DEFAULT 'AUTO', -- 'AUTO', 'ASK', 'BLOCK'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_tool_permission UNIQUE (user_id, tool_name)
);

-- 4. Tool Execution Logs Table (Safe execution history, no secrets)
CREATE TABLE IF NOT EXISTS tool_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  conversation_id VARCHAR(64) REFERENCES conversations(id) ON DELETE SET NULL,
  tool_name VARCHAR(255) NOT NULL,
  server_id UUID REFERENCES mcp_servers(id) ON DELETE SET NULL,
  server_name VARCHAR(255),
  source VARCHAR(50) NOT NULL DEFAULT 'mcp', -- 'builtin' or 'mcp'
  status VARCHAR(50) NOT NULL,              -- 'success', 'error', 'blocked', 'timeout'
  duration_ms INT DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for high-performance querying
CREATE INDEX IF NOT EXISTS idx_mcp_servers_user ON mcp_servers(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tools(server_id);
CREATE INDEX IF NOT EXISTS idx_tool_permissions_user ON tool_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_logs_user ON tool_execution_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_logs_conv ON tool_execution_logs(conversation_id);
