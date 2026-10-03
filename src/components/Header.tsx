import React from "react";
import { 
  Zap, 
  Sparkles, 
  Globe, 
  Settings, 
  Sidebar as SidebarIcon, 
  SlidersHorizontal,
  Bot,
  Activity,
  Mic,
  Volume2,
  Cpu
} from "lucide-react";
import { AIMode, VoiceMode, SystemCapabilityStatus } from "../types";

interface HeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  aiMode: AIMode;
  setAiMode: (mode: AIMode) => void;
  voiceMode: VoiceMode;
  setVoiceMode: (mode: VoiceMode) => void;
  useSearch: boolean;
  setUseSearch: (use: boolean) => void;
  fridayMode: boolean;
  setFridayMode: (friday: boolean) => void;
  systemStatus: SystemCapabilityStatus | null;
  onOpenSettings: () => void;
  onToggleRightPanel: () => void;
  isRightPanelOpen: boolean;
  currentUser?: { id: string; name: string; email: string } | null;
  onOpenAuth?: () => void;
  show3DAssistant?: boolean;
  onToggle3DAssistant?: () => void;
}

const MODELS = [
  { id: "gemini-2.0-flash", name: "Flash 2.0", icon: Zap, desc: "Fast & Precise" },
  { id: "gemini-1.5-pro", name: "Pro 1.5", icon: Sparkles, desc: "Ultimate Reasoning" },
  { id: "gemini-2.0-flash-lite", name: "Lite 2.0", icon: Zap, desc: "Ultra Low Latency" },
];

const AI_MODES: { id: AIMode; label: string; desc: string }[] = [
  { id: "GENERAL", label: "General", desc: "Balanced versatile assistant" },
  { id: "CODING", label: "Coding", desc: "Expert developer & architect" },
  { id: "RESEARCH", label: "Research", desc: "Deep analytical web & paper citations" },
  { id: "VISION", label: "Vision", desc: "High fidelity image & document analysis" },
  { id: "VOICE", label: "Voice", desc: "Optimized for natural audio interaction" },
  { id: "FRIDAY", label: "F.R.I.D.A.Y.", desc: "Calm, concise, confident voice assistant" },
  { id: "CREATIVE", label: "Creative", desc: "Brainstorming & imaginative synthesis" },
];

export const Header: React.FC<HeaderProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  selectedModel,
  setSelectedModel,
  aiMode,
  setAiMode,
  voiceMode,
  setVoiceMode,
  useSearch,
  setUseSearch,
  fridayMode,
  setFridayMode,
  systemStatus,
  onOpenSettings,
  onToggleRightPanel,
  isRightPanelOpen,
  currentUser,
  onOpenAuth,
  show3DAssistant,
  onToggle3DAssistant,
}) => {
  return (
    <header className="h-14 px-4 md:px-6 border-b border-white/10 flex items-center justify-between bg-[#0d0d0d]/90 backdrop-blur-xl sticky top-0 z-30 shadow-md select-none">
      {/* Left branding & sidebar toggle */}
      <div className="flex items-center gap-3">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-slate-100"
          title="Toggle Navigation Sidebar"
        >
          <SidebarIcon className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white shadow-lg transition-all ${
            fridayMode ? "bg-gradient-to-r from-amber-500 via-orange-500 to-red-500" : "bg-gradient-to-br from-indigo-500 to-purple-600"
          }`}>
            <Bot className="w-4 h-4" />
          </div>
          <h1 className="font-extrabold text-base md:text-lg tracking-tight text-white flex items-center gap-1.5">
            Flaw AI <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider shadow">Ultra</span>
          </h1>
        </div>
      </div>

      {/* Center Controls: Model Selector & AI Mode Selector */}
      <div className="hidden lg:flex items-center gap-3">
        {/* Model Selector */}
        <div className="bg-[#18181b] p-1 rounded-xl border border-white/10 flex items-center shadow-inner">
          {MODELS.map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedModel === m.id 
                    ? "bg-indigo-600 text-white shadow" 
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {m.name}
              </button>
            );
          })}
        </div>

        {/* AI Modes Dropdown */}
        <div className="relative group">
          <select 
            value={aiMode} 
            onChange={(e) => setAiMode(e.target.value as AIMode)}
            className="bg-[#18181b] text-slate-200 border border-white/10 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer font-medium appearance-none pr-8"
          >
            {AI_MODES.map(mode => (
              <option key={mode.id} value={mode.id} className="bg-[#18181b] text-slate-200">
                {mode.label} Mode
              </option>
            ))}
          </select>
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Voice Modes Pills */}
        <div className="flex bg-[#18181b] p-1 rounded-xl border border-white/10 shadow-inner">
          {(["chat", "voice", "hands-free"] as VoiceMode[]).map((vMode) => (
            <button
              key={vMode}
              onClick={() => setVoiceMode(vMode)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-all ${
                voiceMode === vMode
                  ? "bg-indigo-500 text-white shadow"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              {vMode === "hands-free" ? "Hands-Free" : vMode}
            </button>
          ))}
        </div>
      </div>

      {/* Right Controls: 3D Assistant, Search, Status, Auth, Settings */}
      <div className="flex items-center gap-2 md:gap-2.5">
        {/* 3D Anime Assistant Quick Toggle */}
        {onToggle3DAssistant && (
          <button
            onClick={onToggle3DAssistant}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all text-xs font-semibold ${
              show3DAssistant
                ? "bg-purple-600/20 border-purple-500/50 text-purple-300 shadow-sm"
                : "bg-slate-800/30 border-slate-700/50 text-slate-400 hover:text-slate-200"
            }`}
            title="Toggle 3D Anime Assistant Companion"
          >
            <Sparkles className={`w-3.5 h-3.5 ${show3DAssistant ? "text-purple-400 animate-spin" : "text-slate-500"}`} />
            <span className="hidden sm:inline text-[11px]">3D Anime</span>
          </button>
        )}

        {/* Search Grounding Toggle */}
        <button 
          onClick={() => setUseSearch(!useSearch)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all text-xs font-semibold ${
            useSearch 
              ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300" 
              : "bg-slate-800/30 border-slate-700/50 text-slate-500 hover:text-slate-400"
          }`}
          title="Toggle Real-time Web Search Grounding"
        >
          <Globe className={`w-3.5 h-3.5 ${useSearch ? "text-indigo-400 animate-pulse" : "text-slate-500"}`} />
          <span className="hidden sm:inline text-[11px]">Search</span>
        </button>

        {/* System Capability Status Indicator */}
        <button
          onClick={onToggleRightPanel}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#18181b] hover:bg-[#222226] border border-white/10 rounded-full text-xs font-medium text-slate-300 transition-colors"
          title="System Capabilities Status"
        >
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline text-[11px]">Status</span>
        </button>

        {/* Account / Auth Button */}
        {onOpenAuth && (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-full text-xs font-bold text-indigo-300 transition-colors"
            title={currentUser ? `Signed in as ${currentUser.name}` : "Sign In / Register"}
          >
            {currentUser ? (
              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
                {currentUser.name[0].toUpperCase()}
              </span>
            ) : (
              <span className="text-[11px]">Sign In</span>
            )}
          </button>
        )}

        {/* Settings Button */}
        <button 
          onClick={onOpenSettings}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-slate-100"
          title="Preferences & Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
