import { useState, useRef, useCallback, useEffect } from "react";
import { generateSpeech } from "../services/api";

export interface UseVoiceOutputProps {
  autoRead?: boolean;
  selectedVoice?: string;
  speechSpeed?: number;
  volume?: number;
  onFinished?: () => void;
}

export function useVoiceOutput({
  autoRead = false,
  selectedVoice = "nova",
  speechSpeed = 1.0,
  volume = 1.0,
  onFinished,
}: UseVoiceOutputProps = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const currentTextRef = useRef<string | null>(null);
  const queueRef = useRef<string[]>([]);
  const isPlayingQueueRef = useRef(false);

  // Web Speech Synthesis Fallback instance
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  const stop = useCallback(() => {
    queueRef.current = [];
    isPlayingQueueRef.current = false;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
    setIsGenerating(false);
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      setIsPaused(true);
    } else if (synthRef.current && synthRef.current.speaking) {
      synthRef.current.pause();
      setIsPlaying(false);
      setIsPaused(true);
    }
  }, [isPlaying]);

  const resume = useCallback(() => {
    if (audioRef.current && isPaused) {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        setIsPaused(false);
      }).catch(err => console.warn("Audio resume error:", err));
    } else if (synthRef.current && synthRef.current.paused) {
      synthRef.current.resume();
      setIsPlaying(true);
      setIsPaused(false);
    }
  }, [isPaused]);

  // Clean markdown and formatting for speech
  const sanitizeForSpeech = (text: string): string => {
    return text
      .replace(/```[\s\S]*?```/g, "Code block omitted.")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/https?:\/\/[^\s]+/g, "link")
      .replace(/[#*_\->[\]()]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const playBlob = async (blob: Blob): Promise<void> => {
    return new Promise((resolve) => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      const audioUrl = URL.createObjectURL(blob);
      audioUrlRef.current = audioUrl;

      const audio = new Audio(audioUrl);
      audio.playbackRate = speechSpeed;
      audio.volume = volume;
      audioRef.current = audio;

      audio.onended = () => {
        resolve();
      };

      audio.onerror = () => {
        resolve();
      };

      audio.play().then(() => {
        setIsPlaying(true);
        setIsPaused(false);
      }).catch(() => {
        resolve();
      });
    });
  };

  // Play full text block
  const playText = useCallback(async (text: string, messageId?: string) => {
    stop();
    const cleanText = sanitizeForSpeech(text);
    if (!cleanText) return;

    currentTextRef.current = cleanText;
    if (messageId) setCurrentMessageId(messageId);

    setIsGenerating(true);

    try {
      const blob = await generateSpeech(cleanText, selectedVoice, speechSpeed);
      setIsGenerating(false);
      await playBlob(blob);
      setIsPlaying(false);
      setIsPaused(false);
      if (onFinished) onFinished();
    } catch (err: any) {
      console.warn("OpenAI TTS backend playback failed, using Web Speech Synthesis fallback:", err.message);
      setIsGenerating(false);
      fallbackWebSpeech(cleanText);
    }
  }, [selectedVoice, speechSpeed, volume, stop, onFinished]);

  // Play queue item by item
  const processQueue = useCallback(async () => {
    if (isPlayingQueueRef.current || queueRef.current.length === 0) return;
    isPlayingQueueRef.current = true;

    while (queueRef.current.length > 0) {
      const sentence = queueRef.current.shift();
      if (!sentence) continue;

      const clean = sanitizeForSpeech(sentence);
      if (!clean) continue;

      try {
        setIsGenerating(true);
        const blob = await generateSpeech(clean, selectedVoice, speechSpeed);
        setIsGenerating(false);
        await playBlob(blob);
      } catch (err) {
        setIsGenerating(false);
        await new Promise<void>((res) => {
          if (!synthRef.current) return res();
          const utterance = new SpeechSynthesisUtterance(clean);
          utterance.rate = speechSpeed;
          utterance.volume = volume;
          utterance.onend = () => res();
          utterance.onerror = () => res();
          synthRef.current.speak(utterance);
          setIsPlaying(true);
        });
      }
    }

    isPlayingQueueRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    if (onFinished) onFinished();
  }, [selectedVoice, speechSpeed, volume, onFinished]);

  const enqueueSentence = useCallback((sentence: string) => {
    const clean = sanitizeForSpeech(sentence);
    if (!clean || clean.length < 2) return;
    queueRef.current.push(clean);
    processQueue();
  }, [processQueue]);

  const fallbackWebSpeech = (text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechSpeed;
    utterance.volume = volume;

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
      if (onFinished) onFinished();
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
      if (onFinished) onFinished();
    };

    synthRef.current.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
  };

  const replay = useCallback(() => {
    if (currentTextRef.current) {
      playText(currentTextRef.current, currentMessageId || undefined);
    }
  }, [playText, currentMessageId]);

  return {
    isPlaying,
    isPaused,
    isGenerating,
    currentMessageId,
    playText,
    enqueueSentence,
    pause,
    resume,
    stop,
    replay,
  };
}
