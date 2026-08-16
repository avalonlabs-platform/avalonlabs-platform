"use client";

import Link from "next/link";
import { usePaddle } from "@/hooks/use-paddle";
import { siteConfig } from "@/lib/site-config";

export function ToolCheckoutButtons({ agentId, priceId }: { agentId: string; priceId: string }) {
  const paddle = usePaddle();

  function openCheckout() {
    if (!priceId) {
      window.location.assign(`mailto:${siteConfig.supportEmail}?subject=${encodeURIComponent(`${agentId} lifetime access`)}`);
      return;
    }
    paddle?.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      settings: { variant: "one-page" },
    });
  }

  const nextParam = encodeURIComponent(`/dashboard?agent=${agentId}`);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Link
        href={`/signup?next=${nextParam}`}
        className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Try with 3 Free Credits
      </Link>
      <button
        type="button"
        onClick={openCheckout}
        className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/90 transition-colors hover:bg-white/5"
      >
        Buy Lifetime Access
      </button>
    </div>
  );
}
