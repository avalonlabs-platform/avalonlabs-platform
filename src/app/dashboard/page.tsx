import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SubscriptionStatus } from "@/components/dashboard/subscription-status";

export default function DashboardPage() {
  return (
    <div className="flex flex-col lg:flex-row">
      <div className="flex-1">
        <DashboardClient />
      </div>
      <aside className="w-full shrink-0 border-white/10 p-5 lg:w-80 lg:border-l">
        <Suspense fallback={<div className="h-24 animate-pulse rounded-2xl bg-white/[0.03]" />}>
          <SubscriptionStatus />
        </Suspense>
      </aside>
    </div>
  );
}
