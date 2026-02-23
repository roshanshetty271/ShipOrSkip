"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Download, MessageCircle, StickyNote, ChevronRight,
  Send, Save, Loader2
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  getResearchDetail, sendChatMessage, getChatHistory,
  getNotes, saveNotes, downloadPdf
} from "@/services/api";

type Tab = "results" | "chat" | "notes";

interface ChatMsg {
  role: string;
  content: string;
  created_at?: string;
}

export default function ResearchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const researchId = params.id as string;

  const [research, setResearch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("results");

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Notes state
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const saveTimeout = useRef<NodeJS.Timeout>();

  // PDF state
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
      return;
    }
    if (user) loadResearch();
  }, [user, authLoading]);

  const loadResearch = async () => {
    try {
      const data = await getResearchDetail(researchId);
      setResearch(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadChat = async () => {
    try {
      const msgs = await getChatHistory(researchId);
      setChatMessages(msgs);
    } catch {}
  };

  const loadNotes = async () => {
    try {
      const n = await getNotes(researchId);
      setNotes(n);
    } catch {}
  };

  useEffect(() => {
    if (tab === "chat") loadChat();
    if (tab === "notes") loadNotes();
  }, [tab]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: msg }]);
    setChatLoading(true);

    try {
      const reply = await sendChatMessage(researchId, msg);
      setChatMessages((prev) => [...prev, reply]);
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setNotesSaved(false);
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setNotesSaving(true);
      try {
        await saveNotes(researchId, value);
        setNotesSaved(true);
      } catch {}
      setNotesSaving(false);
    }, 1000); // Auto-save after 1s of inactivity
  };

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      await downloadPdf(researchId);
    } catch (err: any) {
      alert(err.message || "PDF download failed");
    }
    setPdfLoading(false);
  };

  const result = research?.result || {};

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-ink animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-ink-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-accent mb-4">{error}</p>
          <Link href="/appgroup/dashboard" className="btn-secondary text-xs">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Header */}
      <header className="bg-white border-b border-ink-100">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/appgroup/dashboard" className="text-ink-400 hover:text-ink">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="font-display text-lg italic">ShipOrSkip</span>
          </div>
          <button
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            {pdfLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
            Export PDF
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Idea title */}
        <div className="mb-6">
          <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest mb-2">
            {research.analysis_type === "deep" ? "Deep Research" : "Fast Analysis"} · {new Date(research.created_at).toLocaleDateString()}
          </p>
          <h1 className="text-xl font-semibold leading-snug">{research.idea_text}</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-ink-100">
          {([
            { key: "results", label: "Results", icon: ChevronRight },
            { key: "chat", label: "Chat", icon: MessageCircle },
            { key: "notes", label: "Notes", icon: StickyNote },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                tab === key
                  ? "border-ink text-ink"
                  : "border-transparent text-ink-400 hover:text-ink-600"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ═══ Results Tab ═══ */}
        {tab === "results" && (
          <div className="space-y-6 animate-fade-in">
            {result.verdict && (
              <div className="bg-white rounded-xl border border-ink-100 p-6">
                <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest mb-3">Verdict</p>
                <p className="text-base leading-relaxed">{result.verdict}</p>
              </div>
            )}

            {result.competitors?.length > 0 && (
              <div className="bg-white rounded-xl border border-ink-100 p-6">
                <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest mb-4">Similar Products</p>
                <div className="space-y-3">
                  {result.competitors.map((c: any, i: number) => (
                    <div key={i} className="flex items-start justify-between py-3 border-b border-ink-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-ink-400 mt-0.5">{c.description}</p>
                        {c.differentiator && <p className="text-xs text-ink-300 mt-1 italic">Gap: {c.differentiator}</p>}
                      </div>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-2xs text-ink-300 hover:text-ink shrink-0 ml-4">Visit →</a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              {result.pros?.length > 0 && (
                <div className="bg-white rounded-xl border border-ink-100 p-6">
                  <p className="text-2xs font-medium text-green-600 uppercase tracking-widest mb-3">Pros</p>
                  <ul className="space-y-2">
                    {result.pros.map((p: string, i: number) => (
                      <li key={i} className="text-sm text-ink-500 flex gap-2"><span className="text-green-500 shrink-0">+</span> {p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.cons?.length > 0 && (
                <div className="bg-white rounded-xl border border-ink-100 p-6">
                  <p className="text-2xs font-medium text-accent uppercase tracking-widest mb-3">Cons</p>
                  <ul className="space-y-2">
                    {result.cons.map((c: string, i: number) => (
                      <li key={i} className="text-sm text-ink-500 flex gap-2"><span className="text-accent shrink-0">−</span> {c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {result.build_plan?.length > 0 && (
              <div className="bg-white rounded-xl border border-ink-100 p-6">
                <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest mb-4">Build Plan</p>
                <ol className="space-y-2">
                  {result.build_plan.map((step: string, i: number) => (
                    <li key={i} className="text-sm text-ink-500 flex gap-3">
                      <span className="font-mono text-2xs text-ink-300 mt-0.5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ═══ Chat Tab ═══ */}
        {tab === "chat" && (
          <div className="animate-fade-in">
            <div className="bg-white rounded-xl border border-ink-100 flex flex-col" style={{ height: "calc(100vh - 320px)" }}>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMessages.length === 0 && (
                  <div className="text-center py-12">
                    <MessageCircle className="w-8 h-8 text-ink-200 mx-auto mb-3" />
                    <p className="text-sm text-ink-400">Ask follow-up questions about this research.</p>
                    <p className="text-xs text-ink-300 mt-1">e.g. "Which competitor is most vulnerable?" or "What would the MVP look like?"</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-ink text-white"
                        : "bg-ink-50 text-ink"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-ink-50 rounded-xl px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-ink-300 animate-pulse" />
                        <div className="w-1.5 h-1.5 rounded-full bg-ink-300 animate-pulse" style={{ animationDelay: "0.2s" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-ink-300 animate-pulse" style={{ animationDelay: "0.4s" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSendChat} className="border-t border-ink-100 p-4 flex gap-3">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about this research..."
                  className="input-field flex-1 py-2.5"
                  maxLength={1000}
                  disabled={chatLoading}
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || chatLoading}
                  className="btn-primary px-4 disabled:opacity-30"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ═══ Notes Tab ═══ */}
        {tab === "notes" && (
          <div className="animate-fade-in">
            <div className="bg-white rounded-xl border border-ink-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest">Your Notes</p>
                <span className="text-2xs text-ink-300">
                  {notesSaving ? (
                    <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>
                  ) : notesSaved ? (
                    <span className="text-green-600 flex items-center gap-1"><Save className="w-3 h-3" /> Saved</span>
                  ) : (
                    <span>Auto-saves as you type</span>
                  )}
                </span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Write your thoughts, decisions, next steps..."
                className="input-field resize-none"
                rows={16}
                maxLength={10000}
              />
              <div className="flex justify-end mt-2">
                <span className="text-2xs text-ink-300 tabular-nums">{notes.length}/10,000</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
