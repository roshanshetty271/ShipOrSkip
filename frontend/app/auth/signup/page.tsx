"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Turnstile } from "@marsidev/react-turnstile";
import PasswordInput from "@/components/auth/PasswordInput";
import PasswordValidator, { usePasswordStrength } from "@/components/auth/PasswordValidator";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [token, setToken] = useState<string>("");
  const { signUpWithEmail, signInWithGoogle } = useAuth();
  const { allPassed: passwordValid } = usePasswordStrength(password);

  const router = useRouter();

  const passwordsMatch = confirmPassword === "" || confirmPassword === password;
  const canSubmit =
    !loading &&
    !!token &&
    password.length >= 8 &&
    passwordValid &&
    confirmPassword === password;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      await signUpWithEmail(email, password, token);

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.push("/appgroup/dashboard");
        return;
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || "Google sign in failed");
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

        {/* Google Sign-Up */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border rounded-md hover:bg-gray-50 transition-colors font-medium text-sm text-ink-900"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Sign up with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-border"></div>
          <span className="text-xs text-text-tertiary font-mono uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-border"></div>
        </div>

        {/* Email Sign-Up */}
        <form onSubmit={handleSignup} className="space-y-4">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input-field" required />

          <div>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 8 chars)"
              minLength={8}
            />
            <PasswordValidator password={password} />
          </div>

          <div>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-accent mt-1.5 flex items-center gap-1">
                <span>✕</span> Passwords do not match
              </p>
            )}
            {confirmPassword && passwordsMatch && confirmPassword.length > 0 && (
              <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                <span>✓</span> Passwords match
              </p>
            )}
          </div>

          <Turnstile
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
            onSuccess={setToken}
          />
          <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-secondary mt-8">
          Already have an account? <Link href="/auth/login" className="text-primary underline underline-offset-4 hover:text-accent transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
