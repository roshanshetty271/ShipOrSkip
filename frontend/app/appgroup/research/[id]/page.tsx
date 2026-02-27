"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  MessageSquare,
  StickyNote,
  BarChart3,
  Send,
  Zap,
  Search,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { getAccessToken } from "@/lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface CompetitorItem {
  name: string;
  description: string;
  differentiator?: string;
  url?: string;
  threat_level?: string;
}

interface ChatMsg {
  role: string;
  content: string;
  created_at?: string;
}

export default function ResearchDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [research, setResearch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"results" | "chat" | "notes">("results");

  // Chat
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Notes
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  const [notesSaving, setNotesSaving] = useState(false);
  const notesTimeout = useRef<NodeJS.Timeout>();

  // PDF
  const [pdfLoading, setPdfLoading] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login?returnTo=/appgroup/research/" + id);
    }
  }, [user, authLoading, id, router]);

  useEffect(() => {
    if (!user || !id) return;
    Promise.all([loadResearch(), loadChat(), loadNotes()]);
  }, [user, id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadResearch = async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const resp = await fetch(`${API}/api/research/${id}`, { headers });
      if (!resp.ok) throw new Error("Failed to load research");
      const data = await resp.json();
      setResearch(data);
    } catch (e: any) {
      setError(e.message || "Failed to load research");
    } finally {
      setLoading(false);
    }
  };

  const loadChat = async () => {
    try {
      const headers = await authHeaders();
      const resp = await fetch(`${API}/api/research/${id}/chat/history`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        setMessages(data.messages || []);
      }
    } catch { }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setChatLoading(true);

    try {
      const headers = await authHeaders();
      const resp = await fetch(`${API}/api/research/${id}/chat`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Chat failed");
      }
      const data = await resp.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${e.message}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  const loadNotes = async () => {
    try {
      const headers = await authHeaders();
      const resp = await fetch(`${API}/api/research/${id}/notes`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        setNotes(data.notes || "");
        setNotesSaved(true);
      }
    } catch { }
  };

  const saveNotes = async (text: string) => {
    setNotesSaving(true);
    try {
      const headers = await authHeaders();
      await fetch(`${API}/api/research/${id}/notes`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: text }),
      });
      setNotesSaved(true);
    } catch { } finally {
      setNotesSaving(false);
    }
  };

  const handleNotesChange = (text: string) => {
    setNotes(text);
    setNotesSaved(false);
    if (notesTimeout.current) clearTimeout(notesTimeout.current);
    notesTimeout.current = setTimeout(() => saveNotes(text), 1000);
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const headers = await authHeaders();
      const resp = await fetch(`${API}/api/research/${id}/export/pdf`, { headers });
      if (!resp.ok) throw new Error("PDF export failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shiporskip-${(id as string).slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPdfLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-border-strong border-t-ink-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !research) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card-minimal text-center max-w-md">
          <p className="text-sm text-accent mb-4">{error}</p>
          <Link href="/appgroup/dashboard" className="btn-secondary text-xs">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!research) return null;

  const result = research.result || {};
  const competitors = (result.competitors || []) as CompetitorItem[];
  const gaps = (result.gaps || []) as string[];
  const pros = (result.pros || []) as string[];
  const cons = (result.cons || []) as string[];
  const buildPlan = (result.build_plan || []) as string[];
  const verdict = result.verdict || "";

  return (
    <div className="min-h-screen bg-background text-ink-900 font-sans">
      {/* Brutal Header */}
      <header className="brutal-border-b bg-background sticky top-0 z-40">
        <div className="w-full h-14 px-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/appgroup/dashboard")} className="text-ink-900 hover:bg-ink-900 hover:text-white transition-none p-1 border border-transparent hover:border-ink-900">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 border-l border-border-strong pl-4 ml-2">
              <p className="font-serif text-lg truncate max-w-md tracking-tight leading-none pt-1">{research.idea_text}</p>
              <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.2em] uppercase text-text-tertiary mt-1">
                {research.analysis_type === "deep" ? <Search className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                <span>{research.analysis_type}</span>
                <span>//</span>
                <span>{new Date(research.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          <button
            onClick={downloadPdf}
            disabled={pdfLoading}
            className="btn-secondary text-[10px] py-1.5 px-3"
          >
            {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2 inline" /> : <Download className="w-3.5 h-3.5 mr-2 inline" />}
            EXPORT
          </button>
        </div>
      </header>

      <div className="w-full mx-auto">
        {/* Brutal Tabs - Full width border grid */}
        <div className="grid grid-cols-3 brutal-border-b bg-background sticky top-14 z-30">
          {[
            { key: "results", label: "01 // Results", icon: BarChart3 },
            { key: "chat", label: "02 // Interrogate", icon: MessageSquare },
            { key: "notes", label: "03 // Notes", icon: StickyNote },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key as any)}
              className={`py-3 text-[11px] font-mono tracking-[0.2em] uppercase transition-none border-r border-border-strong last:border-r-0 ${tab === key
                ? "bg-ink-900 text-white"
                : "bg-transparent text-ink-900 hover:bg-background-raised"
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ═══ RESULTS TAB (BRUTAL) ═══ */}
        {tab === "results" && (
          <div className="w-full flex flex-col">

            {/* Verdict */}
            {verdict && (
              <div className="px-4 sm:px-8 py-12 brutal-border-b bg-white">
                <p className="text-[10px] font-mono text-ink-900 uppercase tracking-[0.2em] mb-6 border border-ink-900 inline-block px-2 py-1">Verdict</p>
                <p className="font-serif text-3xl lg:text-4xl leading-tight text-ink-900 max-w-4xl text-balance">{verdict}</p>
              </div>
            )}

            {/* Competitors (Grid Layout) */}
            {competitors.length > 0 && (
              <div className="grid md:grid-cols-12 brutal-border-b">
                <div className="md:col-span-3 p-4 sm:p-8 bg-background border-b md:border-b-0 md:border-r border-border-strong">
                  <p className="text-[10px] font-mono text-ink-900 uppercase tracking-[0.2em]">Competitors</p>
                </div>
                <div className="md:col-span-9 divide-y divide-border-strong bg-white">
                  {competitors.map((c, i) => (
                    <div key={i} className="group flex flex-col sm:flex-row items-start justify-between p-6 sm:p-8 hover:bg-background transition-none">
                      <div className="max-w-[85%]">
                        <div className="flex items-center gap-4 mb-3">
                          <p className="font-serif text-2xl">{c.name}</p>
                          {c.threat_level && (
                            <span className={`px-2 py-1 text-[9px] uppercase font-mono tracking-[0.2em] border ${c.threat_level === "high" ? "bg-accent text-white border-accent" :
                              c.threat_level === "medium" ? "bg-yellow-400 text-ink-900 border-yellow-400" :
                                "bg-accent-green text-white border-accent-green"
                              }`}>
                              {c.threat_level} THREAT
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-ink-800 leading-relaxed font-mono max-w-3xl mb-4">{c.description}</p>
                        {c.differentiator && (
                          <div className="bg-background border border-border-strong p-3 inline-block">
                            <p className="text-[10px] text-ink-900 font-mono uppercase tracking-widest">
                              <span className="font-bold pr-2">// GAP:</span>{c.differentiator}
                            </p>
                          </div>
                        )}
                      </div>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noopener noreferrer"
                          className="mt-4 sm:mt-0 text-[10px] font-mono uppercase tracking-[0.2em] text-ink-900 border border-ink-900 px-3 py-1.5 hover:bg-ink-900 hover:text-white transition-none shrink-0">
                          Visit Site
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pros / Cons / Gaps (Stark Columns) */}
            <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border-strong brutal-border-b bg-white w-full">
              {/* Pros */}
              <div className="p-6 sm:p-8 hover:bg-background transition-none">
                <p className="text-[10px] font-mono text-ink-900 uppercase tracking-[0.2em] mb-8 border-b border-ink-900 pb-2 inline-block">Pros</p>
                <ul className="space-y-6">
                  {pros.map((p, i) => (
                    <li key={i} className="text-sm text-ink-900 flex items-start gap-4">
                      <span className="font-mono text-accent-green font-bold">+</span>
                      <span className="leading-relaxed font-mono text-xs">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Cons */}
              <div className="p-6 sm:p-8 hover:bg-background transition-none">
                <p className="text-[10px] font-mono text-accent uppercase tracking-[0.2em] mb-8 border-b border-accent pb-2 inline-block">Cons</p>
                <ul className="space-y-6">
                  {cons.map((c, i) => (
                    <li key={i} className="text-sm text-ink-900 flex items-start gap-4 flex-grow">
                      <span className="font-mono text-accent font-bold">&minus;</span>
                      <span className="leading-relaxed font-mono text-xs">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Gaps */}
              <div className="p-6 sm:p-8 hover:bg-background transition-none">
                <p className="text-[10px] font-mono text-ink-900 uppercase tracking-[0.2em] mb-8 border-b border-ink-900 pb-2 inline-block">Unmet Gaps</p>
                <ul className="space-y-6">
                  {gaps.map((g, i) => (
                    <li key={i} className="text-sm text-ink-900 flex items-start gap-4">
                      <span className="mt-1"><Zap className="w-3 h-3 stroke-[2] text-ink-900" /></span>
                      <span className="leading-relaxed font-mono text-xs">{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Build Plan */}
            {buildPlan.length > 0 && (
              <div className="grid md:grid-cols-12 brutal-border-b bg-white">
                <div className="md:col-span-3 p-4 sm:p-8 bg-background border-b md:border-b-0 md:border-r border-border-strong">
                  <p className="text-[10px] font-mono text-ink-900 uppercase tracking-[0.2em]">Execution Plan</p>
                </div>
                <div className="md:col-span-9 p-6 sm:p-8">
                  <ol className="space-y-8 max-w-3xl">
                    {buildPlan.map((step, i) => (
                      <li key={i} className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 group">
                        <span className="font-mono text-[10px] uppercase font-medium text-white mt-1 shrink-0 px-2 py-1 bg-ink-900">
                          Phase {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="leading-relaxed text-sm font-mono text-ink-900 pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ CHAT TAB ═══ */}
        {tab === "chat" && (
          <div className="max-w-3xl">
            <div className="card-minimal min-h-[400px] flex flex-col">
              <p className="text-xs font-mono text-secondary uppercase tracking-widest mb-4">
                Ask follow-up questions about this research
              </p>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto max-h-[500px] space-y-4 mb-4">
                {messages.length === 0 && !chatLoading && (
                  <div className="text-center py-12">
                    <MessageSquare className="w-8 h-8 text-border-strong mx-auto mb-3" />
                    <p className="text-sm text-secondary mb-1">No messages yet</p>
                    <p className="text-xs text-text-tertiary">
                      Ask about competitors, tech stacks, market gaps, or anything else about this research.
                    </p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed ${msg.role === "user"
                      ? "bg-ink-900 text-white"
                      : "bg-background-sunken text-secondary"
                      }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-background-sunken rounded-lg px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-border-strong animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-2 h-2 rounded-full bg-border-strong animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-2 h-2 rounded-full bg-border-strong animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-3 border-t border-border pt-4">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask a follow-up question..."
                  className="flex-1 bg-background-sunken rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-border-strong placeholder:text-text-tertiary"
                  disabled={chatLoading}
                />
                <button
                  onClick={sendChat}
                  disabled={!chatInput.trim() || chatLoading}
                  className="btn-primary px-4 py-2.5 disabled:opacity-30"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ NOTES TAB ═══ */}
        {tab === "notes" && (
          <div className="max-w-3xl">
            <div className="card-minimal">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-mono text-secondary uppercase tracking-widest">Your Notes</p>
                <span className="text-xs font-mono text-text-tertiary">
                  {notesSaving ? "Saving..." : notesSaved ? "Saved" : "Unsaved changes"}
                </span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Write your thoughts, next steps, key takeaways..."
                rows={12}
                className="w-full bg-background-sunken rounded-lg p-4 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-border-strong placeholder:text-text-tertiary resize-none"
              />
              <p className="text-xs text-text-tertiary mt-2">
                Auto-saves as you type. {notes.length}/5000 characters.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}