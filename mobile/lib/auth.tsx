import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Linking } from "react-native";
import type { Session } from "@supabase/supabase-js";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { supabase } from "./supabase";

// Always include a path so the redirect URI has a real path segment
// (exp://host:port/--/auth/callback, or avalonlabs://auth/callback outside
// Expo Go) rather than a bare host:port — some allowlist matchers only
// treat a "**" wildcard as matching path segments, not a pathless origin.
const OAUTH_REDIRECT_PATH = "auth/callback";

async function applyTokensFromUrl(url: string): Promise<{ error: string | null } | null> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) return { error: errorCode };
  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) return null;

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  return { error: error?.message ?? null };
}

export type OAuthProvider = "google" | "x";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirm: boolean }>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    // Fallback path: the OS can deliver the OAuth redirect as a deep link
    // even if WebBrowser.openAuthSessionAsync's own promise never resolves
    // (observed on some Android/Custom-Tabs combinations). Harmless no-op
    // for any URL that isn't carrying auth tokens.
    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      applyTokensFromUrl(url);
    });

    return () => {
      subscription.subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null, needsEmailConfirm: !error && !data.session };
  }

  // Redirects back into the running Expo Go instance during dev (exp://<host>/--/...),
  // or the "avalonlabs://" scheme in a standalone/dev-client build. This URL must be
  // added to Supabase's Auth > URL Configuration > Redirect URLs allowlist.
  async function signInWithOAuth(provider: OAuthProvider) {
    // Explicit `scheme` is a no-op in Expo Go (it isn't one of Expo Go's own
    // recognized schemes, so expo-linking silently falls back to "exp"), and
    // becomes the real deep-link scheme in a dev-client/standalone build.
    const redirectTo = makeRedirectUri({ scheme: "avalonlabs", path: OAUTH_REDIRECT_PATH });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { error: error.message };
    if (!data.url) return { error: "No sign-in URL returned." };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === "cancel" || result.type === "dismiss") {
      return { error: null };
    }
    if (result.type !== "success") {
      return { error: `Sign-in didn't complete (${result.type}).` };
    }

    const applied = await applyTokensFromUrl(result.url);
    if (!applied) return { error: "Signed in, but no tokens came back in the redirect." };
    return applied;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signUp, signInWithOAuth, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
