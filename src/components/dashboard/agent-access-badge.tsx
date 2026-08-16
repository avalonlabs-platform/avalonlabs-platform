"use client";

import { usePaddle } from "@/hooks/use-paddle";
import { useAgentAccess } from "@/hooks/use-agent-access";
import { microserviceProducts } from "@/constants/pricing-tiers";
import { siteConfig } from "@/lib/site-config";

/** Dashboard-side equivalent of the tool landing pages' CTA — only rendered
 *  for agents that are also sold as a standalone one-time microservice
 *  (subscription-only agents like General Assistant get nothing here). */
export function AgentAccessBadge({ agentId }: { agentId: string }) {
  const microservice = microserviceProducts.find((m) => m.agentId === agentId);
  const paddle = usePaddle();
  const access = useAgentAccess(agentId);

  if (!microservice || access === "loading" || access === "anonymous") return null;

  if (access === "has-access") {
    return (
      <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
        <span aria-hidden>✓</span> Already Unlocked
      </span>
    );
  }

  function openCheckout() {
    if (!microservice?.priceId) {
      window.location.assign(
        `mailto:${siteConfig.supportEmail}?subject=${encodeURIComponent(`${agentId} lifetime access`)}`
      );
      return;
    }
    paddle?.Checkout.open({
      items: [{ priceId: microservice.priceId, quantity: 1 }],
      settings: { variant: "one-page" },
    });
  }

  return (
    <button
      type="button"
      onClick={openCheckout}
      className="ml-auto shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/90 transition-colors hover:bg-white/5"
    >
      Buy Lifetime Access
    </button>
  );
}
