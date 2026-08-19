import { createClient } from "@/lib/supabase/server";
import { createInternalClient } from "@/lib/supabase/server-internal";
import { generateApiKey, hashApiKey, apiKeyPrefix } from "@/lib/api-keys";

const MAX_ACTIVE_KEYS_PER_USER = 10;

/** Lists the signed-in user's API keys — metadata only. key_hash is never
 *  selected, and the plaintext key was never stored to begin with, so
 *  there's nothing here that could leak a working credential. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const internal = createInternalClient();
  const { data, error } = await internal
    .from("api_keys")
    .select("id, label, key_prefix, created_at, last_used_at, revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("api-keys: list failed —", error);
    return Response.json({ error: "Unable to load API keys" }, { status: 500 });
  }

  return Response.json({ keys: data });
}

interface CreateApiKeyBody {
  label?: string;
}

/**
 * Mints a new API key for the signed-in user (see src/lib/api-keys.ts and
 * src/lib/auth-request.ts). Deliberately reachable only via the web app's
 * cookie session — never via getRequestUser or an existing API key — so a
 * stolen key can never mint a sibling key for itself.
 *
 * The plaintext key is returned exactly once, right here. Only its hash and
 * a display prefix are persisted (supabase/schema.sql); if the caller loses
 * it, there is no recovery path — they revoke it and mint a new one.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const internal = createInternalClient();
  const { count, error: countError } = await internal
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("revoked_at", null);

  if (countError) {
    console.error("api-keys: active-key count failed —", countError);
    return Response.json({ error: "Unable to create API key" }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_ACTIVE_KEYS_PER_USER) {
    return Response.json(
      { error: `You've reached the limit of ${MAX_ACTIVE_KEYS_PER_USER} active API keys — revoke one first.` },
      { status: 429 }
    );
  }

  let label = "Chrome Extension";
  try {
    const body: CreateApiKeyBody = await request.json();
    if (typeof body.label === "string" && body.label.trim()) {
      label = body.label.trim().slice(0, 100);
    }
  } catch {
    // No/invalid JSON body — fall back to the default label above.
  }

  const key = generateApiKey();
  const { data, error } = await internal
    .from("api_keys")
    .insert({
      user_id: user.id,
      key_hash: hashApiKey(key),
      key_prefix: apiKeyPrefix(key),
      label,
    })
    .select("id, label, key_prefix, created_at")
    .single();

  if (error || !data) {
    console.error("api-keys: create failed —", error);
    return Response.json({ error: "Unable to create API key" }, { status: 500 });
  }

  return Response.json({ ...data, key });
}
