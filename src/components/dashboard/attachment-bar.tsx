"use client";

import type { PendingAttachment } from "@/hooks/use-chat-attachments";

export const CATEGORY_ICON: Record<string, string> = {
  image: "🖼️",
  pdf: "📄",
  text: "📝",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The preview strip above the chat input — one chip per pending attachment,
 *  showing an image thumbnail (or a category icon for PDFs/text files),
 *  name, size (or a status message while reading/on error), and a remove
 *  button. Read by AgentChat, which owns the actual attachment state via
 *  useChatAttachments. */
export function AttachmentBar({
  attachments,
  onRemove,
}: {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-white/10 px-6 pt-3">
      {attachments.map((att) => (
        <div
          key={att.id}
          className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
            att.status === "error" ? "border-red-500/40 bg-red-500/5" : "border-white/10 bg-white/[0.03]"
          }`}
        >
          {att.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- transient
            // client-only blob: URL preview, not an asset for Next's image
            // optimizer to process.
            <img src={att.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
          ) : (
            <span className="text-base leading-none">{CATEGORY_ICON[att.category ?? "text"]}</span>
          )}
          <div className="min-w-0 max-w-[10rem]">
            <p className="truncate text-xs font-medium text-white/80">{att.name}</p>
            <p className={`truncate text-[10px] ${att.status === "error" ? "text-red-400" : "text-white/40"}`}>
              {att.status === "reading" ? "Reading…" : att.status === "error" ? att.error : formatBytes(att.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            aria-label={`Remove ${att.name}`}
            className="ml-1 shrink-0 rounded-full p-0.5 text-white/40 hover:bg-white/10 hover:text-white/80"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
