/**
 * Floating quick-action pill: activates on text selection anywhere on the
 * page, offers "Explain Code" / "Security Audit" / "Review Contract", and
 * on click sends the selection to background.js (see its QUICK_ACTION
 * handler) which best-effort opens the side panel and always persists the
 * action so the side panel can pick it up (immediately, or the next time
 * it's opened — see sidepanel.js's consumePendingQuickAction).
 *
 * Runs on every http(s) page (see manifest.json's content_scripts) so it
 * has to be defensive about the host page: isolated via Shadow DOM (styles
 * can't leak either direction), never touches the page's own DOM beyond
 * reading the current selection, and never uses innerHTML — the selected
 * text itself is untrusted content that will flow through the model, so
 * nothing here should risk interpreting it as markup.
 */

const QUICK_ACTIONS = [
  { action: "explain", label: "Explain Code" },
  { action: "security", label: "Security Audit" },
  { action: "contract", label: "Review Contract" },
];

const MIN_SELECTION_LENGTH = 3;
const MAX_SELECTION_LENGTH = 8000; // mirrors the side panel's own message cap
const TOAST_DURATION_MS = 3500;

let shadowHost = null;
let shadowRoot = null;
let cssText = null;
let pill = null;
let toast = null;
let toastTimer = null;

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return Boolean(target.closest("[contenteditable], [contenteditable='true']"));
}

async function ensureShadowRoot() {
  if (shadowRoot) return shadowRoot;

  shadowHost = document.createElement("div");
  shadowHost.style.all = "initial";
  // Appended to <html> rather than <body> — a position:fixed descendant of
  // an ancestor with transform/filter/will-change gets re-anchored to that
  // ancestor instead of the viewport, and that's much rarer on <html>
  // itself than somewhere inside <body>. Not a complete fix, just the
  // least-bad anchor point without a full "walk ancestors for a new
  // containing block" implementation.
  document.documentElement.appendChild(shadowHost);
  shadowRoot = shadowHost.attachShadow({ mode: "open" });

  if (cssText === null) {
    try {
      const response = await fetch(chrome.runtime.getURL("content.css"));
      cssText = await response.text();
    } catch (error) {
      console.warn("AvalonLabs: failed to load content.css —", error);
      cssText = "";
    }
  }

  const style = document.createElement("style");
  style.textContent = cssText;
  shadowRoot.appendChild(style);

  return shadowRoot;
}

function removePill() {
  if (pill) {
    pill.remove();
    pill = null;
  }
}

function removeToast() {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (toast) {
    toast.remove();
    toast = null;
  }
}

function showToast(message, { isError = false, anchorRect } = {}) {
  removeToast();
  if (!shadowRoot) return;

  toast = document.createElement("div");
  toast.className = isError ? "av-toast av-toast-error" : "av-toast";
  toast.textContent = message;

  const top = anchorRect ? Math.max(8, anchorRect.top - 44) : 16;
  const left = anchorRect ? Math.min(Math.max(8, anchorRect.left), window.innerWidth - 296) : 16;
  toast.style.top = `${top}px`;
  toast.style.left = `${left}px`;

  shadowRoot.appendChild(toast);
  toastTimer = setTimeout(removeToast, TOAST_DURATION_MS);
}

async function runQuickAction(action, text, anchorRect) {
  removePill();
  try {
    const response = await chrome.runtime.sendMessage({ type: "QUICK_ACTION", action, text });
    if (response?.ok) {
      showToast("Sent to AvalonLabs — check the side panel for the answer.", { anchorRect });
    } else {
      showToast(response?.error || "Couldn't reach the AvalonLabs extension.", { isError: true, anchorRect });
    }
  } catch (error) {
    // Most commonly: the extension context was invalidated (e.g. the
    // extension was reloaded/updated while this content script was still
    // injected in an old tab) — sendMessage throws synchronously in that
    // case rather than resolving with an error response.
    showToast("AvalonLabs extension unavailable — try reloading the page.", { isError: true, anchorRect });
    console.warn("AvalonLabs: quick action failed —", error);
  }
}

async function showPill(selectionText, rect) {
  const root = await ensureShadowRoot();
  removePill();
  removeToast();

  pill = document.createElement("div");
  pill.className = "av-pill";

  QUICK_ACTIONS.forEach(({ action, label }, index) => {
    if (index > 0) {
      const divider = document.createElement("div");
      divider.className = "av-pill-divider";
      pill.appendChild(divider);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "av-pill-btn";
    btn.textContent = label;
    btn.addEventListener("mousedown", (event) => {
      // mousedown (not click) so this fires before the page's own
      // selectionchange/blur handling can clear window.getSelection().
      event.preventDefault();
      runQuickAction(action, selectionText, rect);
    });
    pill.appendChild(btn);
  });

  root.appendChild(pill);

  const pillWidth = pill.offsetWidth || 260;
  const top = Math.max(8, rect.top - 44);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - pillWidth - 8);
  pill.style.top = `${top}px`;
  pill.style.left = `${left}px`;
}

function handleSelectionChange() {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : "";

  if (!text || text.length < MIN_SELECTION_LENGTH) {
    removePill();
    return;
  }
  if (isEditableTarget(document.activeElement)) {
    removePill();
    return;
  }

  const truncated = text.length > MAX_SELECTION_LENGTH ? text.slice(0, MAX_SELECTION_LENGTH) : text;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    removePill();
    return;
  }

  showPill(truncated, rect);
}

document.addEventListener("mouseup", (event) => {
  if (shadowHost && event.composedPath().includes(shadowHost)) return;
  // Defer a tick so the browser's own selection state has settled after
  // the mouseup that triggered it.
  setTimeout(handleSelectionChange, 0);
});

document.addEventListener("keyup", (event) => {
  if (event.key === "Escape") {
    removePill();
    removeToast();
    return;
  }
  if (shadowHost && event.composedPath().includes(shadowHost)) return;
  setTimeout(handleSelectionChange, 0);
});

document.addEventListener("mousedown", (event) => {
  if (shadowHost && event.composedPath().includes(shadowHost)) return;
  removePill();
});

document.addEventListener("scroll", () => removePill(), { passive: true, capture: true });
