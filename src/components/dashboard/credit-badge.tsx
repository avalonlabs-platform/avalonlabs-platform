import { createClient } from "@/lib/supabase/server";
import { createInternalClient } from "@/lib/supabase/server-internal";
import { normalizeEmail } from "@/lib/normalize-email";

const DEFAULT_FREE_CREDITS = 3;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

/** Free-credit balance badge — only shown for users with no active subscription.
 *  Purely informational, so any lookup failure just hides the badge rather than
 *  erroring the whole dashboard layout (unlike /api/chat, which fails closed). */
export async function CreditBadge() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  let remaining: number | null = null;

  try {
    const internal = createInternalClient();
    const { data: customer } = await internal
      .from("customers")
      .select("customer_id")
      .eq("email", normalizeEmail(user.email) ?? "")
      .single();

    let hasActiveSubscription = false;
    if (customer) {
      const { data: subscription } = await internal
        .from("subscriptions")
        .select("subscription_status")
        .eq("customer_id", customer.customer_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      hasActiveSubscription =
        !!subscription && ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.subscription_status);
    }

    if (!hasActiveSubscription) {
      const { data: profile } = await internal
        .from("profiles")
        .select("free_credits")
        .eq("id", user.id)
        .maybeSingle();
      remaining = profile?.free_credits ?? 0;
    }
  } catch (error) {
    console.error("CreditBadge: lookup failed —", error);
  }

  if (remaining === null) return null;

  return (
    <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/70">
      Free Credits: {remaining}/{DEFAULT_FREE_CREDITS}
    </span>
  );
}
