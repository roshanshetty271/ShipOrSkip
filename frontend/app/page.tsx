"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Zap, Search, Clock } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const [idea, setIdea] = useState("");
  const router = useRouter();

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim()) return;
    const encoded = encodeURIComponent(idea);
    router.push(`/appgroup/dashboard?idea=${encoded}`);
  };

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-sm border-b border-ink-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-display text-xl italic">ShipOrSkip</Link>
          <div className="flex items-center gap-4">
            <Link href="/appgroup/dashboard" className="text-sm text-ink-400 hover:text-ink transition-colors">Dashboard</Link>
            <Link href="/auth/login" className="btn-primary text-xs py-2 px-4">Sign in</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ink-50 border border-ink-100 text-2xs font-medium text-ink-500 uppercase tracking-widest mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            Idea validation engine
          </div>

          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl leading-[0.95] tracking-tight mb-6">
            Should you
            <span className="italic text-accent"> ship it</span>
            <br />
            or skip it?
          </h1>

          <p className="text-ink-400 text-lg max-w-md mx-auto mb-12 leading-relaxed">
            Stop guessing. Get AI-powered competitive intelligence, honest pros & cons, and a concrete build plan — in under a minute.
          </p>

          <form onSubmit={handleAnalyze} className="max-w-lg mx-auto">
            <div className="relative">
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value.slice(0, 500))}
                placeholder="Describe your idea in a few sentences..."
                rows={3}
                className="input-field pr-20 resize-none"
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <span className="text-2xs text-ink-300 tabular-nums">{idea.length}/500</span>
                <button
                  type="submit"
                  disabled={!idea.trim()}
                  className="btn-primary py-1.5 px-3 text-xs disabled:opacity-30 disabled:pointer-events-none"
                >
                  Analyze <ArrowRight className="w-3 h-3 ml-1" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 border-t border-ink-100">
        <div className="max-w-3xl mx-auto">
          <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest mb-10 text-center">How it works</p>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              { step: "01", title: "Describe your idea", desc: "Plain language. No pitch deck needed." },
              { step: "02", title: "AI researches the market", desc: "Searches across the web, Product Hunt, and GitHub." },
              { step: "03", title: "Get your verdict", desc: "Competitors, gaps, pros/cons, and a build plan." },
            ].map((item) => (
              <div key={item.step}>
                <p className="font-mono text-2xs text-ink-300 mb-3">{item.step}</p>
                <h3 className="text-base font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-ink-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two modes */}
      <section className="py-20 px-6 bg-ink-50">
        <div className="max-w-3xl mx-auto">
          <p className="text-2xs font-medium text-ink-300 uppercase tracking-widest mb-10 text-center">Two analysis modes</p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-8 rounded-xl border border-ink-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-ink-50 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-ink-500" />
                </div>
                <h3 className="font-semibold">Fast Analysis</h3>
              </div>
              <p className="text-sm text-ink-400 leading-relaxed mb-4">
                Quick validation in 10-15 seconds. Single AI call with web search. Perfect for a gut check.
              </p>
              <div className="flex items-center gap-4 text-2xs text-ink-300">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ~15 sec</span>
                <span>Unlimited</span>
              </div>
            </div>

            <div className="bg-white p-8 rounded-xl border border-ink-900">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center">
                  <Search className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-semibold">Deep Research</h3>
              </div>
              <p className="text-sm text-ink-400 leading-relaxed mb-4">
                Multi-agent competitive intelligence. Parallel search across Tavily, Product Hunt, and GitHub.
              </p>
              <div className="flex items-center gap-4 text-2xs text-ink-300">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ~60 sec</span>
                <span>4/day free</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-ink-100">
        <div className="max-w-3xl mx-auto flex items-center justify-between text-2xs text-ink-300">
          <span className="font-display text-sm italic text-ink-500">ShipOrSkip</span>
          <span>Built by Roshan · 2026</span>
        </div>
      </footer>
    </div>
  );
}
