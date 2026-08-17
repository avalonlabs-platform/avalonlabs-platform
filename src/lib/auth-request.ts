import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

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

/**
 * Resolves the authenticated user for either the web app (cookie session,
 * via middleware-refreshed Supabase SSR cookies) or a native client sending
 * `Authorization: Bearer <supabase_access_token>` (see mobile/lib/api.ts).
 * An explicitly-supplied but invalid Bearer token is treated as
 * unauthenticated rather than falling through to a cookie check — a client
 * that thinks it's sending credentials should never silently succeed via
 * some unrelated cookie instead.
 */
export async function getRequestUser(request: Request): Promise<User | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return getUserFromBearerToken(authHeader.slice("Bearer ".length));
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
