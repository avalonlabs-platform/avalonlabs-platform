"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePaddle } from "@/hooks/use-paddle";
import { usePaddlePrices } from "@/hooks/use-paddle-prices";
import { useAgentAccess } from "@/hooks/use-agent-access";
import { useSupabaseUser } from "@/hooks/use-supabase-user";
import { pricingTiers, microserviceProducts } from "@/constants/pricing-tiers";
import { siteConfig } from "@/lib/site-config";

type Frequency = "month" | "year";

/** Swaps to "Already Unlocked" once the signed-in user has this agent via an
 *  active subscription or a prior one-time purchase, instead of always
 *  offering a redundant "Buy once". */
function MicroserviceBuyButton({ agentId, onBuy }: { agentId: string; onBuy: () => void }) {
  const access = useAgentAccess(agentId);

  if (access === "loading") {
    return <div className="h-9 w-28 shrink-0 animate-pulse rounded-full bg-white/5" />;
  }

  if (access === "has-access") {
    return (
      <Link
        href={`/dashboard?agent=${agentId}`}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
      >
        <span aria-hidden>✓</span> Already Unlocked
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onBuy}
      className="shrink-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
    >
      Get my report
    </button>
  );
}

export function PricingTable({ country = "OTHERS" }: { country?: string }) {
  const [frequency, setFrequency] = useState<Frequency>("month");
  const paddle = usePaddle();
  const { prices, loading } = usePaddlePrices(paddle, country);
  const user = useSupabaseUser();

  function openCheckout(priceId: string) {
    if (!priceId) {
      window.location.assign(`mailto:${siteConfig.supportEmail}?subject=Plan%20inquiry`);
      return;
    }
    paddle?.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      settings: { variant: "one-page" },
      // Anonymous visitors can still check out — Paddle collects their email
      // directly and the webhook links it up later. Signed-in visitors get
      // it pre-filled and echoed back in custom_data, so the webhook doesn't
      // have to guess or make an extra API call.
      ...(user && {
        customer: { email: user.email },
        customData: { userId: user.id, userEmail: user.email },
      }),
    });
  }

  return (
    <section id="pricing" className="relative overflow-hidden py-24">
      <div aria-hidden className="absolute inset-0 -z-10 bg-grid" />

      <div className="mx-auto max-w-6xl px-6">
        {/* Was `whileInView` gated behind a viewport IntersectionObserver
            with a -100px margin — fine for a section a visitor scrolls down
            to, but this section is also the target of direct "/#pricing"
            links (nav, hero "View plans", shared links). Landing there puts
            it in the viewport before the observer's margin is satisfied, so
            `once: true` could end up never firing and the section sat at
            opacity: 0 for several seconds (observed ~8s) instead of the
            intended sub-second fade. Animating on mount instead removes
            that dependency entirely — it now always plays once, immediately,
            regardless of how the section was reached. */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-sm font-semibold tracking-wide text-indigo-400 uppercase">Pricing</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Start with one problem. One flat price.
          </p>
          <p className="mt-4 text-lg text-white/60">
            Buy a one-time Specialist Report — no subscription, no commitment. Need it running on
            every problem, ongoing? Subscribe below instead. Debit/Credit Card, PayPal, Google
            Pay — all handled securely through Paddle.
          </p>
        </motion.div>

        {/* One-time Specialist Reports — Track B's primary paid CTA, moved
            above the subscription tiers (previously rendered last, under the
            heading "One-time SaaS Microservices"). Cold, no-trust traffic
            gets a flat price for the one problem they came for, with no
            recurring-commitment decision in the way. */}
        <div className="mt-12">
          <span className="mx-auto mb-3 block w-fit rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1 text-center text-xs font-semibold text-white">
            Start here
          </span>
          <h3 className="text-center text-xl font-semibold text-white">One-Time Specialist Reports</h3>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-white/60">
            Paste your problem, get a full expert analysis back in minutes — pay once, keep it forever.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {microserviceProducts.map((product, i) => {
              const formatted = prices[product.priceId];
              return (
                <motion.div
                  key={product.name}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="flex flex-col rounded-xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl transition-colors hover:border-white/20"
                >
                  <p className="text-xs font-medium tracking-wide text-glow-cyan uppercase">{product.tagline}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{product.name}</p>
                  <p className="mt-1 text-sm text-white/60">{product.description}</p>
                  <div className="mt-4 flex flex-1 items-end justify-between gap-4">
                    <p className="text-2xl font-bold text-white">{loading || !formatted ? "…" : formatted}</p>
                    <MicroserviceBuyButton agentId={product.agentId} onBuy={() => openCheckout(product.priceId)} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="mx-auto mt-20 max-w-2xl text-center">
          <h3 className="text-xl font-semibold text-white">Need it running continuously?</h3>
          <p className="mt-2 text-sm text-white/60">
            Subscribe for unlimited runs across every specialist tool, plus team seats and priority
            support.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
            {(["month", "year"] as Frequency[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFrequency(f)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  frequency === f
                    ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {f === "month" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {pricingTiers.map((tier, i) => {
            const priceId = tier.priceId[frequency];
            const formatted = prices[priceId];

            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className={`relative flex flex-col rounded-2xl border p-8 backdrop-blur-xl transition-colors ${
                  tier.featured
                    ? "border-indigo-400/40 bg-white/[0.05] shadow-xl shadow-indigo-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                {tier.featured && (
                  <span className="mb-4 inline-block w-fit rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1 text-xs font-semibold text-white">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
                <p className="mt-1 text-sm text-white/40">{tier.audience}</p>
                <p className="mt-4 text-sm text-white/60">{tier.description}</p>

                <div className="mt-6">
                  <p className="text-3xl font-bold text-white">
                    {loading || !formatted ? "…" : formatted}
                    <span className="text-base font-normal text-white/40">/{frequency}</span>
                  </p>
                  {/* The trial itself already exists in Paddle and shows up
                      correctly at checkout ($0 due today) — it just wasn't
                      surfaced anywhere before that, so a visitor scanning
                      the cards only ever saw "$10/month" and had no reason
                      to click through to discover it's free up front. */}
                  {tier.trialDays && (
                    <p className="mt-1 text-sm font-medium text-emerald-400">
                      Includes {tier.trialDays}-Day Free Trial ($0 due today)
                    </p>
                  )}
                </div>

                <ul className="mt-6 flex-1 space-y-3 text-sm text-white/60">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span aria-hidden className="text-glow-cyan">
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => openCheckout(priceId)}
                  className={`mt-8 rounded-full px-4 py-2.5 text-center text-sm font-semibold transition-opacity hover:opacity-90 ${
                    tier.featured
                      ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white"
                      : "border border-white/15 text-white/90 hover:bg-white/5"
                  }`}
                >
                  Subscribe
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}