import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createInternalClient } from "@/lib/supabase/server-internal";
import { API_KEY_PREFIX, hashApiKey } from "@/lib/api-keys";

/** Verifies an explicit access token against Supabase Auth (no cookies
 *  involved) — used for native/mobile clients that can't share the web
 *  app's cookie session. A plain anon-key client is enough: passing a
 *  token to `getUser` makes Supabase validate it server-side and return
 *  the user it belongs to, or an error if it's invalid/expired. */
async function getUserFromBearerToken(token: string): Promise<User | null> {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/** Verifies an `ak_live_...` API key (see src/lib/api-keys.ts and
 *  src/app/api/account/api-keys/ — used by clients that can't hold a
 *  Supabase session at all, like the Chrome extension). Looks up the key by
 *  its hash, rejects it if revoked, then resolves the same real Supabase
 *  `User` the cookie/Bearer-JWT paths return — every downstream tier/rate-
 *  limit/credit check in agent-access.ts and /api/chat applies unchanged,
 *  an API key is just another way to prove who's asking. */
async function getUserFromApiKey(key: string): Promise<User | null> {
  const internal = createInternalClient();

  const { data: apiKey } = await internal
    .from("api_keys")
    .select("id, user_id, revoked_at")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();

  if (!apiKey || apiKey.revoked_at) return null;

  try {
    await internal
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiKey.id);
  } catch (error) {
    // Usage tracking is best-effort — never block the actual request over it.
    console.error("auth-request: failed to update api_keys.last_used_at —", error);
  }

  const { data, error } = await internal.auth.admin.getUserById(apiKey.user_id);
  if (error || !data.user) return null;
  return data.user;
}

/**
 * Resolves the authenticated user for the web app (cookie session, via
 * middleware-refreshed Supabase SSR cookies), a native client sending
 * `Authorization: Bearer <supabase_access_token>` (see mobile/lib/api.ts),
 * or a client sending `Authorization: Bearer <ak_live_... api key>` (see
 * extension/background.js). The api-key prefix makes the two Bearer cases
 * unambiguous — a Supabase access token is a JWT and never starts with it.
 * An explicitly-supplied but invalid/revoked credential is treated as
 * unauthenticated rather than falling through to a cookie check — a client
 * that thinks it's sending credentials should never silently succeed via
 * some unrelated cookie instead.
 */
export async function getRequestUser(request: Request): Promise<User | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    return token.startsWith(API_KEY_PREFIX) ? getUserFromApiKey(token) : getUserFromBearerToken(token);
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
