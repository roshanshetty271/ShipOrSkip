"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Turnstile } from "@marsidev/react-turnstile";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string>("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithEmail } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signInWithEmail(email, password, token);
      const returnTo = searchParams.get("returnTo") || "/appgroup/dashboard";
      router.push(returnTo);
    } catch (err: any) {
      setError(err.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-2xl tracking-normal block text-center mb-10 text-primary">
          <span className="text-green-600">Ship</span>Or<span className="text-accent">Skip</span>
        </Link>

        {error && <p className="text-sm text-accent text-center mb-4">{error}</p>}

        <form onSubmit={handleLogin} className="space-y-4">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input-field" required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="input-field" required />
          <Turnstile
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
            onSuccess={setToken}
          />
          <button type="submit" disabled={loading || !token} className="btn-primary w-full">{loading ? "Signing in..." : "Sign in"}</button>
        </form>

        <p className="text-center text-sm text-secondary mt-8">
          No account? <Link href="/auth/signup" className="text-primary underline underline-offset-4 hover:text-accent transition-colors">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
