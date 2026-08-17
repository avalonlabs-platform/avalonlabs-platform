import { createInternalClient } from "@/lib/supabase/server-internal";
import { microserviceProducts, pricingTiers } from "@/constants/pricing-tiers";
import { normalizeEmail } from "@/lib/normalize-email";

const COMPLETED_TRANSACTION_STATUS = "completed";
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
// Starter doesn't include the standalone SaaS Microservices (SQL Optimizer,
// Security Auditor, Code Explainer, API Analyzer) — those still need Pro/
// Advanced or a one-time purchase of that specific tool. Pro and Advanced
// include all of them.
const TIERS_INCLUDING_ALL_MICROSERVICES = new Set(["pro", "advanced"]);

export interface AgentAccess {
  /** True if the user has any active/trialing subscription at all — used
   *  for rate-limit tier, independent of whether it covers this agent. */
  hasActiveSubscription: boolean;
  subscriptionPriceId: string;
  /** True if the subscription itself covers this specific agent (see
   *  TIERS_INCLUDING_ALL_MICROSERVICES) — this, not hasActiveSubscription,
   *  is what should gate access to a given agent. */
  subscriptionGrantsThisAgent: boolean;
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
  let subscriptionGrantsThisAgent = false;
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

    if (hasActiveSubscription) {
      const isMicroserviceAgent = microserviceProducts.some((m) => m.agentId === agentId);
      const tier = pricingTiers.find(
        (t) => t.priceId.month === subscriptionPriceId || t.priceId.year === subscriptionPriceId
      );
      // General agents (not sold as a standalone microservice) are covered by
      // every tier, including Starter. Microservice-linked agents need Pro/
      // Advanced — Starter (or an unrecognized/legacy price) doesn't cover them.
      subscriptionGrantsThisAgent =
        !isMicroserviceAgent || (!!tier && TIERS_INCLUDING_ALL_MICROSERVICES.has(tier.id));
    }

    // Subscription doesn't cover this agent? Fall back to checking whether
    // it was unlocked by a completed one-time SaaS Microservice purchase.
    if (!subscriptionGrantsThisAgent) {
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
  if (!subscriptionGrantsThisAgent && !hasStandalonePurchase) {
    const { data: profile } = await internal
      .from("profiles")
      .select("free_credits")
      .eq("id", user.id)
      .maybeSingle();
    freeCredits = profile?.free_credits ?? 0;
  }

  return {
    hasActiveSubscription,
    subscriptionPriceId,
    subscriptionGrantsThisAgent,
    hasStandalonePurchase,
    freeCredits,
  };
}
