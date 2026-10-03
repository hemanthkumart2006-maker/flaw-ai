import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import {
  Chat,
  Message,
  AIMode,
  VoiceMode,
  UserSettings,
  ToolActivity,
  SourceItem,
  User,
  AttachmentItem,
} from "../types";
import { AttachedFileItem } from "../components/ChatInput";
import {
  fetchServerConversations,
  fetchConversationMessages,
  syncServerChat,
  updateServerChat,
  deleteServerChat,
  syncServerMessage,
  uploadAttachment,
} from "../services/api";

export interface UseChatSessionOptions {
  currentUser: User | null;
  settings: UserSettings;
  aiMode: AIMode;
  selectedModel: string;
  fridayMode: boolean;
  useSearch: boolean;
  voiceMode: VoiceMode;
  attachedImages: string[];
  attachedFiles: AttachedFileItem[];
  onClearAttachments: () => void;
  onEnqueueSentence?: (sentence: string) => void;
  onStopAudio?: () => void;
}

export function useChatSession(options: UseChatSessionOptions) {
  const {
    currentUser,
    settings,
    aiMode,
    selectedModel,
    fridayMode,
    useSearch,
    voiceMode,
    attachedImages,
    attachedFiles,
    onClearAttachments,
    onEnqueueSentence,
    onStopAudio,
  } = options;

  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  // Active Tool Traces & Code Runner Snippet
  const [activeToolActivities, setActiveToolActivities] = useState<ToolActivity[]>([]);
  const [activeSources, setActiveSources] = useState<SourceItem[]>([]);
  const [initialCodeSnippet, setInitialCodeSnippet] = useState<{ code: string; language: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingAudioBufferRef = useRef<string>("");

  // Create new conversation
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

  // Load initial chats from localStorage or server
  useEffect(() => {
    if (currentUser) {
      fetchServerConversations().then(serverChats => {
        if (serverChats && serverChats.length > 0) {
          setChats(serverChats);
          setCurrentChatId(serverChats[0].id);
        }
      });
    } else {
      const savedChats = localStorage.getItem("flaw_ai_chats");
      if (savedChats) {
        try {
          const parsed = JSON.parse(savedChats);
          setChats(parsed);
          if (parsed.length > 0) setCurrentChatId(parsed[0].id);
          else createNewChat();
        } catch {
          createNewChat();
        }
      } else {
        createNewChat();
      }
    }
  }, [currentUser]);

  // Persist chats to localStorage
  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem("flaw_ai_chats", JSON.stringify(chats));
    }
  }, [chats]);

  // Scroll to bottom on updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, currentChatId, isLoading, toolStatus]);

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

  // Chat Actions
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
    const filename = `${target.title.replace(/[^a-z0-9]/gi, "_")}.${format === "json" ? "json" : "md"}`;

    if (format === "json") {
      content = JSON.stringify(target, null, 2);
      mime = "application/json";
    } else {
      content =
        `# ${target.title}\n\n` +
        target.messages
          .map(m => `### ${m.role === "user" ? "User" : "Flaw AI"}:\n${m.content}\n`)
          .join("\n---\n\n");
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
  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setToolStatus(null);
    if (onStopAudio) onStopAudio();
  };

  // Send Message Handler
  const sendMessage = async (customPrompt?: string, currentInputText: string = "") => {
    const messageText = customPrompt !== undefined ? customPrompt : currentInputText;
    if (!messageText.trim() && attachedImages.length === 0 && attachedFiles.length === 0) return;
    if (!currentChatId) return;

    if (onStopAudio) onStopAudio();
    streamingAudioBufferRef.current = "";

    // Upload attached files to server to extract document text
    const uploadedAttachments: AttachmentItem[] = [];
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
      newTitle =
        messageText.length > 30
          ? `${messageText.substring(0, 30)}...`
          : messageText ||
            (uploadedAttachments[0]?.filename
              ? `Document: ${uploadedAttachments[0].filename}`
              : "Multimodal Consultation");
    }

    setChats(prev =>
      prev.map(c =>
        c.id === currentChatId
          ? { ...c, messages: updatedMessages, title: newTitle, updatedAt: Date.now() }
          : c
      )
    );

    syncServerMessage(currentChatId, userMessage);
    onClearAttachments();

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
            imagery: m.imagery,
          })),
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || "Rate limit reached. Please wait a moment before sending another message.");
        }
        throw new Error("Failed to communicate with AI Server");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let offerWorldMonitor = false;
      let returnedSources: SourceItem[] = [];

      const assistantMessageId = crypto.randomUUID();

      setChats(prev =>
        prev.map(c =>
          c.id === currentChatId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    id: assistantMessageId,
                    role: "model",
                    content: "",
                    timestamp: Date.now(),
                  },
                ],
              }
            : c
        )
      );

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
                setChats(prev =>
                  prev.map(c =>
                    c.id === currentChatId
                      ? {
                          ...c,
                          messages: c.messages.map(m =>
                            m.id === assistantMessageId ? { ...m, content: assistantContent } : m
                          ),
                        }
                      : c
                  )
                );

                // Streaming voice sentence queueing
                if ((settings.autoRead || voiceMode !== "chat") && onEnqueueSentence) {
                  streamSentenceBuffer += parsed.text;
                  const match = streamSentenceBuffer.match(/(.*?[.!?\n]+)\s+/);
                  if (match) {
                    const completedSentence = match[1].trim();
                    streamSentenceBuffer = streamSentenceBuffer.slice(match[0].length);
                    if (completedSentence && completedSentence.length > 3) {
                      onEnqueueSentence(completedSentence);
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

      // Flush remaining voice buffer
      if ((settings.autoRead || voiceMode !== "chat") && onEnqueueSentence && streamSentenceBuffer.trim()) {
        onEnqueueSentence(streamSentenceBuffer.trim());
      }

      // Attach final metadata
      setChats(prev =>
        prev.map(c =>
          c.id === currentChatId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantMessageId
                    ? { ...m, sources: returnedSources.length > 0 ? returnedSources : undefined, offerWorldMonitor }
                    : m
                ),
              }
            : c
        )
      );

      syncServerMessage(currentChatId, {
        id: assistantMessageId,
        role: "model",
        content: assistantContent,
        model: selectedModel,
        metadata: { sources: returnedSources.length > 0 ? returnedSources : undefined, offerWorldMonitor },
      });

      // Confetti celebration if detected
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

  const handleRunCodeSnippet = (codeStr: string, langStr: string) => {
    setInitialCodeSnippet({ code: codeStr, language: langStr });
  };

  const currentChat = chats.find(c => c.id === currentChatId);

  return {
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
    setInitialCodeSnippet,
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
  };
}
