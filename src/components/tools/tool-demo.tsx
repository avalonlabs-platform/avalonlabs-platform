"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ToolDemoExample } from "@/constants/tools";

type ChatMessage = { id: number; role: "user" | "agent"; content: string; typing?: boolean };

const MAX_MESSAGE_LENGTH = 500;

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return idCounter;
}

/** Public, unauthenticated mini-demo for a /tools/[slug] landing page — posts to the
 *  same rate-limited /api/demo-chat endpoint as the homepage hero, pointed at this
 *  specific agent's real system prompt via agentId for an on-topic preview. */
export function ToolDemo({
  agentId,
  placeholder,
  examples,
}: {
  agentId: string;
  placeholder: string;
  examples: ToolDemoExample[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(prompt: string) {
    const text = prompt.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text || isThinking) return;

    setInput("");
    setMessages((prev) => [...prev, { id: nextId(), role: "user", content: text }]);
    setIsThinking(true);

    const msgId = nextId();

    try {
      const res = await fetch("/api/demo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, agentId }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      setIsThinking(false);
      setMessages((prev) => [...prev, { id: msgId, role: "agent", content: "", typing: true }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
        const full = chunks.join("");
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: full } : m)));
      }

      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, typing: false } : m)));
    } catch (error) {
      setIsThinking(false);
      const errorText = error instanceof Error ? error.message : "Something went wrong.";
      setMessages((prev) => {
        const withoutPending = prev.filter((m) => m.id !== msgId);
        return [...withoutPending, { id: msgId, role: "agent", content: `⚠️ ${errorText}` }];
      });
    }
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
          <p className="text-sm font-medium text-white/80">Live demo — real AI Agent</p>
        </div>
        <p className="text-xs text-white/40">No sign-up needed</p>
      </div>

      <div ref={scrollRef} className="max-h-80 min-h-[9rem] space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 && <p className="text-sm text-white/40">Try a prompt below.</p>}

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
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
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
          {examples.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => send(ex.prompt)}
              disabled={isThinking}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            maxLength={MAX_MESSAGE_LENGTH}
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
