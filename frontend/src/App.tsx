import React, { useState, useEffect, useRef } from "react";
import { Bot, History } from "lucide-react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { ChatMessage } from "./components/ChatMessage";
import { ChatInput } from "./components/ChatInput";
import { AnimeAssistant3D } from "./components/AnimeAssistant3D";
import { AuthModal } from "./components/AuthModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RightPanel } from "./components/RightPanel";
import { WorldMonitorModal } from "./components/WorldMonitorModal";
import { SettingsModal } from "./components/SettingsModal";
import { AttachedFileItem } from "./components/ChatInput";

import { useVoiceInput } from "./hooks/useVoiceInput";
import { useVoiceOutput } from "./hooks/useVoiceOutput";
import { useLiveKit } from "./hooks/useLiveKit";
import { useChatSession } from "./hooks/useChatSession";
import { 
  fetchSystemStatus, 
  fetchCurrentUser, 
  fetchServerConversations, 
  fetchUserSettings,
  saveUserSettings
} from "./services/api";

import { 
  AIMode, 
  VoiceMode, 
  UserSettings, 
  SystemCapabilityStatus, 
  User 
} from "./types";

const DEFAULT_SETTINGS: UserSettings = {
  voiceInputEnabled: true,
  voiceOutputEnabled: true,
  autoRead: false,
  selectedVoice: "nova",
  speechSpeed: 1.0,
  volume: 1.0,
  selectedMicId: "default",
  selectedModel: "gemini-2.0-flash",
  selectedProvider: "AUTO",
  webSearchEnabled: true,
  mcpEnabled: true,
  fridayMode: false,
  theme: "dark",
  animationIntensity: "high",
};

