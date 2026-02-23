"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Zap, Search, Clock } from "lucide-react";
import Link from "next/link";
import TextareaAutosize from 'react-textarea-autosize';

export default function Home() {
  const [idea, setIdea] = useState("");
  const router = useRouter();

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim()) return;
    const encoded = encodeURIComponent(idea);
    router.push(`/appgroup/dashboard?idea=${encoded}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAnalyze(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="layout-container h-16 flex items-center justify-between">
          <Link href="/" className="font-display text-2xl tracking-normal">
            <span className="text-green-600">Ship</span>Or<span className="text-accent">Skip</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/appgroup/dashboard" className="text-sm font-medium text-secondary hover:text-primary transition-colors">Dashboard</Link>
            <Link href="/auth/login" className="btn-primary text-xs py-2 px-5">Sign in</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-24 pb-12 lg:pt-32 lg:pb-16">
        <div className="layout-container flex flex-col items-center text-center">
          <div className="w-full max-w-[800px]">
            <h1 className="text-fluid-display mb-6 tracking-tight">
              Should you <span className="italic text-green-600 pr-0.5">ship</span> it
              <br />
              or <span className="italic text-accent pr-0.5">skip</span> it?
            </h1>

            <p className="text-xl text-secondary max-w-[50ch] mx-auto mb-12">
              Validate your idea before writing a single line of code. Get instant competitor analysis, market feedback, and a technical execution plan.
            </p>

            <form onSubmit={handleAnalyze} className="w-full max-w-[620px] mx-auto text-left relative">
              <div className="flex items-end gap-3 border-b border-border-strong group hover:border-accent focus-within:border-accent transition-all duration-300 pb-3">
                <TextareaAutosize
                  value={idea}
                  onChange={(e) => setIdea(e.target.value.slice(0, 500))}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your idea in a few sentences..."
                  minRows={1}
                  maxRows={5}
                  className="flex-grow bg-transparent resize-none focus:outline-none text-base placeholder:text-text-tertiary leading-relaxed pt-2 break-all"
                />
                <div className="flex items-center gap-4 shrink-0 pb-0.5">
                  <span className="text-xs text-text-tertiary tabular-nums">{idea.length}/500</span>
                  <button
                    type="submit"
                    disabled={!idea.trim()}
                    className="btn-primary py-2 px-4 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    Analyze <ArrowRight className="w-3.5 h-3.5 ml-2" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section-padding border-t border-border bg-background-sunken/30">
        <div className="layout-container">
          <div className="mb-16">
            <h2 className="text-fluid-title">How it works</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-12 lg:gap-20">
            {[
              { step: "01", title: "Describe your idea", desc: "Plain language. No pitch deck needed." },
              { step: "02", title: "AI researches the market", desc: "Searches across the web, Product Hunt, and GitHub." },
              { step: "03", title: "Get your verdict", desc: "Competitors, gaps, pros/cons, and a build plan." },
            ].map((item) => (
              <div key={item.step} className="group cursor-default">
                <p className="font-mono text-3xl font-light text-text-tertiary mb-6 transition-colors group-hover:text-primary">{item.step}</p>
                <div className="h-[1px] w-full bg-border mb-6 transition-colors group-hover:bg-primary" />
                <h3 className="text-lg font-medium mb-3">{item.title}</h3>
                <p className="text-secondary text-base leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two modes */}
      <section className="section-padding bg-background-raised border-t border-border">
        <div className="layout-container">
          <div className="mb-16">
            <h2 className="text-fluid-title">Two analysis modes</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
            <div className="card-minimal flex flex-col items-start hover:border-border-strong transition-colors">
              <div className="w-10 h-10 rounded-[2px] bg-background-sunken flex items-center justify-center mb-8 border border-border">
                <Zap className="w-4 h-4 text-secondary" />
              </div>
              <h3 className="text-xl font-medium mb-3">Fast Analysis</h3>
              <p className="text-base text-secondary leading-relaxed mb-10 flex-grow">
                Quick validation in 10-15 seconds. Single AI call with web search. Perfect for a gut check.
              </p>
              <div className="flex items-center gap-6 text-xs text-secondary font-mono bg-background px-4 py-2 border border-border rounded-[2px] w-full">
                <span className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> ~15 sec</span>
                <span>Unlimited</span>
              </div>
            </div>

            <div className="card-minimal flex flex-col items-start border-primary/20 hover:border-primary transition-colors">
              <div className="w-10 h-10 rounded-[2px] bg-primary flex items-center justify-center mb-8">
                <Search className="w-4 h-4 text-background" />
              </div>
              <h3 className="text-xl font-medium mb-3">Deep Research</h3>
              <p className="text-base text-secondary leading-relaxed mb-10 flex-grow">
                Multi-agent competitive intelligence. Parallel search across Tavily, Product Hunt, and GitHub.
              </p>
              <div className="flex items-center gap-6 text-xs text-secondary font-mono bg-background px-4 py-2 border border-border rounded-[2px] w-full">
                <span className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> ~60 sec</span>
                <span>4/day free</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="layout-container flex items-center justify-between text-xs text-secondary font-mono">
          <span className="font-display text-sm tracking-normal">
            <span className="text-green-600">Ship</span>Or<span className="text-accent">Skip</span>
          </span>
          <span>Built by Roshan · 2026</span>
        </div>
      </footer>
    </div>
  );
}
