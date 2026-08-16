import { createInternalClient } from "@/lib/supabase/server-internal";
import { microserviceProducts } from "@/constants/pricing-tiers";
import { normalizeEmail } from "@/lib/normalize-email";

const COMPLETED_TRANSACTION_STATUS = "completed";
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export interface AgentAccess {
  hasActiveSubscription: boolean;
  subscriptionPriceId: string;
  hasStandalonePurchase: boolean;
  freeCredits: number;
}

/** Shared by /api/chat (real enforcement, fail-closed) and /api/agent-access
 *  (read-only, used by the pricing table / tool pages / dashboard to decide
 *  which CTA to show — never the actual access gate). */
export async function getAgentAccess(
  user: { id: string; email?: string | null },
  agentId: string
): Promise<AgentAccess> {
  const internal = createInternalClient();

  let hasActiveSubscription = false;
  let subscriptionPriceId = "";
  let hasStandalonePurchase = false;
  let freeCredits = 0;

  const { data: customer } = await internal
    .from("customers")
    .select("customer_id")
    .eq("email", normalizeEmail(user.email) ?? "")
    .single();

  if (customer) {
    const { data: subscription } = await internal
      .from("subscriptions")
      .select("subscription_status, price_id")
      .eq("customer_id", customer.customer_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    hasActiveSubscription =
      !!subscription && ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.subscription_status);
    subscriptionPriceId = subscription?.price_id ?? "";

    // No subscription? Fall back to checking whether this specific agent was
    // unlocked by a completed one-time SaaS Microservice purchase.
    if (!hasActiveSubscription) {
      const microservice = microserviceProducts.find((m) => m.agentId === agentId);
      if (microservice?.priceId) {
        const { data: purchase } = await internal
          .from("transactions")
          .select("transaction_id")
          .eq("customer_id", customer.customer_id)
          .eq("price_id", microservice.priceId)
          .eq("status", COMPLETED_TRANSACTION_STATUS)
          .limit(1)
          .maybeSingle();
        hasStandalonePurchase = !!purchase;
      }
    }
  }

  // Still no access via subscription or purchase? Fall back to the freemium
  // free-credit balance (see supabase/schema.sql `profiles`).
  if (!hasActiveSubscription && !hasStandalonePurchase) {
    const { data: profile } = await internal
      .from("profiles")
      .select("free_credits")
      .eq("id", user.id)
      .maybeSingle();
    freeCredits = profile?.free_credits ?? 0;
  }

  return { hasActiveSubscription, subscriptionPriceId, hasStandalonePurchase, freeCredits };
}
