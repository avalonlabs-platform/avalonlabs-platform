import { createInternalClient } from "@/lib/supabase/server-internal";
import { agents } from "@/constants/agents";
import { pricingTiers, type PricingTier } from "@/constants/pricing-tiers";
import { getAgentAccess } from "@/lib/agent-access";
import { getRequestUser } from "@/lib/auth-request";
import {
  ALLOWED_IMAGE_MEDIA_TYPES as ATTACHMENT_ALLOWED_IMAGE_MEDIA_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_COMBINED_ATTACHMENT_BYTES,
  categorizeAttachment,
  maxBytesForCategory,
} from "@/lib/attachments/constants";
import type { AttachmentPayload } from "@/lib/attachments/types";
import {
  LlmGatewayError,
  exceedsGeminiInlineLimit,
  isProviderConfigured,
  resolveProvider,
  streamChatCompletion,
  type NeutralPart,
  type NeutralTurn,
} from "@/lib/llm-router";

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

interface ChatImage {
  /** Base64-encoded image bytes, no "data:" URL prefix. */
  data?: string;
  mediaType?: string;
}

interface ChatRequestBody {
  agentId?: string;
  message?: string;
  history?: ChatTurn[];
  /** Legacy single-image field — the mobile app's earlier Vision Analyzer
   *  camera flow sent this; kept working for any other caller even though
   *  every first-party client now sends `attachments` below instead. */
  image?: ChatImage;
  /** Web dashboard attachment picker / drag-drop / paste, and the mobile
   *  app's multi-photo attachment bar — zero or more images, PDFs, or text
   *  files. See src/lib/attachments/. */
  attachments?: AttachmentPayload[];
  /** Explicit per-request override of which LLM provider serves this
   *  request — see src/lib/llm-router.ts's resolveProvider for the full
   *  precedence order. Also readable via an `X-LLM-Provider` header. */
  provider?: string;
}

const ALLOWED_IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
// Claude's per-image limit is 5MB of raw bytes; base64 runs ~33% larger.
const MAX_IMAGE_BASE64_LENGTH = 7_000_000;

/**
 * Re-validates each attachment against the same allowlist/size rules the
 * client already applied (src/lib/attachments/constants.ts) — never trusts
 * the client's own `category` label — and turns it into the provider-
 * agnostic NeutralPart shape (src/lib/llm-router.ts) so either Anthropic or
 * Gemini can consume it. Returns a user-facing `error` string (never
 * throws) so the route can respond with a clean 400 on the first bad
 * attachment rather than a generic 500.
 */
