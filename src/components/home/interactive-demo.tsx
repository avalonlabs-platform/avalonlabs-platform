"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";

type ChatMessage = {
  id: number;
  role: "user" | "agent";
  content: string;
  /** Agent messages start empty and reveal via the typewriter effect. */
  typing?: boolean;
};

type Suggestion = { label: string; prompt: string };

const SUGGESTIONS: Suggestion[] = [
  {
    label: "Explain an API endpoint",
    prompt: "Explain what this endpoint does: POST /v1/subscriptions/{id}/pause",
  },
  {
    label: "Explain a code snippet",
    prompt: "Explain what this code does: for (const x of items) total += x.amount;",
  },
  {
    label: "Review a business plan",
    prompt: "Review this idea for gaps: a monthly subscription box for artisanal coffee.",
  },
];

const RESPONSES = {
  api: "This endpoint pauses an active subscription without canceling it. It expects a subscription `id` in the path, accepts an optional `resume_at` date, stops the next billing cycle, and returns the updated subscription object with `status: \"paused\"`. Existing usage/entitlements are typically preserved until the current period ends.",
  code: "This loop walks through `items` and accumulates each element's `amount` field into `total`. It's a simple reduction — equivalent to `items.reduce((sum, x) => sum + x.amount, 0)` — with no filtering, so every item in the array contributes, including any with a zero or negative amount.",
  business:
    "Solid core idea — recurring revenue and a naturally repeat-purchase category. Three gaps worth addressing: (1) churn strategy once novelty fades — rotating origins or a discovery mechanic helps, (2) shipping cost sensitivity for a low-margin product like coffee, and (3) no mention of a sourcing/roaster partnership, which is usually the real moat in this space.",
  fallback:
    "Here's a sample response for the demo — in the full product this would be generated live from your actual input by an AI Agent. Sign up to run this on your own code, contracts, or documents.",
} as const;

function pickResponse(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("api") || lower.includes("endpoint")) return RESPONSES.api;
  if (lower.includes("code") || lower.includes("snippet") || lower.includes("function")) return RESPONSES.code;
  if (lower.includes("business") || lower.includes("plan")) return RESPONSES.business;
  return RESPONSES.fallback;
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return idCounter;
}

export function InteractiveDemo() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function send(prompt: string) {
    const text = prompt.trim();
    if (!text || isThinking) return;

    setInput("");
    setMessages((prev) => [...prev, { id: nextId(), role: "user", content: text }]);
    setIsThinking(true);

    const full = pickResponse(text);
    window.setTimeout(() => {
      const agentId = nextId();
      setIsThinking(false);
      setMessages((prev) => [...prev, { id: agentId, role: "agent", content: "", typing: true }]);
      typeOut(agentId, full);
    }, 650);
  }

  function typeOut(id: number, full: string) {
    let i = 0;
    const step = () => {
      i += Math.max(1, Math.round(full.length / 120));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, content: full.slice(0, i), typing: i < full.length }
            : m
        )
      );
      if (i < full.length) window.setTimeout(step, 12);
    };
    step();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    send(input);
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-glow-cyan opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-glow-cyan" />
          </span>
          <p className="text-sm font-medium text-white/80">Live demo — sample responses</p>
        </div>
        <p className="text-xs text-white/40">No sign-up needed</p>
      </div>

      <div ref={scrollRef} className="max-h-80 min-h-[9rem] space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 && (
          <p className="text-sm text-white/40">
            Try a prompt below to see how an AI Agent responds.
          </p>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-indigo-500/90 text-white"
                    : "border border-white/10 bg-white/5 text-white/90"
                }`}
              >
                {m.content}
                {m.typing && <span className="animate-caret ml-0.5 inline-block w-1.5 bg-white/70">&nbsp;</span>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isThinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-white/50"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-5 py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => send(s.prompt)}
              disabled={isThinking}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              {s.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask an AI Agent anything…"
            disabled={isThinking}
            className="flex-1 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-indigo-400/50 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isThinking || !input.trim()}
            className="shrink-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
