import Anthropic from "@anthropic-ai/sdk";
import { createInternalClient } from "@/lib/supabase/server-internal";
import { agents } from "@/constants/agents";
import { pricingTiers, type PricingTier } from "@/constants/pricing-tiers";
import { getAgentAccess } from "@/lib/agent-access";
import { getRequestUser } from "@/lib/auth-request";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_TURNS = 20;

// Best-effort per-user rate limit, scaled by plan tier. In-memory, so it only
// holds within a warm serverless instance — same caveat as the public demo's
// per-IP limit, just keyed by user id since every request here is authenticated.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const TIER_RATE_LIMITS: Record<PricingTier["id"], number> = {
  starter: 30,
  pro: 100,
  advanced: 300,
};
// Unrecognized price id (e.g. a legacy or manually-created price) gets the
// safest, lowest-tier limit rather than being trusted with the highest one.
const DEFAULT_RATE_LIMIT = TIER_RATE_LIMITS.starter;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function tierRateLimit(priceId: string): number {
  const tier = pricingTiers.find((t) => t.priceId.month === priceId || t.priceId.year === priceId);
  return tier ? TIER_RATE_LIMITS[tier.id] : DEFAULT_RATE_LIMIT;
}

function checkRateLimit(userId: string, maxRequests: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count += 1;
  return true;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  agentId?: string;
  message?: string;
  history?: ChatTurn[];
}

export async function POST(request: Request) {
  // Dashboard/mobile chat only — reject unauthenticated requests before any
  // API/SDK call. Accepts either the web app's cookie session or a mobile
  // client's `Authorization: Bearer <token>` (see getRequestUser).
  const user = await getRequestUser(request);

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body: ChatRequestBody = await request.json();
  const { agentId, message, history } = body;

  // The system prompt is resolved server-side from a trusted lookup — the
  // client only ever supplies an agent id, never prompt text.
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    return Response.json({ error: "Unknown agent" }, { status: 400 });
  }

  // Fail closed: if we can't verify billing status, don't grant access.
  let hasActiveSubscription = false;
  let subscriptionPriceId = "";
  let subscriptionGrantsThisAgent = false;
  let hasStandalonePurchase = false;
  let freeCredits = 0;
  try {
    const access = await getAgentAccess(user, agent.id);
    hasActiveSubscription = access.hasActiveSubscription;
    subscriptionPriceId = access.subscriptionPriceId;
    subscriptionGrantsThisAgent = access.subscriptionGrantsThisAgent;
    hasStandalonePurchase = access.hasStandalonePurchase;
    freeCredits = access.freeCredits;
  } catch (error) {
    console.error("Chat: subscription/purchase/credit lookup failed —", error);
    return Response.json({ error: "Unable to verify subscription status" }, { status: 500 });
  }

  const usingFreeCredit = !subscriptionGrantsThisAgent && !hasStandalonePurchase && freeCredits > 0;

  if (!subscriptionGrantsThisAgent && !hasStandalonePurchase && !usingFreeCredit) {
    return Response.json(
      hasActiveSubscription
        ? {
            error:
              "This AI Agent isn't included in your current plan. Upgrade to Pro or Advanced, or purchase lifetime access to it.",
            reason: "not_in_plan",
          }
        : {
            error: "You're out of free credits. Subscribe or purchase this AI Agent to keep chatting.",
            reason: "no_credits",
          },
      { status: 402 }
    );
  }

  // Standalone (no-subscription) purchasers get the safe default rate limit —
  // there's no plan tier to scale it from.
  const rateLimit = hasActiveSubscription ? tierRateLimit(subscriptionPriceId) : DEFAULT_RATE_LIMIT;
  if (!checkRateLimit(user.id, rateLimit)) {
    return Response.json(
      {
        error:
          "You've hit your plan's message limit for now — please wait a bit and try again, or upgrade for a higher limit.",
      },
      { status: 429 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Chat: ANTHROPIC_API_KEY is not set.");
    return Response.json({ error: "Chat is not configured" }, { status: 500 });
  }

  if (!message || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json({ error: "Message too long" }, { status: 400 });
  }

  const trimmedHistory = (Array.isArray(history) ? history : [])
    .filter(
      (turn): turn is ChatTurn =>
        (turn?.role === "user" || turn?.role === "assistant") && typeof turn.content === "string"
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_MESSAGE_LENGTH) }));

  const messages: Anthropic.MessageParam[] = [
    ...trimmedHistory,
    { role: "user", content: message },
  ];

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model: "claude-sonnet-5",
          max_tokens: 4096,
          system: agent.systemPrompt,
          messages,
        });

        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        // Only spend a credit once the response actually completed —
        // a failed generation above skips this and falls to the catch block.
        if (usingFreeCredit) {
          try {
            const internal = createInternalClient();
            await internal.rpc("decrement_free_credit", { user_id: user.id });
          } catch (creditError) {
            console.error("Chat: failed to decrement free credit —", creditError);
          }
        }
      } catch (error) {
        console.error("Chat stream error:", error);
        controller.enqueue(
          encoder.encode("\n\n[Something went wrong generating a response — please try again.]")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
