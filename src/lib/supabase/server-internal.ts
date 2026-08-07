import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for trusted server contexts only (webhook
 * handlers, background jobs). Bypasses Row Level Security — never import
 * this from user-facing routes or Server Components. Use
 * `@/lib/supabase/server` for anything running on behalf of a logged-in user.
 */
export function createInternalClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}
