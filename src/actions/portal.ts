"use server";

import { getPaddleInstance } from "@/lib/paddle/get-paddle-instance";
import { createInternalClient } from "@/lib/supabase/server-internal";
import { createClient } from "@/lib/supabase/server";

export async function createPortalSession() {
  // 1. Authenticate first — reject anonymous requests before any DB query or SDK call.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "Not authenticated" as const };
  }

  // 2. Resolve the Paddle customer_id server-side via the email bridge —
  //    never trust a client-supplied customer id here.
  const internal = createInternalClient();
  const { data: customerRow } = await internal
    .from("customers")
    .select("customer_id")
    .eq("email", user.email)
    .single();

  if (!customerRow?.customer_id) {
    return { error: "No Paddle customer" as const };
  }

  // 3. Include active subscription ids for per-subscription deep links (not used yet, but free).
  const { data: subRows } = await internal
    .from("subscriptions")
    .select("subscription_id")
    .eq("customer_id", customerRow.customer_id);

  const subscriptionIds = (subRows ?? []).map((r) => r.subscription_id);

  const paddle = getPaddleInstance();
  const session = await paddle.customerPortalSessions.create(customerRow.customer_id, subscriptionIds);

  // 4. Return only the redirect URL — never the raw session object.
  return { url: session.urls.general.overview };
}
