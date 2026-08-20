"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { siteConfig } from "@/lib/site-config";

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

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden>
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.22-6.83-5.97 6.83H1.65l7.73-8.84L1.24 2.25h6.83l4.72 6.24Zm-1.16 17.52h1.83L7.02 4.13H5.06Z" />
    </svg>
  );
}

type OAuthProvider = "google" | "x";

// `signInWithOAuth` below does a full-page redirect to the provider — on
// success there's normally nothing left to clean up here, since the whole
// page unloads. But if the user cancels or hits the browser's Back button
// from the provider's consent screen, most browsers restore this page from
// the back-forward cache (bfcache) instead of reloading it: React state
// comes back exactly as it was mid-redirect, so `loadingProvider` is still
// set and the button that was clicked stays stuck on "Redirecting…",
// disabled, with no way to retry short of a manual refresh. No single
// signal for "we're back and the redirect didn't happen" is reliable across
// every browser, so three independent resets cover it: `pageshow` with
// `event.persisted` (the standard bfcache-restore signal), a `focus`
// fallback (covers engines where `persisted` isn't set consistently), and a
// timeout fallback (covers a redirect that silently never fires at all,
// e.g. a blocked popup or a provider misconfiguration).
const STUCK_LOADING_TIMEOUT_MS = 7000;

export function OAuthButtons({ redirectTo }: { redirectTo?: string }) {
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stuckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearStuckTimeout() {
    if (stuckTimeoutRef.current) {
      clearTimeout(stuckTimeoutRef.current);
      stuckTimeoutRef.current = null;
    }
  }

  function resetLoading() {
    clearStuckTimeout();
    setLoadingProvider(null);
  }

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) resetLoading();
    }
    function handleFocus() {
      resetLoading();
    }
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
      clearStuckTimeout();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetLoading/clearStuckTimeout only touch local state/refs, stable across renders.
  }, []);

  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setLoadingProvider(provider);

    clearStuckTimeout();
    stuckTimeoutRef.current = setTimeout(() => {
      setLoadingProvider(null);
    }, STUCK_LOADING_TIMEOUT_MS);

    try {
      const supabase = createClient();
      const params = new URLSearchParams();
      if (redirectTo) params.set("next", redirectTo);

      // Build the redirect from siteConfig.url — the canonical production
      // domain — rather than window.location.origin. window.location.origin
      // reflects whatever host actually served this page, which can be a
      // stale/legacy domain (e.g. the old *.vercel.app default domain, still
      // reachable and possibly indexed or bookmarked) rather than
      // www.avalonlabs-platform.com. Sending Google/X an authorized-but-wrong
      // redirect URI either breaks the OAuth flow outright or, if it happens
      // to be allowed, sends the user back through the wrong domain — both
      // undermine the branding consistency Google's OAuth verification
      // checks for. siteConfig.url is NEXT_PUBLIC_SITE_URL (inlined at build
      // time, safe to read client-side) normalized and validated by
      // normalizeSiteUrl(), with a known-good fallback if that env var is
      // ever missing or malformed in a given deployment.
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${siteConfig.url}/auth/callback?${params.toString()}`,
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        resetLoading();
      }
      // On success the browser navigates away to the provider — the timeout
      // and event listeners above are what unstick the button if that
      // navigation gets cancelled or reversed.
    } catch (err) {
      console.error("OAuth sign-in threw —", err);
      setError(err instanceof Error ? err.message : "Something went wrong starting sign-in.");
      resetLoading();
    }
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
        onClick={() => handleOAuth("x")}
        disabled={loadingProvider !== null}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-black px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <XIcon />
        {loadingProvider === "x" ? "Redirecting…" : "Continue with X"}
      </button>
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
