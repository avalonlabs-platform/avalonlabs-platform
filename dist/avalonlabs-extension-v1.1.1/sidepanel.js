import { API_BASE_URL, DEFAULT_AGENT_ID, QUICK_ACTIONS } from "./config.js";
import { renderMarkdown } from "./markdown.js";

// Mirrors src/app/api/chat/route.ts's own MAX_MESSAGE_LENGTH (checked
// against the live route source, not assumed) — truncating client-side
// gives an honest preview of what will actually be sent instead of letting
// the backend silently cut it off after the request round-trips.
const MAX_MESSAGE_LENGTH = 4000;

// How long a quick action saved to chrome.storage.session stays eligible
// to auto-run when the side panel loads/reacts — stale ones (panel opened
// long after the click) are shown as a note instead of auto-firing, so an
// old selection doesn't unexpectedly fire a request the user no longer
// wants.
const PENDING_QUICK_ACTION_MAX_AGE_MS = 5 * 60 * 1000;

const setupView = document.getElementById("setup-view");
const chatView = document.getElementById("chat-view");
const statusDot = document.getElementById("status-dot");
const apiKeyInput = document.getElementById("api-key-input");
const saveKeyBtn = document.getElementById("save-key-btn");
const setupError = document.getElementById("setup-error");
const agentSelect = document.getElementById("agent-select");
const messageInput = document.getElementById("message-input");
const askBtn = document.getElementById("ask-btn");
const chatError = document.getElementById("chat-error");
const responseEl = document.getElementById("response");
const disconnectBtn = document.getElementById("disconnect-btn");
const quickActionBanner = document.getElementById("quick-action-banner");

function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}

function showQuickActionBanner(message) {
  quickActionBanner.textContent = message;
  quickActionBanner.hidden = !message;
}

/** Populates the agent picker from /api/agents (public metadata, no auth —
 *  see src/app/api/agents/route.ts) instead of hardcoding the list here, so
 *  it can't silently drift from src/constants/agents.ts. */
async function loadAgents() {
  agentSelect.innerHTML = "";
  try {
    const response = await fetch(`${API_BASE_URL}/api/agents`);
    const data = await response.json();
    for (const agent of data.agents ?? []) {
      const option = document.createElement("option");
      option.value = agent.id;
      option.textContent = `${agent.emoji ?? ""} ${agent.name}`.trim();
      agentSelect.appendChild(option);
    }
    if ([...agentSelect.options].some((o) => o.value === DEFAULT_AGENT_ID)) {
      agentSelect.value = DEFAULT_AGENT_ID;
    }
  } catch {
    // Offline, or the API is unreachable — fall back to a single option so
    // the UI still works; the "Ask" click itself will surface a clear error
    // if this really is a connectivity problem.
    const option = document.createElement("option");
    option.value = DEFAULT_AGENT_ID;
    option.textContent = "General Assistant";
    agentSelect.appendChild(option);
  }
}

async function render() {
  const { apiKey } = await chrome.storage.local.get(["apiKey"]);
  const connected = !!apiKey;
  statusDot.classList.toggle("connected", connected);
  setupView.hidden = connected;
  chatView.hidden = !connected;
  if (connected) {
    await loadAgents();
    await consumePendingQuickAction();
  }
}

saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key.startsWith("ak_live_")) {
    showError(setupError, 'That doesn\'t look like an AvalonLabs API key — it should start with "ak_live_".');
    return;
  }
  showError(setupError, "");
  // chrome.storage.local, not .sync — an API key is a bearer credential and
  // shouldn't be replicated to the user's other Chrome installs via sync.
  await chrome.storage.local.set({ apiKey: key });
  apiKeyInput.value = "";
  await render();
});

disconnectBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove(["apiKey"]);
  responseEl.textContent = "";
  showError(chatError, "");
  showQuickActionBanner("");
  await render();
});

/**
 * Shared by the manual "Ask" button and quick actions relayed from
 * content.js — streams the response from background.js's long-lived
 * "chat" port and re-renders the accumulated markdown on every chunk (the
 * renderer re-parses the whole response each time rather than patching
 * incrementally, which is simple and fast enough at chat-message scale).
 */
function runAsk(agentId, message) {
  showError(chatError, "");
  responseEl.textContent = "";
  askBtn.disabled = true;

  let fullText = "";
  const port = chrome.runtime.connect({ name: "chat" });
  port.onMessage.addListener((msg) => {
    if (msg.type === "CHUNK") {
      fullText += msg.text;
      renderMarkdown(responseEl, fullText);
    } else if (msg.type === "DONE") {
      askBtn.disabled = false;
      port.disconnect();
    } else if (msg.type === "ERROR") {
      showError(chatError, msg.error);
      askBtn.disabled = false;
      port.disconnect();
    }
  });
  port.postMessage({ type: "ASK", agentId, message: message.slice(0, MAX_MESSAGE_LENGTH) });
}

askBtn.addEventListener("click", () => {
  const message = messageInput.value.trim();
  if (!message) return;
  showQuickActionBanner("");
  runAsk(agentSelect.value, message);
});

/**
 * On load, and whenever a new one arrives while the panel is already open
 * (see the chrome.storage.onChanged listener below), picks up a quick
 * action queued by content.js via background.js. Both paths funnel through
 * this same function and both do get-then-remove, so it's naturally
 * idempotent if they ever race.
 */
async function consumePendingQuickAction() {
  const { pendingQuickAction } = await chrome.storage.session.get(["pendingQuickAction"]);
  if (!pendingQuickAction) return;

  await chrome.storage.session.remove(["pendingQuickAction"]);

  const age = Date.now() - (pendingQuickAction.ts ?? 0);
  const config = QUICK_ACTIONS[pendingQuickAction.action];
  if (!config) return;

  if (age > PENDING_QUICK_ACTION_MAX_AGE_MS) {
    showQuickActionBanner(
      `A "${config.label}" request from a page selection expired before this panel was opened — select the text again to retry.`
    );
    return;
  }

  if ([...agentSelect.options].some((o) => o.value === config.agentId)) {
    agentSelect.value = config.agentId;
  }

  const prompt = `${config.promptPrefix}\n\n${pendingQuickAction.text}`;
  messageInput.value = prompt;
  showQuickActionBanner(`Running "${config.label}" on your selected text...`);
  runAsk(config.agentId, prompt);
}

// If the panel is already open when a new quick action lands (rather than
// being opened in response to it), react live instead of waiting for the
// next load.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "session" || !changes.pendingQuickAction?.newValue) return;
  if (chatView.hidden) return; // not connected yet — nothing to run against
  consumePendingQuickAction();
});

render();
