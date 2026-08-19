import { API_BASE_URL, DEFAULT_AGENT_ID } from "./config.js";

const CONTEXT_MENU_ID = "avalonlabs-ask-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Ask AvalonLabs about "%s"',
    contexts: ["selection"],
  });
});

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get(["apiKey"]);
  return apiKey ?? null;
}

/**
 * POSTs to /api/chat and returns the full response text. If `onChunk` is
 * given, also streams each decoded piece to it as it arrives (used by the
 * popup's "Ask" flow via the port below). This mirrors exactly what
 * src/app/api/chat/route.ts returns — a plain-text ReadableStream, not
 * SSE or JSON lines — so the reader here just decodes raw bytes.
 *
 * Auth is the `ak_live_...` API key from chrome.storage.local, sent as
 * `Authorization: Bearer <key>` — the same header mobile/lib/api.ts uses for
 * its Supabase access token, just a different token shape. src/lib/auth-
 * request.ts tells the two apart by prefix and resolves either to the same
 * user, so every tier/rate-limit/credit check downstream applies unchanged.
 */
async function askAvalonLabs({ agentId, message, history }, onChunk) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("No API key saved yet — open the extension popup and connect one.");
  }

  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agentId, message, history: history ?? [] }),
  });

  if (!response.ok) {
    // /api/chat's error responses are JSON (401/402/429/400/500), not
    // streamed — see route.ts. 402 in particular carries the tier-gating
    // message ("not_in_plan" / "no_credits"), which is exactly the signal
    // a Starter-tier key hitting a Pro-only agent should surface here.
    let errorMessage = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (body?.error) errorMessage = body.error;
    } catch {
      // Non-JSON error body — fall back to the generic message above.
    }
    throw new Error(errorMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    full += text;
    onChunk?.(text);
  }
  return full;
}

// Right-click a selection anywhere -> ask the default agent about it and
// surface the answer as a native notification. Self-contained: doesn't
// need the popup open at all.
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) return;

  try {
    const answer = await askAvalonLabs({ agentId: DEFAULT_AGENT_ID, message: info.selectionText });
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "AvalonLabs Assistant",
      message: answer.length > 200 ? `${answer.slice(0, 200)}…` : answer,
    });
  } catch (error) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "AvalonLabs Assistant — couldn't answer",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Popup <-> background streaming relay for the main "Ask" flow. A single
// chrome.runtime.sendMessage/sendResponse round trip can't deliver a
// response as it streams in, so the popup opens a long-lived port instead
// and gets CHUNK messages as they arrive, then DONE or ERROR.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "chat") return;

  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== "ASK") return;
    try {
      await askAvalonLabs(
        { agentId: msg.agentId, message: msg.message, history: msg.history },
        (text) => port.postMessage({ type: "CHUNK", text })
      );
      port.postMessage({ type: "DONE" });
    } catch (error) {
      port.postMessage({ type: "ERROR", error: error instanceof Error ? error.message : String(error) });
    }
  });
});
