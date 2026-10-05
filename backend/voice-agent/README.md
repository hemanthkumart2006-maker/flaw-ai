# fLAW AI - LiveKit Real-Time Voice Agent Architecture

This directory houses the backend implementation for **LiveKit Real-Time Voice** in fLAW AI.

---

## 1. What LiveKit Does
[LiveKit](https://livekit.io/) is an open-source WebRTC infrastructure designed for low-latency audio, video, and data streaming. In fLAW AI, LiveKit provides:
- Ultra-low latency, bidirectional WebRTC audio channels between the browser and the fLAW AI server.
- Participant state synchronization via binary data packets (reliable and lossy).
- Active speaker detection for instant interruption / barge-in.
- Room isolation and deterministic participant token authentication.

---

## 2. Normal Voice vs Realtime Live Voice

fLAW AI provides two distinct voice workflows:

| Feature | Normal Voice Input | Real-Time Live Voice (LiveKit) |
| :--- | :--- | :--- |
| **Protocol** | HTTP POST `/api/stt` (FormData) | LiveKit WebRTC Room (`wss://...`) |
| **Trigger** | Hold/Click mic → Record → Stop | Click "Start Live Voice" → Open bidirectional audio room |
| **STT Engine** | Sarvam Saaras v4 Batch STT | LiveKit Real-Time STT Provider Pipeline |
| **LLM Output** | Chat SSE Stream (Markdown, code, etc.) | Spoken Conversational Responses |
| **Audio Output** | Web Audio API / OpenAI TTS on demand | LiveKit Realtime Audio Published directly into room |
| **Barge-in** | Manual click | Speak at any time to interrupt AI speech naturally |
| **3D Assistant** | Listens during recording, speaks on text | Real-time mouth sync driven by live audio amplitude |

---

## 3. Required Environment Variables

To activate LiveKit real-time voice, set the following environment variables in `.env`:

```env
# LiveKit Cloud or Self-Hosted Server URL
LIVEKIT_URL="wss://your-project-subdomain.livekit.cloud"

# LiveKit API Key (Server-Side Only - NEVER exposed to browser)
LIVEKIT_API_KEY="APIxxxxxxxxx"

# LiveKit API Secret (Server-Side Only - NEVER exposed to browser)
LIVEKIT_API_SECRET="sec_xxxxxxxxxxxxxxxxxxxxxxxx"
```

> **Note**: If these credentials are omitted or left blank, fLAW AI gracefully reports `LiveKit: Not Configured`. The rest of the application (chat, documents, normal Sarvam STT, tools, MCP) operates normally without errors or crashes.

---

## 4. How to Create a LiveKit Project
1. Visit [LiveKit Cloud](https://cloud.livekit.io/) and create a free account.
2. Create a new project (e.g. `flaw-ai-voice`).
3. In **Project Settings** > **Keys**, create an API Key pair.
4. Copy the **WebSocket URL** (`wss://...`), **API Key**, and **API Secret**.

---

## 5. How to Configure Credentials
1. Open `.env` in the root of the project.
2. Paste your LiveKit values into:
   ```env
   LIVEKIT_URL=wss://your-domain.livekit.cloud
   LIVEKIT_API_KEY=your_livekit_key
   LIVEKIT_API_SECRET=your_livekit_secret
   ```
3. Restart the server (`npm run dev`). The system status will automatically flip to:
   ```json
   { "livekit": "ready" }
   ```

---

## 6. How to Start the Voice Agent

The LiveKit Voice Agent can run in two ways:

### Option A: Embedded Mode (Default)
When `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are present, `backend/server.ts` automatically initializes `voiceAgentService` in-process. When a user requests a room token via `POST /api/livekit/token`, the agent is automatically attached to the room.

### Option B: Standalone Worker Process
You can also run the agent as a standalone background worker:
```bash
npx tsx backend/voice-agent/agent.ts
```

---

## 7. How Frontend Connects
1. User clicks **"Start Live Voice"** in the fLAW AI UI.
2. Frontend requests a token from `POST /api/livekit/token` passing conversation context:
   ```json
   {
     "conversationId": "uuid-here",
     "aiMode": "GENERAL",
     "provider": "gemini",
     "model": "gemini-2.0-flash"
   }
   ```
3. Backend validates authentication, generates a short-lived token using `livekit-server-sdk` `AccessToken`, and returns `{ token, url, roomName, identity }`.
4. The frontend connects to the room using `livekit-client`:
   ```ts
   const room = new Room({ adaptiveStream: true, dynacast: true });
   await room.connect(url, token);
   const micTrack = await createLocalAudioTrack();
   await room.localParticipant.publishTrack(micTrack);
   ```
5. Incoming agent audio tracks are automatically subscribed and attached to an `<audio>` element for playback.

---

## 8. How the Agent Processes Voice
```
User speaks
    │
    ▼ (WebRTC Audio Track)
LiveKit Room
    │
    ▼
LiveKitVoiceSession
    │
    ▼
STT Provider (Sarvam Saaras STT / Streaming Adapter)
    │
    ▼
LLM Provider Manager (Gemini / Qwen / OpenAI)
    │
    ├─► CentralToolManager (Built-ins & MCP Servers)
    │
    ▼
TTS Provider (OpenAI Realtime TTS / Browser Fallback)
    │
    ▼ (WebRTC Audio Stream & Data Packets)
Room Audio Output -> Frontend Speaker
```

### Barge-In / Interruption
- The session monitors incoming audio levels and `ActiveSpeakersChanged`.
- If user starts speaking while the AI is in `SPEAKING` or `THINKING` state, an `AbortController` cancels active LLM generation and audio playback immediately.
- The state transitions to `INTERRUPTED`, then smoothly to `LISTENING`.

---

## 9. MCP (Model Context Protocol) Integration

The LiveKit Voice Agent **reuses the existing `CentralToolManager` without duplication**:
- Tools available to the voice agent include:
  - `web_search`: Live web queries
  - `get_world_news`: Breaking news across categories
  - `get_current_time`: Time, date, timezone
  - `get_system_info`: Server and host statistics
  - `execute_code`: Sandboxed code execution
  - **All connected user MCP servers**: (Filesystem, GitHub, PostgreSQL, APIs, etc.)
- User permissions (`AUTO`, `ASK`, `BLOCK`) are strictly enforced.
- Execution duration, status, and metadata are logged to the PostgreSQL `tool_execution_logs` table.

---

## 10. Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `LiveKit: Not Configured` | Missing `.env` variables | Add `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. |
| `HTTP 503: LiveKit credentials not configured` | Token requested while unconfigured | Verify `.env` contains valid credentials and restart server. |
| `Microphone permission denied` | Browser blocked mic | Allow microphone permissions in browser site settings. |
| `Agent unavailable` | Network issue connecting to LiveKit Cloud | Verify internet connection and `LIVEKIT_URL` host. |
| `No speech generated` | `OPENAI_API_KEY` missing | OpenAI TTS is used for speech synthesis; if missing, client uses Web Speech API fallback. |
