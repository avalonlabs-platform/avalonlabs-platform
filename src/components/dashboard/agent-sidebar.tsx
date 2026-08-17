"use client";

import type { Agent } from "@/constants/agents";
import { microserviceProducts } from "@/constants/pricing-tiers";
import { useAgentAccess } from "@/hooks/use-agent-access";

/** Compact per-row status tag — only shown for agents also sold as a
 *  standalone microservice (see AgentAccessBadge in the chat panel header,
 *  which owns the actual purchase CTA once an agent is selected). General
 *  agents like General Assistant get no tag: they're included in any plan. */
function AgentUnlockTag({ agentId }: { agentId: string }) {
  const isMicroservice = microserviceProducts.some((m) => m.agentId === agentId);
  const access = useAgentAccess(agentId);

  if (!isMicroservice || access === "loading") return null;

  if (access === "has-access") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
        ✓ Unlocked
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/40 ring-1 ring-white/10">
      🔒 Locked
    </span>
  );
}

export function AgentSidebar({
  agents,
  selectedId,
  onSelect,
}: {
  agents: Agent[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="flex w-full flex-col gap-1 border-white/10 p-3 sm:w-64 sm:border-r">
      <p className="px-2 pb-2 text-xs font-medium tracking-wide text-white/40 uppercase">AI Agents</p>
      {agents.map((agent) => {
        const active = agent.id === selectedId;
        return (
          <button
            key={agent.id}
            type="button"
            onClick={() => onSelect(agent.id)}
            className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
              active ? "bg-white/[0.06] ring-1 ring-white/10" : "hover:bg-white/[0.03]"
            }`}
          >
            <span className="text-lg leading-none">{agent.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className={`text-sm font-medium ${active ? "text-white" : "text-white/80"}`}>
                  {agent.name}
                </span>
                <AgentUnlockTag agentId={agent.id} />
              </span>
              <span className="mt-0.5 block text-xs text-white/40">{agent.description}</span>
              <span className="mt-1.5 inline-flex items-center rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[9px] text-white/30">
                Sonnet 5
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
