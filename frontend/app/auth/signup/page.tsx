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
  const { signUpWithEmail } = useAuth();
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
