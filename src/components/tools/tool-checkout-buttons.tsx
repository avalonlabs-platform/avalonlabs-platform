"use client";

import Link from "next/link";
import { usePaddle } from "@/hooks/use-paddle";
import { useAgentAccess } from "@/hooks/use-agent-access";
import { siteConfig } from "@/lib/site-config";

export function ToolCheckoutButtons({ agentId, priceId }: { agentId: string; priceId: string }) {
  const paddle = usePaddle();
  const access = useAgentAccess(agentId);

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
  const dashboardHref = `/dashboard?agent=${agentId}`;

  // Already unlocked via subscription or a prior one-time purchase — a
  // second "Buy" button would just be a confusing, redundant upsell.
  if (access === "has-access") {
    return (
      <div className="flex flex-col items-center gap-3">
        <Link
          href={dashboardHref}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <span aria-hidden>✓</span> Already Unlocked — Open Tool
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={access === "anonymous" ? `/signup?next=${nextParam}` : dashboardHref}
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {access === "anonymous" ? "Try with 3 Free Credits" : "Continue in Dashboard"}
        </Link>
        <button
          type="button"
          onClick={openCheckout}
          className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/90 transition-colors hover:bg-white/5"
        >
          Buy Lifetime Access
        </button>
      </div>
      {access === "anonymous" && (
        <p className="text-xs text-white/40">
          No credit card required to try. 3 free credits, then subscribe or buy lifetime access to
          this agent.
        </p>
      )}
    </div>
  );
}
