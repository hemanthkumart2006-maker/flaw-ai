import { useState, useRef, useEffect, useCallback } from "react";
import { transcribeAudio } from "../services/api";

export interface UseVoiceInputProps {
  onTranscript: (text: string) => void;
  onError?: (err: string) => void;
  deviceId?: string;
  enableVAD?: boolean;
}

export function useVoiceInput({ onTranscript, onError, deviceId, enableVAD = false }: UseVoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [errorState, setErrorState] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // VAD state refs
  const hasSpokenRef = useRef(false);
  const silenceTimerRef = useRef<any>(null);

  // Initialize fallback Web Speech API if browser supported
  useEffect(() => {
    if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          onTranscript(transcript);
        }
        setIsRecording(false);
        setIsProcessing(false);
      };

      recognitionRef.current.onerror = (e: any) => {
        console.warn("Browser WebSpeech fallback error:", e.error);
        setIsRecording(false);
        setIsProcessing(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
  }, [onTranscript]);

  const stopAudioAnalyzer = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
    hasSpokenRef.current = false;
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      setIsRecording(false);
    }
  }, []);

  // Voice Activity Detection / Audio Level Monitor
  const startAudioAnalyzer = (stream: MediaStream) => {
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 64;
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      const updateLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
          const currentLevel = Math.min(100, Math.round((average / 128) * 100));
          setAudioLevel(currentLevel);

          // VAD silence detection for hands-free
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
                }, 1600); // 1.6s of silence triggers auto-send
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
  };

  const startRecording = useCallback(async () => {
    setErrorState(null);
    hasSpokenRef.current = false;
    try {
      const audioConstraints: MediaTrackConstraints = deviceId && deviceId !== "default"
        ? { deviceId: { exact: deviceId } }
        : {};

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      startAudioAnalyzer(stream);

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stopAudioAnalyzer();
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        if (audioBlob.size === 0) return;

        setIsProcessing(true);

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          try {
            // Sarvam Saaras v3 STT via backend
            const transcript = await transcribeAudio(base64Data, mediaRecorder.mimeType || "audio/webm");
            if (transcript && transcript.trim()) {
              onTranscript(transcript.trim());
            } else if (recognitionRef.current) {
              recognitionRef.current.start();
            }
          } catch (err: any) {
            console.warn("Sarvam STT failed, falling back to WebSpeech:", err.message);
            if (recognitionRef.current) {
              try { recognitionRef.current.start(); } catch (e) {}
            } else {
              const msg = "Microphone transcription failed. Check Sarvam API key or browser mic settings.";
              setErrorState(msg);
              if (onError) onError(msg);
            }
          } finally {
            setIsProcessing(false);
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.warn("Microphone access denied or failed, attempting WebSpeech API fallback:", err);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsRecording(true);
        } catch (e) {
          setErrorState("Microphone access denied.");
        }
      } else {
        const msg = "Microphone access denied or browser incompatible.";
        setErrorState(msg);
        if (onError) onError(msg);
      }
    }
  }, [onTranscript, onError, deviceId, enableVAD, stopRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isProcessing,
    audioLevel,
    errorState,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
