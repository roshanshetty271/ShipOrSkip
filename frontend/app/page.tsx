"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Zap, Search, Clock, X } from "lucide-react";
import Link from "next/link";
import TextareaAutosize from 'react-textarea-autosize';
import { useAuth } from "@/hooks/use-auth";

export default function Home() {
  const [idea, setIdea] = useState("");
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const router = useRouter();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    setShowProfileMenu(false);
    router.push("/");
  };

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
    <div className="min-h-screen bg-background text-ink-900 font-sans flex flex-col">
      {/* 
        BRUTAL NAV
        No blur. No transition. Just a solid line and text. 
      */}
      <nav className="w-full brutal-border-b bg-background z-50">
        <div className="flex items-center justify-between h-14 px-4 sm:px-8">
          <Link href="/" className="font-display text-2xl tracking-tight leading-none pt-1">
            <span className="text-accent-green pr-[1px]">Ship</span>Or<span className="text-accent pl-[1px] font-sans font-bold tracking-tighter text-[0.8em] uppercase">Skip</span>
          </Link>
          <div className="flex items-center gap-6 font-mono text-xs uppercase tracking-[0.1em]">
            <button onClick={() => setIsFeaturesOpen(true)} className="hover:underline underline-offset-4 hidden sm:block uppercase tracking-[0.1em]">Features</button>
            {!user && <Link href="/appgroup/dashboard" className="hover:underline underline-offset-4">Dashboard</Link>}

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-ink-900 font-sans text-sm font-medium text-white hover:opacity-90 transition-opacity"
                >
                  {user.email?.[0]?.toUpperCase() || "?"}
                </button>
                {showProfileMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-white border border-ink-900 shadow-[4px_4px_0_0_rgba(17,17,16,1)] z-50 py-2 animate-fade-in font-sans normal-case tracking-normal">
                      <div className="px-4 py-2 border-b border-border/50">
                        <p className="text-sm font-medium text-ink-900 truncate">{user.email}</p>
                      </div>
                      <Link
                        href="/appgroup/dashboard"
                        className="block px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-background-raised hover:text-ink-900 transition-colors"
                        onClick={() => setShowProfileMenu(false)}
                      >
                        Dashboard
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-background-raised hover:text-accent transition-colors"
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link href="/auth/login" className="hover:bg-ink-900 hover:text-white transition-none px-3 py-1.5 border border-ink-900">Sign In</Link>
            )}
          </div>
        </div>
      </nav>

      {/* 
        FEATURES MODAL
      */}
      {isFeaturesOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-3xl bg-background border-[3px] border-ink-900 shadow-[8px_8px_0_0_rgba(17,17,16,1)] relative flex flex-col max-h-[90vh] overflow-hidden">

            <button
              onClick={() => setIsFeaturesOpen(false)}
              className="absolute top-4 right-4 z-50 text-ink-900 md:text-white bg-white md:bg-transparent md:hover:bg-white/10 hover:bg-gray-100 transition-colors p-1 border border-ink-900 md:border-transparent rounded-sm"
              aria-label="Close features"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Content - Two Columns */}
            <div className="flex flex-col md:flex-row overflow-y-auto">

              {/* Guest Column */}
              <div className="flex-1 p-6 md:p-8 md:border-r-[3px] border-border-strong border-b-[3px] md:border-b-0 bg-white relative pt-12 md:pt-8">
                <span className="inline-block px-3 py-1 bg-ink-900 text-white font-mono text-[10px] uppercase tracking-widest mb-6">
                  What you get now
                </span>
                <h3 className="font-display text-3xl mb-4 leading-none text-balance">Guest Access</h3>
                <p className="font-sans text-sm text-text-secondary leading-relaxed mb-8">
                  Try ShipOrSkip instantly without creating an account. Perfect for a quick validation check.
                </p>
                <ul className="space-y-4 font-mono text-xs uppercase tracking-widest text-ink-900">
                  <li className="flex items-start gap-3">
                    <Zap className="w-4 h-4 shrink-0 mt-0.5 text-text-tertiary" />
                    <span>3 Fast Analyses Total<br /><span className="text-[10px] text-text-tertiary normal-case tracking-normal">~15 sec turnaround</span></span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Search className="w-4 h-4 shrink-0 mt-0.5 text-text-tertiary" />
                    <span>1 Deep Research Total<br /><span className="text-[10px] text-text-tertiary normal-case tracking-normal">Multi-agent deep dive</span></span>
                  </li>
                  <li className="flex items-start gap-3 opacity-50">
                    <X className="w-4 h-4 shrink-0 mt-0.5 text-ink-900" />
                    <span className="line-through">Saved Idea Dashboard</span>
                  </li>
                  <li className="flex items-start gap-3 opacity-50">
                    <X className="w-4 h-4 shrink-0 mt-0.5 text-ink-900" />
                    <span className="line-through">Chat, PDF & Notes</span>
                  </li>
                </ul>
              </div>

              {/* Authenticated Column */}
              <div className="flex-1 p-6 md:p-8 bg-ink-900 text-white relative overflow-hidden pt-12 md:pt-8">
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent-green opacity-20 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2 pattern-grid-lg"></div>

                <span className="inline-block px-3 py-1 bg-accent-green text-white font-mono text-[10px] uppercase tracking-widest mb-6 relative z-10">
                  When you sign in
                </span>
                <h3 className="font-display text-3xl mb-4 leading-none text-balance relative z-10">Free Account</h3>
                <p className="font-sans text-sm text-gray-400 leading-relaxed mb-8 relative z-10">
                  Create a free account to unlock higher daily limits, save your research, and chat with your reports.
                </p>
                <ul className="space-y-4 font-mono text-xs uppercase tracking-widest text-white relative z-10">
                  <li className="flex items-start gap-3">
                    <Zap className="w-4 h-4 shrink-0 mt-0.5 text-accent-green" />
                    <span>10 Fast Analyses / Day<br /><span className="text-[10px] text-gray-400 normal-case tracking-normal">~15 sec turnaround</span></span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Search className="w-4 h-4 shrink-0 mt-0.5 text-accent-green" />
                    <span>3 Deep Researches / Day<br /><span className="text-[10px] text-gray-400 normal-case tracking-normal">Multi-agent deep dive</span></span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Clock className="w-4 h-4 shrink-0 mt-0.5 text-accent-green" />
                    <span>Saved Idea Dashboard<br /><span className="text-[10px] text-gray-400 normal-case tracking-normal">Track your portfolio easily</span></span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Clock className="w-4 h-4 shrink-0 mt-0.5 text-accent-green" />
                    <span>Chat, PDF & Notes<br /><span className="text-[10px] text-gray-400 normal-case tracking-normal">Analyze and export reports</span></span>
                  </li>
                </ul>
                <div className="mt-10 relative z-10">
                  {user ? (
                    <Link href="/appgroup/dashboard" className="btn-primary w-full bg-white text-ink-900 border-white hover:bg-transparent hover:text-white hover:border-white">
                      Go to Dashboard
                    </Link>
                  ) : (
                    <Link href="/auth/login" className="btn-primary w-full bg-white text-ink-900 border-white hover:bg-transparent hover:text-white hover:border-white">
                      Sign In Now
                    </Link>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 
        BRUTAL HERO
        Massive text. The input is not a box, it's just a line in the void.
      */}
      <main className="flex-grow flex flex-col">
        <section className="flex-grow flex flex-col justify-center px-4 sm:px-8 pt-24 pb-12 lg:pt-32 lg:pb-16 brutal-border-b relative overflow-hidden">
          {/* Subtle grid background for architectural feel */}
          <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

          <div className="w-full max-w-5xl mx-auto relative z-10 flex flex-col">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center w-full">
              {/* Value Proposition Column */}
              <div className="flex flex-col z-10 -mt-8 lg:-mt-16">
                <h1 className="text-fluid-display font-display leading-[0.9] tracking-[-0.04em] text-balance mb-10">
                  Should you <span className="text-accent-green italic pr-1">ship</span> it
                  <br />
                  or <span className="text-accent italic pr-1">skip</span> it?
                </h1>

                <div className="font-mono text-xs md:text-sm uppercase tracking-widest leading-loose text-ink-800 lg:border-l-[3px] border-accent lg:pl-8 pl-0">
                  <p className="font-bold text-ink-900 mb-4 inline-block bg-accent text-white px-4 py-2">
                    Stop building in the dark.
                  </p>
                  <p className="mt-2 text-text-secondary leading-relaxed normal-case tracking-normal font-sans text-base">
                    AI-powered validation for your next big idea. We analyze the market, find your true competitors, and tell you if it's worth your time—before you write a single line of code.
                  </p>
                  <ul className="mt-8 space-y-4 text-xs font-bold text-ink-900">
                    <li className="flex items-center gap-3"><Zap className="w-4 h-4 text-accent-green" /> Deep competitor research</li>
                    <li className="flex items-center gap-3"><Search className="w-4 h-4 text-accent-green" /> Brutally honest market feedback</li>
                    <li className="flex items-center gap-3"><Clock className="w-4 h-4 text-accent-green" /> Actionable technical execution steps</li>
                  </ul>
                </div>
              </div>

              {/* Input Column */}
              <div className="w-full relative z-20 mt-8 lg:mt-0">
                <div className="absolute top-4 left-4 w-full h-full bg-ink-900 z-0 hidden md:block"></div>
                <div className="bg-white border-[3px] border-ink-900 relative z-10 flex flex-col shadow-xl md:shadow-none">
                  <div className="bg-gray-100 border-b-[3px] border-ink-900 py-3 px-6 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-widest font-bold flex items-center gap-2"><Zap className="w-3 h-3 text-accent-green fill-accent-green" /> Idea Validation Engine</span>
                    <span className={`tabular-nums font-mono text-[10px] uppercase tracking-widest ${idea.length > 450 ? 'text-accent font-bold' : 'text-text-tertiary'}`}>
                      {String(idea.length).padStart(3, '0')}/500
                    </span>
                  </div>
                  <form onSubmit={handleAnalyze} className="flex flex-col p-6 group">
                    <TextareaAutosize
                      value={idea}
                      onChange={(e) => setIdea(e.target.value.slice(0, 500))}
                      onKeyDown={handleKeyDown}
                      placeholder="Describe your app, tool, or service idea in detail..."
                      minRows={3}
                      maxRows={6}
                      className="w-full bg-transparent font-sans text-lg lg:text-xl leading-relaxed text-ink-900 focus:outline-none transition-colors placeholder:text-text-tertiary resize-none outline-none selection:bg-accent-green selection:text-white"
                      autoFocus
                    />

                    <div className="flex items-center justify-end mt-8 pt-4 border-t-2 border-dashed border-gray-200">
                      <button
                        type="submit"
                        disabled={!idea.trim()}
                        className="btn-primary h-12 w-full md:w-auto px-8 flex items-center justify-center gap-3 disabled:opacity-0 group-focus-within:bg-accent-green group-focus-within:border-accent-green group-focus-within:text-white transition-all duration-300"
                      >
                        Analyze Idea <ArrowRight className="w-4 h-4 group-focus-within:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 
          PREMIUM FEATURES LIST
        */}
        <section className="w-full bg-white relative py-16 lg:py-20">
          {/* Subtle top border for separation */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-border-strong/20 to-transparent"></div>

          <div className="max-w-4xl mx-auto px-6 sm:px-8">
            <div className="text-center mb-12">
              <span className="inline-block px-3 py-1 bg-accent-green/10 text-accent-green font-mono text-[10px] uppercase tracking-[0.2em] mb-6 rounded-full border border-accent-green/20">
                Core Capabilities
              </span>
              <h2 className="font-display text-5xl md:text-6xl text-ink-900 tracking-tight leading-none mb-6">
                Everything you need to validate.
              </h2>
              <p className="font-sans text-text-secondary text-lg max-w-2xl mx-auto">
                A powerful suite of intelligent tools designed to give you absolute clarity before you commit to building your next product.
              </p>
            </div>

            <div className="flex flex-col gap-6">
              {/* Feature 1 */}
              <div className="group relative bg-background-raised border border-border/50 p-8 md:p-10 hover:border-accent-green/30 transition-all duration-500 overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-accent-green scale-y-0 group-hover:scale-y-100 origin-top transition-transform duration-500 ease-out"></div>
                <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-12">
                  <div className="flex bg-white w-14 h-14 items-center justify-center shrink-0 border border-border shadow-sm">
                    <Zap className="w-6 h-6 text-ink-900 group-hover:text-accent-green transition-colors" />
                  </div>
                  <div>
                    <h3 className="font-display text-3xl text-ink-900 mb-2">Instant AI Market Validation</h3>
                    <p className="font-sans text-text-secondary leading-relaxed">
                      Run a fast analysis in 15 seconds to gauge immediate market interest, target audience viability, and potential roadblocks.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="group relative bg-background-raised border border-border/50 p-8 md:p-10 hover:border-accent/30 transition-all duration-500 overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-accent scale-y-0 group-hover:scale-y-100 origin-top transition-transform duration-500 ease-out"></div>
                <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-12">
                  <div className="flex bg-white w-14 h-14 items-center justify-center shrink-0 border border-border shadow-sm">
                    <Search className="w-6 h-6 text-ink-900 group-hover:text-accent transition-colors" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-display text-3xl text-ink-900">Deep Competitor Intelligence</h3>
                      <span className="font-mono text-[9px] uppercase tracking-widest bg-ink-900 text-white px-2 py-0.5">Deep Research</span>
                    </div>
                    <p className="font-sans text-text-secondary leading-relaxed">
                      Multi-agent systems scour the web, Product Hunt, and GitHub to find obscure competitors and analyze their feature gaps.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="group relative bg-background-raised border border-border/50 p-8 md:p-10 hover:border-accent-green/30 transition-all duration-500 overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-accent-green scale-y-0 group-hover:scale-y-100 origin-top transition-transform duration-500 ease-out"></div>
                <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-12">
                  <div className="flex bg-white w-14 h-14 items-center justify-center shrink-0 border border-border shadow-sm">
                    <Clock className="w-6 h-6 text-ink-900 group-hover:text-accent-green transition-colors" />
                  </div>
                  <div>
                    <h3 className="font-display text-3xl text-ink-900 mb-2">Actionable Build Plans</h3>
                    <p className="font-sans text-text-secondary leading-relaxed">
                      Receive comprehensive technical recommendations, database schemas, and architectural outlines to accelerate your development.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="group relative bg-background-raised border border-border/50 p-8 md:p-10 hover:border-accent/30 transition-all duration-500 overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-accent scale-y-0 group-hover:scale-y-100 origin-top transition-transform duration-500 ease-out"></div>
                <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-12">
                  <div className="flex w-14 h-14 items-center justify-center shrink-0 bg-ink-900">
                    <ArrowRight className="w-6 h-6 text-white group-hover:translate-x-1 group-hover:text-accent transition-all" />
                  </div>
                  <div>
                    <h3 className="font-display text-3xl text-ink-900 mb-2">Interactive Research Chat</h3>
                    <p className="font-sans text-text-secondary leading-relaxed">
                      Talk directly to your generated research reports. Ask follow-up questions, request specific pivots, and export findings to PDF.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>
      </main>

      {/* 
        BRUTAL FOOTER
      */}
      <footer className="brutal-border-t p-4 sm:px-8 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-ink-900 bg-background">
        <span>ShipOrSkip © {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
