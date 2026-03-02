"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  MessageSquare,
  StickyNote,
  BarChart3,
  Send,
  Zap,
  Search,
  Loader2,
  Lock,
  ExternalLink,
  AlertTriangle,
  X,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
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
  const [chatUsed, setChatUsed] = useState(0);
  const [chatLimit, setChatLimit] = useState(5);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Notes
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  const [notesSaving, setNotesSaving] = useState(false);
  const notesTimeout = useRef<NodeJS.Timeout>();

  // PDF
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");

  // Header height tracking for sticky tabs
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(56);

  useEffect(() => {
    if (!headerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setHeaderH(entry.contentRect.height));
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);

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
      setResearch(await resp.json());
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
        if (data.chat_used !== undefined) setChatUsed(data.chat_used);
        if (data.chat_limit !== undefined) setChatLimit(data.chat_limit);
      }
    } catch { }
  };

  const chatAtLimit = chatUsed >= chatLimit;

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading || chatAtLimit) return;
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
        const detail = err.detail;
        if (resp.status === 429 && typeof detail === "object") {
          setChatUsed(detail.chat_used ?? chatLimit);
          setChatLimit(detail.chat_limit ?? chatLimit);
          throw new Error(detail.message || "Message limit reached.");
        }
        throw new Error(typeof detail === "string" ? detail : detail?.message || "Chat failed");
      }
      const data = await resp.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      if (data.chat_used !== undefined) setChatUsed(data.chat_used);
      if (data.chat_limit !== undefined) setChatLimit(data.chat_limit);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
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
    } catch { } finally { setNotesSaving(false); }
  };

  const handleNotesChange = (text: string) => {
    setNotes(text);
    setNotesSaved(false);
    if (notesTimeout.current) clearTimeout(notesTimeout.current);
    notesTimeout.current = setTimeout(() => saveNotes(text), 1000);
  };

  const downloadPdf = useCallback(async () => {
    setPdfLoading(true);
    setPdfError("");
    try {
      const headers = await authHeaders();
      const resp = await fetch(`${API}/api/research/${id}/export/pdf`, { headers });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(body || `Export failed (${resp.status})`);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shiporskip-${(id as string).slice(0, 8)}.pdf`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    } catch (e: any) {
      setPdfError(e.message || "PDF export failed");
    } finally {
      setPdfLoading(false);
    }
  }, [id]);

  // ─── Loading / Error states ───
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-border-strong border-t-ink-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !research) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <p className="text-sm text-accent font-mono mb-6">{error}</p>
          <Link href="/appgroup/dashboard" className="btn-secondary text-xs">Back to Dashboard</Link>
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
    <div className="min-h-screen bg-background text-ink-900 font-sans overflow-x-hidden">
      {/* ─── Header ─── */}
      <header ref={headerRef} className="brutal-border-b bg-white sticky top-0 z-40">
        <div className="w-full px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => router.push("/appgroup/dashboard")}
              className="text-ink-900 hover:bg-ink-900 hover:text-white p-1.5 border border-transparent hover:border-ink-900 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0 border-l border-border-strong pl-4 overflow-hidden">
              <p className="font-serif text-base sm:text-lg truncate tracking-tight leading-snug">{research.idea_text}</p>
              <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.15em] uppercase text-text-tertiary mt-0.5">
                {research.analysis_type === "deep"
                  ? <Search className="w-3 h-3 shrink-0" />
                  : <Zap className="w-3 h-3 shrink-0" />}
                <span>{research.analysis_type}</span>
                <span className="text-border-strong">//</span>
                <span>{new Date(research.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          <button
            onClick={downloadPdf}
            disabled={pdfLoading}
            className="btn-secondary text-[10px] py-1.5 px-3 shrink-0 flex items-center gap-1.5"
          >
            {pdfLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">EXPORT</span>
          </button>
        </div>
      </header>

      {/* ─── PDF error toast ─── */}
      {pdfError && (
        <div className="fixed top-4 right-4 z-50 bg-white border border-accent shadow-lg px-4 py-3 flex items-center gap-3 max-w-sm animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-accent shrink-0" />
          <p className="text-xs font-mono text-ink-900 flex-1">{pdfError}</p>
          <button onClick={() => setPdfError("")} className="text-text-tertiary hover:text-ink-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="w-full">
        {/* ─── Tabs ─── */}
        <div
          className="grid grid-cols-3 brutal-border-b bg-background sticky z-30"
          style={{ top: `${headerH}px` }}
        >
          {([
            { key: "results", label: "Results", num: "01" },
            { key: "chat", label: "Interrogate", num: "02" },
            { key: "notes", label: "Notes", num: "03" },
          ] as const).map(({ key, label, num }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`py-3 text-[10px] sm:text-[11px] font-mono tracking-[0.15em] uppercase transition-none border-r border-border-strong last:border-r-0 ${
                tab === key
                  ? "bg-ink-900 text-white"
                  : "bg-transparent text-ink-900 hover:bg-background-raised"
              }`}
            >
              <span className="opacity-40 mr-1">{num}</span> {label}
            </button>
          ))}
        </div>

        {/* ═══════════ RESULTS TAB ═══════════ */}
        {tab === "results" && (
          <div className="w-full flex flex-col">

            {/* Verdict */}
            {verdict && (
              <section className="brutal-border-b bg-white px-6 sm:px-10 py-8 sm:py-10">
                <p className="text-[10px] font-mono text-text-tertiary uppercase tracking-[0.2em] mb-1">Verdict</p>
                <div className="w-12 h-[2px] bg-ink-900 mb-5" />
                <p className="text-base sm:text-lg leading-relaxed text-ink-900 max-w-4xl break-words">
                  {verdict}
                </p>
              </section>
            )}

            {/* Competitors */}
            {competitors.length > 0 && (
              <section className="brutal-border-b">
                <div className="grid md:grid-cols-12">
                  <div className="md:col-span-3 px-6 sm:px-10 py-6 sm:py-8 bg-background border-b md:border-b-0 md:border-r border-border-strong">
                    <p className="text-[10px] font-mono text-text-tertiary uppercase tracking-[0.2em]">Competitors</p>
                    <p className="text-[10px] font-mono text-text-tertiary mt-1">{competitors.length} found</p>
                  </div>
                  <div className="md:col-span-9 divide-y divide-border-strong bg-white">
                    {competitors.map((c, i) => (
                      <div key={i} className="px-6 sm:px-10 py-6 sm:py-8 hover:bg-background/50 overflow-hidden">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 flex-wrap mb-2">
                              <h3 className="font-serif text-xl sm:text-2xl leading-tight">{c.name}</h3>
                              {c.threat_level && (
                                <span className={`px-2 py-0.5 text-[9px] uppercase font-mono tracking-[0.15em] font-medium whitespace-nowrap ${
                                  c.threat_level === "high"
                                    ? "bg-accent text-white"
                                    : c.threat_level === "medium"
                                      ? "bg-yellow-400 text-ink-900"
                                      : "bg-accent-green text-white"
                                }`}>
                                  {c.threat_level} threat
                                </span>
                              )}
                            </div>
                            <p className="text-sm leading-relaxed text-ink-700 max-w-3xl break-words">{c.description}</p>
                            {c.differentiator && (
                              <div className="mt-4 bg-background border-l-2 border-ink-900 pl-4 py-2">
                                <p className="text-[10px] font-mono text-ink-800 uppercase tracking-wider break-words">
                                  <span className="font-bold text-ink-900">Gap:</span> {c.differentiator}
                                </p>
                              </div>
                            )}
                          </div>
                          {c.url && (
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.15em] text-ink-900 border border-ink-900 px-3 py-1.5 hover:bg-ink-900 hover:text-white shrink-0 self-start"
                            >
                              Visit <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Pros / Cons / Gaps */}
            {(pros.length > 0 || cons.length > 0 || gaps.length > 0) && (
              <section className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border-strong brutal-border-b bg-white">
                <div className="px-6 sm:px-8 py-8">
                  <p className="text-[10px] font-mono text-accent-green uppercase tracking-[0.2em] mb-6 pb-2 border-b border-accent-green/30 inline-block font-bold">
                    Strengths
                  </p>
                  {pros.length === 0
                    ? <p className="text-xs text-text-tertiary font-mono">None identified</p>
                    : (
                      <ul className="space-y-4">
                        {pros.map((p, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <span className="font-mono text-accent-green font-bold text-sm leading-relaxed shrink-0">+</span>
                            <span className="text-sm leading-relaxed text-ink-800 break-words">{p}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>

                <div className="px-6 sm:px-8 py-8">
                  <p className="text-[10px] font-mono text-accent uppercase tracking-[0.2em] mb-6 pb-2 border-b border-accent/30 inline-block font-bold">
                    Weaknesses
                  </p>
                  {cons.length === 0
                    ? <p className="text-xs text-text-tertiary font-mono">None identified</p>
                    : (
                      <ul className="space-y-4">
                        {cons.map((c, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <span className="font-mono text-accent font-bold text-sm leading-relaxed shrink-0">&minus;</span>
                            <span className="text-sm leading-relaxed text-ink-800 break-words">{c}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>

                <div className="px-6 sm:px-8 py-8">
                  <p className="text-[10px] font-mono text-ink-900 uppercase tracking-[0.2em] mb-6 pb-2 border-b border-ink-900/20 inline-block font-bold">
                    Market Gaps
                  </p>
                  {gaps.length === 0
                    ? <p className="text-xs text-text-tertiary font-mono">None identified</p>
                    : (
                      <ul className="space-y-4">
                        {gaps.map((g, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <Zap className="w-3 h-3 shrink-0 mt-1 text-ink-500" />
                            <span className="text-sm leading-relaxed text-ink-800 break-words">{g}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              </section>
            )}

            {/* Build Plan */}
            {buildPlan.length > 0 && (
              <section className="brutal-border-b bg-white">
                <div className="grid md:grid-cols-12">
                  <div className="md:col-span-3 px-6 sm:px-10 py-6 sm:py-8 bg-background border-b md:border-b-0 md:border-r border-border-strong">
                    <p className="text-[10px] font-mono text-text-tertiary uppercase tracking-[0.2em]">Execution Plan</p>
                    <p className="text-[10px] font-mono text-text-tertiary mt-1">{buildPlan.length} phases</p>
                  </div>
                  <div className="md:col-span-9 px-6 sm:px-10 py-8">
                    <ol className="space-y-6 max-w-3xl">
                      {buildPlan.map((step, i) => (
                        <li key={i} className="flex items-start gap-4 sm:gap-5">
                          <span className="font-mono text-[10px] uppercase font-bold text-white shrink-0 px-2 py-1 bg-ink-900 mt-0.5 tabular-nums">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <p className="text-sm leading-relaxed text-ink-800 break-words">{step}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </section>
            )}

            {/* Empty state */}
            {!verdict && competitors.length === 0 && pros.length === 0 && (
              <div className="px-8 py-20 text-center">
                <p className="text-sm text-text-tertiary font-mono">No results available for this research.</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ CHAT TAB ═══════════ */}
        {tab === "chat" && (
          <div className="flex flex-col" style={{ height: `calc(100vh - ${headerH + 45}px)` }}>
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-5">
              {messages.length === 0 && !chatLoading && (
                <div className="text-center py-20">
                  <MessageSquare className="w-8 h-8 text-border-strong mx-auto mb-3" />
                  <p className="text-sm text-secondary mb-1">No messages yet</p>
                  <p className="text-xs text-text-tertiary max-w-sm mx-auto">
                    Ask about competitors, tech stacks, market gaps, or anything else.
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "user" ? (
                    <div className="max-w-[75%] bg-ink-900 text-white rounded-lg px-4 py-3 text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[85%] bg-white border border-border-strong rounded-lg px-5 py-4 text-ink-900
                      prose prose-sm prose-neutral
                      prose-headings:font-mono prose-headings:text-ink-900 prose-headings:text-sm prose-headings:font-bold prose-headings:mt-4 prose-headings:mb-2
                      prose-p:my-2 prose-p:text-sm prose-p:leading-relaxed
                      prose-ul:my-2 prose-ul:pl-4 prose-ol:my-2 prose-ol:pl-4
                      prose-li:my-0.5 prose-li:text-sm
                      prose-strong:text-ink-900
                      prose-a:text-accent prose-a:underline prose-a:break-all
                      prose-code:bg-background-sunken prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-border-strong rounded-lg px-5 py-4">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-border-strong animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 rounded-full bg-border-strong animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 rounded-full bg-border-strong animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-border-strong bg-background px-4 sm:px-8 py-4">
              <div className="max-w-3xl mx-auto">
                {chatAtLimit ? (
                  <div className="flex items-center justify-center gap-2 py-2 text-xs font-mono text-text-tertiary uppercase tracking-[0.15em]">
                    <Lock className="w-3.5 h-3.5" />
                    <span>{chatLimit} of {chatLimit} messages used — limit reached</span>
                  </div>
                ) : (
                  <div className="flex gap-3 items-end">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder="Ask a follow-up question..."
                      className="flex-1 bg-white border border-border-strong px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ink-900 placeholder:text-text-tertiary"
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
                )}
                {!chatAtLimit && (
                  <p className="text-[10px] font-mono text-text-tertiary uppercase tracking-[0.15em] mt-2 text-right">
                    {chatUsed} of {chatLimit} messages used
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════ NOTES TAB ═══════════ */}
        {tab === "notes" && (
          <div className="brutal-border-b bg-white">
            <div className="grid md:grid-cols-12">
              <div className="md:col-span-3 px-6 sm:px-10 py-6 sm:py-8 bg-background border-b md:border-b-0 md:border-r border-border-strong">
                <p className="text-[10px] font-mono text-text-tertiary uppercase tracking-[0.2em]">Your Notes</p>
                <p className="text-[10px] font-mono text-text-tertiary mt-1">
                  {notesSaving ? "Saving..." : notesSaved ? "Saved" : "Unsaved"}
                </p>
              </div>
              <div className="md:col-span-9 px-6 sm:px-10 py-8">
                <textarea
                  value={notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="Write your thoughts, next steps, key takeaways..."
                  rows={16}
                  className="w-full max-w-3xl bg-background border border-border-strong p-5 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ink-900 placeholder:text-text-tertiary resize-y font-mono"
                />
                <p className="text-[10px] font-mono text-text-tertiary mt-3 uppercase tracking-wider">
                  Auto-saves as you type · {notes.length} / 5000
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
