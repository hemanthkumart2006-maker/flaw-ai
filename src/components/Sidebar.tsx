import React, { useState } from "react";
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Pin, 
  Edit3, 
  Download, 
  Search, 
  Bot, 
  Zap,
  Check,
  X,
  Share2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Chat } from "../types";

interface SidebarProps {
  isOpen: boolean;
  chats: Chat[];
  currentChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string, e: React.MouseEvent) => void;
  onTogglePinChat: (id: string, e: React.MouseEvent) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onExportChat: (id: string, format: "markdown" | "json") => void;
  fridayMode: boolean;
  setFridayMode: (val: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onTogglePinChat,
  onRenameChat,
  onExportChat,
  fridayMode,
  setFridayMode,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filteredChats = chats.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinnedChats = filteredChats.filter(c => c.isPinned);
  const unpinnedChats = filteredChats.filter(c => !c.isPinned);

  const handleStartRename = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
  };

  const handleSaveRename = (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (editTitle.trim()) {
      onRenameChat(id, editTitle.trim());
    }
    setEditingChatId(null);
  };

  return (
    <motion.aside
      animate={{ width: isOpen ? 280 : 0 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="bg-[#111113] border-r border-white/10 flex flex-col overflow-hidden shrink-0 relative z-20 h-full select-none"
    >
      <div className="p-4 flex flex-col h-full w-[280px]">
        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          className="flex items-center justify-center gap-2.5 w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98]"
        >
          <Plus className="w-5 h-5" />
          <span>New Chat</span>
        </button>

        {/* FRIDAY Mode Toggle Card */}
        <div className="mt-4 p-3 bg-[#18181c] border border-white/10 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              fridayMode ? "bg-amber-500 text-black" : "bg-white/10 text-slate-400"
            }`}>
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">FRIDAY Mode</p>
              <p className="text-[10px] text-slate-400">Calm & confident AI</p>
            </div>
          </div>
          <button
            onClick={() => setFridayMode(!fridayMode)}
            className={`w-11 h-6 rounded-full transition-colors relative p-1 ${
              fridayMode ? "bg-amber-500" : "bg-slate-700"
            }`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
              fridayMode ? "translate-x-5" : "translate-x-0"
            }`} />
          </button>
        </div>

        {/* Search Input */}
        <div className="mt-4 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-[#18181c] border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Conversations List */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-4 no-scrollbar pr-1">
          {/* Pinned Chats Section */}
          {pinnedChats.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <Pin className="w-3 h-3" /> Pinned
              </div>
              <div className="space-y-1 mt-1">
                {pinnedChats.map((chat) => renderChatItem(chat))}
              </div>
            </div>
          )}

          {/* Recent Chats Section */}
          <div>
            <div className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Recent Sessions
            </div>
            <div className="space-y-1 mt-1">
              {unpinnedChats.map((chat) => renderChatItem(chat))}
            </div>
          </div>
        </div>

        {/* Footer Profile */}
        <div className="mt-auto pt-3 border-t border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow">
            U
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-bold text-white truncate">Pro Assistant User</p>
            <p className="text-[10px] text-slate-400 truncate">Flaw AI Ultra Multimodal</p>
          </div>
        </div>
      </div>
    </motion.aside>
  );

  function renderChatItem(chat: Chat) {
    const isSelected = currentChatId === chat.id;

    if (editingChatId === chat.id) {
      return (
        <form key={chat.id} onSubmit={(e) => handleSaveRename(chat.id, e)} className="px-2 py-1.5 flex items-center gap-1.5 bg-[#222226] rounded-lg">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="flex-1 bg-transparent text-xs text-white outline-none"
            autoFocus
          />
          <button type="submit" className="p-1 hover:text-green-400 text-slate-400"><Check className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => setEditingChatId(null)} className="p-1 hover:text-red-400 text-slate-400"><X className="w-3.5 h-3.5" /></button>
        </form>
      );
    }

    return (
      <div
        key={chat.id}
        onClick={() => onSelectChat(chat.id)}
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer group transition-all ${
          isSelected 
            ? "bg-indigo-600/15 border-l-2 border-indigo-500 text-white" 
            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
        }`}
      >
        <MessageSquare className={`w-4 h-4 shrink-0 ${isSelected ? "text-indigo-400" : "text-slate-500"}`} />
        <span className="truncate flex-1">{chat.title}</span>

        {/* Action icons */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
          <button onClick={(e) => onTogglePinChat(chat.id, e)} className="p-1 hover:text-indigo-400 text-slate-500" title={chat.isPinned ? "Unpin" : "Pin"}>
            <Pin className={`w-3.5 h-3.5 ${chat.isPinned ? "fill-indigo-400 text-indigo-400" : ""}`} />
          </button>
          <button onClick={(e) => handleStartRename(chat, e)} className="p-1 hover:text-indigo-400 text-slate-500" title="Rename">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onExportChat(chat.id, "markdown"); }} className="p-1 hover:text-indigo-400 text-slate-500" title="Export Markdown">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onExportChat(chat.id, "json"); }} className="px-1 py-0.5 hover:text-indigo-400 text-slate-500 text-[10px] font-mono leading-none" title="Export JSON">
            {"{}"}
          </button>
          <button onClick={(e) => onDeleteChat(chat.id, e)} className="p-1 hover:text-red-400 text-slate-500" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }
};
