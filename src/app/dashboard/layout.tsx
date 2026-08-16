import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/dashboard/logout-button";
import { CreditBadge } from "@/components/dashboard/credit-badge";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  return (
    <div className="flex min-h-[calc(100vh-1px)] flex-col">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-6 py-4">
        <div>
          <p className="text-sm font-semibold text-white">Dashboard</p>
          <p className="text-xs text-white/40">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}>
            <CreditBadge />
          </Suspense>
          <LogoutButton />
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
