import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Exchanges the `code` param for a session — used by Google/X OAuth redirects and by
 *  password-recovery email links (both land here before continuing to `next`). */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("OAuth callback: exchangeCodeForSession failed —", error.message, error);
  } else {
    console.error("OAuth callback: no `code` param on the request", request.url);
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
