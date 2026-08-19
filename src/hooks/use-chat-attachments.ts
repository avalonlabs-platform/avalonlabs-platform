"use client";

import { useCallback, useMemo, useState } from "react";
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_COMBINED_ATTACHMENT_BYTES } from "@/lib/attachments/constants";
import { readFileAsAttachment, AttachmentValidationError } from "@/lib/attachments/validate-and-read";
import type { AttachmentPayload } from "@/lib/attachments/types";

export interface PendingAttachment {
  id: string;
  name: string;
  size: number;
  category: AttachmentPayload["category"] | null;
  status: "reading" | "ready" | "error";
  previewUrl?: string;
  payload?: AttachmentPayload;
  error?: string;
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `att-${idCounter}`;
}

/**
 * Owns the full lifecycle of chat attachments — adding files (from the
 * paperclip picker, drag-and-drop, or a pasted screenshot), the async
 * client-side read + validation per file (see validate-and-read.ts),
 * per-attachment removal, and the combined-size guard that keeps a batch of
 * files under the request budget. All three UI entry points in AgentChat
 * call the same `addFiles`, so they get identical validation.
 */
export function useChatAttachments() {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;

    setBannerError(null);
    setAttachments((prev) => {
      const roomLeft = MAX_ATTACHMENTS_PER_MESSAGE - prev.length;
      if (roomLeft <= 0) {
        setBannerError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message — remove one first.`);
        return prev;
      }
      const accepted = incoming.slice(0, roomLeft);
      if (incoming.length > accepted.length) {
        setBannerError(
          `Only added ${accepted.length} of ${incoming.length} files — the ${MAX_ATTACHMENTS_PER_MESSAGE}-file limit per message was reached.`
        );
      }

      const placeholders: PendingAttachment[] = accepted.map((file) => ({
        id: nextId(),
        name: file.name,
        size: file.size,
        category: null,
        status: "reading",
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      }));

      accepted.forEach((file, i) => {
        const id = placeholders[i].id;
        readFileAsAttachment(file)
          .then((payload) => {
            setAttachments((cur) =>
              cur.map((a) => (a.id === id ? { ...a, status: "ready" as const, category: payload.category, payload } : a))
            );
          })
          .catch((error) => {
            const message =
              error instanceof AttachmentValidationError ? error.message : `Couldn't read "${file.name}".`;
            setAttachments((cur) => cur.map((a) => (a.id === id ? { ...a, status: "error" as const, error: message } : a)));
          });
      });

      return [...prev, ...placeholders];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      return [];
    });
    setBannerError(null);
  }, []);

  const totalBytes = useMemo(() => attachments.reduce((sum, a) => sum + a.size, 0), [attachments]);
  const isOverBudget = totalBytes > MAX_COMBINED_ATTACHMENT_BYTES;
  const isReading = attachments.some((a) => a.status === "reading");
  const readyPayloads = useMemo(
    () =>
      attachments
        .filter((a): a is PendingAttachment & { payload: AttachmentPayload } => a.status === "ready" && !!a.payload)
        .map((a) => a.payload),
    [attachments]
  );

  return {
    attachments,
    bannerError,
    totalBytes,
    isOverBudget,
    isReading,
    readyPayloads,
    addFiles,
    removeAttachment,
    clearAttachments,
  };
}
