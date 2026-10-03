import React, { useState, useEffect } from "react";
import { 
  X, 
  Terminal, 
  Globe, 
  Activity, 
  Newspaper, 
  Play, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  ExternalLink,
  Cpu,
  Clock
} from "lucide-react";
import { motion } from "motion/react";
import { SystemCapabilityStatus, WorldNewsItem, CodeExecutionResult, ToolActivity, SourceItem } from "../types";
import { fetchWorldNews, runCode } from "../services/api";

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  systemStatus: SystemCapabilityStatus | null;
  toolActivities: ToolActivity[];
  sources: SourceItem[];
  activeTab?: "tools" | "code" | "world" | "status";
  initialCodeSnippet?: { code: string; language: string } | null;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  isOpen,
  onClose,
  systemStatus,
  toolActivities,
  sources,
  activeTab: defaultTab = "tools",
  initialCodeSnippet,
}) => {
  const [tab, setTab] = useState<"tools" | "code" | "world" | "status">(defaultTab);
  
  // Code execution state
  const [code, setCode] = useState(initialCodeSnippet?.code || `// JavaScript Sandboxed Runner\nconsole.log("Hello from Flaw AI Ultra Sandboxed Code Execution!");\nconst sum = [1, 2, 3, 4, 5].reduce((a, b) => a + b, 0);\nconsole.log("Sum:", sum);`);
  const [language, setLanguage] = useState(initialCodeSnippet?.language || "javascript");
  const [isExecutingCode, setIsExecutingCode] = useState(false);
  const [codeResult, setCodeResult] = useState<CodeExecutionResult | null>(null);

  // World Monitor state
  const [news, setNews] = useState<WorldNewsItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [isLoadingNews, setIsLoadingNews] = useState(false);

  useEffect(() => {
    if (initialCodeSnippet) {
      setCode(initialCodeSnippet.code);
      setLanguage(initialCodeSnippet.language);
      setTab("code");
    }
  }, [initialCodeSnippet]);

  useEffect(() => {
    if (tab === "world" && news.length === 0) {
      loadNews();
    }
  }, [tab]);

  const loadNews = async (category?: string) => {
    setIsLoadingNews(true);
    const items = await fetchWorldNews(category === "All" ? undefined : category);
    setNews(items);
    setIsLoadingNews(false);
  };

  const handleRunCode = async () => {
    setIsExecutingCode(true);
    try {
      const res = await runCode(code, language);
      setCodeResult(res);
    } catch (err: any) {
      setCodeResult({ stdout: "", stderr: err.message || "Execution error" });
    } finally {
      setIsExecutingCode(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 380, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      className="bg-[#121215] border-l border-white/10 flex flex-col h-full shrink-0 z-30 select-none shadow-2xl"
    >
      {/* Header Tabs */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between bg-[#17171b]">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: "tools", label: "Activity", icon: Activity },
            { id: "code", label: "Code Run", icon: Terminal },
            { id: "world", label: "World", icon: Newspaper },
            { id: "status", label: "Status", icon: Cpu },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  tab === t.id
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors ml-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab Content Panels */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {/* Tab 1: Tool Activity & Sources */}
        {tab === "tools" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                Live Tool Execution Trace
              </h3>
              {toolActivities.length === 0 ? (
                <div className="p-4 bg-[#18181c] rounded-xl border border-white/5 text-center text-xs text-slate-500">
                  No active tool calls in current session.
                </div>
              ) : (
                <div className="space-y-2">
                  {toolActivities.map((act) => (
                    <div key={act.id} className="p-3 bg-[#18181c] border border-white/10 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
                        <span>{act.userFacingStatus}</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{act.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                Web Sources & Citations
              </h3>
              {sources.length === 0 ? (
                <div className="p-4 bg-[#18181c] rounded-xl border border-white/5 text-center text-xs text-slate-500">
                  No web sources cited yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {sources.map((src, i) => (
                    <a
                      key={i}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-[#18181c] hover:bg-[#202026] border border-white/10 rounded-xl block space-y-1 group transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200 group-hover:text-indigo-400 truncate pr-2">
                          {src.title}
                        </span>
                        <ExternalLink className="w-3 h-3 text-slate-500 shrink-0" />
                      </div>
                      <span className="text-[10px] text-indigo-400 font-mono block">{src.domain}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Code Execution Environment */}
        {tab === "code" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-[#18181c] border border-white/10 text-xs font-mono text-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-indigo-500"
              >
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="html">HTML / Preview</option>
                <option value="python">Python (Mock)</option>
              </select>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCodeResult(null)}
                  className="p-1 text-slate-400 hover:text-white"
                  title="Clear Console"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={isExecutingCode}
                  onClick={handleRunCode}
                  className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  {isExecutingCode ? "Running..." : "Run"}
                </button>
              </div>
            </div>

            {/* Code Textarea Editor */}
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-48 bg-[#0a0a0c] border border-white/10 rounded-xl p-3 font-mono text-xs text-indigo-200 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
            />

            {/* Output Panel */}
            <div className="space-y-1">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Output Console</h4>
              <div className="min-h-28 bg-[#0a0a0c] border border-white/10 rounded-xl p-3 font-mono text-xs overflow-x-auto">
                {codeResult ? (
                  <div className="space-y-2">
                    {codeResult.stdout && (
                      <pre className="text-emerald-400 whitespace-pre-wrap">{codeResult.stdout}</pre>
                    )}
                    {codeResult.stderr && (
                      <pre className="text-rose-400 whitespace-pre-wrap">{codeResult.stderr}</pre>
                    )}
                    {codeResult.executionTimeMs !== undefined && (
                      <span className="text-[9px] text-slate-500 block pt-1 border-t border-white/5">
                        Execution time: {codeResult.executionTimeMs}ms
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-600 italic">Click Run to execute code in sandbox.</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: World Monitor */}
        {tab === "world" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                World News Monitor
              </h3>
              <button
                onClick={() => loadNews(selectedCategory)}
                className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300"
              >
                Refresh Feed
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
              {["All", "World", "Technology", "AI", "Science", "Business"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    loadNews(cat);
                  }}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 transition-all ${
                    selectedCategory === cat
                      ? "bg-indigo-600 text-white"
                      : "bg-[#18181c] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* News Items List */}
            {isLoadingNews ? (
              <div className="p-6 text-center text-xs text-slate-500">Loading global news feed...</div>
            ) : (
              <div className="space-y-2.5">
                {news.map((item) => (
                  <div key={item.id} className="p-3 bg-[#18181c] border border-white/10 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold text-indigo-400">
                      <span>{item.category} • {item.source}</span>
                      <span className="text-slate-500 font-normal flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> {item.publishedAt}
                      </span>
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-slate-100 hover:text-indigo-300 line-clamp-2 block leading-snug"
                    >
                      {item.title}
                    </a>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{item.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: System Capability Status */}
        {tab === "status" && (
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2">
              System Capability Matrix
            </h3>
            {systemStatus ? (
              <div className="space-y-2">
                {[
                  { key: "gemini", label: "Gemini AI Engine", status: systemStatus.gemini },
                  { key: "voiceInput", label: "Sarvam Saaras STT", status: systemStatus.voiceInput },
                  { key: "voiceOutput", label: "OpenAI TTS", status: systemStatus.voiceOutput },
                  { key: "webSearch", label: "Web Search Grounding", status: systemStatus.webSearch },
                  { key: "mcp", label: "MCP Tool Architecture", status: systemStatus.mcp },
                  { key: "livekit", label: "LiveKit Real-time Voice", status: systemStatus.livekit },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="p-3 bg-[#18181c] border border-white/10 rounded-xl flex items-center justify-between"
                  >
                    <span className="text-xs font-semibold text-slate-200">{item.label}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize flex items-center gap-1 ${
                      item.status === "ready"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : item.status === "unavailable"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-slate-800 text-slate-400"
                    }`}>
                      {item.status === "ready" ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {item.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Checking system capabilities...</p>
            )}
          </div>
        )}
      </div>
    </motion.aside>
  );
};
