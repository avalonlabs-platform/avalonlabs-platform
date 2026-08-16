"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

/** Reads a query param without next/navigation's useSearchParams, which requires a
 * Suspense boundary for static generation — avoided here after that pattern
 * produced a route-specific 404 on Vercel's build (isolated to the login page). */
function getQueryParam(name: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get(name) ?? undefined;
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push(getQueryParam("next") ?? "/dashboard");
      router.refresh();
      return;
    }

    // No session back means email confirmation is required before login.
    setCheckEmail(true);
    setLoading(false);
  }

  if (checkEmail) {
    return (
      <div className="mx-auto max-w-sm px-6 py-24 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white">Check your email</h1>
        <p className="mt-3 text-sm text-white/60">
          We sent a confirmation link to <span className="text-white">{email}</span>. Click it to
          activate your account, then log in.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/5"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-2xl font-bold tracking-tight text-white">Create your account</h1>
      <p className="mt-2 text-sm text-white/50">Get access to your AI Agents dashboard.</p>

      <div className="mt-8">
        <OAuthButtons redirectTo={getQueryParam("next")} />
      </div>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-xs text-white/40">or</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-white/80">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-indigo-400/50 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-white/80">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-indigo-400/50 focus:outline-none"
          />
          <p className="mt-1 text-xs text-white/40">At least 6 characters.</p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/50">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-indigo-400 hover:text-indigo-300">
          Log in
        </Link>
      </p>
    </div>
  );
}
