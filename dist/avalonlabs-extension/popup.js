import { API_BASE_URL, DEFAULT_AGENT_ID } from "./config.js";

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

function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
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
  if (connected) await loadAgents();
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
  await render();
});

askBtn.addEventListener("click", () => {
  const message = messageInput.value.trim();
  if (!message) return;

  showError(chatError, "");
  responseEl.textContent = "";
  askBtn.disabled = true;

  // Long-lived port to background.js, which holds the API key and does the
  // actual authenticated fetch — see extension/background.js. Streamed
  // CHUNK messages get appended here as they arrive.
  const port = chrome.runtime.connect({ name: "chat" });
  port.onMessage.addListener((msg) => {
    if (msg.type === "CHUNK") {
      responseEl.textContent += msg.text;
    } else if (msg.type === "DONE") {
      askBtn.disabled = false;
      port.disconnect();
    } else if (msg.type === "ERROR") {
      showError(chatError, msg.error);
      askBtn.disabled = false;
      port.disconnect();
    }
  });
  port.postMessage({ type: "ASK", agentId: agentSelect.value, message });
});

render();
