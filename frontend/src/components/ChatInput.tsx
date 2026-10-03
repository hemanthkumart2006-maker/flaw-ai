import React, { useState, useRef, useEffect } from "react";
import { 
  Send, 
  Paperclip, 
  Camera, 
  Mic, 
  MicOff, 
  X, 
  Sparkles, 
  Loader2, 
  Image as ImageIcon,
  Volume2,
  Square,
  Monitor,
  FileText,
  FileCode
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { VoiceMode } from "../types";

export interface AttachedFileItem {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  base64Content: string;
  extractedText?: string;
}

interface ChatInputProps {
  input: string;
  setInput: (val: string) => void;
  attachedImages: string[];
  setAttachedImages: React.Dispatch<React.SetStateAction<string[]>>;
  attachedFiles?: AttachedFileItem[];
  setAttachedFiles?: React.Dispatch<React.SetStateAction<AttachedFileItem[]>>;
  onSendMessage: () => void;
  onStopGeneration?: () => void;
  isLoading: boolean;
  isListening: boolean;
  isProcessingVoice: boolean;
  audioLevel: number;
  onToggleListening: () => void;
  voiceMode: VoiceMode;
  toolStatus?: string | null;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  attachedImages,
  setAttachedImages,
  attachedFiles = [],
  setAttachedFiles,
  onSendMessage,
  onStopGeneration,
  isLoading,
  isListening,
  isProcessingVoice,
  audioLevel,
  onToggleListening,
  voiceMode,
  toolStatus,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  // Handle Paste Image from Clipboard
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result) {
              setAttachedImages(prev => [...prev, reader.result as string]);
            }
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  // Handle Multi-format File Selection (PDF, DOCX, TXT, CSV, Code, Images)
  const processSelectedFiles = (files: File[]) => {
    files.forEach(file => {
      const isImg = file.type.startsWith("image/");
      const reader = new FileReader();

      reader.onloadend = () => {
        if (!reader.result) return;
        const resultStr = reader.result as string;

        if (isImg) {
          setAttachedImages(prev => [...prev, resultStr]);
        } else if (setAttachedFiles) {
          setAttachedFiles(prev => [
            ...prev,
            {
              id: crypto.randomUUID(),
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
              size: file.size,
              base64Content: resultStr,
            },
          ]);
        }
      };

      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processSelectedFiles(files);
    e.target.value = "";
  };

  // Screenshot Feature (Captures screen frame into image attachment)
  const handleCaptureScreenshot = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert("Screen capture is not supported in this browser. Please use standard image upload.");
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" } as any,
      });

      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Cleanly stop tracks after grabbing frame
      stream.getTracks().forEach(track => track.stop());

      const dataUrl = canvas.toDataURL("image/png");
      setAttachedImages(prev => [...prev, dataUrl]);
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        console.warn("Screenshot capture error:", err);
      }
    }
  };

  const removeImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeFile = (id: string) => {
    if (setAttachedFiles) {
      setAttachedFiles(prev => prev.filter(f => f.id !== id));
    }
  };

  const totalAttachments = attachedImages.length + attachedFiles.length;

  return (
    <div className="p-4 md:p-6 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d]/90 to-transparent relative z-20">
      <div className="max-w-3xl mx-auto relative">
        {/* Subtle Tool Status Indicator */}
        <AnimatePresence>
          {(isLoading || toolStatus) && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="absolute -top-7 left-4 flex items-center gap-2 text-xs font-semibold text-indigo-400 bg-[#161619] px-3 py-1 rounded-t-xl border-t border-x border-white/10 shadow"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{toolStatus || "Generating..."}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attachment Previews Grid (Images + Documents) */}
        <AnimatePresence>
          {totalAttachments > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mb-3 flex flex-wrap gap-2.5 p-3 bg-[#18181c] border border-white/10 rounded-2xl shadow-xl"
            >
              {/* Image Previews */}
              {attachedImages.map((img, i) => (
                <div key={`img-${i}`} className="relative group w-16 h-16 rounded-xl overflow-hidden border border-white/10 shadow-md">
                  <img src={img} alt={`Upload ${i}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 p-0.5 bg-black/70 hover:bg-red-500 rounded-full text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {/* Document / File Previews */}
              {attachedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 px-3 py-2 bg-[#202028] border border-indigo-500/30 rounded-xl text-xs text-indigo-200 relative group shadow-md"
                >
                  <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="overflow-hidden">
                    <p className="font-semibold text-white truncate max-w-[140px]">{file.filename}</p>
                    <p className="text-[10px] text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-1 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <div className="flex flex-col justify-center px-2">
                <span className="text-[11px] font-bold text-indigo-400">Multimodal Input Ready</span>
                <span className="text-[10px] text-slate-400">File + prompt processed together</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Bar Container */}
        <div 
          onPaste={handlePaste}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const files = Array.from(e.dataTransfer.files || []);
            processSelectedFiles(files);
          }}
          className={`bg-[#18181c] border rounded-2xl p-2.5 shadow-2xl relative transition-all ${
            isDragging 
              ? "border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30" 
              : "border-white/10 focus-within:border-indigo-500/60 focus-within:ring-1 focus-within:ring-indigo-500/20"
          }`}
        >
          {isDragging && (
            <div className="absolute inset-0 z-30 bg-indigo-950/80 backdrop-blur-sm rounded-2xl flex items-center justify-center border-2 border-dashed border-indigo-400">
              <span className="text-xs font-bold text-indigo-300">Drop files or images to attach</span>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isLoading) onSendMessage();
              }
            }}
            placeholder={
              isListening 
                ? "Listening to your voice..." 
                : totalAttachments > 0 
                ? "Type instructions for attached file(s) (e.g. 'Summarize this', 'Find errors')..." 
                : "Ask Flaw AI Ultra..."
            }
            rows={1}
            className="w-full bg-transparent border-none text-white text-sm placeholder-slate-500 py-2.5 px-3 resize-none focus:ring-0 focus:outline-none max-h-48 overflow-y-auto no-scrollbar font-medium"
          />

          {/* Controls Footer */}
          <div className="flex items-center justify-between pt-1 border-t border-white/5">
            <div className="flex items-center gap-1">
              {/* Document / File Upload Button */}
              <button
                onClick={() => docInputRef.current?.click()}
                className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-indigo-300 transition-colors"
                title="Attach Document (PDF, DOCX, TXT, CSV, Code, JSON)"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                type="file"
                ref={docInputRef}
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.txt,.csv,.json,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.html,.css,.md,image/*"
                multiple
                className="hidden"
              />

              {/* Screenshot Capture Button */}
              <button
                onClick={handleCaptureScreenshot}
                className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-indigo-300 transition-colors"
                title="Capture Screenshot (Window, Tab, or Full Screen)"
              >
                <Monitor className="w-4 h-4" />
              </button>

              {/* Camera Input Button */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-indigo-300 transition-colors"
                title="Take Photo with Camera"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                type="file"
                ref={cameraInputRef}
                onChange={handleFileChange}
                accept="image/*"
                capture="environment"
                className="hidden"
              />

              {/* Voice Input (Sarvam Saaras STT with audio visualizer) */}
              <button
                onClick={onToggleListening}
                className={`p-2.5 rounded-xl transition-all flex items-center gap-2 ${
                  isListening
                    ? "bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse"
                    : isProcessingVoice
                    ? "bg-amber-500 text-black shadow-lg"
                    : "hover:bg-white/10 text-slate-400 hover:text-white"
                }`}
                title="Voice Input (Sarvam Saaras v3 STT)"
              >
                {isProcessingVoice ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isListening ? (
                  <div className="flex items-center gap-1">
                    <MicOff className="w-4 h-4" />
                    <div className="flex items-end gap-0.5 h-3">
                      <div className="w-1 bg-white rounded-full transition-all" style={{ height: `${Math.max(20, audioLevel)}%` }} />
                      <div className="w-1 bg-white rounded-full transition-all" style={{ height: `${Math.max(40, audioLevel * 1.2)}%` }} />
                      <div className="w-1 bg-white rounded-full transition-all" style={{ height: `${Math.max(10, audioLevel * 0.8)}%` }} />
                    </div>
                  </div>
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden md:inline text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                Shift + Enter for new line
              </span>

              {/* Stop Generation or Send Button */}
              {isLoading ? (
                <button
                  onClick={onStopGeneration}
                  className="p-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-all shadow-lg flex items-center gap-1.5 hover:scale-105 active:scale-95 text-xs font-bold"
                  title="Stop Generating"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  <span className="text-[11px] hidden sm:inline">Stop</span>
                </button>
              ) : (
                <button
                  disabled={!input.trim() && totalAttachments === 0}
                  onClick={onSendMessage}
                  className={`p-2.5 rounded-xl text-black transition-all shadow-lg flex items-center justify-center ${
                    !input.trim() && totalAttachments === 0
                      ? "bg-slate-700 text-slate-500 opacity-40 cursor-not-allowed"
                      : "bg-white hover:bg-indigo-100 hover:scale-105 active:scale-95"
                  }`}
                  title="Send Message"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
