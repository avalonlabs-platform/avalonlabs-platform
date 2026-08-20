"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { agentProviderLabel, type Agent } from "@/constants/agents";
import { AgentAccessBadge } from "@/components/dashboard/agent-access-badge";
import { MarkdownRenderer } from "@/components/dashboard/markdown-renderer";
import { MessageExportMenu } from "@/components/dashboard/message-export-menu";
import { AttachmentBar, CATEGORY_ICON } from "@/components/dashboard/attachment-bar";
import { useChatAttachments } from "@/hooks/use-chat-attachments";

type MessageAttachmentSummary = { name: string; category: string };
type ChatMessage = {
  id: number;
  role: "user" | "agent";
  content: string;
  typing?: boolean;
  attachments?: MessageAttachmentSummary[];
};
type ApiTurn = { role: "user" | "assistant"; content: string };

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return idCounter;
}

/** Isolated so each agent bubble owns its own DOM ref for the export menu
 *  (copy/`.md`/PDF) without the parent needing a ref-per-message map. Export
 *  controls are withheld while streaming and for error bubbles — neither is
 *  a finished response worth exporting. */
function AgentBubble({ message, agentName }: { message: ChatMessage; agentName: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const isError = message.content.startsWith("⚠️");
  const showExport = !message.typing && !isError && message.content.trim().length > 0;

  return (
    <div className="max-w-[85%]">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <MarkdownRenderer ref={contentRef} content={message.content} />
        {message.typing && <span className="animate-caret ml-0.5 inline-block w-1.5 bg-white/70">&nbsp;</span>}
      </div>
      {showExport && <MessageExportMenu agentName={agentName} content={message.content} containerRef={contentRef} />}
    </div>
  );
}

/** Remounted (via `key={agent.id}`) whenever the selected agent changes, so history resets per-agent. */
export function AgentChat({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: nextId(), role: "agent", content: agent.greeting },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  // Real conversation sent to the model — excludes the client-only greeting.
  const historyRef = useRef<ApiTurn[]>([]);
  const attachmentsState = useChatAttachments();
  const { addFiles } = attachmentsState;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Lets a user Snipping-Tool a screenshot and paste it straight in with
  // Ctrl/Cmd+V, no save-to-disk round trip. Window-scoped rather than
  // input-scoped since focus may be anywhere in the panel when they paste.
  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        addFiles(files);
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addFiles]);

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer?.types.includes("Files")) {
      dragCounterRef.current += 1;
      setIsDraggingOver(true);
    }
  }, []);
  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);
  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDraggingOver(false);
  }, []);
  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
      if (event.dataTransfer?.files?.length) {
        addFiles(event.dataTransfer.files);
      }
    },
    [addFiles]
  );

  async function send(prompt: string) {
    const text = prompt.trim();
    const readyAttachments = attachmentsState.readyPayloads;
    const canSend =
      (text || readyAttachments.length > 0) &&
      !isThinking &&
      !attachmentsState.isReading &&
      !attachmentsState.isOverBudget;
    if (!canSend) return;

    setInput("");
    const attachmentSummaries: MessageAttachmentSummary[] = attachmentsState.attachments
      .filter((a) => a.status === "ready")
      .map((a) => ({ name: a.name, category: a.category ?? "text" }));
    attachmentsState.clearAttachments();

    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", content: text, attachments: attachmentSummaries.length ? attachmentSummaries : undefined },
    ]);
    setIsThinking(true);

    const history = historyRef.current;
    const agentMsgId = nextId();
    const historyText = text || "[Attached file(s)]";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, message: text, history, attachments: readyAttachments }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      setIsThinking(false);
      setMessages((prev) => [...prev, { id: agentMsgId, role: "agent", content: "", typing: true }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
        const full = chunks.join("");
        setMessages((prev) => prev.map((m) => (m.id === agentMsgId ? { ...m, content: full } : m)));
      }

      const full = chunks.join("");
      setMessages((prev) => prev.map((m) => (m.id === agentMsgId ? { ...m, typing: false } : m)));
      historyRef.current = [...history, { role: "user", content: historyText }, { role: "assistant", content: full }];
      // Re-fetch server components (credit badge, subscription status) in
      // case this response spent a free credit.
      router.refresh();
    } catch (error) {
      setIsThinking(false);
      const errorText = error instanceof Error ? error.message : "Something went wrong.";
      setMessages((prev) => {
        const withoutPending = prev.filter((m) => m.id !== agentMsgId);
        return [
          ...withoutPending,
          { id: agentMsgId, role: "agent", content: `⚠️ ${errorText}` },
        ];
      });
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    send(input);
  }

  const canSubmit =
    (input.trim().length > 0 || attachmentsState.readyPayloads.length > 0) &&
    !isThinking &&
    !attachmentsState.isReading &&
    !attachmentsState.isOverBudget;

  return (
    <div
      className="relative flex flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-indigo-400/60 bg-indigo-500/10 backdrop-blur-sm">
          <p className="rounded-full bg-indigo-500/90 px-4 py-2 text-sm font-semibold text-white shadow-lg">
            Drop files to attach
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-white/10 px-6 py-4">
        <span className="text-xl leading-none">{agent.emoji}</span>
        <div>
          <p className="text-sm font-semibold text-white">{agent.name}</p>
          <p className="text-xs text-white/40">{agentProviderLabel(agent)}</p>
        </div>
        <AgentAccessBadge agentId={agent.id} />
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
              {m.role === "user" ? (
                <div className="max-w-[75%] rounded-2xl bg-indigo-500/90 px-4 py-2.5 text-sm leading-relaxed text-white">
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {m.attachments.map((a, i) => (
                        <span
                          key={i}
                          className="inline-flex max-w-[10rem] items-center gap-1 truncate rounded-full bg-white/15 px-2 py-0.5 text-[11px]"
                        >
                          <span aria-hidden>{CATEGORY_ICON[a.category] ?? "📎"}</span>
                          <span className="truncate">{a.name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {m.content && <span className="whitespace-pre-wrap">{m.content}</span>}
                </div>
              ) : (
                <AgentBubble message={m} agentName={agent.name} />
              )}
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

      {attachmentsState.bannerError && (
        <p className="border-t border-white/10 px-6 pt-2 text-xs text-red-400">{attachmentsState.bannerError}</p>
      )}
      {attachmentsState.isOverBudget && (
        <p className="border-t border-white/10 px-6 pt-2 text-xs text-red-400">
          Attachments are too large combined — remove one to send this message.
        </p>
      )}
      <AttachmentBar attachments={attachmentsState.attachments} onRemove={attachmentsState.removeAttachment} />

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/10 px-6 py-4">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.txt,.csv,.json,.log"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isThinking}
          title="Attach a file"
          aria-label="Attach a file"
          className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] p-2.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${agent.name}…`}
          disabled={isThinking}
          className="flex-1 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-indigo-400/50 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="shrink-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
