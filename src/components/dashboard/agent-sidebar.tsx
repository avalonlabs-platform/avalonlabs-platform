"use client";

import type { Agent } from "@/constants/agents";

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
            <span>
              <span className={`block text-sm font-medium ${active ? "text-white" : "text-white/80"}`}>
                {agent.name}
              </span>
              <span className="mt-0.5 block text-xs text-white/40">{agent.description}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
