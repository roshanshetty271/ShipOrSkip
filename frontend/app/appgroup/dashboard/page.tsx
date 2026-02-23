"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Zap, Search, ChevronRight } from "lucide-react";
import Link from "next/link";

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const prefilled = searchParams.get("idea") || "";
  const [idea, setIdea] = useState(prefilled);
  const [mode, setMode] = useState<"fast" | "deep">("fast");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");
    setProgress("Starting analysis...");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const endpoint = mode === "fast" ? "/api/analyze/fast" : "/api/analyze/deep";

      if (mode === "deep") {
        // SSE streaming for deep research
        const response = await fetch(`${apiUrl}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea, category: null }),
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        if (!response.body) throw new Error("No response body");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const block of lines) {
            const dataLine = block.split("\n").find(l => l.startsWith("data: "));
            const eventLine = block.split("\n").find(l => l.startsWith("event: "));
            if (!dataLine) continue;
            const data = JSON.parse(dataLine.slice(6));
            const event = eventLine?.slice(7) || "message";

            if (event === "progress") setProgress(data.message || "Researching...");
            if (event === "done") setResult(data);
            if (event === "error") throw new Error(data.message || "Research failed");
          }
        }
      } else {
        // Regular POST for fast analysis
        const response = await fetch(`${apiUrl}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea, category: null }),
        });
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        const data = await response.json();
        setResult(data);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Header */}
      <header className="bg-white border-b border-ink-100">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-display text-lg italic">ShipOrSkip</Link>
          <div className="flex items-center gap-3">
            <Link href="/appgroup/dashboard" className="text-xs text-ink-400 hover:text-ink">History</Link>
            <div className="w-7 h-7 rounded-full bg-ink-100 flex items-center justify-center text-2xs font-medium">R</div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
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
            {(result.competitors || result.report?.competitors) && (
              <div className="bg-white rounded-xl border border-ink-100 p-6">
                <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest mb-4">Similar Products</p>
                <div className="space-y-3">
                  {(result.competitors || result.report?.competitors || []).map((c: any, i: number) => (
                    <div key={i} className="flex items-start justify-between py-3 border-b border-ink-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-ink-400 mt-0.5">{c.description}</p>
                      </div>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noopener" className="text-2xs text-ink-300 hover:text-ink flex items-center gap-0.5 shrink-0 ml-4">
                          Visit <ChevronRight className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pros & Cons */}
            <div className="grid md:grid-cols-2 gap-6">
              {(result.pros || result.report?.pros) && (
                <div className="bg-white rounded-xl border border-ink-100 p-6">
                  <p className="text-2xs font-medium text-green-600 uppercase tracking-widest mb-3">Pros</p>
                  <ul className="space-y-2">
                    {(result.pros || result.report?.pros || []).map((p: string, i: number) => (
                      <li key={i} className="text-sm text-ink-500 flex gap-2">
                        <span className="text-green-500 shrink-0">+</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(result.cons || result.report?.cons) && (
                <div className="bg-white rounded-xl border border-ink-100 p-6">
                  <p className="text-2xs font-medium text-accent uppercase tracking-widest mb-3">Cons</p>
                  <ul className="space-y-2">
                    {(result.cons || result.report?.cons || []).map((c: string, i: number) => (
                      <li key={i} className="text-sm text-ink-500 flex gap-2">
                        <span className="text-accent shrink-0">&minus;</span> {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Build Plan */}
            {(result.build_plan || result.report?.build_plan) && (
              <div className="bg-white rounded-xl border border-ink-100 p-6">
                <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest mb-4">Build Plan</p>
                <ol className="space-y-2">
                  {(result.build_plan || result.report?.build_plan || []).map((step: string, i: number) => (
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
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink-50" />}>
      <DashboardContent />
    </Suspense>
  );
}
