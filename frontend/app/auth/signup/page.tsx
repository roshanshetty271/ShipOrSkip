"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Turnstile } from "@marsidev/react-turnstile";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [token, setToken] = useState<string>("");
  const { signUpWithEmail } = useAuth();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signUpWithEmail(email, password, token);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-background">
        <div className="w-full max-w-sm text-center">
          <Link href="/" className="font-display text-2xl tracking-normal block mb-10 text-primary">
            <span className="text-green-600">Ship</span>Or<span className="text-accent">Skip</span>
          </Link>
          <p className="text-base text-secondary mb-4">Check your email to confirm your account.</p>
          <Link href="/auth/login" className="text-sm font-medium text-primary underline underline-offset-4 hover:text-accent transition-colors">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-2xl tracking-normal block text-center mb-10 text-primary">
          <span className="text-green-600">Ship</span>Or<span className="text-accent">Skip</span>
        </Link>

        {error && <p className="text-sm text-accent text-center mb-4">{error}</p>}

        <form onSubmit={handleSignup} className="space-y-4">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input-field" required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 8 chars)" className="input-field" minLength={8} required />
          <Turnstile
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
            onSuccess={setToken}
          />
          <button type="submit" disabled={loading || !token} className="btn-primary w-full">{loading ? "Creating account..." : "Create account"}</button>
        </form>

        <p className="text-center text-sm text-secondary mt-8">
          Already have an account? <Link href="/auth/login" className="text-primary underline underline-offset-4 hover:text-accent transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
