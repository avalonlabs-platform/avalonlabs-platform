"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ToolDemoExample } from "@/constants/tools";
import { MarkdownRenderer } from "@/components/dashboard/markdown-renderer";

type ChatMessage = { id: number; role: "user" | "agent"; content: string; typing?: boolean };

const MAX_MESSAGE_LENGTH = 500;

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return idCounter;
}

/** Public, unauthenticated mini-demo for a /tools/[slug] landing page — posts to the
 *  same rate-limited /api/demo-chat endpoint as the homepage hero, pointed at this
 *  specific agent's real system prompt via agentId for an on-topic preview.
 *
 *  Renders through the same MarkdownRenderer a paying customer's dashboard
 *  response uses (Revenue Recovery Track B, step 2) — previously this had its
 *  own lightweight parser that only handled ```fenced``` code blocks,
 *  **bold** text, and `code` spans, so the "[STATUS: LEVEL]" marker every agent's
 *  systemPrompt is instructed to lead with (see RESPONSE_FORMAT_DIRECTIVE in
 *  src/constants/agents.ts) rendered as literal bracketed text instead of the
 *  colored StatusBadge. Sharing the real renderer means an anonymous visitor
 *  sees the same enterprise-grade "[STATUS: ...]" badge + Executive Summary a
 *  paying customer sees — the free preview's whole "60-second aha" only works
 *  if it looks like the real product. The route this posts to
 *  (src/app/api/demo-chat/route.ts) is responsible for making sure the model
 *  stops after the Executive Summary in this unauthenticated context — see
 *  TOOL_PREVIEW_GUARD there — since anything sent over this stream is
 *  visible in the network tab regardless of how it's rendered here. */
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
    <div className="relative overflow-hidden rounded-xl border border-border-subtle bg-[#0a0c10] shadow-2xl shadow-black/60">
      {/* Terminal window chrome */}
      <div className="flex items-center gap-3 border-b border-border-subtle bg-white/[0.02] px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        </div>
        <p className="flex-1 text-center font-mono text-xs text-white/40">{agentId} — demo</p>
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-glow-cyan opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-glow-cyan" />
        </span>
      </div>

      <div ref={scrollRef} className="max-h-80 min-h-[9rem] space-y-3 overflow-y-auto px-4 py-4 font-mono text-sm">
        {messages.length === 0 && <p className="text-white/30">Try a prompt below.</p>}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {m.role === "user" ? (
                <p className="text-white/90">
                  <span className="text-glow-cyan">$</span> {m.content}
                </p>
              ) : (
                <div className="pl-3">
                  <MarkdownRenderer content={m.content} />
                  {m.typing && <span className="animate-caret ml-0.5 inline-block w-1.5 bg-glow-cyan align-middle">&nbsp;</span>}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isThinking && (
          <div className="flex items-center gap-1 pl-3">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-glow-cyan/60"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border-subtle px-4 py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => send(ex.prompt)}
              disabled={isThinking}
              className="rounded-full border border-border-subtle bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <span className="font-mono text-sm text-glow-cyan">$</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={isThinking}
            className="flex-1 rounded-full border border-border-subtle bg-white/[0.03] px-4 py-2.5 font-mono text-sm text-white placeholder:text-white/30 focus:border-indigo-400/50 focus:outline-none disabled:opacity-50"
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
