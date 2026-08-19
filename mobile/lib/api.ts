import { supabase } from "./supabase";
import type { AttachmentPayload } from "./attachments";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE) {
  throw new Error("EXPO_PUBLIC_API_BASE_URL is not set — see .env.example.");
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Calls the same /api/chat the web dashboard uses — including its
 * `attachments` array (see src/lib/attachments/, and route.ts's
 * resolveAttachmentBlocks), the same multi-file mechanism the web
 * dashboard's paperclip/drag-drop/paste pipeline uses. This supersedes the
 * older single-image `image` field this function used to send via a
 * separate sendVisionMessage — route.ts still accepts that legacy field
 * for any other caller, but this client now sends every photo (one or
 * several) through `attachments` alongside the text prompt, matching the
 * web app's shape exactly instead of mobile carrying its own one-off path.
 *
 * Note: this awaits the full response rather than reading it incrementally
 * — React Native's fetch has historically had inconsistent support for
 * streaming response bodies across platforms/engines, and that can't be
 * verified without testing on a real device. Simpler and reliable for v1;
 * revisit for token-by-token streaming once confirmed working on-device.
 */
export async function sendChatMessage(
  agentId: string,
  message: string,
  history: ChatTurn[],
  attachments: AttachmentPayload[] = []
): Promise<string> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ agentId, message, history, attachments }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }

  return res.text();
}

export interface AccountInfo {
  email: string;
  subscription: { status: string; tier: string | null; priceId: string } | null;
  freeCredits: number;
}

export async function fetchAccount(): Promise<AccountInfo> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/account`, { headers });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }

  return res.json();
}
