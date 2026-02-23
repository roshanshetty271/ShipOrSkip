"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowRight, Zap, Search, ChevronRight, Clock, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { analyzeFast, analyzeDeepStream, getResearchHistory } from "@/services/api";

interface ResearchItem {
  id: string;
  idea_text: string;
  analysis_type: string;
  created_at: string;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const prefilled = searchParams.get("idea") || "";
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [idea, setIdea] = useState(prefilled);
  const [mode, setMode] = useState<"fast" | "deep">("fast");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  // Research history
  const [history, setHistory] = useState<ResearchItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Load history on mount if authenticated
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
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");
    setProgress("Starting analysis...");

    try {
      if (mode === "deep") {
        await analyzeDeepStream(
          idea,
          null,
          (msg) => setProgress(msg),
          (data) => { setResult(data); setLoading(false); if (user) loadHistory(); },
          (err) => { setError(err); setLoading(false); },
        );
        return; // callbacks handle setLoading
      } else {
        const data = await analyzeFast(idea);
        setResult(data);
        if (user) loadHistory();
      }
    } catch (err: any) {
      setError(err.message || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const initials = user?.email ? user.email[0].toUpperCase() : "?";

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Header */}
      <header className="bg-white border-b border-ink-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-display text-lg italic">ShipOrSkip</Link>
          <div className="flex items-center gap-3">
            {user && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`text-xs transition-colors ${showHistory ? "text-ink font-medium" : "text-ink-400 hover:text-ink"}`}
              >
                History
              </button>
            )}
            {user ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-ink flex items-center justify-center text-2xs font-medium text-white">
                  {initials}
                </div>
                <button onClick={signOut} className="text-2xs text-ink-300 hover:text-ink">Sign out</button>
              </div>
            ) : (
              <Link href="/auth/login" className="btn-primary text-xs py-1.5 px-3">Sign in</Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 flex gap-8">
        {/* Sidebar — Research History */}
        {showHistory && user && (
          <aside className="w-64 shrink-0 hidden lg:block">
            <div className="flex items-center justify-between mb-4">
              <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest">Past Research</p>
              <button onClick={loadHistory} className="text-ink-300 hover:text-ink">
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
            {historyLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-lg border border-ink-100 animate-pulse" />)}
              </div>
            ) : history.length === 0 ? (
              <p className="text-xs text-ink-300">No research yet. Analyze an idea to get started.</p>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => router.push(`/appgroup/research/${item.id}`)}
                    className="w-full text-left bg-white rounded-lg border border-ink-100 p-3 hover:border-ink-300 transition-colors"
                  >
                    <p className="text-xs font-medium line-clamp-2 mb-1">{item.idea_text}</p>
                    <div className="flex items-center gap-2 text-2xs text-ink-300">
                      {item.analysis_type === "deep" ? (
                        <Search className="w-2.5 h-2.5" />
                      ) : (
                        <Zap className="w-2.5 h-2.5" />
                      )}
                      <span>{item.analysis_type}</span>
                      <span>·</span>
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Input */}
          <div className="bg-white rounded-xl border border-ink-100 p-6 mb-8">
            <form onSubmit={handleAnalyze}>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value.slice(0, 500))}
                placeholder="Describe your project idea..."
                rows={3}
                className="input-field mb-4 resize-none"
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("fast")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      mode === "fast" ? "bg-ink text-white" : "bg-ink-50 text-ink-400 hover:bg-ink-100"
                    }`}
                  >
                    <Zap className="w-3 h-3" /> Fast
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("deep")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      mode === "deep" ? "bg-ink text-white" : "bg-ink-50 text-ink-400 hover:bg-ink-100"
                    }`}
                  >
                    <Search className="w-3 h-3" /> Deep Research
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xs text-ink-300 tabular-nums">{idea.length}/500</span>
                  <button
                    type="submit"
                    disabled={loading || !idea.trim()}
                    className="btn-primary text-xs disabled:opacity-30"
                  >
                    {loading ? progress : <>Analyze <ArrowRight className="w-3 h-3 ml-1" /></>}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="bg-white rounded-xl border border-ink-100 p-10 text-center animate-fade-in">
              <div className="inline-flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-ink animate-pulse" />
                <p className="text-sm text-ink-400">{progress}</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="bg-white rounded-xl border border-accent/20 p-6 text-center animate-fade-in">
              <p className="text-sm text-accent">{error}</p>
              <button onClick={() => setError("")} className="btn-secondary text-xs mt-4">Dismiss</button>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <div className="space-y-6 animate-slide-up">
              {/* Verdict */}
              <div className="bg-white rounded-xl border border-ink-100 p-6">
                <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest mb-3">Verdict</p>
                <p className="text-base leading-relaxed">{result.verdict || result.report?.verdict || "Analysis complete."}</p>
              </div>

              {/* Competitors */}
              {(result.competitors || result.report?.competitors)?.length > 0 && (
                <div className="bg-white rounded-xl border border-ink-100 p-6">
                  <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest mb-4">Similar Products</p>
                  <div className="space-y-3">
                    {(result.competitors || result.report?.competitors).map((c: any, i: number) => (
                      <div key={i} className="flex items-start justify-between py-3 border-b border-ink-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-ink-400 mt-0.5">{c.description}</p>
                          {c.differentiator && (
                            <p className="text-xs text-ink-300 mt-1 italic">Gap: {c.differentiator}</p>
                          )}
                        </div>
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-2xs text-ink-300 hover:text-ink flex items-center gap-0.5 shrink-0 ml-4">
                            Visit <ChevronRight className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gaps */}
              {(result.gaps || result.report?.gaps)?.length > 0 && (
                <div className="bg-white rounded-xl border border-ink-100 p-6">
                  <p className="text-2xs font-medium text-blue-600 uppercase tracking-widest mb-3">Market Gaps</p>
                  <ul className="space-y-2">
                    {(result.gaps || result.report?.gaps).map((g: string, i: number) => (
                      <li key={i} className="text-sm text-ink-500 flex gap-2">
                        <span className="text-blue-500 shrink-0">◆</span> {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pros & Cons */}
              <div className="grid md:grid-cols-2 gap-6">
                {(result.pros || result.report?.pros)?.length > 0 && (
                  <div className="bg-white rounded-xl border border-ink-100 p-6">
                    <p className="text-2xs font-medium text-green-600 uppercase tracking-widest mb-3">Pros</p>
                    <ul className="space-y-2">
                      {(result.pros || result.report?.pros).map((p: string, i: number) => (
                        <li key={i} className="text-sm text-ink-500 flex gap-2">
                          <span className="text-green-500 shrink-0">+</span> {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(result.cons || result.report?.cons)?.length > 0 && (
                  <div className="bg-white rounded-xl border border-ink-100 p-6">
                    <p className="text-2xs font-medium text-accent uppercase tracking-widest mb-3">Cons</p>
                    <ul className="space-y-2">
                      {(result.cons || result.report?.cons).map((c: string, i: number) => (
                        <li key={i} className="text-sm text-ink-500 flex gap-2">
                          <span className="text-accent shrink-0">&minus;</span> {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Build Plan */}
              {(result.build_plan || result.report?.build_plan)?.length > 0 && (
                <div className="bg-white rounded-xl border border-ink-100 p-6">
                  <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest mb-4">Build Plan</p>
                  <ol className="space-y-2">
                    {(result.build_plan || result.report?.build_plan).map((step: string, i: number) => (
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

          {/* Empty state */}
          {!result && !loading && !error && !prefilled && (
            <div className="text-center py-20">
              <p className="text-ink-300 text-sm">Enter an idea above to get started.</p>
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
