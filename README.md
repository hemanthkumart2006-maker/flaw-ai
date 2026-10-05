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
- **Real-Time LiveKit Voice**: Ultra low-latency WebRTC bidirectional voice room with live AI Voice Agent.
- **Normal Voice Input (Sarvam Saaras STT)**: High-accuracy batch transcription for multi-lingual and English voice input directly into chat.
- **F.R.I.D.A.Y. Hands-Free Conversational Mode**: Continuous voice conversation with Voice Activity Detection (VAD).
- **Text-to-Speech (TTS)**: Low-latency streaming speech powered by OpenAI TTS with browser speech synthesis fallback.
- **Interactive 3D Anime Assistant**: Three.js-powered character that reacts dynamically to voice, speaking amplitude, and generation states.

---

## 🎙️ LiveKit Real-Time Voice

fLAW AI includes a complete **Real-Time Voice Architecture** powered by LiveKit WebRTC and an AI Voice Agent pipeline.

### Architecture Overview

```
User (Microphone)
       │
       ▼ (WebRTC Audio Track)
fLAW AI Frontend (livekit-client)
       │
       ▼ (WebRTC Signaling & Transport)
  LiveKit Room
       │
       ▼ (Low-Latency Audio Stream)
LiveKit AI Voice Agent (backend/voice-agent/)
       │
       ├─► STT Provider (Sarvam Saaras STT / Streaming Adapter)
       │
       ├─► LLM Provider Manager (Gemini / Qwen / OpenAI)
       │         │
       │         ▼
       │   CentralToolManager (Built-in Tools & User MCP Servers)
       │
       └─► TTS Provider (OpenAI Realtime TTS / Browser Fallback)
                 │
                 ▼ (WebRTC Audio Output)
         LiveKit Room Audio Track
                 │
                 ▼
        Frontend Speakers & 3D Anime Lip-Sync
```

### 1. What LiveKit Does
[LiveKit](https://livekit.io/) is an open-source WebRTC infrastructure designed for ultra-low latency audio, video, and data communication. In fLAW AI, LiveKit provides:
- Bidirectional WebRTC audio channels between the browser and backend.
- Sub-second round-trip voice interaction with interruption/barge-in support.
- Synchronized participant data channel messages for real-time state and transcripts.
- Strict room isolation and cryptographically signed participant tokens.

### 2. Normal Voice vs Real-Time Live Voice
fLAW AI provides two distinct, non-conflicting voice workflows:

| Feature | Normal Voice Input | Real-Time Live Voice (LiveKit) |
| :--- | :--- | :--- |
| **Transport** | HTTP POST `/api/stt` (FormData) | LiveKit WebRTC Room (`wss://...`) |
| **Trigger** | Click mic icon in chat input bar | Click "Live Voice" button or F.R.I.D.A.Y. mode |
| **STT Engine** | Sarvam Saaras v4 Batch STT | LiveKit STT Provider Pipeline |
| **LLM Output** | Markdown text & code streams to chat | Spoken conversational response |
| **Audio Output** | Audio playback on demand | Streamed directly into WebRTC audio room |
| **Barge-In** | Manual stop | Speak at any time to interrupt AI speech |
| **3D Assistant** | Listens during recording | Mouth opening reacts to real audio amplitude |

### 3. Required Environment Variables
Add the following optional variables to your `.env` file:
```env
LIVEKIT_URL="wss://your-project.livekit.cloud"
LIVEKIT_API_KEY="your_livekit_api_key"
LIVEKIT_API_SECRET="your_livekit_api_secret"
```
> **Graceful Degradation**: If credentials are not configured, fLAW AI reports `LiveKit: Not Configured`. The normal application, chat, Sarvam STT, and MCP tools run completely normally without errors.

### 4. How to Create a LiveKit Project
1. Sign up for a free account at [LiveKit Cloud](https://cloud.livekit.io/).
2. Create a project (e.g. `flaw-ai-voice`).
3. In **Settings** > **Keys**, generate an API key and secret.
4. Copy the **WebSocket URL**, **API Key**, and **API Secret**.

### 5. How to Configure Credentials
1. Open `.env` in the root of the project.
2. Add your `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`.
3. Restart the server (`npm run dev`). System status will automatically display `LiveKit: Ready`.

### 6. How to Start the Agent
- **Embedded Mode (Default)**: Automatically runs in `backend/server.ts` when credentials are configured.
- **Standalone Worker Mode**: Run in a separate terminal:
  ```bash
  npx tsx backend/voice-agent/agent.ts
  ```

### 7. How Frontend Connects
1. User clicks **"Live Voice"** in the chat input bar or opens the voice assistant.
2. Frontend requests a token from `POST /api/livekit/token` with user authentication.
3. Backend validates session, assigns deterministic room `flaw-{userId}-{conversationId}`, and issues an official LiveKit `AccessToken`.
4. `livekit-client` connects to the room, publishes local microphone audio, and subscribes to remote agent audio.

### 8. How the Agent Processes Voice
1. **Audio Ingestion**: Audio frames arrive via WebRTC room track.
2. **STT Transcription**: Processed via `LiveKitSTTProvider` (Sarvam Saaras STT or streaming adapter).
3. **LLM Generation**: Transcribed text queries the active LLM (Gemini, Qwen, or OpenAI) using a voice-optimized conversational system prompt.
4. **Tool Execution**: Tools are executed through `CentralToolManager`, formatting summaries for natural speech.
5. **Speech Synthesis**: Response is synthesized via `LiveKitTTSProvider` (OpenAI TTS) and published into the room.
6. **Barge-in / Interruption**: If user speaks while AI is speaking, an `AbortController` halts LLM generation and room playback instantly, returning to `LISTENING`.
7. **Persistence**: User and assistant transcripts are saved directly to PostgreSQL `messages` table.

### 9. MCP (Model Context Protocol) Integration
The voice agent shares the **exact same `CentralToolManager`** as chat:
- Access to `web_search`, `get_world_news`, `get_current_time`, `get_system_info`, `execute_code`, and all connected user MCP servers.
- Strictly respects user permissions (`AUTO`, `ASK`, `BLOCK`).
- All tool executions are logged into PostgreSQL `tool_execution_logs`.

### 10. Troubleshooting
- **LiveKit: Not Configured**: Add `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` to `.env`.
- **HTTP 503 Service Unavailable**: Token requested before credentials are configured.
- **Microphone Permission Denied**: Check browser settings and grant microphone access.
- **No Sound from AI**: Verify `OPENAI_API_KEY` is configured for OpenAI TTS. When unavailable, browser Web Speech API acts as fallback.

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
