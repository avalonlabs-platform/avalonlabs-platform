import Anthropic from "@anthropic-ai/sdk";

const MAX_MESSAGE_LENGTH = 500;
const MAX_OUTPUT_TOKENS = 300;

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

const SYSTEM_PROMPT =
  "You are the live public demo of an AvalonLabs AI Agent, embedded on the homepage for visitors who " +
  "haven't signed up yet. Give a genuinely useful, concise answer (2-4 sentences) to whatever the visitor " +
  "asks — code explanations, API/endpoint analysis, business plan feedback, or general questions. This is a " +
  "brief taste of the product, so stay short and concrete rather than exhaustive. Never say you are Claude " +
  "or made by Anthropic — you are an AvalonLabs AI Agent.";

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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model: "claude-haiku-4-5",
          max_tokens: MAX_OUTPUT_TOKENS,
          system: SYSTEM_PROMPT,
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
