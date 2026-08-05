"use client";

import { useState } from "react";
import { usePaddle } from "@/hooks/use-paddle";
import { usePaddlePrices } from "@/hooks/use-paddle-prices";
import { pricingTiers, microserviceProducts } from "@/constants/pricing-tiers";
import { siteConfig } from "@/lib/site-config";

type Frequency = "month" | "year";

export function PricingTable({ country = "OTHERS" }: { country?: string }) {
  const [frequency, setFrequency] = useState<Frequency>("month");
  const paddle = usePaddle();
  const { prices, loading } = usePaddlePrices(paddle, country);

  function openCheckout(priceId: string) {
    if (!priceId || priceId.startsWith("pri_placeholder")) {
      window.location.assign(`mailto:${siteConfig.supportEmail}?subject=Plan%20inquiry`);
      return;
    }
    paddle?.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      settings: { variant: "one-page" },
    });
  }

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-base font-semibold text-indigo-600 dark:text-indigo-400">Pricing</h2>
        <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Plans for individuals, businesses, and enterprises
        </p>
        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
          Subscribe for ongoing access to AI Mentor Agents, or buy a SaaS Microservice once. Card,
          PayPal, Apple Pay, Google Pay, and IBAN/wire — all handled securely through Paddle.
        </p>
      </div>

      <div className="mt-10 flex justify-center">
        <div className="inline-flex rounded-full border border-zinc-200 p-1 dark:border-zinc-800">
          {(["month", "year"] as Frequency[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                frequency === f
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              {f === "month" ? "Monthly" : "Yearly (save ~15%)"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {pricingTiers.map((tier) => {
          const priceId = tier.priceId[frequency];
          const formatted = prices[priceId];

          return (
            <div
              key={tier.id}
              className={`flex flex-col rounded-2xl border p-8 ${
                tier.featured
                  ? "border-indigo-600 ring-1 ring-indigo-600 dark:border-indigo-400 dark:ring-indigo-400"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              {tier.featured && (
                <span className="mb-4 inline-block w-fit rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">{tier.name}</h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{tier.audience}</p>
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{tier.description}</p>

              <div className="mt-6">
                {tier.contactSalesOnly ? (
                  <p className="text-3xl font-bold text-zinc-900 dark:text-white">Custom</p>
                ) : (
                  <p className="text-3xl font-bold text-zinc-900 dark:text-white">
                    {loading || !formatted ? "…" : formatted}
                    <span className="text-base font-normal text-zinc-500 dark:text-zinc-400">
                      /{frequency}
                    </span>
                  </p>
                )}
              </div>

              <ul className="mt-6 flex-1 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span aria-hidden className="text-indigo-600 dark:text-indigo-400">
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() =>
                  tier.contactSalesOnly
                    ? window.location.assign(
                        `mailto:${siteConfig.supportEmail}?subject=Enterprise%20plan%20inquiry`
                      )
                    : openCheckout(priceId)
                }
                className={`mt-8 rounded-full px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                  tier.featured
                    ? "bg-indigo-600 text-white hover:bg-indigo-500"
                    : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                }`}
              >
                {tier.contactSalesOnly ? "Contact sales" : "Subscribe"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-20">
        <h3 className="text-center text-xl font-semibold text-zinc-900 dark:text-white">
          One-time SaaS Microservices
        </h3>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-600 dark:text-zinc-400">
          No subscription needed — pay once for a focused AI mentor task.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {microserviceProducts.map((product) => (
            <div
              key={product.name}
              className="flex items-center justify-between rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-white">{product.name}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{product.description}</p>
              </div>
              <button
                type="button"
                onClick={() => openCheckout(product.priceId)}
                className="ml-4 shrink-0 rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-900"
              >
                Buy once
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
