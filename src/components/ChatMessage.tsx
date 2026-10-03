import React, { useState } from "react";
import { 
  Copy, 
  Check, 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  ExternalLink, 
  Globe, 
  Sparkles, 
  Terminal, 
  Edit2, 
  RefreshCw, 
  Bot, 
  User,
  ChevronDown,
  ChevronUp,
  Newspaper,
  FileText
} from "lucide-react";
import { MermaidDiagram } from "./MermaidDiagram";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Message, SourceItem } from "../types";

interface ChatMessageProps {
  message: Message;
  isPlayingAudio: boolean;
  isPausedAudio: boolean;
  onPlayAudio: (text: string, id: string) => void;
  onPauseAudio: () => void;
  onResumeAudio: () => void;
  onStopAudio: () => void;
  onReplayAudio: () => void;
  onRegenerate?: () => void;
  onOpenWorldMonitor?: () => void;
  onRunCodeSnippet?: (code: string, language: string) => void;
  onEditUserMessage?: (text: string) => void;
  onContinueResponse?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isPlayingAudio,
  isPausedAudio,
  onPlayAudio,
  onPauseAudio,
  onResumeAudio,
  onStopAudio,
  onReplayAudio,
  onRegenerate,
  onOpenWorldMonitor,
  onRunCodeSnippet,
  onEditUserMessage,
  onContinueResponse,
}) => {
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [copyCodeKey, setCopyCodeKey] = useState<string | null>(null);

  const isUser = message.role === "user";

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = (code: string, key: string) => {
    navigator.clipboard.writeText(code);
    setCopyCodeKey(key);
    setTimeout(() => setCopyCodeKey(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-4 md:gap-6 max-w-4xl mx-auto py-4 px-2 group ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {/* AI Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 shrink-0 flex items-center justify-center font-bold text-xs text-white shadow-lg border border-white/10 mt-1">
          <Bot className="w-4 h-4" />
        </div>
      )}

      {/* Message Body */}
      <div className={`flex-1 overflow-hidden space-y-3 ${isUser ? "max-w-2xl text-right" : ""}`}>
        {/* Imagery attachments */}
        {message.imagery && message.imagery.length > 0 && (
          <div className={`flex flex-wrap gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
            {message.imagery.map((img, idx) => (
              <div key={idx} className="rounded-2xl overflow-hidden border border-white/10 max-w-xs shadow-xl">
                <img src={img} alt={`Attached ${idx}`} className="w-full h-auto max-h-64 object-cover" />
              </div>
            ))}
          </div>
        )}

        {/* Document Attachments (PDF, DOCX, Code, CSV, etc.) */}
        {message.attachments && message.attachments.length > 0 && (
          <div className={`flex flex-wrap gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
            {message.attachments.map((att, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2.5 bg-[#18181f] border border-indigo-500/30 rounded-xl text-xs text-indigo-300 shadow-md"
              >
                <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                <div className="overflow-hidden">
                  <p className="font-semibold text-white truncate max-w-[180px]">{att.filename}</p>
                  <p className="text-[10px] text-slate-400">{(att.size / 1024).toFixed(1)} KB • {att.mimeType.split("/")[1] || "doc"}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Content Box */}
        <div className={`relative text-sm leading-relaxed ${
          isUser 
            ? "bg-indigo-600/20 text-slate-100 p-4 rounded-2xl border border-indigo-500/30 inline-block text-left shadow-sm group/user" 
            : "text-slate-200"
        }`}>
          {isUser ? (
            <div>
              <p className="whitespace-pre-wrap">{message.content}</p>
              {onEditUserMessage && (
                <div className="mt-2 flex justify-end gap-2 opacity-0 group-hover/user:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEditUserMessage(message.content)}
                    className="flex items-center gap-1 text-[11px] text-indigo-300 hover:text-white bg-indigo-500/20 hover:bg-indigo-500/40 px-2 py-0.5 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-3 h-3" /> Edit query
                  </button>
                  <button
                    onClick={handleCopyMessage}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded-lg transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeString = String(children).replace(/\n$/, "");
                    const language = match ? match[1] : "javascript";

                    if (!inline && language === "mermaid") {
                      return <MermaidDiagram code={codeString} />;
                    }

                    if (!inline && match) {
                      return (
                        <div className="relative my-4 rounded-xl overflow-hidden border border-white/10 bg-[#161618] group/code">
                          {/* Code Header Bar */}
                          <div className="px-4 py-2 bg-[#1f1f23] border-b border-white/10 flex items-center justify-between text-xs text-slate-400 font-mono">
                            <span>{language.toUpperCase()}</span>
                            <div className="flex items-center gap-2">
                              {onRunCodeSnippet && (
                                <button
                                  onClick={() => onRunCodeSnippet(codeString, language)}
                                  className="flex items-center gap-1 px-2 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded transition-colors text-[11px]"
                                  title="Run Code in Sandbox"
                                >
                                  <Terminal className="w-3 h-3" /> Run
                                </button>
                              )}
                              <button
                                onClick={() => handleCopyCode(codeString, codeString)}
                                className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded transition-colors text-[11px]"
                              >
                                {copyCodeKey === codeString ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                {copyCodeKey === codeString ? "Copied" : "Copy"}
                              </button>
                            </div>
                          </div>
                          {/* Syntax Highlighter */}
                          <SyntaxHighlighter
                            style={atomDark}
                            language={language}
                            PreTag="div"
                            className="!p-4 !m-0 !bg-transparent text-xs"
                            {...props}
                          >
                            {codeString}
                          </SyntaxHighlighter>
                        </div>
                      );
                    }
                    return <code className="bg-white/10 px-1.5 py-0.5 rounded text-indigo-300 text-xs font-mono" {...props}>{children}</code>;
                  }
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Offer World Monitor Link */}
        {!isUser && message.offerWorldMonitor && onOpenWorldMonitor && (
          <div className="pt-2">
            <button
              onClick={onOpenWorldMonitor}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold rounded-xl transition-all shadow-sm"
            >
              <Newspaper className="w-3.5 h-3.5" />
              Open World Monitor
            </button>
          </div>
        )}

        {/* Sources Section */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{message.sources.length} Sources Cited</span>
              {showSources ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <AnimatePresence>
              {showSources && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-hidden"
                >
                  {message.sources.map((src, i) => (
                    <a
                      key={i}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 bg-[#18181c] hover:bg-[#222226] border border-white/10 rounded-xl flex items-center justify-between group/link transition-colors"
                    >
                      <div className="overflow-hidden pr-2">
                        <p className="text-xs font-semibold text-slate-200 truncate group-hover/link:text-indigo-400">
                          {src.title}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">{src.domain}</p>
                      </div>
                      <ExternalLink className="w-3 h-3 text-slate-500 group-hover/link:text-indigo-400 shrink-0" />
                    </a>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Audio Output Controls & Message Actions */}
        {!isUser && (
          <div className="flex items-center gap-2 pt-1 text-slate-400 text-xs">
            {/* Audio Play/Pause Button */}
            {isPlayingAudio ? (
              <button
                onClick={onPauseAudio}
                className="flex items-center gap-1 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-lg hover:bg-indigo-500/30 transition-colors"
              >
                <Pause className="w-3.5 h-3.5" /> Pause Voice
              </button>
            ) : isPausedAudio ? (
              <button
                onClick={onResumeAudio}
                className="flex items-center gap-1 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-lg hover:bg-indigo-500/30 transition-colors"
              >
                <Play className="w-3.5 h-3.5" /> Resume
              </button>
            ) : (
              <button
                onClick={() => onPlayAudio(message.content, message.id)}
                className="flex items-center gap-1 px-2.5 py-1 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                title="Play Voice Response"
              >
                <Play className="w-3.5 h-3.5" /> Read
              </button>
            )}

            {(isPlayingAudio || isPausedAudio) && (
              <button
                onClick={onStopAudio}
                className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                title="Stop Audio"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={handleCopyMessage}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
              title="Copy text"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                title="Regenerate response"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}

            {onContinueResponse && message.content && (
              <button
                onClick={onContinueResponse}
                className="flex items-center gap-1 px-2 py-1 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-indigo-300"
                title="Continue response"
              >
                Continue
              </button>
            )}
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-slate-700 shrink-0 flex items-center justify-center font-bold text-xs text-white shadow border border-white/10 mt-1">
          <User className="w-4 h-4" />
        </div>
      )}
    </motion.div>
  );
};
