"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Zap,
  Search,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import {
  analyzeFast,
  analyzeDeepStream,
  getResearchHistory,
} from "@/services/api";
import { Turnstile } from "@marsidev/react-turnstile";
import TextareaAutosize from 'react-textarea-autosize';

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
}

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

  // Research history
  const [history, setHistory] = useState<ResearchItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

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
      // silently fail — history is non-critical
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim() || loading) return;

    if (!token) {
      setError("Please complete verification");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (mode === "deep") {
        await analyzeDeepStream(
          idea,
          null,
          (msg: string) => setProgress(msg),
          (data: Record<string, unknown>) => {
            setResult(data);
            setLoading(false);
            if (user) loadHistory();
          },
          (err: string) => {
            setError(err);
            setLoading(false);
          },
          token
        );
        return;
      } else {
        const data = await analyzeFast(idea, undefined, token);
        setResult(data);
        if (user) loadHistory();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Analysis failed. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAnalyze(e as unknown as React.FormEvent);
    }
  };

  const getField = (key: string): unknown[] => {
    if (!result) return [];
    const direct = result[key];
    const fromReport =
      result.report && typeof result.report === "object"
        ? (result.report as Record<string, unknown>)[key]
        : undefined;
    const val = direct || fromReport;
    return Array.isArray(val) ? val : [];
  };

  const getVerdict = (): string => {
    if (!result) return "";
    const direct = result.verdict;
    const fromReport =
      result.report && typeof result.report === "object"
        ? (result.report as Record<string, unknown>).verdict
        : undefined;
    return (direct as string) || (fromReport as string) || "Analysis complete.";
  };

  const competitors = getField("competitors") as CompetitorItem[];
  const gaps = getField("gaps") as string[];
  const pros = getField("pros") as string[];
  const cons = getField("cons") as string[];
  const buildPlan = getField("build_plan") as string[];

  const initials = user?.email ? user.email[0].toUpperCase() : "?";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-background-raised border-b border-border sticky top-0 z-40">
        <div className="layout-container h-16 flex items-center justify-between">
          <Link href="/" className="font-display text-2xl tracking-normal">
            <span className="text-green-600">Ship</span>Or<span className="text-accent">Skip</span>
          </Link>
          <div className="flex items-center gap-6">
            {user && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`text-sm transition-colors ${showHistory
                  ? "text-primary font-medium"
                  : "text-secondary hover:text-primary"
                  }`}
              >
                History
              </button>
            )}
            {user ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[2px] bg-ink-900 flex items-center justify-center text-xs font-mono text-white">
                  {initials}
                </div>
                <button
                  onClick={signOut}
                  className="text-xs text-secondary hover:text-primary transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link href="/auth/login" className="btn-primary text-xs py-2 px-5">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="layout-container py-12 flex gap-12">
        {/* Sidebar — Research History */}
        {showHistory && user && (
          <aside className="w-72 shrink-0 hidden lg:block">
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs font-mono text-secondary uppercase tracking-widest">
                Past Research
              </p>
              <button onClick={loadHistory} className="text-secondary hover:text-primary transition-colors">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
            {historyLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 bg-background-raised rounded-[2px] border border-border animate-pulse"
                  />
                ))}
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-secondary">
                No research yet. Analyze an idea to get started.
              </p>
            ) : (
              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => router.push(`/appgroup/research/${item.id}`)}
                    className="w-full text-left bg-background-raised rounded-[2px] border border-border p-4 hover:border-border-strong transition-colors group"
                  >
                    <p className="text-sm font-medium line-clamp-2 mb-3 group-hover:text-primary text-secondary transition-colors">
                      {item.idea_text}
                    </p>
                    <div className="flex items-center gap-2 text-xs font-mono text-text-tertiary">
                      {item.analysis_type === "deep" ? (
                        <Search className="w-3 h-3" />
                      ) : (
                        <Zap className="w-3 h-3" />
                      )}
                      <span className="capitalize">{item.analysis_type}</span>
                      <span>&middot;</span>
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 max-w-5xl w-full">
          {/* Input */}
          <div className="card-minimal mb-12 relative overflow-hidden">
            <form onSubmit={handleAnalyze}>
              <TextareaAutosize
                value={idea}
                onChange={(e) => setIdea(e.target.value.slice(0, 500))}
                onKeyDown={handleKeyDown}
                placeholder="Describe your project idea..."
                minRows={1}
                maxRows={10}
                className="w-full bg-transparent resize-none focus:outline-none text-lg mb-6 placeholder:text-text-tertiary leading-relaxed break-all"
              />
              <div className="flex items-center justify-between border-t border-border pt-6">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setMode("fast")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-[2px] text-sm font-medium transition-all border ${mode === "fast"
                      ? "bg-ink-900 border-ink-900 text-white"
                      : "bg-transparent border-transparent text-secondary hover:bg-background-sunken hover:border-border"
                      }`}
                  >
                    <Zap className="w-3.5 h-3.5" /> Fast
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("deep")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-[2px] text-sm font-medium transition-all border ${mode === "deep"
                      ? "bg-ink-900 border-ink-900 text-white"
                      : "bg-transparent border-transparent text-secondary hover:bg-background-sunken hover:border-border"
                      }`}
                  >
                    <Search className="w-3.5 h-3.5" /> Deep Research
                  </button>
                </div>
                <div className="flex items-center gap-6">
                  <div
                    className={`transition-all duration-500 overflow-hidden ${token ? "opacity-0 max-w-0 max-h-0" : "opacity-100 max-w-[300px] max-h-[65px]"
                      }`}
                  >
                    <Turnstile
                      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
                      onSuccess={setToken}
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-text-tertiary tabular-nums">
                      {idea.length}/500
                    </span>
                    <button
                      type="submit"
                      disabled={loading || !idea.trim() || !token}
                      className="btn-primary"
                    >
                      {loading ? (
                        progress
                      ) : (
                        <>
                          Analyze <ArrowRight className="w-3.5 h-3.5 ml-2" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>

          {/* Loading state (Skeletons per guide) */}
          {loading && (
            <div className="card-minimal text-center animate-fade-in flex flex-col items-center justify-center min-h-[200px]">
              <div className="w-4 h-4 border-2 border-border-strong border-t-ink-900 rounded-full animate-spin mb-4" />
              <p className="text-sm font-mono text-secondary">{progress}</p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="bg-white rounded-xl border border-accent/20 p-6 text-center animate-fade-in">
              <p className="text-sm text-accent">{error}</p>
              <button
                onClick={() => setError("")}
                className="btn-secondary text-xs mt-4"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <div className="space-y-6 animate-slide-up">
              {/* Verdict */}
              <div className="card-minimal">
                <p className="text-xs font-mono text-secondary uppercase tracking-widest mb-4">
                  Verdict
                </p>
                <p className="text-lg leading-relaxed text-primary font-medium">{getVerdict()}</p>
              </div>

              {/* Competitors */}
              {competitors.length > 0 && (
                <div className="card-minimal">
                  <p className="text-xs font-mono text-secondary uppercase tracking-widest mb-6">
                    Similar Products
                  </p>
                  <div className="space-y-0">
                    {competitors.map((c, i) => (
                      <div
                        key={i}
                        className="group flex items-start justify-between py-5 border-b border-border last:border-0 hover:bg-background-sunken -mx-8 px-8 transition-colors"
                      >
                        <div className="max-w-[80%]">
                          <p className="text-base font-medium mb-1">{c.name}</p>
                          <p className="text-sm text-secondary leading-relaxed">
                            {c.description}
                          </p>
                          {c.differentiator && (
                            <p className="text-xs text-secondary mt-3 font-mono border-l-2 border-border-strong pl-3">
                              <span className="text-primary font-medium">Gap: </span>{c.differentiator}
                            </p>
                          )}
                        </div>
                        {c.url && (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-secondary hover:text-primary flex items-center gap-1 shrink-0 ml-4 pt-1 transition-colors"
                          >
                            Visit <ChevronRight className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gaps */}
              {gaps.length > 0 && (
                <div className="card-minimal">
                  <p className="text-xs font-mono text-secondary uppercase tracking-widest mb-6">
                    Market Gaps
                  </p>
                  <ul className="space-y-3">
                    {gaps.map((g, i) => (
                      <li key={i} className="text-base text-secondary flex items-start gap-4">
                        <span className="text-primary mt-1.5 shrink-0"><Zap className="w-3.5 h-3.5" /></span>
                        <span className="leading-relaxed">{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pros & Cons */}
              <div className="grid md:grid-cols-2 gap-6">
                {pros.length > 0 && (
                  <div className="card-minimal">
                    <p className="text-xs font-mono text-secondary uppercase tracking-widest mb-6">
                      Pros
                    </p>
                    <ul className="space-y-3">
                      {pros.map((p, i) => (
                        <li key={i} className="text-base text-secondary flex items-start gap-3">
                          <span className="text-primary shrink-0 font-medium">+</span>
                          <span className="leading-relaxed">{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {cons.length > 0 && (
                  <div className="card-minimal border-accent/20">
                    <p className="text-xs font-mono text-accent uppercase tracking-widest mb-6">
                      Cons
                    </p>
                    <ul className="space-y-3">
                      {cons.map((c, i) => (
                        <li key={i} className="text-base text-secondary flex items-start gap-3">
                          <span className="text-accent shrink-0 font-medium">&minus;</span>
                          <span className="leading-relaxed">{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Build Plan */}
              {buildPlan.length > 0 && (
                <div className="card-minimal">
                  <p className="text-xs font-mono text-secondary uppercase tracking-widest mb-6">
                    Build Plan
                  </p>
                  <ol className="space-y-4">
                    {buildPlan.map((step, i) => (
                      <li key={i} className="text-base text-secondary flex items-start gap-4">
                        <span className="font-mono text-xs font-medium text-primary mt-1 shrink-0 min-w-[24px]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!result && !loading && !error && !prefilled && (
            <div className="text-center py-20">
              <p className="text-secondary text-base">
                Enter an idea above to get started.
              </p>
            </div>
          )}
        </main>
      </div>
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