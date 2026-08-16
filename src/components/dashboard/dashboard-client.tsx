"use client";

import { useState } from "react";
import { agents, defaultAgentId } from "@/constants/agents";
import { AgentSidebar } from "@/components/dashboard/agent-sidebar";
import { AgentChat } from "@/components/dashboard/agent-chat";

export function DashboardClient({ initialAgentId }: { initialAgentId?: string }) {
  const [selectedId, setSelectedId] = useState(initialAgentId ?? defaultAgentId);
  const selectedAgent = agents.find((a) => a.id === selectedId) ?? agents[0];

  return (
    <div className="flex flex-col sm:flex-row">
      <AgentSidebar agents={agents} selectedId={selectedId} onSelect={setSelectedId} />
      <div className="min-w-0 flex-1">
        <AgentChat key={selectedAgent.id} agent={selectedAgent} />
      </div>
    </div>
  );
}