function resolveAttachmentParts(
  attachments: AttachmentPayload[]
): { parts: NeutralPart[]; error: string | null } {
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { parts: [], error: `Too many attachments — up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.` };
  }

  const parts: NeutralPart[] = [];
  let combinedBytes = 0;

  for (const att of attachments) {
    if (
      !att ||
      typeof att.name !== "string" ||
      typeof att.mediaType !== "string" ||
      typeof att.data !== "string" ||
      !att.data
    ) {
      return { parts: [], error: "Malformed attachment." };
    }

    const category = categorizeAttachment(att.name, att.mediaType);
    if (!category) {
      return { parts: [], error: `"${att.name}" isn't a supported attachment type.` };
    }

    // Text attachments are sent as literal characters (not base64), so
    // their byte size is just the string length; base64 inflates by ~4/3
    // over the original file, so approximate the real file size back out
    // for the size check.
    const approxBytes = category === "text" ? att.data.length : Math.ceil((att.data.length * 3) / 4);
    if (approxBytes > maxBytesForCategory(category)) {
      return { parts: [], error: `"${att.name}" is too large for a ${category} attachment.` };
    }
    combinedBytes += approxBytes;
    if (combinedBytes > MAX_COMBINED_ATTACHMENT_BYTES) {
      return { parts: [], error: "Attachments are too large combined — remove one and try again." };
    }

    if (category === "image") {
      if (!(ATTACHMENT_ALLOWED_IMAGE_MEDIA_TYPES as readonly string[]).includes(att.mediaType)) {
        return { parts: [], error: `"${att.name}" has an unsupported image type.` };
      }
      parts.push({ type: "image", mediaType: att.mediaType, data: att.data });
    } else if (category === "pdf") {
      parts.push({ type: "document", mediaType: "application/pdf", data: att.data, encoding: "base64", title: att.name });
    } else {
      parts.push({ type: "document", mediaType: "text/plain", data: att.data, encoding: "utf8", title: att.name });
    }
  }

  return { parts, error: null };
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
  const { agentId, message, history, image, attachments: rawAttachments, provider: requestedProvider } = body;
  const attachments = Array.isArray(rawAttachments) ? rawAttachments : [];

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

  if (!isProviderConfigured("anthropic") && !isProviderConfigured("gemini")) {
    console.error("Chat: neither ANTHROPIC_API_KEY nor GEMINI_API_KEY is set.");
    return Response.json({ error: "Chat is not configured" }, { status: 500 });
  }

  const hasImage = !!image?.data;

  if (hasImage) {
    if (typeof image!.mediaType !== "string" || !ALLOWED_IMAGE_MEDIA_TYPES.has(image!.mediaType)) {
      return Response.json({ error: "Unsupported image type" }, { status: 400 });
    }
    if (typeof image!.data !== "string" || image!.data.length > MAX_IMAGE_BASE64_LENGTH) {
      return Response.json({ error: "Image too large" }, { status: 400 });
    }
  }

  let attachmentParts: NeutralPart[] = [];
  if (attachments.length > 0) {
    const resolved = resolveAttachmentParts(attachments);
    if (resolved.error) {
      return Response.json({ error: resolved.error }, { status: 400 });
    }
    attachmentParts = resolved.parts;
  }
  const hasAttachments = attachmentParts.length > 0;

  if (!hasImage && !hasAttachments && (!message || typeof message !== "string" || !message.trim())) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }
  if (message && message.length > MAX_MESSAGE_LENGTH) {
    return Response.json({ error: "Message too long" }, { status: 400 });
  }

  const trimmedHistory: NeutralTurn[] = (Array.isArray(history) ? history : [])
    .filter(
      (turn): turn is ChatTurn =>
        (turn?.role === "user" || turn?.role === "assistant") && typeof turn.content === "string"
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_MESSAGE_LENGTH) }));

  const userText =
    message?.trim() || (hasImage ? "Analyze this image." : hasAttachments ? "Analyze the attached file(s)." : "");

  const userParts: NeutralPart[] = [
    ...(hasImage ? [{ type: "image" as const, mediaType: image!.mediaType!, data: image!.data! }] : []),
    ...attachmentParts,
    { type: "text", text: userText },
  ];

  let resolvedProvider = resolveProvider({
    requestedProvider: requestedProvider ?? request.headers.get("X-LLM-Provider"),
    agentPreferredProvider: agent.preferredProvider,
  });

  // Gemini's inline (non-Files-API) requests cap out at ~20MB total —
  // tighter than the attachment ceilings in src/lib/attachments/constants.ts,
  // which were sized for Anthropic's larger 32MB limit. A request that's
  // valid but too big for Gemini falls back to Anthropic here rather than
  // surfacing a confusing rejection from Gemini's API.
  if (resolvedProvider === "gemini" && exceedsGeminiInlineLimit(userParts)) {
    console.warn("Chat: attachments too large for Gemini's inline limit — routing to Anthropic instead.");
    resolvedProvider = "anthropic";
  }

  const encoder = new TextEncoder();
  const completion = streamChatCompletion({
    provider: resolvedProvider,
    geminiModelHint: agent.geminiModelHint,
    systemPrompt: agent.systemPrompt,
    history: trimmedHistory,
    userParts,
  });

  // Prime the stream (get/await the first chunk) before committing to a
  // Response at all — the router's own provider fallback (see
  // streamChatCompletion) has already run by the time this either resolves
  // or throws, so a total failure (both providers down/misconfigured) can
  // still return a clean JSON error with the right status code instead of
  // a 200 response carrying an inline "something went wrong" text notice.
  let firstChunk: string | null;
  try {
    const { value, done } = await completion.next();
    firstChunk = done ? null : value;
  } catch (error) {
    if (error instanceof LlmGatewayError) {
      console.error("Chat: LLM gateway failed before producing output —", error.message);
      return Response.json({ error: "Chat is temporarily unavailable — please try again shortly." }, { status: error.status });
    }
    console.error("Chat: unexpected error starting the LLM stream —", error);
    return Response.json({ error: "Chat is temporarily unavailable — please try again shortly." }, { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (firstChunk) controller.enqueue(encoder.encode(firstChunk));
        for await (const chunk of completion) {
          controller.enqueue(encoder.encode(chunk));
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
