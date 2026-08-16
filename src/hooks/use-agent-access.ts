"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AgentAccessState = "loading" | "anonymous" | "no-access" | "has-access";

/** Checked client-side (like site-header's AuthNav) so pages stay statically
 *  prerenderable — the real access gate is always /api/chat, this only
 *  decides which CTA to show. */
export function useAgentAccess(agentId: string): AgentAccessState {
  const [state, setState] = useState<AgentAccessState>("loading");

  useEffect(() => {
    let cancelled = false;

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        if (!cancelled) setState("anonymous");
        return;
      }
      try {
        const res = await fetch(`/api/agent-access?agentId=${encodeURIComponent(agentId)}`);
        const body = await res.json().catch(() => null);
        if (!cancelled) setState(body?.hasAccess ? "has-access" : "no-access");
      } catch {
        if (!cancelled) setState("no-access");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return state;
}
