import { createClient } from "@/lib/supabase/server";
import { agents } from "@/constants/agents";
import { getAgentAccess } from "@/lib/agent-access";

/** Read-only status check for CTA rendering (pricing table, tool landing pages,
 *  dashboard) — never the actual access gate, which lives in /api/chat. Returns
 *  only a boolean, never subscription/purchase details. */
export async function GET(request: Request) {
  const agentId = new URL(request.url).searchParams.get("agentId") ?? "";
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    return Response.json({ error: "Unknown agent" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ signedIn: false, hasAccess: false });
  }

  try {
    const access = await getAgentAccess(user, agent.id);
    return Response.json({
      signedIn: true,
      hasAccess: access.subscriptionGrantsThisAgent || access.hasStandalonePurchase,
    });
  } catch (error) {
    console.error("agent-access: lookup failed —", error);
    // Display-only endpoint — default to "no confirmed access" rather than
    // erroring the page; /api/chat still enforces the real gate either way.
    return Response.json({ signedIn: true, hasAccess: false });
  }
}
