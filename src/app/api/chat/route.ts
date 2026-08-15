import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { agents } from "@/constants/agents";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_TURNS = 20;

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
  // Dashboard chat only — reject unauthenticated requests before any API/SDK call.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Chat: ANTHROPIC_API_KEY is not set.");
    return Response.json({ error: "Chat is not configured" }, { status: 500 });
  }

  const body: ChatRequestBody = await request.json();
  const { agentId, message, history } = body;

  // The system prompt is resolved server-side from a trusted lookup — the
  // client only ever supplies an agent id, never prompt text.
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    return Response.json({ error: "Unknown agent" }, { status: 400 });
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
