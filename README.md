# fLAW AI Ultra — Advanced Multimodal AI Platform

<div align="center">
  <h3>Next-Generation Multimodal Intelligence with Multi-Provider AI, Real-Time Model Context Protocol (MCP), and Voice Intelligence</h3>
</div>

---

## 🌟 Overview

**fLAW AI Ultra** is a full-stack, enterprise-grade AI assistant platform engineered for multimodal intelligence, dynamic tool execution, and real-time voice conversations. It supports multi-provider LLM routing, extensible MCP servers, sandboxed code execution, document analysis, and animated 3D assistant interactions.

---

## 🏗️ Architecture

The codebase is organized into clean, decoupled tiers:

```
flaw-ai/
├── frontend/                # Client-Side Application (React 19, Vite, Tailwind CSS)
│   ├── src/
│   │   ├── components/      # UI components (Chat, Sidebar, Header, 3D Assistant, Settings, etc.)
│   │   ├── hooks/           # useChatSession, useVoiceInput, useVoiceOutput, useLiveKit
│   │   ├── services/        # api.ts (HTTP client strictly communicating with backend)
│   │   ├── types/           # Strongly-typed TypeScript interfaces
│   │   ├── App.tsx          # Main application layout and modal orchestrator
│   │   └── main.tsx         # Frontend DOM entry point
│   ├── public/              # Static assets
│   └── assets/              # Design assets
│
├── backend/                 # Server Application (Node.js, Express, TypeScript)
│   ├── server.ts            # Server bootstrap, API routes, and SSE streaming pipeline
│   ├── config/              # env.ts (Strict environment validation & production gates)
│   ├── middleware/          # auth.ts (JWT verification), rateLimiter.ts (Express rate limiters)
│   ├── services/
│   │   ├── ai/              # Multi-Provider abstraction (Gemini, Qwen, OpenAI, ProviderManager)
│   │   ├── mcp/             # Model Context Protocol (Client, Manager, Registry, Security, Transport)
│   │   ├── database.ts      # PostgreSQL connection pool with automated migration execution
│   │   ├── apiKeys.ts       # Server-side API key management
│   │   ├── attachments.ts   # Secure file uploads and document text extraction
│   │   ├── code.ts          # Sandboxed code execution
│   │   ├── gemini.ts        # Gemini integration with backoff
│   │   ├── livekit.ts       # LiveKit WebRTC real-time voice rooms
│   │   ├── speech.ts        # Sarvam AI Speech-to-Text (STT)
│   │   ├── tts.ts           # OpenAI Text-to-Speech (TTS)
│   │   └── web.ts           # Real-time web search, world news, and URL fetching
│   ├── mcp/                 # Re-exported MCP module interface
│   └── routes/              # Route prefix constants
│
├── database/                # Database Migrations & Schemas
│   ├── migrations/
│   │   ├── 001_initial_schema.sql      # Core tables: users, conversations, messages, settings
│   │   └── 002_mcp_architecture.sql    # MCP tables: servers, permissions, execution logs
│   └── seeds/               # Seed scripts directory
│
├── desktop/                 # Desktop launcher and Windows startup scripts
├── .env.example             # Documented server-side environment variables template
├── package.json             # Build and development scripts
├── tsconfig.json            # TypeScript configuration with @frontend and @backend aliases
└── vite.config.ts           # Vite bundler configuration
```

---

## 🚀 Key Features

### 1. Multi-Provider AI Abstraction Layer
- **Seamless Provider Switching**: Select between `AUTO`, `Google Gemini`, `Alibaba Qwen`, or `OpenAI`.
- **Zero-Crash Without Keys**: Reports "Not Configured" and graceful errors without breaking the application if provider keys are missing.
- **Unified Tool Schema Conversion**: Adapts tools dynamically across Gemini OpenAPI schemas and OpenAI/Qwen JSON Schema formats.

### 2. Model Context Protocol (MCP) Integration
- Connects local and remote MCP servers via **STDIO** or **SSE** transports.
- Dynamic tool discovery: automatically discovers tools from running MCP servers and exposes them to the active AI provider.
- Role-based permissions and encrypted credential storage in PostgreSQL.

### 3. Voice & 3D Intelligence
- **F.R.I.D.A.Y. Hands-Free Conversational Mode**: Continuous voice conversation with Voice Activity Detection (VAD).
- **Speech-to-Text (STT)**: High-accuracy transcription powered by Sarvam AI.
- **Text-to-Speech (TTS)**: Low-latency streaming speech powered by OpenAI TTS.
- **Interactive 3D Anime Assistant**: Three.js-powered character that reacts dynamically to voice and generation states.

### 4. Enterprise Security & Hardening
- **AES-256-GCM Secret Encryption**: Server-side credentials, custom MCP tokens, and user API keys are encrypted at rest.
- **Production Secret Validation**: Mandatory high-entropy `JWT_SECRET` and `ENCRYPTION_SECRET` in production mode.
- **Fail-Fast Database Protection**: In-memory storage is restricted to development; production mandates a healthy PostgreSQL connection.
- **Rate Limiting**:
  - `authRateLimiter`: 5 requests/minute on authentication routes.
  - `chatRateLimiter`: 30 requests/minute on chat completion streams.

---

## 🛠️ Quickstart

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v14 or higher recommended)

### 1. Clone & Install
```bash
git clone https://github.com/hemanthkumart2006-maker/flaw-ai.git
cd flaw-ai
npm install
```

### 2. Environment Configuration
Copy the sample environment file:
```bash
cp .env.example .env
```
Configure your `.env` variables:
```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/flaw_ai"

# Secrets (Required: minimum 32 random characters in production)
JWT_SECRET="your-32-plus-character-jwt-secret-key-goes-here"
ENCRYPTION_SECRET="your-32-plus-character-master-encryption-key-here"

# AI Providers (Optional - at least one recommended)
GEMINI_API_KEY="your-gemini-api-key"
QWEN_API_KEY="your-qwen-api-key"
OPENAI_API_KEY="your-openai-api-key"
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production
```bash
npm run build
npm start
```

---

## 🧪 Testing & Linting

```bash
# Type check without emitting
npm run lint

# Clean and bundle production output
npm run clean
npm run build
```

---

## 📄 License
This project is licensed under the MIT License.
