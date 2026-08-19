import { API_BASE_URL, DEFAULT_AGENT_ID } from "./config.js";

const CONTEXT_MENU_ID = "avalonlabs-ask-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Ask AvalonLabs about "%s"',
    contexts: ["selection"],
  });

  // Makes clicking the toolbar icon (and the "_execute_action" keyboard
  // shortcut declared in manifest.json) open the side panel instead of a
  // popup — this is the actual migration switch; there's no separate
  // popup.html anymore. Chrome doesn't expose a close()/toggle() on
  // chrome.sidePanel (only open()), so "toggle" here really means "open" —
  // the user closes the panel from its own UI, same as any other side panel.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.error("AvalonLabs: failed to set side panel behavior —", error);
  });
});

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get(["apiKey"]);
  return apiKey ?? null;
}

/**
 * POSTs to /api/chat and returns the full response text. If `onChunk` is
 * given, also streams each decoded piece to it as it arrives (used by the
 * side panel's "Ask" flow via the port below). This mirrors exactly what
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
    throw new Error("No API key saved yet — open the side panel and connect one.");
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
// need the side panel open at all.
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

// Floating in-page quick action pill (content.js) -> here. A selection's
// "Explain Code" / "Security Audit" / "Review Contract" click sends this,
// and the side panel picks it up (see sidepanel.js's
// consumePendingQuickAction + the chrome.storage.onChanged listener there).
//
// chrome.sidePanel.open() is only honored when called "in response to a
// user gesture" — a click inside a content script relayed through
// chrome.runtime.sendMessage sits right at the edge of what different
// Chrome versions still count as that gesture (see e.g. Chromium issue
// 355266358, an open bug about exactly this pattern). So this call happens
// as the very first thing in this listener, before any await, to give it
// the best chance of being honored — and if Chrome rejects it anyway, the
// pending action is still saved below, so it runs the moment the user opens
// the panel themselves (toolbar icon or the Alt+Shift+A / Cmd+Shift+A
// shortcut) rather than being silently lost.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "QUICK_ACTION") return undefined;

  const tabId = sender.tab?.id;
  if (tabId != null) {
    try {
      chrome.sidePanel.open({ tabId }).catch((error) => {
        console.warn("AvalonLabs: side panel auto-open was declined —", error);
      });
    } catch (error) {
      console.warn("AvalonLabs: side panel auto-open threw —", error);
    }
  }

  chrome.storage.session
    .set({ pendingQuickAction: { action: message.action, text: message.text, ts: Date.now() } })
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true; // keep the message channel open for the async sendResponse above
});

// Side panel <-> background streaming relay for the main "Ask" flow. A
// single chrome.runtime.sendMessage/sendResponse round trip can't deliver a
// response as it streams in, so the panel opens a long-lived port instead
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
