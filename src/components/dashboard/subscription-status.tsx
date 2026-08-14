import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createInternalClient } from "@/lib/supabase/server-internal";
import { pricingTiers } from "@/constants/pricing-tiers";
import { ManageSubscriptionButton } from "@/components/dashboard/manage-subscription-button";

function planLabelForPriceId(priceId: string): string {
  for (const tier of pricingTiers) {
    if (tier.priceId.month === priceId) return `${tier.name} (Monthly)`;
    if (tier.priceId.year === priceId) return `${tier.name} (Yearly)`;
  }
  return "Custom plan";
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  trialing: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  past_due: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  paused: "bg-white/10 text-white/60 ring-white/20",
  canceled: "bg-white/10 text-white/40 ring-white/20",
};

export async function SubscriptionStatus() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  let subscription: { subscription_status: string; price_id: string } | null = null;
  let unavailable = false;

  try {
    const internal = createInternalClient();
    const { data: customer } = await internal
      .from("customers")
      .select("customer_id")
      .eq("email", user.email)
      .single();

    subscription = customer
      ? (
          await internal
            .from("subscriptions")
            .select("subscription_status, price_id")
            .eq("customer_id", customer.customer_id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data
      : null;
  } catch (error) {
    // Most commonly SUPABASE_SERVICE_ROLE_KEY missing in this environment
    // (e.g. local dev, where only Vercel has the production secret).
    console.error("SubscriptionStatus: billing lookup failed —", error);
    unavailable = true;
  }

  if (unavailable) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm font-medium text-white">Billing info unavailable</p>
        <p className="mt-1 text-sm text-white/50">
          Couldn&apos;t load your plan right now — check server logs for details.
        </p>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm font-medium text-white">No active plan</p>
        <p className="mt-1 text-sm text-white/50">Subscribe to unlock full access to your AI Agents.</p>
        <Link
          href="/#pricing"
          className="mt-4 inline-block rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          View plans
        </Link>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[subscription.subscription_status] ?? STATUS_STYLES.paused;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs font-medium tracking-wide text-white/40 uppercase">Current plan</p>
      <div className="mt-2 flex items-center gap-2">
        <p className="text-lg font-semibold text-white">{planLabelForPriceId(subscription.price_id)}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusStyle}`}>
          {subscription.subscription_status}
        </span>
      </div>
      <div className="mt-4">
        <ManageSubscriptionButton />
      </div>
    </div>
  );
}
