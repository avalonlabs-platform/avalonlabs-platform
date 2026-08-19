import { agents } from "@/constants/agents";

/** Public agent catalog — id/name/emoji/description only, never
 *  systemPrompt (that stays a server-side trusted lookup, see
 *  src/app/api/chat/route.ts). No auth required: this is metadata for
 *  building a picker (extension popup, future clients), not access —
 *  /api/chat is still the only place that actually gates anything. */
export async function GET() {
  return Response.json({
    agents: agents.map(({ id, name, emoji, description }) => ({ id, name, emoji, description })),
  });
}
