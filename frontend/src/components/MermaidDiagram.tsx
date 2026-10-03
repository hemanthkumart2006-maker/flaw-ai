import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Copy, Check, ZoomIn, ZoomOut, RotateCcw, Code } from "lucide-react";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  themeVariables: {
    darkMode: true,
    background: "#161618",
    primaryColor: "#6366f1",
    primaryTextColor: "#ffffff",
    primaryBorderColor: "#4f46e5",
    lineColor: "#818cf8",
    secondaryColor: "#a855f7",
    tertiaryColor: "#1e1e24",
  },
});

interface MermaidDiagramProps {
  code: string;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(1);

  const diagramId = useRef(`mermaid-${Math.random().toString(36).substring(2, 9)}`);

  useEffect(() => {
    let isMounted = true;
    const renderDiagram = async () => {
      try {
        setRenderError(null);
        const { svg } = await mermaid.render(diagramId.current, code);
        if (isMounted) {
          setSvgContent(svg);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn("Mermaid Render Warning:", err);
          setRenderError(err.message || "Failed to render visual flowchart.");
        }
      }
    };

    renderDiagram();
    return () => {
      isMounted = false;
    };
  }, [code]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-2xl border border-white/10 bg-[#141418] overflow-hidden shadow-xl">
      {/* Header Bar */}
      <div className="px-4 py-2 bg-[#1c1c22] border-b border-white/10 flex items-center justify-between text-xs text-slate-300">
        <span className="font-bold flex items-center gap-2 text-indigo-400">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          Flowchart / Diagram
        </span>

        <div className="flex items-center gap-1.5">
          {!showRaw && !renderError && (
            <>
              <button
                onClick={() => setScale(s => Math.min(s + 0.15, 2.0))}
                className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setScale(s => Math.max(s - 0.15, 0.6))}
                className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setScale(1)}
                className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded text-[11px] transition-colors"
          >
            <Code className="w-3 h-3" />
            <span>{showRaw ? "View Diagram" : "View Code"}</span>
          </button>

          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded text-[11px] transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 overflow-x-auto flex justify-center bg-[#0d0d10] min-h-[140px]">
        {showRaw || renderError ? (
          <div className="w-full">
            {renderError && (
              <p className="text-amber-400 text-xs mb-2">Diagram rendering fallback (displaying source):</p>
            )}
            <pre className="text-xs text-indigo-300 font-mono whitespace-pre-wrap p-2 bg-black/40 rounded-xl">
              {code}
            </pre>
          </div>
        ) : (
          <div
            ref={containerRef}
            style={{ transform: `scale(${scale})`, transformOrigin: "top center", transition: "transform 0.15s ease" }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
            className="w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto"
          />
        )}
      </div>
    </div>
  );
};
