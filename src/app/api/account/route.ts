import { createInternalClient } from "@/lib/supabase/server-internal";
import { getRequestUser } from "@/lib/auth-request";
import { normalizeEmail } from "@/lib/normalize-email";
import { pricingTiers } from "@/constants/pricing-tiers";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function tierNameForPriceId(priceId: string): string | null {
  const tier = pricingTiers.find((t) => t.priceId.month === priceId || t.priceId.year === priceId);
  return tier?.name ?? null;
}

/** Account overview for the mobile Dashboard tab (and any other client that
 *  needs tier/credits without the full per-agent access-gate logic in
 *  src/lib/agent-access.ts). Read-only — never grants anything itself. */
export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const internal = createInternalClient();
    const { data: customer } = await internal
      .from("customers")
      .select("customer_id")
      .eq("email", normalizeEmail(user.email) ?? "")
      .single();

    let subscription: { status: string; tier: string | null; priceId: string } | null = null;

    if (customer) {
      const { data: sub } = await internal
        .from("subscriptions")
        .select("subscription_status, price_id")
        .eq("customer_id", customer.customer_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sub && ACTIVE_SUBSCRIPTION_STATUSES.has(sub.subscription_status)) {
        subscription = {
          status: sub.subscription_status,
          tier: tierNameForPriceId(sub.price_id),
          priceId: sub.price_id,
        };
      }
    }

    const { data: profile } = await internal
      .from("profiles")
      .select("free_credits")
      .eq("id", user.id)
      .maybeSingle();

    return Response.json({
      email: user.email,
      subscription,
      freeCredits: profile?.free_credits ?? 0,
    });
  } catch (error) {
    console.error("account: lookup failed —", error);
    return Response.json({ error: "Unable to load account" }, { status: 500 });
  }
}
