"use client";

import { useState, useEffect, Suspense, useRef } from "react";
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
import { supabase } from "@/lib/supabase";

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

interface RawSource {
  title: string;
  url: string;
  snippet: string;
  source_type: string;
  score: number;
}

function SourceBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    github: "bg-gray-800 text-white",
    producthunt: "bg-orange-500 text-white",
    reddit: "bg-orange-600 text-white",
    hackernews: "bg-orange-400 text-white",
    web: "bg-ink-100 text-ink-500",
  };
  const label: Record<string, string> = {
    github: "GitHub",
    producthunt: "Product Hunt",
    reddit: "Reddit",
    hackernews: "Hacker News",
    web: "Web",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[type] || colors.web}`}>
      {label[type] || "Web"}
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

  // Save pending results to session storage so they survive login redirects
  useEffect(() => {
    if (result) {
      sessionStorage.setItem("shiporskip_pending_result", JSON.stringify(result));
      sessionStorage.setItem("shiporskip_pending_idea", idea);
    }
  }, [result, idea]);

  // Restore pending results on mount
  useEffect(() => {
    const savedResult = sessionStorage.getItem("shiporskip_pending_result");
    const savedIdea = sessionStorage.getItem("shiporskip_pending_idea");
    if (savedResult && !result) {
      try {
        setResult(JSON.parse(savedResult));
        if (savedIdea) setIdea(savedIdea);
        sessionStorage.removeItem("shiporskip_pending_result");
        sessionStorage.removeItem("shiporskip_pending_idea");
      } catch { }
    }
  }, []);

  useEffect(() => {
    const fetchLimits = async () => {
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

    if (!verified) {
      setError("Please complete verification");
      return;
    }
    if (!token) {
      setError("Refreshing security check... Please try again in a second.");
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
            setResult(data);
            if (data.limits) setLimits(data.limits);
            setLoading(false);
            if (user) loadHistory();
          },
          (err: any) => {
            if (err?.response?.status === 429 && err?.response?.data?.detail) {
              const detail = err.response.data.detail;
              setError(detail.message || "Rate limit exceeded.");
              if (detail.limits) setLimits(detail.limits);
            } else {
              setError(err instanceof Error ? err.message : typeof err === "string" ? err : "Research failed.");
            }
            setLoading(false);
          },
          token
        );
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Research failed.");
        setLoading(false);
      } finally {
        setToken("");
        turnstileRef.current?.reset();
      }
    } else {
      setProgress("Analyzing your idea...");
      try {
        const data = await analyzeFast(idea, undefined, token);
        setResult(data);
        if (data.limits) setLimits(data.limits);
        if (user) loadHistory();
      } catch (err: any) {
        if (err?.response?.status === 429 && err?.response?.data?.detail) {
          const detail = err.response.data.detail;
          setError(detail.message || "Rate limit exceeded.");
          if (detail.limits) setLimits(detail.limits);
        } else {
          setError(err instanceof Error ? err.message : "Analysis failed.");
        }
      } finally {
        setLoading(false);
        setToken("");
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
  const rawSources = getField("raw_sources") as RawSource[];

  // Sources that aren't already shown as competitors
  const competitorUrls = new Set(competitors.map(c => c.url?.toLowerCase().replace(/\/$/, "") || ""));
  const extraSources = rawSources.filter(s => !competitorUrls.has(s.url.toLowerCase().replace(/\/$/, "")));

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
                  onClick={handleSignOut}
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

                <div className="flex items-center gap-4 text-xs">
                  {limits && limits.remaining_fast !== "unlimited" && (
                    <span className="text-xs font-mono text-text-tertiary">
                      {mode === "fast"
                        ? `${limits.remaining_fast} of ${limits.fast_limit} fast left`
                        : `${limits.remaining_deep} of ${limits.deep_limit} deep left`}
                      {!user && limits.remaining_fast === 0 && limits.remaining_deep === 0 && (
                        <> · <Link href="/auth/login" className="text-primary hover:underline">Sign in for more</Link></>
                      )}
                    </span>
                  )}

                  <div className="flex items-center gap-6">
                    <div
                      className={`transition-all duration-500 overflow-hidden ${verified ? "opacity-0 max-w-0 max-h-0" : "opacity-100 max-w-[300px] max-h-[65px]"
                        }`}
                    >
                      <Turnstile
                        ref={turnstileRef}
                        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
                        onSuccess={handleTurnstileSuccess}
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-text-tertiary tabular-nums">
                        {idea.length}/500
                      </span>
                      <button
                        type="submit"
                        disabled={loading || !idea.trim() || !verified}
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
              </div>
            </form>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="card-minimal text-center animate-fade-in flex flex-col items-center justify-center min-h-[200px]">
              <div className="w-4 h-4 border-2 border-border-strong border-t-ink-900 rounded-full animate-spin mb-4" />
              <p className="text-sm font-mono text-secondary">{progress}</p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="bg-white rounded-xl border border-accent/20 p-6 text-center animate-fade-in relative">
              <p className="text-sm text-accent">{error}</p>

              {!user && error.includes("Sign in") && (
                <div className="mt-4">
                  <Link href="/auth/login" className="btn-primary text-xs py-2 px-5 inline-block">
                    Sign in
                  </Link>
                </div>
              )}

              <button
                onClick={() => setError("")}
                className="btn-secondary text-xs mt-4 absolute top-2 right-4 !mt-0"
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

              {/* Competitors + Raw Sources (same card) */}
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

                  {/* ═══ MORE SOURCES — same card layout, blurred for anon ═══ */}
                  {extraSources.length > 0 && (
                    <div className="mt-2">
                      {/* Anonymous: blurred teaser using SAME competitor card layout */}
                      {!user && (
                        <div className="relative">
                          {/* Fake competitor cards that look exactly like the real ones above */}
                          <div className="space-y-0">
                            {extraSources.slice(0, 3).map((s, i) => (
                              <div
                                key={i}
                                className="flex items-start justify-between py-5 border-b border-border last:border-0 -mx-8 px-8 blur-[5px] select-none pointer-events-none"
                              >
                                <div className="max-w-[80%]">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="text-base font-medium">{s.title}</p>
                                    <SourceBadge type={s.source_type} />
                                  </div>
                                  <p className="text-sm text-secondary leading-relaxed">
                                    {s.snippet}
                                  </p>
                                </div>
                                <span className="text-xs font-medium text-secondary flex items-center gap-1 shrink-0 ml-4 pt-1">
                                  Visit <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                              </div>
                            ))}
                          </div>
                          {/* Overlay */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-white via-white/90 to-white/50">
                            <Lock className="w-4 h-4 text-secondary mb-2" />
                            <p className="text-sm font-medium text-primary mb-1">
                              {extraSources.length} more sources found
                            </p>
                            <p className="text-xs text-secondary mb-3">Sign in to see all discovered sources</p>
                            <Link href="/auth/login?returnTo=/appgroup/dashboard" className="btn-primary text-xs py-2 px-5">
                              Sign in to unlock
                            </Link>
                          </div>
                        </div>
                      )}

                      {/* Signed-in: collapsed preview */}
                      {user && !showAllSources && (
                        <button
                          onClick={() => setShowAllSources(true)}
                          className="w-full mt-4 py-3 text-sm text-secondary hover:text-primary font-medium flex items-center justify-center gap-1.5 border border-border rounded-[2px] hover:border-border-strong transition-colors"
                        >
                          See {extraSources.length} more sources <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Signed-in: expanded full list — same card layout as competitors */}
                      {user && showAllSources && (
                        <div className="mt-2 animate-fade-in">
                          <p className="text-xs font-mono text-secondary uppercase tracking-widest mb-4 pt-4 border-t border-border">
                            More Sources
                          </p>
                          {extraSources.map((s, i) => (
                            <div
                              key={i}
                              className="group flex items-start justify-between py-5 border-b border-border last:border-0 hover:bg-background-sunken -mx-8 px-8 transition-colors"
                            >
                              <div className="max-w-[80%]">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-base font-medium">{s.title}</p>
                                  <SourceBadge type={s.source_type} />
                                </div>
                                <p className="text-sm text-secondary leading-relaxed">
                                  {s.snippet}
                                </p>
                                <p className="text-[10px] font-mono text-text-tertiary mt-1 truncate">{s.url}</p>
                              </div>
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-secondary hover:text-primary flex items-center gap-1 shrink-0 ml-4 pt-1 transition-colors"
                              >
                                Visit <ChevronRight className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          ))}
                          <button
                            onClick={() => setShowAllSources(false)}
                            className="mt-4 text-xs font-mono text-secondary hover:text-primary transition-colors"
                          >
                            Show less
                          </button>
                        </div>
                      )}
                    </div>
                  )}
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