"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden>
      <path d="M16.36 1.43c0 1.14-.42 2.2-1.1 2.99-.76.87-2 1.55-3.2 1.46-.14-1.1.42-2.26 1.1-2.99.78-.85 2.13-1.5 3.2-1.46ZM20.1 17.2c-.55 1.28-.82 1.85-1.53 2.98-1 1.56-2.41 3.5-4.16 3.52-1.55.02-1.95-1.02-4.05-1-2.1 0-2.55 1.02-4.1 1-1.75-.02-3.08-1.77-4.08-3.33-2.8-4.34-3.1-9.42-1.37-12.13 1.23-1.93 3.17-3.06 5-3.06 1.86 0 3.03 1.03 4.57 1.03 1.49 0 2.4-1.03 4.55-1.03 1.63 0 3.36.9 4.6 2.44-4.04 2.24-3.39 8.03.57 9.58Z" />
    </svg>
  );
}

export function OAuthButtons({ redirectTo }: { redirectTo?: string }) {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOAuth(provider: "google" | "apple") {
    setError(null);
    setLoadingProvider(provider);

    const supabase = createClient();
    const params = new URLSearchParams();
    if (redirectTo) params.set("next", redirectTo);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?${params.toString()}`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoadingProvider(null);
    }
    // On success the browser navigates away to the provider — nothing else to do here.
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => handleOAuth("google")}
        disabled={loadingProvider !== null}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <GoogleIcon />
        {loadingProvider === "google" ? "Redirecting…" : "Continue with Google"}
      </button>
      <button
        type="button"
        onClick={() => handleOAuth("apple")}
        disabled={loadingProvider !== null}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-black px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <AppleIcon />
        {loadingProvider === "apple" ? "Redirecting…" : "Continue with Apple"}
      </button>
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
