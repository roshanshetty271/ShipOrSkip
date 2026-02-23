"use client";

import { useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // TODO: Supabase signup
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-2xl italic block text-center mb-10">ShipOrSkip</Link>

        <form onSubmit={handleSignup} className="space-y-4">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input-field" required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 8 chars)" className="input-field" minLength={8} required />
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Creating account..." : "Create account"}</button>
        </form>

        <p className="text-center text-sm text-ink-400 mt-6">
          Already have an account? <Link href="/auth/login" className="text-ink underline underline-offset-4">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
