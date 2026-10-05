import React, { useState, useEffect } from "react";
import { 
  X, 
  Settings as SettingsIcon, 
  Volume2, 
  Shield, 
  Sliders, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Cpu, 
  Server, 
  Plus, 
  Trash2, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight, 
  Terminal, 
  Activity, 
  Lock, 
  Globe 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { UserSettings, SystemCapabilityStatus, MCPServerItem, UnifiedToolItem, ToolExecutionLogItem } from "../types";
import { 
  fetchMCPServers, 
  createMCPServer, 
  updateMCPServer, 
  deleteMCPServer, 
  reconnectMCPServer, 
  fetchUnifiedTools, 
  fetchToolPermissions, 
  saveToolPermission, 
  fetchToolExecutionLogs 
} from "../services/api";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
  systemStatus: SystemCapabilityStatus | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  setSettings,
  systemStatus,
}) => {
  const [activeTab, setActiveTab] = useState<"general" | "mcp" | "permissions" | "logs">("general");

  // MCP State
  const [mcpServers, setMcpServers] = useState<MCPServerItem[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
  const [connectingServerId, setConnectingServerId] = useState<string | null>(null);

  // New Server Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [newServerTransport, setNewServerTransport] = useState<"sse" | "stdio">("sse");
  const [newServerEndpoint, setNewServerEndpoint] = useState("");
  const [newServerArgs, setNewServerArgs] = useState("");
  const [newServerAuthHeader, setNewServerAuthHeader] = useState("");
  const [newServerTimeout, setNewServerTimeout] = useState(15000);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmittingServer, setIsSubmittingServer] = useState(false);

  // Permissions & Tools State
  const [unifiedTools, setUnifiedTools] = useState<UnifiedToolItem[]>([]);
  const [permissions, setPermissions] = useState<Record<string, "AUTO" | "ASK" | "BLOCK">>({});
  const [isLoadingTools, setIsLoadingTools] = useState(false);

  // Execution Logs State
  const [executionLogs, setExecutionLogs] = useState<ToolExecutionLogItem[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Load MCP servers and permissions when modal opens or tab changes
  useEffect(() => {
    if (!isOpen) return;

    if (activeTab === "mcp") {
      loadServers();
    } else if (activeTab === "permissions") {
      loadPermissionsAndTools();
    } else if (activeTab === "logs") {
      loadLogs();
    }
  }, [isOpen, activeTab]);

  const loadServers = async () => {
    setIsLoadingServers(true);
    try {
      const servers = await fetchMCPServers();
      setMcpServers(servers);
    } catch (e) {
      console.warn("Error loading MCP servers:", e);
    } finally {
      setIsLoadingServers(false);
    }
  };

  const loadPermissionsAndTools = async () => {
    setIsLoadingTools(true);
    try {
      const [tools, perms] = await Promise.all([fetchUnifiedTools(), fetchToolPermissions()]);
      setUnifiedTools(tools);
      setPermissions(perms);
    } catch (e) {
      console.warn("Error loading tools/permissions:", e);
    } finally {
      setIsLoadingTools(false);
    }
  };

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const logs = await fetchToolExecutionLogs(30);
      setExecutionLogs(logs);
    } catch (e) {
      console.warn("Error loading logs:", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServerName.trim() || !newServerEndpoint.trim()) {
      setFormError("Server name and endpoint/command are required.");
      return;
    }

    setFormError(null);
    setIsSubmittingServer(true);

    try {
      const argsArray = newServerArgs
        .split(" ")
        .map((a) => a.trim())
        .filter(Boolean);

      const envVars: Record<string, string> = {};
      if (newServerAuthHeader.trim()) {
        envVars["Authorization"] = newServerAuthHeader.trim();
      }

      await createMCPServer({
        name: newServerName.trim(),
        transport: newServerTransport,
        endpoint: newServerEndpoint.trim(),
        args: newServerTransport === "stdio" ? argsArray : undefined,
        envVars: Object.keys(envVars).length > 0 ? envVars : undefined,
        enabled: true,
        timeoutMs: Number(newServerTimeout) || 15000,
      });

      // Reset form
      setNewServerName("");
      setNewServerEndpoint("");
      setNewServerArgs("");
      setNewServerAuthHeader("");
      setShowAddForm(false);
      await loadServers();
    } catch (err: any) {
      setFormError(err.message || "Failed to add MCP server");
    } finally {
      setIsSubmittingServer(false);
    }
  };

  const handleReconnectServer = async (serverId: string) => {
    setConnectingServerId(serverId);
    try {
      await reconnectMCPServer(serverId);
      await loadServers();
    } catch (err) {
      console.warn("Reconnect failed:", err);
    } finally {
      setConnectingServerId(null);
    }
  };

  const handleToggleServer = async (server: MCPServerItem) => {
    const updatedEnabled = !server.enabled;
    await updateMCPServer(server.id, { enabled: updatedEnabled });
    await loadServers();
  };

  const handleDeleteServer = async (serverId: string) => {
    if (confirm("Are you sure you want to remove this MCP server?")) {
      await deleteMCPServer(serverId);
      await loadServers();
    }
  };

  const handlePermissionChange = async (toolName: string, level: "AUTO" | "ASK" | "BLOCK") => {
    setPermissions((prev) => ({ ...prev, [toolName]: level }));
    await saveToolPermission(toolName, level);
  };

  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };
      localStorage.setItem("flaw_ai_settings", JSON.stringify(updated));
      return updated;
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-[#121216] border border-white/10 w-full max-w-3xl max-h-[88vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl select-none"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/10 bg-[#18181f] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <SettingsIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">System Settings & MCP Architecture</h2>
                <p className="text-xs text-slate-400">Configure voice, AI engine, MCP servers, permissions & logs</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-white/10 bg-[#141418] px-6 text-xs font-bold gap-2">
            {[
              { id: "general", label: "General & AI", icon: Sliders },
              { id: "mcp", label: "MCP Servers", icon: Server },
              { id: "permissions", label: "Tool Permissions", icon: Shield },
              { id: "logs", label: "Execution Logs", icon: Activity },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-1.5 py-3 px-3 border-b-2 transition-all ${
                    isActive
                      ? "border-indigo-500 text-indigo-400 bg-white/5"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Settings Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar text-xs text-slate-300">
            {/* TAB 1: General & AI */}
            {activeTab === "general" && (
              <>
                {/* Capabilities Matrix */}
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400 mb-3 flex items-center gap-1.5">
                    <Cpu className="w-4 h-4" /> Server Capabilities Status
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { label: "Sarvam Saaras STT", status: systemStatus?.voiceInput },
                      { label: "OpenAI TTS", status: systemStatus?.voiceOutput },
                      { label: "Search Grounding", status: systemStatus?.webSearch },
                      { label: "MCP Protocol", status: systemStatus?.mcp },
                      { label: "LiveKit WebRTC", status: systemStatus?.livekit },
                    ].map((cap, i) => {
                      const isReady = cap.status === "ready";
                      const isNotConfigured = cap.status === "not_configured";
                      return (
                        <div key={i} className="p-3 bg-[#18181f] border border-white/10 rounded-2xl space-y-1">
                          <span className="text-[11px] font-bold text-slate-300 block">{cap.label}</span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                              isReady
                                ? "bg-emerald-500/20 text-emerald-400"
                                : isNotConfigured
                                ? "bg-zinc-800 text-zinc-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}
                          >
                            {isReady ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            {isReady ? "Ready" : isNotConfigured ? "Not Configured" : cap.status?.replace("_", " ") || "Check..."}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* AI Providers Status Matrix */}
                <div className="space-y-3 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Cpu className="w-4 h-4" /> AI Providers
                    </h3>
                    <span className="text-[10px] text-slate-400 font-medium">Configured server-side in .env</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { 
                        id: "gemini", 
                        name: "Gemini", 
                        configured: Boolean(systemStatus?.providers?.gemini?.configured ?? (systemStatus?.gemini === "ready")) 
                      },
                      { 
                        id: "qwen", 
                        name: "Qwen", 
                        configured: Boolean(systemStatus?.providers?.qwen?.configured ?? false) 
                      },
                      { 
                        id: "openai", 
                        name: "OpenAI", 
                        configured: Boolean(systemStatus?.providers?.openai?.configured ?? false) 
                      },
                    ].map((provider) => (
                      <div key={provider.id} className="p-3 bg-[#18181f] border border-white/10 rounded-2xl space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-200 block">{provider.name}</span>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                            provider.configured
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {provider.configured ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {provider.configured ? "Configured" : "Not Configured"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {!Boolean(
                    systemStatus?.providers?.gemini?.configured ||
                    systemStatus?.providers?.qwen?.configured ||
                    systemStatus?.providers?.openai?.configured ||
                    systemStatus?.gemini === "ready"
                  ) && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[11px] text-amber-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">No AI provider is configured</p>
                        <p className="text-[10px] text-amber-300/80">Add an API key on the server (GEMINI_API_KEY, QWEN_API_KEY, or OPENAI_API_KEY) in .env to enable AI responses.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Voice Settings */}
                <div className="space-y-4 pt-2 border-t border-white/5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4" /> Voice Input & Output Preferences
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3 bg-[#18181f] border border-white/10 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="font-bold text-white">Voice Input (STT)</p>
                        <p className="text-[10px] text-slate-400">Microphone voice typing</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.voiceInputEnabled}
                        onChange={(e) => updateSetting("voiceInputEnabled", e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                      />
                    </div>

                    <div className="p-3 bg-[#18181f] border border-white/10 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="font-bold text-white">AI Voice Output (TTS)</p>
                        <p className="text-[10px] text-slate-400">Speak AI responses</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.voiceOutputEnabled}
                        onChange={(e) => updateSetting("voiceOutputEnabled", e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                      />
                    </div>

                    {/* Sarvam STT Language Selection */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-200">Speech Recognition Language</label>
                        <span className="text-[10px] text-indigo-400 font-semibold">Sarvam Saaras STT & Web Speech</span>
                      </div>
                      <select
                        value={settings.speechLanguage || "unknown"}
                        onChange={(e) => updateSetting("speechLanguage", e.target.value)}
                        className="w-full bg-[#18181f] border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="unknown">Auto-Detect (Sarvam Indic & English)</option>
                        <option value="en-IN">English (India) [en-IN]</option>
                        <option value="hi-IN">Hindi [hi-IN]</option>
                        <option value="bn-IN">Bengali [bn-IN]</option>
                        <option value="ta-IN">Tamil [ta-IN]</option>
                        <option value="te-IN">Telugu [te-IN]</option>
                        <option value="mr-IN">Marathi [mr-IN]</option>
                        <option value="gu-IN">Gujarati [gu-IN]</option>
                        <option value="kn-IN">Kannada [kn-IN]</option>
                        <option value="ml-IN">Malayalam [ml-IN]</option>
                        <option value="pa-IN">Punjabi [pa-IN]</option>
                        <option value="od-IN">Odia [od-IN]</option>
                        <option value="as-IN">Assamese [as-IN]</option>
                        <option value="ur-IN">Urdu [ur-IN]</option>
                      </select>
                    </div>

                    {/* Status hint if Sarvam is not configured */}
                    {systemStatus?.voiceInput === "not_configured" && (
                      <div className="sm:col-span-2 p-3 bg-zinc-900/80 border border-white/10 rounded-2xl text-[11px] text-slate-400 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-slate-300">Sarvam Saaras STT: Not Configured</p>
                          <p className="text-[10px] text-slate-400">
                            Browser Web Speech API is active as an automatic fallback. To enable Sarvam Saaras AI transcription, add <code className="text-indigo-400">SARVAM_API_KEY</code> in server <code className="text-slate-300">.env</code>.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="font-bold text-slate-200">OpenAI TTS Voice</label>
                      <select
                        value={settings.selectedVoice}
                        onChange={(e) => updateSetting("selectedVoice", e.target.value)}
                        className="w-full bg-[#18181f] border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="nova">Nova (Default - Warm & Clear)</option>
                        <option value="alloy">Alloy (Neutral & Balanced)</option>
                        <option value="echo">Echo (Warm Male)</option>
                        <option value="fable">Fable (Expressive British)</option>
                        <option value="onyx">Onyx (Deep Male)</option>
                        <option value="shimmer">Shimmer (Soprano & Upbeat)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* AI Model & Mode */}
                <div className="space-y-4 pt-2 border-t border-white/5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> AI Engine & Personality
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-200">AI Provider</label>
                      <select
                        value={settings.selectedProvider || "AUTO"}
                        onChange={(e) => updateSetting("selectedProvider", e.target.value as any)}
                        className="w-full bg-[#18181f] border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="AUTO">AUTO (Auto-Select Configured)</option>
                        <option value="gemini">Google Gemini</option>
                        <option value="qwen">Alibaba Qwen</option>
                        <option value="openai">OpenAI</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-200">AI Model</label>
                      <select
                        value={settings.selectedModel}
                        onChange={(e) => updateSetting("selectedModel", e.target.value)}
                        className="w-full bg-[#18181f] border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <optgroup label="Google Gemini">
                          <option value="gemini-2.0-flash">Gemini 2.0 Flash (Default)</option>
                          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                          <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</option>
                          <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                        </optgroup>
                        <optgroup label="Alibaba Qwen">
                          <option value="qwen-plus">Qwen Plus (Balanced)</option>
                          <option value="qwen-max">Qwen Max (Flagship)</option>
                          <option value="qwen-turbo">Qwen Turbo (Fast)</option>
                          <option value="qwen-2.5-72b-instruct">Qwen 2.5 72B Instruct</option>
                        </optgroup>
                        <optgroup label="OpenAI">
                          <option value="gpt-4o">GPT-4o (Omni)</option>
                          <option value="gpt-4o-mini">GPT-4o Mini (Fast)</option>
                          <option value="gpt-4-turbo">GPT-4 Turbo</option>
                          <option value="o3-mini">o3-mini (Reasoning)</option>
                        </optgroup>
                      </select>
                    </div>

                    <div className="p-3 bg-[#18181f] border border-white/10 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="font-bold text-white">FRIDAY Personality</p>
                        <p className="text-[10px] text-slate-400">Concise voice style</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.fridayMode}
                        onChange={(e) => updateSetting("fridayMode", e.target.checked)}
                        className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Appearance */}
                <div className="space-y-4 pt-2 border-t border-white/5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4" /> Appearance & Theme
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-200">Color Theme</label>
                      <select
                        value={settings.theme}
                        onChange={(e) => updateSetting("theme", e.target.value as any)}
                        className="w-full bg-[#18181f] border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="dark">Dark Obsidian (Classic Flaw AI)</option>
                        <option value="midnight">Deep Midnight Blue</option>
                        <option value="cyberpunk">Cyberpunk Neon</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-200">Animation Intensity</label>
                      <select
                        value={settings.animationIntensity}
                        onChange={(e) => updateSetting("animationIntensity", e.target.value as any)}
                        className="w-full bg-[#18181f] border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="high">High (Smooth micro-animations & waveforms)</option>
                        <option value="medium">Medium (Standard transitions)</option>
                        <option value="low">Low (Reduced motion for performance)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* TAB 2: MCP SERVERS */}
            {activeTab === "mcp" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Server className="w-4 h-4 text-indigo-400" />
                      Model Context Protocol Servers
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Connect external MCP servers over SSE or local Stdio to expose dynamic AI capabilities.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {showAddForm ? "Cancel" : "Add MCP Server"}
                  </button>
                </div>

                {/* Add Server Form */}
                <AnimatePresence>
                  {showAddForm && (
                    <motion.form
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={handleAddServer}
                      className="p-4 bg-[#18181f] border border-indigo-500/30 rounded-2xl space-y-3 overflow-hidden shadow-xl"
                    >
                      <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-indigo-400" /> Register New MCP Server
                      </h4>

                      {formError && (
                        <div className="p-2.5 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl text-[11px] flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{formError}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-300">Server Name</label>
                          <input
                            type="text"
                            placeholder="e.g. GitHub MCP or Web Search"
                            value={newServerName}
                            onChange={(e) => setNewServerName(e.target.value)}
                            className="w-full bg-[#121216] border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                            required
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-300">Transport Type</label>
                          <select
                            value={newServerTransport}
                            onChange={(e) => setNewServerTransport(e.target.value as any)}
                            className="w-full bg-[#121216] border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                          >
                            <option value="sse">SSE (HTTP Server-Sent Events URL)</option>
                            <option value="stdio">Stdio (Local Command / Process)</option>
                          </select>
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[11px] font-bold text-slate-300">
                            {newServerTransport === "sse" ? "SSE Endpoint URL" : "Executable / Command Path"}
                          </label>
                          <input
                            type="text"
                            placeholder={newServerTransport === "sse" ? "https://mcp-server.example.com/sse" : "npx"}
                            value={newServerEndpoint}
                            onChange={(e) => setNewServerEndpoint(e.target.value)}
                            className="w-full bg-[#121216] border border-white/10 rounded-xl p-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                            required
                          />
                        </div>

                        {newServerTransport === "stdio" && (
                          <div className="space-y-1 sm:col-span-2">
                            <label className="text-[11px] font-bold text-slate-300">CLI Arguments (Space-separated)</label>
                            <input
                              type="text"
                              placeholder="-y @modelcontextprotocol/server-filesystem D:/data"
                              value={newServerArgs}
                              onChange={(e) => setNewServerArgs(e.target.value)}
                              className="w-full bg-[#121216] border border-white/10 rounded-xl p-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        )}

                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                            <Lock className="w-3 h-3 text-slate-400" />
                            Optional Auth Token / Secret (Encrypted Server-Side)
                          </label>
                          <input
                            type="password"
                            placeholder="Bearer your-secret-token"
                            value={newServerAuthHeader}
                            onChange={(e) => setNewServerAuthHeader(e.target.value)}
                            className="w-full bg-[#121216] border border-white/10 rounded-xl p-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowAddForm(false)}
                          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingServer}
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                        >
                          {isSubmittingServer ? "Registering & Connecting..." : "Save & Connect Server"}
                        </button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>

                {/* Server List */}
                <div className="space-y-3">
                  {isLoadingServers ? (
                    <div className="p-8 text-center text-slate-400">Loading registered MCP servers...</div>
                  ) : mcpServers.length === 0 ? (
                    <div className="p-8 bg-[#18181f] border border-white/5 rounded-2xl text-center space-y-2">
                      <Server className="w-8 h-8 text-slate-500 mx-auto" />
                      <p className="font-bold text-slate-300">No MCP Servers Configured</p>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        Add an MCP server above to dynamically connect external tools (search, filesystem, GitHub, databases) to fLAW AI.
                      </p>
                    </div>
                  ) : (
                    mcpServers.map((server) => {
                      const isExpanded = expandedServerId === server.id;
                      const isConnecting = connectingServerId === server.id;

                      const statusColors = {
                        connected: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                        connecting: "bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse",
                        disconnected: "bg-amber-500/20 text-amber-400 border-amber-500/30",
                        error: "bg-rose-500/20 text-rose-400 border-rose-500/30",
                      };

                      return (
                        <div
                          key={server.id}
                          className="bg-[#18181f] border border-white/10 rounded-2xl p-4 space-y-3 shadow-md"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-xl bg-white/5 text-indigo-400 border border-white/10">
                                {server.transport === "sse" ? <Globe className="w-4 h-4" /> : <Terminal className="w-4 h-4" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-white text-xs">{server.name}</h4>
                                  <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                                    {server.transport}
                                  </span>
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                      statusColors[server.status] || statusColors.disconnected
                                    }`}
                                  >
                                    {server.status === "connected" ? "✓ Connected" : server.status}
                                  </span>
                                </div>
                                <p className="text-[11px] font-mono text-slate-400 truncate max-w-md mt-0.5">
                                  {server.endpoint}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Enable / Disable Switch */}
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <span className="text-[10px] text-slate-400 font-semibold">
                                  {server.enabled ? "Enabled" : "Disabled"}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={server.enabled}
                                  onChange={() => handleToggleServer(server)}
                                  className="w-3.5 h-3.5 accent-indigo-600 rounded cursor-pointer"
                                />
                              </label>

                              {/* Reconnect button */}
                              <button
                                onClick={() => handleReconnectServer(server.id)}
                                disabled={isConnecting}
                                className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors"
                                title="Reconnect & Refresh Tools"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? "animate-spin text-indigo-400" : ""}`} />
                              </button>

                              {/* Delete button */}
                              <button
                                onClick={() => handleDeleteServer(server.id)}
                                className="p-1.5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                                title="Delete Server"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Tools summary expander */}
                          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                            <button
                              onClick={() => setExpandedServerId(isExpanded ? null : server.id)}
                              className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                            >
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              <span>{server.tools?.length || server.toolCount || 0} Dynamic Tools Discovered</span>
                            </button>

                            <span className="text-[10px] text-slate-500">
                              Timeout: {server.timeoutMs || 15000}ms {server.hasAuth && "• Protected"}
                            </span>
                          </div>

                          {/* Expanded Discovered Tools List */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-2 pt-2 overflow-hidden"
                              >
                                {server.tools && server.tools.length > 0 ? (
                                  server.tools.map((tool, idx) => (
                                    <div
                                      key={idx}
                                      className="p-2.5 bg-[#121216] border border-white/5 rounded-xl space-y-1"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-mono font-bold text-indigo-300 text-[11px]">
                                          {tool.name}
                                        </span>
                                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded font-bold">
                                          Discovered
                                        </span>
                                      </div>
                                      {tool.description && (
                                        <p className="text-[10px] text-slate-400 leading-normal">{tool.description}</p>
                                      )}
                                      {tool.inputSchema?.properties && (
                                        <div className="text-[9px] font-mono text-slate-500 pt-0.5">
                                          Params: {Object.keys(tool.inputSchema.properties).join(", ") || "none"}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-[11px] text-slate-500 italic p-2">
                                    No tools discovered yet. Click the Reconnect icon to discover tools.
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: TOOL PERMISSIONS */}
            {activeTab === "permissions" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-400" />
                    Unified Tool Security & Permissions
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Enforce server-side security policies for built-in and MCP tools.
                  </p>
                </div>

                <div className="space-y-2">
                  {isLoadingTools ? (
                    <div className="p-8 text-center text-slate-400">Loading tools and permissions...</div>
                  ) : unifiedTools.length === 0 ? (
                    <div className="p-6 bg-[#18181f] border border-white/5 rounded-2xl text-center text-slate-400">
                      No tools registered.
                    </div>
                  ) : (
                    unifiedTools.map((tool) => {
                      const currentPerm = permissions[tool.name] || tool.permission || "AUTO";
                      return (
                        <div
                          key={tool.id}
                          className="p-3 bg-[#18181f] border border-white/10 rounded-2xl flex items-center justify-between gap-4"
                        >
                          <div className="overflow-hidden">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-white text-xs">{tool.name}</span>
                              <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                                {tool.source === "builtin" ? "Built-in" : `MCP: ${tool.serverName || "Server"}`}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5 max-w-md">
                              {tool.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              value={currentPerm}
                              onChange={(e) => handlePermissionChange(tool.name, e.target.value as any)}
                              className={`p-1.5 text-xs font-bold rounded-xl border focus:outline-none ${
                                currentPerm === "AUTO"
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                  : currentPerm === "ASK"
                                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                  : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                              }`}
                            >
                              <option value="AUTO">AUTO (Allow)</option>
                              <option value="ASK">ASK (Confirm)</option>
                              <option value="BLOCK">BLOCK (Deny)</option>
                            </select>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: EXECUTION LOGS */}
            {activeTab === "logs" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-400" />
                      Safe Tool Execution Logs
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Audit trail of recent built-in and MCP tool calls. Sensitive credentials are stripped.
                    </p>
                  </div>

                  <button
                    onClick={loadLogs}
                    className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors"
                    title="Refresh Logs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2">
                  {isLoadingLogs ? (
                    <div className="p-8 text-center text-slate-400">Loading execution logs...</div>
                  ) : executionLogs.length === 0 ? (
                    <div className="p-8 bg-[#18181f] border border-white/5 rounded-2xl text-center text-slate-500">
                      No tool executions recorded yet.
                    </div>
                  ) : (
                    executionLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 bg-[#18181f] border border-white/5 rounded-2xl flex items-center justify-between text-[11px]"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-white">{log.tool_name}</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 text-slate-400 font-mono">
                              {log.source.toUpperCase()} {log.server_name && `• ${log.server_name}`}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                log.status === "success"
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : log.status === "blocked"
                                  ? "bg-amber-500/20 text-amber-400"
                                  : "bg-rose-500/20 text-rose-400"
                              }`}
                            >
                              {log.status.toUpperCase()}
                            </span>
                          </div>
                          {log.error_message && (
                            <p className="text-rose-400 text-[10px] truncate max-w-md">{log.error_message}</p>
                          )}
                        </div>

                        <div className="text-right text-[10px] text-slate-500">
                          <div>{log.duration_ms}ms</div>
                          <div>{new Date(log.created_at).toLocaleTimeString()}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
