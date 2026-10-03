import React, { useState, useEffect } from "react";
import { X, Globe, MapPin, Clock, Search, ExternalLink, Newspaper, Radio } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { WorldNewsItem } from "../types";
import { fetchWorldNews } from "../services/api";

interface WorldMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WorldMonitorModal: React.FC<WorldMonitorModalProps> = ({ isOpen, onClose }) => {
  const [news, setNews] = useState<WorldNewsItem[]>([]);
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadNews(category);
    }
  }, [isOpen, category]);

  const loadNews = async (cat: string) => {
    setIsLoading(true);
    const data = await fetchWorldNews(cat === "All" ? undefined : cat);
    setNews(data);
    setIsLoading(false);
  };

  const filteredNews = news.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.summary.toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-[#121216] border border-white/10 w-full max-w-5xl h-[85vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl"
        >
          {/* Header Bar */}
          <div className="px-6 py-4 border-b border-white/10 bg-[#18181f] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Globe className="w-5 h-5 animate-spin-slow" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                  F.R.I.D.A.Y. World Monitor
                  <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full uppercase font-black tracking-widest flex items-center gap-1">
                    <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Global breaking news briefing & geo-intelligence dashboard</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Subheader: Category filters & Search input */}
          <div className="px-6 py-3 border-b border-white/5 bg-[#14141a] flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto">
              {["All", "World", "Technology", "AI", "Science", "Business"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    category === cat
                      ? "bg-indigo-600 text-white shadow-lg"
                      : "bg-[#1f1f28] text-slate-400 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search world headlines..."
                className="w-full bg-[#1f1f28] border border-white/10 rounded-xl py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Tactical Global Time & Telemetry Hub Bar */}
          <div className="px-6 py-2 bg-[#0d0d10] border-b border-white/5 flex items-center justify-between overflow-x-auto no-scrollbar text-[11px] font-mono text-slate-400">
            <div className="flex items-center gap-4 shrink-0">
              <span className="flex items-center gap-1.5 text-indigo-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" /> GLOBAL HUBS:
              </span>
              <span>SF: {new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit' })}</span>
              <span>NYC: {new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}</span>
              <span>LON: {new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}</span>
              <span>DEL: {new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</span>
              <span>TYO: {new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <span className="text-[10px] text-slate-500 hidden lg:inline">LIVE FEED ACTIVE • 24/7 MONITORING</span>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4 no-scrollbar">
            {isLoading ? (
              <div className="col-span-full py-16 text-center text-sm text-slate-400 font-medium">
                Syncing global news data feeds...
              </div>
            ) : filteredNews.length === 0 ? (
              <div className="col-span-full py-16 text-center text-sm text-slate-500">
                No headlines matching query.
              </div>
            ) : (
              filteredNews.map((item) => (
                <div
                  key={item.id}
                  className="p-5 bg-[#181820] hover:bg-[#1e1e28] border border-white/10 rounded-2xl flex flex-col justify-between space-y-3 transition-colors shadow-lg group"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-indigo-400">
                      <span className="bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
                        {item.category}
                      </span>
                      <span className="text-slate-500 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {item.publishedAt}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors leading-snug">
                      {item.title}
                    </h3>

                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                      {item.summary}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-semibold flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-indigo-400" /> {item.location || item.source}
                    </span>

                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1"
                    >
                      Read Full <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
