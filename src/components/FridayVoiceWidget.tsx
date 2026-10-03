import React from "react";
import { Mic, MicOff, Volume2, Square, X, Sparkles, Radio } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { VoiceMode } from "../types";

interface FridayVoiceWidgetProps {
  voiceMode: VoiceMode;
  setVoiceMode: (mode: VoiceMode) => void;
  isListening: boolean;
  isProcessing: boolean;
  isPlayingAudio: boolean;
  audioLevel: number;
  onToggleListening: () => void;
  onStopAudio: () => void;
  livekitConnected: boolean;
}

export const FridayVoiceWidget: React.FC<FridayVoiceWidgetProps> = ({
  voiceMode,
  setVoiceMode,
  isListening,
  isProcessing,
  isPlayingAudio,
  audioLevel,
  onToggleListening,
  onStopAudio,
  livekitConnected,
}) => {
  if (voiceMode === "chat") return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="fixed bottom-24 right-6 z-40 bg-[#161619]/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 shadow-2xl w-80 select-none overflow-hidden"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              {voiceMode === "hands-free" ? "F.R.I.D.A.Y. Hands-Free" : "Voice Assistant"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {livekitConnected && (
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" /> LiveKit
              </span>
            )}
            <button
              onClick={() => setVoiceMode("chat")}
              className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Waveform Visualizer */}
        <div className="h-28 flex flex-col items-center justify-center relative my-2 bg-[#0e0e10] rounded-2xl border border-white/5 p-4">
          {isPlayingAudio ? (
            <div className="flex items-center gap-1.5 h-12">
              {[60, 100, 40, 80, 50, 90, 70, 30].map((h, i) => (
                <motion.div
                  key={i}
                  animate={{ height: ["20%", `${h}%`, "20%"] }}
                  transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.1 }}
                  className="w-1.5 bg-gradient-to-t from-indigo-500 to-purple-400 rounded-full"
                />
              ))}
            </div>
          ) : isListening ? (
            <div className="flex items-center gap-1.5 h-12">
              {[...Array(9)].map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-amber-400 rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(15, audioLevel * (0.5 + Math.random() * 0.8))}%` }}
                />
              ))}
            </div>
          ) : isProcessing ? (
            <div className="flex flex-col items-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-400 animate-spin" />
              <span className="text-[11px] font-bold text-slate-400">Processing STT / AI...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-slate-500">
              <Mic className="w-6 h-6" />
              <span className="text-[11px]">Ready. Tap to speak.</span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={onToggleListening}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
              isListening
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-amber-500 hover:bg-amber-400 text-black"
            }`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>{isListening ? "Stop Mic" : "Start Speaking"}</span>
          </button>

          {isPlayingAudio && (
            <button
              onClick={onStopAudio}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors"
              title="Stop Speech"
            >
              <Square className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
