import { useState, useCallback, useRef, useEffect } from "react";
import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  LocalAudioTrack,
  Track,
  RemoteTrack,
  DataPacket_Kind,
} from "livekit-client";
import { LiveKitVoiceState } from "../types";

export interface ConnectLiveKitOptions {
  conversationId?: string | null;
  aiMode?: string;
  selectedProvider?: string;
  selectedModel?: string;
  fridayMode?: boolean;
}

export interface LiveKitTranscript {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export function useLiveKit() {
  const [voiceState, setVoiceState] = useState<LiveKitVoiceState>("IDLE");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // Local mic level (0-100)
  const [agentAudioLevel, setAgentAudioLevel] = useState(0); // Remote agent level (0-100)
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeToolActivity, setActiveToolActivity] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<LiveKitTranscript[]>([]);
  const [lastUserTranscript, setLastUserTranscript] = useState("");
  const [lastAgentTranscript, setLastAgentTranscript] = useState("");

  const roomRef = useRef<Room | null>(null);
  const localTrackRef = useRef<LocalAudioTrack | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const agentAnalyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const remoteAudioElRef = useRef<HTMLAudioElement | null>(null);

  // Clean up AudioContext & Analysers
  const cleanupAudio = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (localTrackRef.current) {
      localTrackRef.current.stop();
      localTrackRef.current = null;
    }

