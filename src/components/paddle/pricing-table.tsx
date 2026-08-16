"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePaddle } from "@/hooks/use-paddle";
import { usePaddlePrices } from "@/hooks/use-paddle-prices";
import { useAgentAccess } from "@/hooks/use-agent-access";
import { pricingTiers, microserviceProducts } from "@/constants/pricing-tiers";
import { siteConfig } from "@/lib/site-config";

type Frequency = "month" | "year";

/** Swaps to "Already Unlocked" once the signed-in user has this agent via an
 *  active subscription or a prior one-time purchase, instead of always
 *  offering a redundant "Buy once". Defaults to the buy button while the
 *  check resolves (or for signed-out visitors) to avoid layout flicker. */
function MicroserviceBuyButton({ agentId, onBuy }: { agentId: string; onBuy: () => void }) {
  const access = useAgentAccess(agentId);

  if (access === "has-access") {
    return (
      <Link
        href={`/dashboard?agent=${agentId}`}
        className="ml-4 flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
      >
        <span aria-hidden>✓</span> Already Unlocked
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onBuy}
      className="ml-4 shrink-0 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/90 transition-colors hover:bg-white/5"
    >
      Buy once
    </button>
  );
}

export function PricingTable({ country = "OTHERS" }: { country?: string }) {
  const [frequency, setFrequency] = useState<Frequency>("month");
  const paddle = usePaddle();
  const { prices, loading } = usePaddlePrices(paddle, country);

  function openCheckout(priceId: string) {
    if (!priceId) {
      window.location.assign(`mailto:${siteConfig.supportEmail}?subject=Plan%20inquiry`);
      return;
    }
    paddle?.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      settings: { variant: "one-page" },
    });
  }

  return (
    <section id="pricing" className="relative overflow-hidden py-24">
      <div aria-hidden className="absolute inset-0 -z-10 bg-grid" />

      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-sm font-semibold tracking-wide text-indigo-400 uppercase">Pricing</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Plans for individuals, businesses, and enterprises
          </p>
          <p className="mt-4 text-lg text-white/60">
            Subscribe for ongoing access to AI Agents, or buy a SaaS Microservice once.
            Debit/Credit Card, PayPal, Google Pay — all handled securely through Paddle.
          </p>
        </motion.div>

        <div className="mt-10 flex justify-center">
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
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
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

        <div className="mt-20">
          <h3 className="text-center text-xl font-semibold text-white">One-time SaaS Microservices</h3>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-white/60">
            No subscription needed — pay once for a focused automated AI task.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {microserviceProducts.map((product, i) => (
              <motion.div
                key={product.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl transition-colors hover:border-white/20"
              >
                <div>
                  <p className="font-medium text-white">{product.name}</p>
                  <p className="mt-1 text-sm text-white/60">{product.description}</p>
                </div>
                <MicroserviceBuyButton
                  agentId={product.agentId}
                  onBuy={() => openCheckout(product.priceId)}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
