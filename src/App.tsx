import React, { useState, useEffect, useRef } from "react";
import { Bot, Sparkles, Zap, Globe, MessageSquare, Terminal, History } from "lucide-react";
import confetti from "canvas-confetti";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { ChatMessage } from "./components/ChatMessage";
import { ChatInput } from "./components/ChatInput";
import { FridayVoiceWidget } from "./components/FridayVoiceWidget";
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
import { 
  fetchSystemStatus, 
  uploadAttachment, 
  fetchCurrentUser, 
  fetchServerConversations, 
  fetchConversationMessages,
  syncServerChat, 
  updateServerChat,
  deleteServerChat,
  syncServerMessage,
  fetchUserSettings,
  saveUserSettings
} from "./services/api";

import { 
  Chat, 
  Message, 
  AIMode, 
  VoiceMode, 
  UserSettings, 
  SystemCapabilityStatus, 
  ToolActivity, 
  SourceItem,
  User,
  AttachmentItem
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
  // State
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFileItem[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [show3DAssistant, setShow3DAssistant] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorldMonitorOpen, setIsWorldMonitorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  // Modes & Settings
  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash");
  const [aiMode, setAiMode] = useState<AIMode>("GENERAL");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("chat");
  const [useSearch, setUseSearch] = useState(true);
  const [fridayMode, setFridayMode] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [systemStatus, setSystemStatus] = useState<SystemCapabilityStatus | null>(null);

  // Active Tool Traces & Code Runner Snippet
  const [activeToolActivities, setActiveToolActivities] = useState<ToolActivity[]>([]);
  const [activeSources, setActiveSources] = useState<SourceItem[]>([]);
  const [initialCodeSnippet, setInitialCodeSnippet] = useState<{ code: string; language: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Streaming voice buffer ref
  const streamingAudioBufferRef = useRef<string>("");

  // Hands-free conversational loop ref
  const voiceModeRef = useRef<VoiceMode>(voiceMode);
  voiceModeRef.current = voiceMode;

  const { isPlaying: isPlayingAudio, isPaused: isPausedAudio, playText, enqueueSentence, pause: pauseAudio, resume: resumeAudio, stop: stopAudio, replay: replayAudio } = useVoiceOutput({
    autoRead: settings.autoRead,
    selectedVoice: settings.selectedVoice,
    speechSpeed: settings.speechSpeed,
    volume: settings.volume,
    onFinished: () => {
      // In hands-free mode, reactivate microphone automatically after AI speech
      if (voiceModeRef.current === "hands-free") {
        setTimeout(() => {
          startVoiceRecording();
        }, 600);
      }
    },
  });

  // Voice Input Hook with VAD and mic device support
  const { 
    isRecording, 
    isProcessing: isProcessingVoice, 
    audioLevel, 
    startRecording: startVoiceRecording,
    stopRecording: stopVoiceRecording,
    toggleRecording 
  } = useVoiceInput({
    deviceId: settings.selectedMicId,
    enableVAD: voiceMode === "hands-free",
    onTranscript: (transcriptText) => {
      if (voiceModeRef.current === "hands-free" && transcriptText.trim()) {
        handleSendMessage(transcriptText.trim());
      } else {
        setInput(prev => (prev ? `${prev} ${transcriptText}` : transcriptText));
      }
    },
  });

  const { isConnected: livekitConnected } = useLiveKit();

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
        fetchServerConversations().then(serverChats => {
          if (serverChats && serverChats.length > 0) {
            setChats(serverChats);
            setCurrentChatId(serverChats[0].id);
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
      } catch (e) {}
    }

    const savedChats = localStorage.getItem("flaw_ai_chats");
    if (savedChats) {
      try {
        const parsed = JSON.parse(savedChats);
        setChats(parsed);
        if (parsed.length > 0) setCurrentChatId(parsed[0].id);
        else createNewChat();
      } catch (e) {
        createNewChat();
      }
    } else {
      createNewChat();
    }
  }, []);

  // Persist user settings to server when user is authenticated
  useEffect(() => {
    if (currentUser) {
      saveUserSettings(settings);
    }
  }, [settings, currentUser]);

  // Load conversation messages with pagination when active chat changes
  useEffect(() => {
    if (!currentChatId) return;
    const activeChat = chats.find(c => c.id === currentChatId);
    if (activeChat && activeChat.messages.length === 0) {
      fetchConversationMessages(currentChatId, { limit: 50, offset: 0 }).then(res => {
        if (res.messages && res.messages.length > 0) {
          const loaded: Message[] = res.messages.map((m: any) => ({
            id: m.id,
            role: m.role === "model" ? "model" : "user",
            content: m.content,
            timestamp: new Date(m.created_at).getTime(),
            sources: m.metadata?.sources,
            offerWorldMonitor: m.metadata?.offerWorldMonitor,
          }));
          setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: loaded } : c));
          setHasMoreMessages(res.hasMore);
        } else {
          setHasMoreMessages(false);
        }
      });
    }
  }, [currentChatId]);

  // Load older messages for pagination (50 at a time)
  const loadOlderMessages = async () => {
    if (!currentChatId || isLoadingOlder) return;
    const activeChat = chats.find(c => c.id === currentChatId);
    const currentCount = activeChat?.messages.length || 0;
    setIsLoadingOlder(true);
    try {
      const res = await fetchConversationMessages(currentChatId, { limit: 50, offset: currentCount });
      if (res.messages && res.messages.length > 0) {
        const formattedOlder: Message[] = res.messages.map((m: any) => ({
          id: m.id,
          role: m.role === "model" ? "model" : "user",
          content: m.content,
          timestamp: new Date(m.created_at).getTime(),
          sources: m.metadata?.sources,
          offerWorldMonitor: m.metadata?.offerWorldMonitor,
        }));
        setChats(prev => prev.map(c => 
          c.id === currentChatId ? { ...c, messages: [...formattedOlder, ...c.messages] } : c
        ));
        setHasMoreMessages(res.hasMore);
      } else {
        setHasMoreMessages(false);
      }
    } catch (e) {
      console.warn("Failed to load older messages:", e);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  // Save chats to localStorage
  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem("flaw_ai_chats", JSON.stringify(chats));
    }
  }, [chats]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, currentChatId, isLoading, toolStatus]);

  const createNewChat = () => {
    const newChat: Chat = {
      id: crypto.randomUUID(),
      title: "New Conversation",
      messages: [],
      updatedAt: Date.now(),
      mode: aiMode,
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    syncServerChat(newChat);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteServerChat(id);
    const updated = chats.filter(c => c.id !== id);
    setChats(updated);
    if (currentChatId === id) {
      if (updated.length > 0) setCurrentChatId(updated[0].id);
      else createNewChat();
    }
  };

  const togglePinChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const chat = chats.find(c => c.id === id);
    const newPinned = !chat?.isPinned;
    updateServerChat(id, { pinned: newPinned });
    setChats(prev => prev.map(c => c.id === id ? { ...c, isPinned: newPinned } : c));
  };

  const renameChat = (id: string, newTitle: string) => {
    updateServerChat(id, { title: newTitle });
    setChats(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));
  };

  const exportChat = (id: string, format: "markdown" | "json") => {
    const target = chats.find(c => c.id === id);
    if (!target) return;

    let content = "";
    let mime = "text/plain";
    let filename = `${target.title.replace(/[^a-z0-9]/gi, "_")}.${format === "json" ? "json" : "md"}`;

    if (format === "json") {
      content = JSON.stringify(target, null, 2);
      mime = "application/json";
    } else {
      content = `# ${target.title}\n\n` + target.messages.map(m => `### ${m.role === 'user' ? 'User' : 'Flaw AI'}:\n${m.content}\n`).join("\n---\n\n");
      mime = "text/markdown";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Stop Generation Handler
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setToolStatus(null);
    stopAudio();
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const messageText = customPrompt !== undefined ? customPrompt : input;
    if (!messageText.trim() && attachedImages.length === 0 && attachedFiles.length === 0) return;
    if (!currentChatId) return;

    stopAudio();
    streamingAudioBufferRef.current = "";

    // Upload attached files to server to extract document text
    let uploadedAttachments: AttachmentItem[] = [];
    if (attachedFiles.length > 0) {
      setToolStatus("Processing attachments...");
      for (const f of attachedFiles) {
        try {
          const res = await uploadAttachment(f.filename, f.mimeType, f.base64Content, currentChatId);
          uploadedAttachments.push(res);
        } catch (err) {
          console.warn("Attachment upload warning:", err);
        }
      }
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText.trim(),
      imagery: attachedImages.length > 0 ? [...attachedImages] : undefined,
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
      timestamp: Date.now(),
    };

    const activeChat = chats.find(c => c.id === currentChatId);
    if (!activeChat) return;

    const updatedMessages = [...activeChat.messages, userMessage];

    let newTitle = activeChat.title;
    if (activeChat.messages.length === 0) {
      newTitle = messageText.length > 30 ? `${messageText.substring(0, 30)}...` : messageText || (uploadedAttachments[0]?.filename ? `Document: ${uploadedAttachments[0].filename}` : "Multimodal Consultation");
    }

    setChats(prev => prev.map(c => 
      c.id === currentChatId 
        ? { ...c, messages: updatedMessages, title: newTitle, updatedAt: Date.now() } 
        : c
    ));

    syncServerMessage(currentChatId, userMessage);

    if (customPrompt === undefined) {
      setInput("");
    }
    setAttachedImages([]);
    setAttachedFiles([]);
    setIsLoading(true);
    setToolStatus(null);

    abortControllerRef.current = new AbortController();

    try {
      const token = localStorage.getItem("flaw_ai_token");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          conversationId: currentChatId,
          model: selectedModel,
          provider: settings.selectedProvider || "AUTO",
          useSearch,
          fridayMode,
          aiMode,
          attachments: uploadedAttachments,
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content,
            imagery: m.imagery
          }))
        }),
      });

      if (!response.ok) throw new Error("Failed to communicate with AI Server");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let offerWorldMonitor = false;
      let returnedSources: SourceItem[] = [];

      const assistantMessageId = crypto.randomUUID();

      setChats(prev => prev.map(c => 
        c.id === currentChatId 
          ? { 
              ...c, 
              messages: [...c.messages, { 
                id: assistantMessageId, 
                role: "model", 
                content: "", 
                timestamp: Date.now() 
              }] 
            } 
          : c
      ));

      let streamSentenceBuffer = "";

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            if (dataStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(dataStr);

              if (parsed.error) {
                assistantContent += `\n\n> ⚠️ ${parsed.error}`;
              }

              if (parsed.toolStatus) {
                setToolStatus(parsed.toolStatus);
                const activity: ToolActivity = {
                  id: crypto.randomUUID(),
                  name: parsed.toolName || "System Tool",
                  userFacingStatus: parsed.toolStatus,
                  timestamp: Date.now(),
                };
                setActiveToolActivities(prev => [activity, ...prev]);
              }

              if (parsed.text) {
                assistantContent += parsed.text;
                setChats(prev => prev.map(c => 
                  c.id === currentChatId 
                    ? { 
                        ...c, 
                        messages: c.messages.map(m => 
                          m.id === assistantMessageId ? { ...m, content: assistantContent } : m
                        ) 
                      } 
                    : c
                ));

                // Streaming-aware voice output: segment sentences as they arrive
                if (settings.autoRead || voiceMode !== "chat") {
                  streamSentenceBuffer += parsed.text;
                  const match = streamSentenceBuffer.match(/(.*?[.!?\n]+)\s+/);
                  if (match) {
                    const completedSentence = match[1].trim();
                    streamSentenceBuffer = streamSentenceBuffer.slice(match[0].length);
                    if (completedSentence && completedSentence.length > 3) {
                      enqueueSentence(completedSentence);
                    }
                  }
                }
              }

              if (parsed.meta) {
                if (parsed.meta.offerWorldMonitor) offerWorldMonitor = true;
                if (parsed.meta.sources) {
                  returnedSources = parsed.meta.sources;
                  setActiveSources(prev => [...returnedSources, ...prev]);
                }
              }
            } catch (e) {
              console.error("JSON Chunk Parse Error:", e);
            }
          }
        }
      }

      // Flush any remaining text in streamSentenceBuffer to TTS queue
      if ((settings.autoRead || voiceMode !== "chat") && streamSentenceBuffer.trim()) {
        enqueueSentence(streamSentenceBuffer.trim());
      }

      // Attach metadata sources & World Monitor offer to final message
      setChats(prev => prev.map(c => 
        c.id === currentChatId 
          ? { 
              ...c, 
              messages: c.messages.map(m => 
                m.id === assistantMessageId 
                  ? { ...m, sources: returnedSources.length > 0 ? returnedSources : undefined, offerWorldMonitor } 
                  : m
              ) 
            } 
          : c
      ));

      syncServerMessage(currentChatId, {
        id: assistantMessageId,
        role: "model",
        content: assistantContent,
        model: selectedModel,
        metadata: { sources: returnedSources.length > 0 ? returnedSources : undefined, offerWorldMonitor },
      });

      // Trigger celebratory confetti if victory detected
      if (assistantContent.toLowerCase().includes("congratulations") || assistantContent.toLowerCase().includes("win")) {
        confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      }

    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("Chat Error:", error);
      }
    } finally {
      setIsLoading(false);
      setToolStatus(null);
      abortControllerRef.current = null;
    }
  };

  const handleEditUserMessage = (text: string) => {
    setInput(text);
  };

  const handleContinueResponse = () => {
    handleSendMessage("Please continue your response from where you left off.");
  };

  const handleRunCodeSnippet = (codeStr: string, langStr: string) => {
    setInitialCodeSnippet({ code: codeStr, language: langStr });
    setIsRightPanelOpen(true);
  };

  const currentChat = chats.find(c => c.id === currentChatId);

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
                onRunCodeSnippet={handleRunCodeSnippet}
                onEditUserMessage={handleEditUserMessage}
                onContinueResponse={handleContinueResponse}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <ChatInput
          input={input}
          setInput={setInput}
          attachedImages={attachedImages}
          setAttachedImages={setAttachedImages}
          attachedFiles={attachedFiles}
          setAttachedFiles={setAttachedFiles}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          isLoading={isLoading}
          isListening={isRecording}
          isProcessingVoice={isProcessingVoice}
          audioLevel={audioLevel}
          onToggleListening={toggleRecording}
          voiceMode={voiceMode}
          toolStatus={toolStatus}
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
            audioLevel={audioLevel}
            onToggleListening={toggleRecording}
            onStopAudio={stopAudio}
            livekitConnected={livekitConnected}
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
