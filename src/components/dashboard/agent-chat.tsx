"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Agent } from "@/constants/agents";

type ChatMessage = { id: number; role: "user" | "agent"; content: string; typing?: boolean };

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return idCounter;
}

/** Remounted (via `key={agent.id}`) whenever the selected agent changes, so history resets per-agent. */
export function AgentChat({ agent }: { agent: Agent }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: nextId(), role: "agent", content: agent.greeting },
  ]);
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

    const full = agent.respond(text);
    window.setTimeout(() => {
      const agentId = nextId();
      setIsThinking(false);
      setMessages((prev) => [...prev, { id: agentId, role: "agent", content: "", typing: true }]);
      typeOut(agentId, full);
    }, 550);
  }

  function typeOut(id: number, full: string) {
    let i = 0;
    const step = () => {
      i += Math.max(1, Math.round(full.length / 140));
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, content: full.slice(0, i), typing: i < full.length } : m))
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
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-6 py-4">
        <span className="text-xl leading-none">{agent.emoji}</span>
        <div>
          <p className="text-sm font-semibold text-white">{agent.name}</p>
          <p className="text-xs text-white/40">Mocked responses — live model coming soon</p>
        </div>
      </div>

      <div ref={scrollRef} className="h-[55vh] min-h-[20rem] space-y-4 overflow-y-auto px-6 py-6">
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
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
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

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/10 px-6 py-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${agent.name}…`}
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
  );
}
