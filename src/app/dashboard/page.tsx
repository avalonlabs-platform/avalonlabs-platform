import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SubscriptionStatus } from "@/components/dashboard/subscription-status";
import { ApiKeysManager } from "@/components/dashboard/api-keys-manager";
import { agents, defaultAgentId } from "@/constants/agents";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent } = await searchParams;
  const initialAgentId = agents.some((a) => a.id === agent) ? (agent as string) : defaultAgentId;

  return (
    <div className="flex flex-col lg:flex-row">
      <div className="flex-1">
        <DashboardClient initialAgentId={initialAgentId} />
      </div>
      <aside className="w-full shrink-0 border-white/10 p-5 lg:w-80 lg:border-l">
        <Suspense fallback={<div className="h-24 animate-pulse rounded-2xl bg-white/[0.03]" />}>
          <SubscriptionStatus />
        </Suspense>
        <div className="mt-5">
          <ApiKeysManager />
        </div>
      </aside>
    </div>
  );
}
