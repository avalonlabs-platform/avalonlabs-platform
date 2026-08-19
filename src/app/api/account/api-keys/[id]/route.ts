import { createClient } from "@/lib/supabase/server";
import { createInternalClient } from "@/lib/supabase/server-internal";

/** Revokes one of the signed-in user's API keys. Sets revoked_at rather
 *  than deleting the row, so created_at/last_used_at history survives in
 *  the user's own key list. Only reachable via the web app's cookie
 *  session, same reasoning as POST /api/account/api-keys. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const internal = createInternalClient();
  // This is the service-role client, so RLS isn't what stops one user from
  // revoking another's key by guessing an id — the explicit .eq("user_id", ...)
  // filter is, same as every other user-scoped internal-client query in this
  // codebase (see src/lib/agent-access.ts, src/app/api/account/route.ts).
  const { data, error } = await internal
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("api-keys: revoke failed —", error);
    return Response.json({ error: "Unable to revoke API key" }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "API key not found (or already revoked)" }, { status: 404 });
  }

  return Response.json({ revoked: true });
}