export default function App() {
  // Input & Attachment State
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFileItem[]>([]);

  // User & Modal States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [show3DAssistant, setShow3DAssistant] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorldMonitorOpen, setIsWorldMonitorOpen] = useState(false);

  // Modes & Settings
  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash");
  const [aiMode, setAiMode] = useState<AIMode>("GENERAL");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("chat");
  const [useSearch, setUseSearch] = useState(true);
  const [fridayMode, setFridayMode] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [systemStatus, setSystemStatus] = useState<SystemCapabilityStatus | null>(null);

  // Voice Mode ref for hands-free loop
  const voiceModeRef = useRef<VoiceMode>(voiceMode);
  voiceModeRef.current = voiceMode;

  // Voice Output Hook
  const { 
    isPlaying: isPlayingAudio, 
    isPaused: isPausedAudio, 
    playText, 
    enqueueSentence, 
    pause: pauseAudio, 
    resume: resumeAudio, 
    stop: stopAudio, 
    replay: replayAudio 
  } = useVoiceOutput({
    autoRead: settings.autoRead,
    selectedVoice: settings.selectedVoice,
    speechSpeed: settings.speechSpeed,
    volume: settings.volume,
    onFinished: () => {
      if (voiceModeRef.current === "hands-free") {
        setTimeout(() => {
          startVoiceRecording();
        }, 600);
      }
    },
  });

  // Chat Session Custom Hook (encapsulates chat history, messages, pagination, SSE streaming)
  const {
    chats,
    setChats,
    currentChatId,
    setCurrentChatId,
    currentChat,
    isLoading,
    toolStatus,
    hasMoreMessages,
    isLoadingOlder,
    activeToolActivities,
    activeSources,
    initialCodeSnippet,
    messagesEndRef,
    createNewChat,
    loadOlderMessages,
    deleteChat,
    togglePinChat,
    renameChat,
    exportChat,
    stopGeneration,
    sendMessage,
    handleRunCodeSnippet,
  } = useChatSession({
    currentUser,
    settings,
    aiMode,
    selectedModel,
    fridayMode,
    useSearch,
    voiceMode,
    attachedImages,
    attachedFiles,
    onClearAttachments: () => {
      setAttachedImages([]);
      setAttachedFiles([]);
    },
    onEnqueueSentence: enqueueSentence,
    onStopAudio: stopAudio,
  });

  // Voice Input Hook
  const { 
    status: voiceStatus,
    isRecording, 
    isProcessing: isProcessingVoice, 
    audioLevel, 
    errorState: voiceError,
    startRecording: startVoiceRecording,
    stopRecording: stopVoiceRecording,
    toggleRecording 
  } = useVoiceInput({
    deviceId: settings.selectedMicId,
    enableVAD: voiceMode === "hands-free",
    languageCode: settings.speechLanguage || "unknown",
    isSarvamConfigured: systemStatus?.voiceInput === "ready",
    onTranscript: (transcriptText) => {
      if (voiceModeRef.current === "hands-free" && transcriptText.trim()) {
        sendMessage(transcriptText.trim(), "");
      } else {
        setInput(prev => (prev ? `${prev} ${transcriptText}` : transcriptText));
      }
    },
  });

  // Realtime LiveKit AI Voice Agent Hook
  const {
    voiceState: livekitVoiceState,
    isConnected: livekitConnected,
    isConnecting: livekitConnecting,
    isMuted: livekitMuted,
    audioLevel: livekitAudioLevel,
    agentAudioLevel: livekitAgentAudioLevel,
    error: livekitError,
    activeToolActivity: livekitToolActivity,
    transcripts: livekitTranscripts,
    lastUserTranscript: livekitUserTranscript,
    lastAgentTranscript: livekitAgentTranscript,
    connectToLiveKit,
    disconnectFromLiveKit,
    toggleMute: toggleLiveKitMute,
    interruptAgent: interruptLiveKitAgent,
  } = useLiveKit();

  const handleToggleLiveKit = () => {
    if (livekitConnected || livekitConnecting) {
      disconnectFromLiveKit();
    } else {
      connectToLiveKit({
        conversationId: currentChatId,
        aiMode,
        selectedProvider: settings.selectedProvider,
        selectedModel,
        fridayMode,
      });
    }
  };

  // Apply Theme Attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  // Load Initial Settings, Auth Session & System Status
  useEffect(() => {
    fetchSystemStatus().then(setSystemStatus);

    fetchCurrentUser().then(user => {
      if (user) {
        setCurrentUser(user);
        fetchUserSettings().then(serverSettings => {
          if (serverSettings && Object.keys(serverSettings).length > 0) {
            setSettings(prev => ({ ...prev, ...serverSettings }));
          }
        });
      }
    });

    const savedSettings = localStorage.getItem("flaw_ai_settings");
    if (savedSettings) {
      try { 
        const parsed = JSON.parse(savedSettings);
        setSettings(parsed);
        if (parsed.selectedModel) setSelectedModel(parsed.selectedModel);
        if (parsed.fridayMode !== undefined) setFridayMode(parsed.fridayMode);
      } catch {}
    }
  }, []);

  // Persist user settings to server when user is authenticated
  useEffect(() => {
    if (currentUser) {
      saveUserSettings(settings);
    }
  }, [settings, currentUser]);

  const handleSendMessage = (customPrompt?: string) => {
    sendMessage(customPrompt, input);
    if (customPrompt === undefined) {
      setInput("");
    }
  };

  const handleEditUserMessage = (text: string) => {
    setInput(text);
  };

  const handleContinueResponse = () => {
    handleSendMessage("Please continue your response from where you left off.");
  };

  const onRunCodeSnippet = (codeStr: string, langStr: string) => {
    handleRunCodeSnippet(codeStr, langStr);
    setIsRightPanelOpen(true);
  };

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-slate-200 font-sans overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={setCurrentChatId}
        onNewChat={createNewChat}
        onDeleteChat={deleteChat}
        onTogglePinChat={togglePinChat}
        onRenameChat={renameChat}
        onExportChat={exportChat}
        fridayMode={fridayMode}
        setFridayMode={setFridayMode}
      />

      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col relative h-full overflow-hidden">
        {/* Header Bar */}
        <Header
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          aiMode={aiMode}
          setAiMode={setAiMode}
          voiceMode={voiceMode}
          setVoiceMode={setVoiceMode}
          useSearch={useSearch}
          setUseSearch={setUseSearch}
          fridayMode={fridayMode}
          setFridayMode={setFridayMode}
          systemStatus={systemStatus}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onToggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
          isRightPanelOpen={isRightPanelOpen}
          currentUser={currentUser}
          onOpenAuth={() => setIsAuthOpen(true)}
          show3DAssistant={show3DAssistant}
          onToggle3DAssistant={() => setShow3DAssistant(!show3DAssistant)}
        />

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto px-4 md:px-12 py-8 no-scrollbar scroll-smooth">
          {hasMoreMessages && currentChat && currentChat.messages.length > 0 && (
            <div className="flex justify-center pb-4">
              <button
                onClick={loadOlderMessages}
                disabled={isLoadingOlder}
                className="flex items-center gap-2 px-4 py-2 bg-[#18181f] hover:bg-[#22222b] border border-white/10 hover:border-indigo-500/40 text-xs font-semibold text-indigo-400 hover:text-indigo-300 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                <History className="w-3.5 h-3.5" />
                <span>{isLoadingOlder ? "Loading older messages..." : "Load older messages"}</span>
              </button>
            </div>
          )}

          {currentChat?.messages.length === 0 ? (
            <div className="h-[65vh] flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-20 h-20 bg-gradient-to-tr from-indigo-600/20 via-purple-600/20 to-amber-500/20 rounded-3xl flex items-center justify-center border border-white/10 shadow-2xl">
                <Bot className="w-10 h-10 text-indigo-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-extrabold text-white tracking-tight">Multimodal Intelligence Reimagined</h2>
                <p className="text-slate-400 max-w-md mx-auto text-xs leading-relaxed">
                  Speak naturally with Sarvam STT & OpenAI TTS, upload documents & screenshots, run code in sandboxes, generate flowcharts, or talk with the 3D Anime Assistant.
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl pt-2">
                {[
                  "What's happening in the world?",
                  "Deep Code Analysis",
                  "Create a login flowchart",
                  "Read https://example.com"
                ].map((promptText) => (
                  <button
                    key={promptText}
                    onClick={() => setInput(promptText)}
                    className="p-3.5 bg-[#141418] hover:bg-[#1f1f26] border border-white/10 rounded-2xl text-[11px] font-bold text-indigo-300 transition-all hover:scale-[1.02] text-center shadow-md"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            currentChat?.messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isPlayingAudio={isPlayingAudio}
                isPausedAudio={isPausedAudio}
                onPlayAudio={playText}
                onPauseAudio={pauseAudio}
                onResumeAudio={resumeAudio}
                onStopAudio={stopAudio}
                onReplayAudio={replayAudio}
                onRegenerate={handleSendMessage}
                onOpenWorldMonitor={() => setIsWorldMonitorOpen(true)}
                onRunCodeSnippet={onRunCodeSnippet}
                onEditUserMessage={handleEditUserMessage}
                onContinueResponse={handleContinueResponse}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* LiveKit Error / Status Notification */}
        {livekitError && (
          <div className="mx-auto max-w-4xl px-4 pb-2">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-amber-300 flex items-center justify-between">
              <span>⚠️ <strong>LiveKit Voice Notice:</strong> {livekitError}</span>
              <button 
                onClick={() => disconnectFromLiveKit()}
                className="text-[11px] underline hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Input Bar */}
        <ChatInput
          input={input}
          setInput={setInput}
          attachedImages={attachedImages}
          setAttachedImages={setAttachedImages}
          attachedFiles={attachedFiles}
          setAttachedFiles={setAttachedFiles}
          onSendMessage={handleSendMessage}
          onStopGeneration={stopGeneration}
          isLoading={isLoading}
          isListening={isRecording}
          isProcessingVoice={isProcessingVoice}
          voiceStatus={voiceStatus}
          voiceError={voiceError}
          audioLevel={audioLevel}
          onToggleListening={toggleRecording}
          voiceMode={voiceMode}
          toolStatus={livekitToolActivity ? `Live Voice Tool: ${livekitToolActivity}...` : toolStatus}
          livekitConnected={livekitConnected}
          livekitConnecting={livekitConnecting}
          livekitState={livekitVoiceState}
          livekitAudioLevel={livekitAudioLevel}
          livekitMuted={livekitMuted}
          onToggleLiveKit={handleToggleLiveKit}
          onToggleLiveKitMute={toggleLiveKitMute}
          onInterruptLiveKit={interruptLiveKitAgent}
        />
      </div>

      {/* 3D Anime AI Voice Assistant Character */}
      {(voiceMode !== "chat" || show3DAssistant) && (
        <ErrorBoundary fallbackTitle="3D Assistant View">
          <AnimeAssistant3D
            voiceMode={voiceMode}
            setVoiceMode={setVoiceMode}
            isListening={isRecording}
            isProcessing={isProcessingVoice}
            isPlayingAudio={isPlayingAudio}
            audioLevel={livekitConnected ? (livekitVoiceState === "SPEAKING" ? livekitAgentAudioLevel : livekitAudioLevel) : audioLevel}
            onToggleListening={toggleRecording}
            onStopAudio={stopAudio}
            livekitConnected={livekitConnected}
            livekitState={livekitVoiceState}
            onLiveKitInterrupt={interruptLiveKitAgent}
          />
        </ErrorBoundary>
      )}

      {/* Collapsible Right Panel */}
      <ErrorBoundary fallbackTitle="Tool & Code Activity Panel">
        <RightPanel
          isOpen={isRightPanelOpen}
          onClose={() => setIsRightPanelOpen(false)}
          systemStatus={systemStatus}
          toolActivities={activeToolActivities}
          sources={activeSources}
          initialCodeSnippet={initialCodeSnippet}
        />
      </ErrorBoundary>

      {/* World Monitor Dashboard Modal */}
      <WorldMonitorModal
        isOpen={isWorldMonitorOpen}
        onClose={() => setIsWorldMonitorOpen(false)}
      />

      {/* Settings Dialog Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        setSettings={setSettings}
        systemStatus={systemStatus}
      />

      {/* Auth & Account Profile Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={currentUser}
        onUserChange={(user) => {
          setCurrentUser(user);
          if (user) {
            fetchServerConversations().then(serverChats => {
              if (serverChats && serverChats.length > 0) setChats(serverChats);
            });
          }
        }}
      />
    </div>
  );
}
