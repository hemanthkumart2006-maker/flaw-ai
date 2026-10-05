import { useState, useRef, useEffect, useCallback } from "react";
import { transcribeAudio } from "../services/api";
import { VoiceInputStatus } from "../types";

export interface UseVoiceInputProps {
  onTranscript: (text: string) => void;
  onError?: (err: string) => void;
  deviceId?: string;
  enableVAD?: boolean;
  languageCode?: string;
  isSarvamConfigured?: boolean;
}

export function useVoiceInput({
  onTranscript,
  onError,
  deviceId,
  enableVAD = false,
  languageCode = "unknown",
  isSarvamConfigured = true,
}: UseVoiceInputProps) {
  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [errorState, setErrorState] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const isWebSpeechActiveRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // VAD state refs
  const hasSpokenRef = useRef(false);
  const silenceTimerRef = useRef<any>(null);
  const errorResetTimerRef = useRef<any>(null);

  // Map languageCode to BCP-47 for WebSpeech fallback if needed
  const getWebSpeechLang = useCallback((code?: string) => {
    if (!code || code === "unknown" || code === "auto") return "en-US";
    if (code === "hi-IN" || code === "hi") return "hi-IN";
    if (code === "en-IN" || code === "en") return "en-IN";
    if (code === "bn-IN" || code === "bn") return "bn-IN";
    if (code === "ta-IN" || code === "ta") return "ta-IN";
    if (code === "te-IN" || code === "te") return "te-IN";
    if (code === "mr-IN" || code === "mr") return "mr-IN";
    if (code === "gu-IN" || code === "gu") return "gu-IN";
    if (code === "kn-IN" || code === "kn") return "kn-IN";
    if (code === "ml-IN" || code === "ml") return "ml-IN";
    if (code === "pa-IN" || code === "pa") return "pa-IN";
    return code;
  }, []);

  // Initialize Web Speech API instance
  useEffect(() => {
    if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = getWebSpeechLang(languageCode);

      recognition.onresult = (event: any) => {
        const text = event.results?.[0]?.[0]?.transcript;
        if (text && text.trim()) {
          onTranscript(text.trim());
          setStatus("done");
          setTimeout(() => setStatus("idle"), 1200);
        } else {
          setStatus("idle");
        }
        setIsRecording(false);
        setIsProcessing(false);
        isWebSpeechActiveRef.current = false;
      };

      recognition.onerror = (e: any) => {
        const errType = e.error || "speech_recognition_error";
        let message = "Browser speech recognition failed.";
        if (errType === "not-allowed" || errType === "service-not-allowed") {
          message = "Microphone permission denied.";
        } else if (errType === "no-speech") {
          message = "No speech was detected.";
        } else if (errType === "network") {
          message = "Speech recognition network error.";
        }

        console.warn("[WebSpeech] Recognition error:", errType);
        setErrorState(message);
        setStatus("error");
        if (onError) onError(message);

        setIsRecording(false);
        setIsProcessing(false);
        isWebSpeechActiveRef.current = false;
      };

      recognition.onend = () => {
        if (isWebSpeechActiveRef.current) {
          setIsRecording(false);
          setIsProcessing(false);
          isWebSpeechActiveRef.current = false;
          setStatus((prev) => (prev === "listening" ? "idle" : prev));
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [onTranscript, onError, languageCode, getWebSpeechLang]);

  // Update WebSpeech lang if languageCode changes
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = getWebSpeechLang(languageCode);
    }
  }, [languageCode, getWebSpeechLang]);

  const stopAudioAnalyzer = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
    hasSpokenRef.current = false;
  }, []);

  const releaseMediaStream = useCallback(() => {
    if (currentStreamRef.current) {
      currentStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      currentStreamRef.current = null;
    }
    stopAudioAnalyzer();
  }, [stopAudioAnalyzer]);

  const triggerError = useCallback(
    (msg: string) => {
      releaseMediaStream();
      setIsRecording(false);
      setIsProcessing(false);
      isWebSpeechActiveRef.current = false;
      setErrorState(msg);
      setStatus("error");
      if (onError) onError(msg);

      if (errorResetTimerRef.current) clearTimeout(errorResetTimerRef.current);
      errorResetTimerRef.current = setTimeout(() => {
        setErrorState(null);
        setStatus((curr) => (curr === "error" ? "idle" : curr));
      }, 4000);
    },
    [onError, releaseMediaStream]
  );

  const stopRecording = useCallback(() => {
    // 1. If currently using MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn("Failed to stop MediaRecorder cleanly:", err);
      }
      setIsRecording(false);
    }
    // 2. If using Web Speech API fallback
    else if (isWebSpeechActiveRef.current && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.warn("Failed to stop WebSpeech cleanly:", err);
      }
      setIsRecording(false);
      isWebSpeechActiveRef.current = false;
    } else {
      setIsRecording(false);
      releaseMediaStream();
      setStatus("idle");
    }
  }, [releaseMediaStream]);

  // Voice Activity Detection / Audio Level Monitor
  const startAudioAnalyzer = useCallback(
    (stream: MediaStream) => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;

        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
            const currentLevel = Math.min(100, Math.round((average / 128) * 100));
            setAudioLevel(currentLevel);

            // VAD silence detection for hands-free mode
            if (enableVAD) {
              if (currentLevel > 18) {
                hasSpokenRef.current = true;
                if (silenceTimerRef.current) {
                  clearTimeout(silenceTimerRef.current);
                  silenceTimerRef.current = null;
                }
              } else if (hasSpokenRef.current && currentLevel < 8) {
                if (!silenceTimerRef.current) {
                  silenceTimerRef.current = setTimeout(() => {
                    stopRecording();
                  }, 1800); // 1.8s of silence triggers auto-send
                }
              }
            }

            animFrameRef.current = requestAnimationFrame(updateLevel);
          }
        };
        updateLevel();
      } catch (e) {
        console.warn("Audio Context Analyzer error:", e);
      }
    },
    [enableVAD, stopRecording]
  );

  const startWebSpeechFallback = useCallback(() => {
    if (!recognitionRef.current) {
      triggerError("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      recognitionRef.current.lang = getWebSpeechLang(languageCode);
      recognitionRef.current.start();
      isWebSpeechActiveRef.current = true;
      setIsRecording(true);
      setIsProcessing(false);
      setStatus("listening");
      setErrorState(null);
    } catch (err: any) {
      console.warn("WebSpeech start failed:", err);
      triggerError("Could not start browser speech recognition.");
    }
  }, [languageCode, getWebSpeechLang, triggerError]);

  const startRecording = useCallback(async () => {
    setErrorState(null);
    hasSpokenRef.current = false;

    // Direct WebSpeech fallback if Sarvam is not configured on the server
    if (!isSarvamConfigured) {
      startWebSpeechFallback();
      return;
    }

    // Check mediaDevices support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (recognitionRef.current) {
        startWebSpeechFallback();
        return;
      }
      triggerError("Microphone access is not supported by your browser.");
      return;
    }

    try {
      const audioConstraints: MediaTrackConstraints =
        deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : {};

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...audioConstraints,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      currentStreamRef.current = stream;
      startAudioAnalyzer(stream);

      // Preferred audio MIME types
      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
          mimeType = "audio/ogg;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else {
          mimeType = "";
        }
      }

      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop audio tracks and analyzer immediately
        releaseMediaStream();

        const recordedBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });

        if (recordedBlob.size < 100) {
          // Empty or near-empty recording
          setIsProcessing(false);
          setIsRecording(false);
          setStatus("idle");
          return;
        }

        setIsProcessing(true);
        setStatus("processing");

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          try {
            setStatus("transcribing");
            const transcript = await transcribeAudio(
              base64Data,
              mediaRecorder.mimeType || "audio/webm",
              languageCode !== "unknown" && languageCode !== "auto" ? languageCode : undefined
            );

            if (transcript && transcript.trim()) {
              onTranscript(transcript.trim());
              setStatus("done");
              setTimeout(() => {
                setStatus("idle");
              }, 1200);
            } else {
              setStatus("idle");
            }
          } catch (err: any) {
            console.warn("Sarvam STT failed:", err.message);
            // If Sarvam STT failed with auth/config and WebSpeech is supported, inform user
            const errorMsg = err.message || "Transcription failed.";
            triggerError(errorMsg);
          } finally {
            setIsProcessing(false);
          }
        };

        reader.onerror = () => {
          setIsProcessing(false);
          triggerError("Failed to read recorded audio data.");
        };

        reader.readAsDataURL(recordedBlob);
      };

      mediaRecorder.start(250); // Collect in 250ms chunks
      setIsRecording(true);
      setStatus("listening");
    } catch (err: any) {
      console.warn("Microphone access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        triggerError("Microphone permission denied. Please allow microphone access.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        triggerError("No microphone found. Please connect a microphone.");
      } else if (recognitionRef.current) {
        // Attempt WebSpeech fallback
        startWebSpeechFallback();
      } else {
        triggerError("Failed to access microphone. Please check your system settings.");
      }
    }
  }, [
    deviceId,
    isSarvamConfigured,
    languageCode,
    onTranscript,
    releaseMediaStream,
    startAudioAnalyzer,
    startWebSpeechFallback,
    triggerError,
  ]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      releaseMediaStream();
      if (errorResetTimerRef.current) clearTimeout(errorResetTimerRef.current);
    };
  }, [releaseMediaStream]);

  return {
    status,
    isRecording,
    isProcessing,
    audioLevel,
    errorState,
    startRecording,
    stopRecording,
    toggleRecording,
    clearError: () => setErrorState(null),
  };
}
