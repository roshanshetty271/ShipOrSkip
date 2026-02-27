"use client";

import { useState, useEffect, Suspense, useRef, useMemo, useCallback, memo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Zap,
  Search,
  ChevronRight,
  RotateCcw,
  ExternalLink,
  Github,
  Globe,
  Lock,
  MessageSquare,
  FileText,
  StickyNote,
  X,
  Trash2,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import {
  analyzeFast,
  analyzeDeepStream,
  getResearchHistory,
} from "@/services/api";
import dynamic from "next/dynamic";
import TextareaAutosize from 'react-textarea-autosize';
import { supabase } from "@/lib/supabase";
import { getAccessToken } from "@/lib/supabase";

const Turnstile = dynamic(
  () => import("@marsidev/react-turnstile").then((m) => m.Turnstile),
  { ssr: false }
);

interface ResearchItem {
  id: string;
  idea_text: string;
  analysis_type: string;
  status: string;
  created_at: string;
}

interface CompetitorItem {
  name: string;
  description: string;
  differentiator?: string;
  url?: string;
  threat_level?: string;
}

interface RawSource {
  title: string;
  url: string;
  snippet: string;
  source_type: string;
  score: number;
}

const SOURCE_COLORS: Record<string, string> = {
  github: "bg-gray-800 text-white",
  producthunt: "bg-orange-500 text-white",
  reddit: "bg-orange-600 text-white",
  hackernews: "bg-orange-400 text-white",
  web: "bg-ink-100 text-ink-500",
};

const SOURCE_LABELS: Record<string, string> = {
  github: "GitHub",
  producthunt: "Product Hunt",
  reddit: "Reddit",
  hackernews: "Hacker News",
  web: "Web",
};

function SourceBadge({ type }: { type: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[type] || SOURCE_COLORS.web}`}>
      {SOURCE_LABELS[type] || "Web"}
    </span>
  );
}

// Friendly progress messages for deep research
function friendlyProgress(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("starting")) return "Starting research...";
  if (lower.includes("planned") || lower.includes("queries")) return "Searching the web for competitors...";
  if (lower.includes("web:") || lower.includes("tavily")) return "Scanning websites, GitHub, and Product Hunt...";
  if (lower.includes("github")) return "Looking through GitHub repositories...";
  if (lower.includes("product hunt")) return "Checking recent Product Hunt launches...";
  if (lower.includes("filtered") || lower.includes("dedup")) return "Filtering and ranking results...";
  if (lower.includes("deep fetch") || lower.includes("readme")) return "Reading competitor pages and READMEs...";
  if (lower.includes("profiles") || lower.includes("extract")) return "Extracting competitor details...";
  if (lower.includes("analysis complete") || lower.includes("strategist")) return "Finalizing your report...";
  if (lower.includes("complete")) return "Almost done...";
  return "Researching...";
}

const SignInModal = memo(function SignInModal({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative bg-white w-full sm:max-w-md rounded-3xl border border-border/50 shadow-xl p-8 sm:p-10 transform transition-all overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-accent-green"></div>
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-text-tertiary hover:text-ink-900 hover:bg-background-raised rounded-full p-2 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <span className="inline-flex items-center gap-2 px-3 py-1 bg-accent-green/10 text-accent-green font-mono text-[10px] uppercase tracking-[0.2em] rounded-full border border-accent-green/20 mb-6 font-bold truncate pr-4">
          <Zap className="w-3 h-3 fill-accent-green" /> Validation Complete
        </span>
        <h3 className="font-display text-3xl font-medium text-ink-900 mb-8 leading-tight pr-8">
          Sign In To Get More Benefits
        </h3>

        <div className="space-y-4 mb-8">
          {[
            "10 fast + 3 deep analyses daily",
            "Chat with AI about your results",
            "Export complete research to PDF",
            "See all discovered source links",
            "Access full research history",
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-text-secondary font-sans leading-relaxed">
              <div className="w-5 h-5 rounded-full bg-accent-green/10 flex items-center justify-center shrink-0 border border-accent-green/20">
                <span className="text-accent-green font-bold text-xs">+</span>
              </div>
              <span>{f}</span>
            </div>
          ))}
        </div>

        <Link
          href="/auth/login?returnTo=/appgroup/dashboard"
          className="btn-primary w-full py-4 text-sm shadow-md"
          onClick={onClose}
        >
          Set Up Free Account
        </Link>
      </div>
    </div>
  );
});

const DeleteModal = memo(function DeleteModal({
  onClose,
  onDeleted,
}: {
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={() => !deleting && onClose()}
      />
      <div className="relative bg-white sm:max-w-sm w-full sm:rounded-lg rounded-t-2xl p-6 animate-slide-up shadow-2xl">
        <p className="text-base font-medium text-ink-900 mb-2">Delete all research?</p>
        <p className="text-sm text-text-secondary mb-6">
          This will permanently delete all your research history, chat messages, and notes. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 py-2.5 text-sm font-medium text-text-secondary border border-border/50 rounded-[2px] hover:bg-background-raised transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              setDeleting(true);
              try {
                const token = await getAccessToken();
                await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/research`, {
                  method: "DELETE",
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                onDeleted();
                onClose();
              } catch { } finally {
                setDeleting(false);
              }
            }}
            disabled={deleting}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-accent rounded-[2px] hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete all"}
          </button>
        </div>
      </div>
    </div>
  );
});

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const prefilled = searchParams.get("idea") || "";
  const { user, loading: authLoading, signOut } = useAuth();

  const [idea, setIdea] = useState(prefilled);
  const [mode, setMode] = useState<"fast" | "deep">("fast");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [token, setToken] = useState<string>("");
  const [verified, setVerified] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const turnstileRef = useRef<any>(null);
  const [limits, setLimits] = useState<any>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const hasShownModal = useRef(false);

  // Save pending results to session storage so they survive login redirects
  useEffect(() => {
    if (result) {
      sessionStorage.setItem("shiporskip_pending_result", JSON.stringify(result));
      sessionStorage.setItem("shiporskip_pending_idea", idea);
    }
  }, [result, idea]);

  // Restore pending results on mount or clear if URL has a different idea
  useEffect(() => {
    const savedResult = sessionStorage.getItem("shiporskip_pending_result");
    const savedIdea = sessionStorage.getItem("shiporskip_pending_idea");
    const urlIdea = searchParams.get("idea");

    if (savedResult && savedIdea) {
      if (!urlIdea || urlIdea === savedIdea) {
        try {
          setResult(JSON.parse(savedResult));
          setIdea(savedIdea);
        } catch { }
      }
      sessionStorage.removeItem("shiporskip_pending_result");
      sessionStorage.removeItem("shiporskip_pending_idea");
    }
  }, [searchParams]);

  useEffect(() => {
    const newIdea = searchParams.get("idea");
    setIdea(currentIdea => {
      if (newIdea && newIdea !== currentIdea) {
        setResult(null);
        setError("");
        setShowAllSources(false);
        return newIdea;
      }
      return currentIdea;
    });
  }, [searchParams]);

  useEffect(() => {
    const fetchLimits = async () => {
      if (!user) {
        const saved = localStorage.getItem("shiporskip_limits");
        if (saved) {
          try { setLimits(JSON.parse(saved)); } catch { }
        }
      }
      try {
        const headers: Record<string, string> = {};
        if (user) {
          const { data } = await supabase.auth.getSession();
          if (data.session?.access_token) {
            headers["Authorization"] = `Bearer ${data.session.access_token}`;
          }
        }
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/limits`, {
          headers,
        });
        if (r.ok) {
          const data = await r.json();
          setLimits(data);
        }
      } catch { }
    };
    fetchLimits();
  }, [user]);

  const handleTurnstileSuccess = (t: string) => {
    setToken(t);
    setVerified(true);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  // Research history
  const [history, setHistory] = useState<ResearchItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      loadHistory();
    }
  }, [user, authLoading]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const items = await getResearchHistory();
      setHistory(items);
    } catch {
      // silently fail
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim() || loading) return;

    if (!user && (!verified || !token)) {
      setError("Please complete verification");
      return;
    }

    setLoading(true);
    setResult(null);
    setError("");
    setShowAllSources(false);

    if (mode === "deep") {
      setProgress("Starting research...");
      try {
        await analyzeDeepStream(
          idea,
          null,
          (msg: string) => setProgress(friendlyProgress(msg)),
          (data: Record<string, unknown>) => {
            setResult({ ...data, _mode: "deep" });
            if (data.limits) {
              setLimits(data.limits);
              if (!user) localStorage.setItem("shiporskip_limits", JSON.stringify(data.limits));
            }

            if (!user && !hasShownModal.current) {
              hasShownModal.current = true;
              setTimeout(() => setShowSignInModal(true), 500);
            }

            setLoading(false);
            if (user) loadHistory();
            turnstileRef.current?.reset();
          },
          (err: any) => {
            if (err?.response?.status === 429 && err?.response?.data?.detail) {
              const detail = err.response.data.detail;
              setError(typeof detail === "string" ? detail : (detail.message || "Rate limit exceeded."));
              if (detail.limits) {
                setLimits(detail.limits);
                if (!user) localStorage.setItem("shiporskip_limits", JSON.stringify(detail.limits));
              }
            } else if (err?.response?.status === 403 || err?.response?.data?.detail === "Bot verification failed") {
              setVerified(false);
              setToken("");
              setError("Bot verification expired. Please verify again.");
            } else {
              setError(err instanceof Error ? err.message : typeof err === "string" ? err : "Research failed.");
            }
            setLoading(false);
            turnstileRef.current?.reset();
          },
          token
        );
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Research failed.");
        setLoading(false);
        turnstileRef.current?.reset();
      }
    } else {
      setProgress("Analyzing your idea...");
      try {
        const data = await analyzeFast(idea, undefined, token);
        setResult({ ...data, _mode: "fast" });
        if (data.limits) {
          setLimits(data.limits);
          if (!user) localStorage.setItem("shiporskip_limits", JSON.stringify(data.limits));
        }

        if (!user && !hasShownModal.current) {
          hasShownModal.current = true;
          setTimeout(() => setShowSignInModal(true), 500);
        }

        if (user) loadHistory();
      } catch (err: any) {
        if (err?.response?.status === 429 && err?.response?.data?.detail) {
          const detail = err.response.data.detail;
          setError(typeof detail === "string" ? detail : (detail.message || "Rate limit exceeded."));
          if (detail.limits) {
            setLimits(detail.limits);
            if (!user) localStorage.setItem("shiporskip_limits", JSON.stringify(detail.limits));
          }
        } else if (err?.response?.status === 403 || err?.response?.data?.detail === "Bot verification failed") {
          setVerified(false);
          setToken("");
          setError("Bot verification expired. Please verify again.");
        } else {
          setError(err instanceof Error ? err.message : "Analysis failed.");
        }
      } finally {
        setLoading(false);
        turnstileRef.current?.reset();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAnalyze(e as unknown as React.FormEvent);
    }
  };

  const getField = useCallback((key: string): unknown[] => {
    if (!result) return [];
    const direct = result[key];
    const fromReport =
      result.report && typeof result.report === "object"
        ? (result.report as Record<string, unknown>)[key]
        : undefined;
    const val = direct || fromReport;
    return Array.isArray(val) ? val : [];
  }, [result]);

  const verdict = useMemo(() => {
    if (!result) return "";
    const direct = result.verdict;
    const fromReport =
      result.report && typeof result.report === "object"
        ? (result.report as Record<string, unknown>).verdict
        : undefined;
    return (direct as string) || (fromReport as string) || "Analysis complete.";
  }, [result]);

  const competitors = useMemo(() => getField("competitors") as CompetitorItem[], [getField]);
  const gaps = useMemo(() => getField("gaps") as string[], [getField]);
  const pros = useMemo(() => getField("pros") as string[], [getField]);
  const cons = useMemo(() => getField("cons") as string[], [getField]);
  const buildPlan = useMemo(() => getField("build_plan") as string[], [getField]);
  const rawSources = useMemo(() => getField("raw_sources") as RawSource[], [getField]);

  const extraSources = useMemo(() => {
    const names = new Set(competitors.map(c => c.name?.toLowerCase().trim()));
    const urls = new Set(competitors.map(c => c.url?.toLowerCase().replace(/\/$/, "") || ""));
    return rawSources.filter((s: RawSource) =>
      !urls.has(s.url.toLowerCase().replace(/\/$/, "")) &&
      !names.has(s.title?.toLowerCase().trim())
    );
  }, [competitors, rawSources]);

  const initials = user?.email ? user.email[0].toUpperCase() : "?";

  return (
    <div className="min-h-screen bg-background">
      {/* Premium Header */}
      <header className="border-b border-border/50 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="w-full h-16 px-4 sm:px-8 flex items-center justify-between max-w-7xl mx-auto">
          <Link href="/" className="font-display text-2xl tracking-tight leading-none pt-1">
            <span className="text-accent-green pr-[1px] italic">Ship</span>Or<span className="text-accent pl-[1px] font-sans font-bold tracking-tighter text-[0.8em] uppercase not-italic">Skip</span>
          </Link>
          <div className="flex items-center gap-4 sm:gap-6 font-mono text-[10px] sm:text-xs uppercase tracking-widest">
            {user && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`transition-colors px-3 py-1.5 rounded-full border ${showHistory ? "bg-accent-green/10 text-accent-green border-accent-green/20 font-bold" : "text-text-secondary border-transparent hover:text-ink-900 hover:bg-background-raised"}`}
              >
                History
              </button>
            )}
            {user ? (
              <div className="flex items-center gap-4">
                <div className="w-7 h-7 rounded-full bg-accent-green/10 flex items-center justify-center font-mono text-[10px] text-accent-green border border-accent-green/20 font-bold">
                  {initials}
                </div>
                <button
                  onClick={handleSignOut}
                  className="hover:text-accent transition-colors text-text-tertiary"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <Link href="/auth/login" className="btn-primary text-[10px] py-1.5 px-4 rounded-full">Sign In</Link>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-64px)] max-w-7xl mx-auto w-full">
        {/* Sidebar — Research History */}
        {showHistory && user && (
          <aside className="w-72 shrink-0 hidden lg:flex flex-col border-r border-border/50 bg-background-raised">
            <div className="flex items-center justify-between p-5 border-b border-border/50">
              <p className="text-[10px] font-mono text-text-secondary uppercase tracking-[0.2em] font-medium">
                Past Research
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="text-text-tertiary hover:text-accent-green p-1.5 transition-colors rounded-full hover:bg-accent-green/10"
                  title="Delete all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={loadHistory} className="text-text-tertiary hover:text-accent-green p-1.5 transition-colors rounded-full hover:bg-accent-green/10" title="Refresh">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-grow overflow-y-auto">
              {historyLoading ? (
                <div className="divide-y divide-border-strong">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 bg-background-raised animate-pulse" />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <p className="text-xs font-mono p-4 text-text-tertiary">
                  No research yet.
                </p>
              ) : (
                <div className="divide-y divide-border/30 p-2">
                  {history.map((item) => (
                    <div key={item.id} className="relative group">
                      <button
                        onClick={() => router.push(`/appgroup/research/${item.id}`)}
                        className="w-full text-left p-3 hover:bg-white rounded-md transition-all mb-1 block border border-transparent hover:border-border/50 hover:shadow-sm pr-8"
                      >
                        <p className="text-sm font-sans font-medium line-clamp-2 mb-2 leading-relaxed text-ink-900 group-hover:text-accent-green transition-colors">
                          {item.idea_text}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-text-tertiary uppercase tracking-widest">
                          {item.analysis_type === "deep" ? <Search className="w-3 h-3 text-accent" /> : <Zap className="w-3 h-3 text-accent-green" />}
                          <span>{item.analysis_type}</span>
                          <span className="opacity-50">&middot;</span>
                          <span>{new Date(item.created_at).toLocaleDateString()}</span>
                        </div>
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const token = await getAccessToken();
                            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/research/${item.id}`, {
                              method: "DELETE",
                              headers: token ? { Authorization: `Bearer ${token}` } : {},
                            });
                            setHistory(prev => prev.filter(h => h.id !== item.id));
                          } catch { }
                        }}
                        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-accent transition-all p-1.5 rounded-full hover:bg-accent/10"
                        title="Delete research"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 w-full bg-background flex flex-col items-center">

          {/* Premium Input Area */}
          <div className="w-full bg-white relative py-12 lg:py-16 border-b border-border/50 shadow-sm">
            <div className="max-w-7xl mx-auto px-6 sm:px-8">
              <form onSubmit={handleAnalyze} className="flex flex-col relative w-full group">

                <div className="bg-white border border-border/50 shadow-sm transition-all duration-300 focus-within:border-accent-green/50 focus-within:shadow-md rounded-xl overflow-hidden mb-6">
                  <div className="bg-background-raised border-b border-border/50 py-3 px-5 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 text-text-secondary"><Zap className="w-3 h-3 text-accent-green fill-accent-green" /> Idea Validation Engine</span>
                    <span className={`tabular-nums font-mono text-[10px] uppercase tracking-widest ${idea.length > 450 ? 'text-accent font-bold' : 'text-text-tertiary'}`}>
                      {String(idea.length).padStart(3, '0')}/500
                    </span>
                  </div>
                  <TextareaAutosize
                    value={idea}
                    onChange={(e) => setIdea(e.target.value.slice(0, 500))}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe your app, tool, or service idea in detail..."
                    minRows={3}
                    maxRows={8}
                    className="w-full bg-transparent p-5 sm:p-6 font-sans text-xl lg:text-2xl leading-relaxed text-ink-900 focus:outline-none transition-colors placeholder:text-text-tertiary resize-none outline-none selection:bg-accent-green selection:text-white"
                    autoFocus
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setMode("fast")}
                      className={`flex items-center gap-2 px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-all rounded-full ${mode === "fast"
                        ? "bg-accent-green/10 text-accent-green border border-accent-green/20 font-bold shadow-sm"
                        : "bg-white border border-border/50 text-text-secondary hover:border-accent-green/30 hover:text-ink-900"
                        }`}
                    >
                      <Zap className="w-3.5 h-3.5" /> Fast
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("deep")}
                      className={`flex items-center gap-2 px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-all rounded-full ${mode === "deep"
                        ? "bg-accent/10 text-accent border border-accent/20 font-bold shadow-sm"
                        : "bg-white border border-border/50 text-text-secondary hover:border-accent/30 hover:text-ink-900"
                        }`}
                    >
                      <Search className="w-3.5 h-3.5" /> Deep
                    </button>
                  </div>

                  <div className="flex items-center justify-end gap-6">
                    {limits && limits.remaining_fast !== "unlimited" && (
                      <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-text-tertiary">
                        {mode === "fast"
                          ? `${limits.remaining_fast} of ${limits.fast_limit} Left`
                          : `${limits.remaining_deep} of ${limits.deep_limit} Left`}
                      </span>
                    )}

                    <div
                      className={`transition-all duration-500 overflow-hidden ${(verified || user) ? "opacity-0 max-w-0 max-h-0" : "opacity-100 max-w-[300px]"
                        }`}
                    >
                      <Turnstile
                        ref={turnstileRef}
                        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
                        onSuccess={handleTurnstileSuccess}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !idea.trim() || (!verified && !user)}
                      className="btn-primary h-12 px-8 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group/btn hover:shadow-lg transition-all duration-300"
                    >
                      {loading ? "Analyzing..." : "Analyze Idea"}
                      {!loading && <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          <div className="w-full max-w-7xl mx-auto flex flex-col flex-grow px-4 sm:px-6 lg:px-8">

            {/* Premium Loading State */}
            {loading && (
              <div className="w-full h-full flex flex-col pt-24 pb-12">
                <div className="flex flex-col items-center justify-center py-12 mb-4 bg-white rounded-2xl border border-border/50 shadow-sm p-12">
                  <div className="relative flex items-center justify-center w-16 h-16 mb-8 border-[3px] border-accent-green/20 border-t-accent-green rounded-full animate-spin">
                  </div>
                  <p className="text-xs font-mono text-accent-green tracking-widest uppercase mb-4 text-center bg-accent-green/10 px-4 py-1.5 rounded-full border border-accent-green/20 font-bold shadow-sm">
                    {progress}
                  </p>
                  <p className="font-sans text-text-tertiary text-sm mt-4 text-center max-w-sm">
                    Our AI agents are currently scouring the web, analyzing competitors, and generating a custom validation report for your idea.
                  </p>
                </div>
              </div>
            )}

            {/* Premium Error state */}
            {error && !loading && (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-6 py-8 text-center mt-12 shadow-sm">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-200">
                  <X className="w-6 h-6 text-accent" />
                </div>
                <p className="text-sm font-mono text-accent uppercase tracking-widest font-bold mb-2">Error</p>
                <p className="font-sans text-ink-900">{error}</p>
                {!user && error.includes("Sign in") && (
                  <div className="mt-6">
                    <Link href="/auth/login" className="btn-primary text-sm py-2.5 px-6 rounded-full inline-block shadow-sm">
                      Sign in to continue
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Premium Results Layout */}
            {result && !loading && (
              <div className="w-full flex flex-col gap-12 py-12">

                {result && (
                  <div className="text-xs text-text-tertiary font-mono mb-4 flex items-center gap-2">
                    {result._mode === "deep" ? (
                      <><Search className="w-3 h-3" /> Deep research — {rawSources.length}+ sources analyzed</>
                    ) : (
                      <><Zap className="w-3 h-3" /> Quick check — switch to Deep Research for a thorough analysis</>
                    )}
                  </div>
                )}

                {/* Verdict */}
                {verdict ? (
                  <div className="mb-4">
                    <span className="inline-block px-3 py-1 bg-accent-green/10 text-accent-green font-mono text-[10px] uppercase tracking-[0.2em] mb-4 rounded-full border border-accent-green/20">
                      Executive Verdict
                    </span>
                    <p className="font-sans text-xl leading-[1.6] text-ink-900 font-medium tracking-tight mb-4 max-w-5xl">{verdict}</p>
                  </div>
                ) : null}

                {/* Competitors */}
                {competitors.length > 0 && (
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-4">
                      <h3 className="font-display text-3xl text-ink-900">Competitor Landscape</h3>
                      <span className="px-3 py-1 bg-accent/10 text-accent font-mono text-[10px] uppercase tracking-[0.2em] rounded-full border border-accent/20">
                        {competitors.length} Found
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-6 w-full">
                      {competitors.map((c, i) => (
                        <div key={i} className="group flex flex-col bg-white rounded-2xl p-6 border border-border/50 hover:border-accent/30 hover:shadow-md transition-all duration-300 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-accent scale-y-0 group-hover:scale-y-100 origin-top transition-transform duration-500 ease-out"></div>

                          <div className="flex justify-between items-start gap-4 mb-4">
                            <h4 className="font-display text-2xl text-ink-900 leading-snug">{c.name}</h4>
                            {c.threat_level && (
                              <span className={`shrink-0 px-2.5 py-1 text-[9px] uppercase font-mono tracking-widest rounded-full ${c.threat_level === "high" ? "bg-accent/10 text-accent border border-accent/20" :
                                c.threat_level === "medium" ? "bg-orange-100 text-orange-700 border border-orange-200" :
                                  "bg-accent-green/10 text-accent-green border border-accent-green/20"
                                }`}>
                                {c.threat_level} THREAT
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-text-secondary leading-relaxed font-sans mb-6 flex-grow">{c.description}</p>

                          {c.differentiator && (
                            <div className="bg-background-raised rounded-lg p-3 mb-6 border border-border/50">
                              <p className="text-xs text-ink-900 font-sans">
                                <span className="font-bold text-accent mr-2">Gap:</span>{c.differentiator}
                              </p>
                            </div>
                          )}

                          {c.url && (
                            <a href={c.url} target="_blank" rel="noopener noreferrer"
                              className="mt-auto self-start flex items-center gap-2 text-xs font-medium text-text-secondary hover:text-accent transition-colors group/link">
                              Visit Website <ChevronRight className="w-3.5 h-3.5 group-hover/link:translate-x-1 transition-transform" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>

                    {!user && extraSources.length > 0 && (
                      <div className="mt-2 relative">
                        <div className="space-y-0">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="flex items-start justify-between py-5 border-b border-border/50 last:border-0 -mx-8 px-8 blur-[5px] select-none pointer-events-none"
                              aria-hidden="true"
                            >
                              <div className="max-w-[80%]">
                                <p className="text-base font-medium mb-1 text-ink-900">Competitor Product Name</p>
                                <p className="text-sm text-text-secondary leading-relaxed">
                                  A brief description of what this competing product does and how it relates to your idea validation search.
                                </p>
                                <p className="text-xs text-text-secondary mt-3 font-mono border-l-2 border-border-strong pl-3">
                                  <span className="text-ink-900 font-medium tracking-widest uppercase">Gap: </span>This competitor focuses on a different approach than what you are building.
                                </p>
                              </div>
                              <span className="text-xs font-medium text-text-secondary flex items-center gap-1 shrink-0 ml-4 pt-1">
                                Visit <ChevronRight className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-white via-white/90 to-white/50 z-10 rounded-xl">
                          <Lock className="w-5 h-5 text-ink-900 mb-3" />
                          <p className="text-base font-medium text-ink-900 mb-1">
                            {extraSources.length} more sources found
                          </p>
                          <p className="text-sm text-text-secondary mb-4">Sign in to see all discovered sources</p>
                          <Link href="/auth/login?returnTo=/appgroup/dashboard" className="btn-primary text-sm py-2 px-6 rounded-full shadow-md hover:shadow-lg transition-all">
                            Sign in to unlock
                          </Link>
                        </div>
                      </div>
                    )}

                    {user && mode === "deep" && extraSources.length > 0 && (
                      <div className="mt-8 border-t border-border/50 pt-8">
                        <div className="flex items-center gap-4 mb-6">
                          <h4 className="font-display text-2xl text-ink-900">Additional Market Intelligence</h4>
                          <span className="px-3 py-1 bg-background-raised text-ink-900 font-mono text-[10px] uppercase tracking-[0.2em] rounded-full border border-border/50">
                            {extraSources.length} Sources
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          {extraSources.slice(0, showAllSources ? extraSources.length : 5).map((s, i) => (
                            <a
                              key={i}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-white rounded-xl p-5 border border-border/50 hover:border-ink-900/30 hover:shadow-md transition-all duration-300 group"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-3 mb-2">
                                    <SourceBadge type={s.source_type} />
                                    <h5 className="font-display text-lg text-ink-900 truncate group-hover:text-accent-green transition-colors">
                                      {s.title}
                                    </h5>
                                  </div>
                                  <p className="text-sm font-sans text-text-secondary line-clamp-2 leading-relaxed">
                                    {s.snippet}
                                  </p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-border-strong group-hover:text-accent-green shrink-0 transition-colors" />
                              </div>
                            </a>
                          ))}
                        </div>
                        {extraSources.length > 5 && (
                          <button
                            onClick={() => setShowAllSources(!showAllSources)}
                            className="w-full py-4 text-sm font-medium text-text-secondary hover:text-ink-900 bg-background-raised hover:bg-white rounded-xl border border-border/50 transition-all group flex items-center justify-center gap-2 mt-4"
                          >
                            {showAllSources ? "Collapse Sources" : `View ${extraSources.length - 5} More Sources`}
                            <ChevronRight className={`w-4 h-4 transition-transform ${showAllSources ? '-rotate-90' : 'rotate-90 group-hover:translate-y-0.5'}`} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Strategic Analysis */}
                {(pros.length > 0 || cons.length > 0 || gaps.length > 0) && (
                  <div className="bg-white rounded-2xl p-8 sm:p-12 border border-border/50 shadow-sm">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 rounded-xl bg-ink-900/5 flex items-center justify-center border border-border/50">
                        <Search className="w-6 h-6 text-ink-900" />
                      </div>
                      <div>
                        <h3 className="font-display text-3xl text-ink-900">Strategic Analysis</h3>
                        <p className="font-sans text-text-secondary text-sm">Key advantages, risks, and market opportunities.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
                      {/* Pros */}
                      {pros.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-6 h-6 rounded-full bg-accent-green/10 flex items-center justify-center">
                              <Zap className="w-3 h-3 text-accent-green" />
                            </div>
                            <h4 className="font-display text-xl text-ink-900">Strengths</h4>
                          </div>
                          <ul className="space-y-3">
                            {pros.map((p, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="font-bold text-accent-green mt-0.5">+</span>
                                <span className="font-sans text-[15px] text-ink-900 leading-relaxed font-medium">{p}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Cons */}
                      {cons.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center">
                              <X className="w-3 h-3 text-accent" />
                            </div>
                            <h4 className="font-display text-xl text-ink-900">Weaknesses</h4>
                          </div>
                          <ul className="space-y-3">
                            {cons.map((c, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="font-bold text-accent mt-0.5">&minus;</span>
                                <span className="font-sans text-[15px] text-ink-900 leading-relaxed font-medium">{c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Opportunities (formerly Gaps) */}
                      {gaps.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                              <ArrowRight className="w-3 h-3 text-blue-600" />
                            </div>
                            <h4 className="font-display text-xl text-ink-900">Opportunities</h4>
                          </div>
                          <ul className="space-y-3">
                            {gaps.map((g, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0"></span>
                                <span className="font-sans text-[15px] text-ink-900 leading-relaxed font-medium">{g}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Build Plan */}
                {buildPlan.length > 0 && (
                  <div className="bg-white rounded-2xl p-8 sm:p-12 border border-border/50 shadow-sm">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 rounded-xl bg-accent-green/10 flex items-center justify-center border border-accent-green/20">
                        <Clock className="w-6 h-6 text-accent-green" />
                      </div>
                      <div>
                        <h3 className="font-display text-3xl text-ink-900">Execution Plan</h3>
                        <p className="font-sans text-text-secondary text-sm">Step-by-step phases to build your product.</p>
                      </div>
                    </div>
                    <ol className="space-y-6 max-w-4xl">
                      {buildPlan.map((step, i) => (
                        <li key={i} className="flex items-start gap-6 group">
                          <span className="font-mono text-[10px] uppercase font-bold text-accent-green border border-accent-green/20 bg-accent-green/10 px-3 py-1.5 rounded-full shrink-0 group-hover:bg-accent-green group-hover:text-white transition-colors mt-0.5">
                            Phase {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="font-sans text-ink-900 leading-relaxed pt-1">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* Redirect to History Detail for signed in users */}
            {user && result && (
              <div className="w-full text-center mt-12 mb-12 p-8 bg-background-raised rounded-2xl border border-border/50">
                <Link href="/appgroup/dashboard" className="group inline-flex items-center gap-3 text-sm font-medium text-text-secondary hover:text-ink-900 bg-white px-6 py-3 rounded-full border border-border/50 hover:border-accent-green/30 hover:shadow-sm transition-all duration-300">
                  Return to Dashboard &amp; View Full History
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 group-hover:text-accent-green transition-all" />
                </Link>
              </div>
            )}

            {/* Premium Empty state */}
            {!result && !loading && !error && !prefilled && (
              <div className="w-full text-center py-32 flex-grow flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-white border border-border/50 flex items-center justify-center mb-6 shadow-sm">
                  <Zap className="w-8 h-8 text-border-strong" />
                </div>
                <h3 className="font-display text-2xl text-ink-900 mb-2">Ready to Validate</h3>
                <p className="font-sans text-sm text-text-tertiary max-w-sm">
                  Enter your product or service idea above to generate a comprehensive market validation report.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {showSignInModal && !user ? (
        <SignInModal onClose={() => setShowSignInModal(false)} />
      ) : null}

      {showDeleteModal ? (
        <DeleteModal
          onClose={() => setShowDeleteModal(false)}
          onDeleted={() => setHistory([])}
        />
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink-50" />}>
      <DashboardContent />
    </Suspense>
  );
}