    if (remoteAudioElRef.current) {
      remoteAudioElRef.current.pause();
      remoteAudioElRef.current.src = "";
      remoteAudioElRef.current.remove();
      remoteAudioElRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    micAnalyserRef.current = null;
    agentAnalyserRef.current = null;
    setAudioLevel(0);
    setAgentAudioLevel(0);
  }, []);

  // Audio Amplitude Monitor Loop for 3D Assistant and Waveform Visualizer
  const startAudioMeter = useCallback(() => {
    const updateLevels = () => {
      // Local Mic Level
      if (micAnalyserRef.current) {
        const buffer = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
        micAnalyserRef.current.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normalized);
      }

      // Remote Agent Level (for 3D lip-sync)
      if (agentAnalyserRef.current) {
        const buffer = new Uint8Array(agentAnalyserRef.current.frequencyBinCount);
        agentAnalyserRef.current.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setAgentAudioLevel(normalized);
      }

      animFrameRef.current = requestAnimationFrame(updateLevels);
    };

    animFrameRef.current = requestAnimationFrame(updateLevels);
  }, []);

  // Interruption / Barge-in
  const interruptAgent = useCallback(() => {
    if (!roomRef.current) return;

    try {
      // Broadcast interrupt signal via reliable data packet
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify({ type: "INTERRUPT" }));
      roomRef.current.localParticipant.publishData(payload, { reliable: true });
    } catch (e: any) {
      console.warn("[LiveKit] Notice sending interrupt:", e.message);
    }

    // Stop current remote audio playback
    if (remoteAudioElRef.current) {
      remoteAudioElRef.current.pause();
    }

    setVoiceState("INTERRUPTED");
    setTimeout(() => {
      setVoiceState("LISTENING");
    }, 250);
  }, []);

  // Connect to LiveKit Room
  const connectToLiveKit = useCallback(
    async (options?: ConnectLiveKitOptions) => {
      setIsConnecting(true);
      setVoiceState("CONNECTING");
      setError(null);

      try {
        // 1. Request access token from backend
        const authToken = localStorage.getItem("flaw_ai_token");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        const tokenRes = await fetch("/api/livekit/token", {
          method: "POST",
          headers,
          body: JSON.stringify({
            conversationId: options?.conversationId,
            aiMode: options?.aiMode,
            provider: options?.selectedProvider,
            model: options?.selectedModel,
            fridayMode: options?.fridayMode,
          }),
        });

        if (!tokenRes.ok) {
          const errData = await tokenRes.json().catch(() => ({}));
          const errMsg = errData.error || `Server responded with ${tokenRes.status}`;
          throw new Error(errMsg);
        }

        const { token, url, roomName: resolvedRoomName } = await tokenRes.json();
        setRoomToken(token);
        setLivekitUrl(url);
        setRoomName(resolvedRoomName);

        // 2. Initialize LiveKit Room instance
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });
        roomRef.current = room;

        // 3. Audio Element for remote playback
        const audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        remoteAudioElRef.current = audioEl;
        document.body.appendChild(audioEl);

        // Initialize Web Audio Context for audio level analysis
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;

        // 4. Register Room Event Listeners
        room
          .on(RoomEvent.Connected, () => {
            setIsConnected(true);
            setIsConnecting(false);
            setVoiceState("LISTENING");
          })
          .on(RoomEvent.Disconnected, () => {
            setIsConnected(false);
            setIsConnecting(false);
            setVoiceState("DISCONNECTED");
            cleanupAudio();
            setTimeout(() => setVoiceState("IDLE"), 500);
          })
          .on(RoomEvent.Reconnecting, () => {
            setVoiceState("CONNECTING");
          })
          .on(RoomEvent.Reconnected, () => {
            setVoiceState("LISTENING");
          })
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
            if (track.kind === Track.Kind.Audio) {
              track.attach(audioEl);
              setVoiceState("SPEAKING");

              // Connect to agent analyser for lip-sync
              try {
                if (audioCtx.state === "suspended") {
                  audioCtx.resume();
                }
                const mediaStream = new MediaStream([track.mediaStreamTrack]);
                const source = audioCtx.createMediaStreamSource(mediaStream);
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 64;
                source.connect(analyser);
                agentAnalyserRef.current = analyser;
              } catch (e) {
                console.warn("[LiveKit] Audio analyser setup notice:", e);
              }
            }
          })
          .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
            track.detach();
            agentAnalyserRef.current = null;
            setAgentAudioLevel(0);
            setVoiceState("LISTENING");
          })
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            const isUserSpeaking = speakers.some((s) => s.isLocal);
            const isAgentSpeaking = speakers.some((s) => !s.isLocal);

            if (isUserSpeaking && isAgentSpeaking) {
              // User interrupted the AI
              interruptAgent();
            }
          })
          .on(RoomEvent.DataReceived, (payload: Uint8Array) => {
            try {
              const decoder = new TextDecoder();
              const message = JSON.parse(decoder.decode(payload));

              if (message.type === "STATE_CHANGE" && message.state) {
                setVoiceState(message.state as LiveKitVoiceState);
              } else if (message.type === "TRANSCRIPTION") {
                const item: LiveKitTranscript = {
                  role: message.role,
                  text: message.text,
                  timestamp: Date.now(),
                };
                setTranscripts((prev) => [...prev, item]);
                if (message.role === "user") {
                  setLastUserTranscript(message.text);
                } else {
                  setLastAgentTranscript(message.text);
                }
              } else if (message.type === "TOOL_ACTIVITY") {
                setActiveToolActivity(message.status === "completed" ? null : message.name);
              } else if (message.type === "INTERRUPT") {
                setVoiceState("INTERRUPTED");
                setTimeout(() => setVoiceState("LISTENING"), 200);
              } else if (message.type === "SPEAK_TEXT_FALLBACK") {
                // Browser speech synthesis fallback
                if ("speechSynthesis" in window) {
                  const utterance = new SpeechSynthesisUtterance(message.text);
                  window.speechSynthesis.speak(utterance);
                }
              }
            } catch {
              // Ignore invalid data packets
            }
          });

        // 5. Connect to room
        await room.connect(url, token);

        // 6. Request microphone permission & publish local audio track
        const micTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        localTrackRef.current = micTrack;
        await room.localParticipant.publishTrack(micTrack);

        // Connect mic to analyser for local volume visualizer
        try {
          if (audioCtx.state === "suspended") {
            await audioCtx.resume();
          }
          const micSource = audioCtx.createMediaStreamSource(new MediaStream([micTrack.mediaStreamTrack]));
          const micAnalyser = audioCtx.createAnalyser();
          micAnalyser.fftSize = 64;
          micSource.connect(micAnalyser);
          micAnalyserRef.current = micAnalyser;
        } catch (e) {
          console.warn("[LiveKit] Mic analyser notice:", e);
        }

        // Start measurement loop
        startAudioMeter();
        setVoiceState("LISTENING");
      } catch (err: any) {
        console.warn("[LiveKit Connection Notice]:", err.message);
        setError(err.message || "Failed to establish LiveKit connection");
        setVoiceState("ERROR");
        setIsConnected(false);
        cleanupAudio();
      } finally {
        setIsConnecting(false);
      }
    },
    [cleanupAudio, startAudioMeter, interruptAgent]
  );

  // Disconnect from LiveKit
  const disconnectFromLiveKit = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    cleanupAudio();
    setIsConnected(false);
    setIsConnecting(false);
    setRoomToken(null);
    setRoomName(null);
    setVoiceState("IDLE");
    setError(null);
  }, [cleanupAudio]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    if (!localTrackRef.current) return;

    if (isMuted) {
      localTrackRef.current.unmute();
      setIsMuted(false);
    } else {
      localTrackRef.current.mute();
      setIsMuted(true);
    }
  }, [isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectFromLiveKit();
    };
  }, [disconnectFromLiveKit]);

  return {
    voiceState,
    isConnected,
    isConnecting,
    isMuted,
    audioLevel,
    agentAudioLevel,
    roomToken,
    livekitUrl,
    roomName,
    error,
    activeToolActivity,
    transcripts,
    lastUserTranscript,
    lastAgentTranscript,
    connectToLiveKit,
    disconnectFromLiveKit,
    toggleMute,
    interruptAgent,
  };
}
