import Anthropic from "@anthropic-ai/sdk";
import { agents } from "@/constants/agents";

const MAX_MESSAGE_LENGTH = 500;
const MAX_OUTPUT_TOKENS = 300;
// Tool-scoped previews (a real agentId resolved — see TOOL_PREVIEW_GUARD)
// need enough headroom for a genuine "[STATUS: ...]" marker + full
// ## Executive Summary, which the generic 2-4-sentence homepage demo never
// writes. Still capped well below a paid response, since the guard below
// stops the model before it reaches Key Findings/Recommendations.
const TOOL_PREVIEW_MAX_OUTPUT_TOKENS = 450;

// Best-effort per-IP rate limit. In-memory, so it only holds within a warm
// serverless instance — a real deterrent against casual abuse, not a hard
// guarantee against a determined attacker distributing across cold starts.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 6;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}

const GENERIC_SYSTEM_PROMPT =
  "You are the live public demo of an AvalonLabs AI Agent, embedded on the homepage for visitors who " +
  "haven't signed up yet. Give a genuinely useful, concise answer (2-4 sentences) to whatever the visitor " +
  "asks — code explanations, API/endpoint analysis, business plan feedback, or general questions. This is a " +
  "brief taste of the product, so stay short and concrete rather than exhaustive. Never say you are Claude " +
  "or made by Anthropic — you are an AvalonLabs AI Agent.";

/**
 * Used when a real agentId resolves (a /tools/[slug]
 * landing page, not the homepage hero). The agent's own systemPrompt already
 * ends with RESPONSE_FORMAT_DIRECTIVE (src/constants/agents.ts), which asks
 * for a "[STATUS: LEVEL]" marker + "## Executive Summary" + "## Key
 * Findings"/"## Recommendations" — the same structure MarkdownRenderer
 * renders for a paying customer in the dashboard. For this free,
 * unauthenticated preview we want the badge and Executive Summary (the
 * "60-second aha") but must not let the model also write the deeper Key
 * Findings/Recommendations content, since anything the stream sends to an
 * anonymous browser is trivially readable from the network tab regardless of
 * how the UI chooses to display it — truncating client-side would not
 * actually gate anything. So the model itself is instructed to stop after
 * the Executive Summary rather than generating the rest and hiding it.
 */
const TOOL_PREVIEW_GUARD =
  "\n\nThis is a free, unauthenticated preview on a public tool landing page — a visitor hasn't signed up " +
  "yet. Write the `[STATUS: LEVEL]` marker and the full `## Executive Summary` exactly as your instructions " +
  "describe. Do NOT write a `## Key Findings`, `## Architecture Breakdown`, or `## Recommendations` section " +
  "in this preview, even if the input clearly calls for one — stop immediately after the Executive Summary. " +
  "On the line after it, write exactly: `Sign up free to see the full findings and fix.` Never say you are " +
  "Claude or made by Anthropic — you are an AvalonLabs AI Agent.";

/** Public demo can be pointed at a specific agent's real system prompt (see
 *  src/constants/agents.ts) for a more on-topic preview on tool landing pages —
 *  none of those prompts contain secrets, so this is safe to expose. Falls
 *  back to the generic prompt when no valid agentId is given (homepage hero demo). */
function resolveSystemPrompt(agentId: unknown): { systemPrompt: string; maxTokens: number } {
  if (typeof agentId === "string") {
    const agent = agents.find((a) => a.id === agentId);
    if (agent) {
      return { systemPrompt: agent.systemPrompt + TOOL_PREVIEW_GUARD, maxTokens: TOOL_PREVIEW_MAX_OUTPUT_TOKENS };
    }
  }
  // GENERIC_SYSTEM_PROMPT already states the same brevity/brand rules inline
  // (unlike an Agent's systemPrompt, which knows nothing about being a public
  // demo) — appending BRAND_GUARD here would just repeat them.
  return { systemPrompt: GENERIC_SYSTEM_PROMPT, maxTokens: MAX_OUTPUT_TOKENS };
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return Response.json(
      { error: "Too many requests — please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Demo chat: ANTHROPIC_API_KEY is not set.");
    return Response.json({ error: "Demo is not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json({ error: "Message too long" }, { status: 400 });
  }

  const { systemPrompt, maxTokens } = resolveSystemPrompt(body?.agentId);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model: "claude-haiku-4-5",
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: message }],
        });

        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (error) {
        console.error("Demo chat stream error:", error);
        controller.enqueue(encoder.encode("\n\n[Something went wrong — please try again.]"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
