import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Only allow same-origin relative paths for the post-auth redirect — a bare
 *  "/foo", never "//evil.com" (protocol-relative) or "https://evil.com"
 *  (absolute), either of which would otherwise send a just-authenticated
 *  user straight off-site since `next` comes from an attacker-controllable
 *  query string. */
function isSafeRedirectPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}

/** Exchanges the `code` param for a session — used by Google/X OAuth redirects and by
 *  password-recovery email links (both land here before continuing to `next`). */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  const next = rawNext && isSafeRedirectPath(rawNext) ? rawNext : "/dashboard";

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
