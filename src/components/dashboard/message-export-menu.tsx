"use client";

import { useState, type RefObject } from "react";
import { downloadMarkdown } from "@/lib/export/download-markdown";
import { copyCleanText } from "@/lib/export/copy-clean-text";
import { openPrintReport } from "@/lib/export/print-report";

interface MessageExportMenuProps {
  agentName: string;
  content: string;
  containerRef: RefObject<HTMLDivElement | null>;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function MessageExportMenu({ agentName, content, containerRef }: MessageExportMenuProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  function handleExportMarkdown() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadMarkdown(`${slugify(agentName)}-response-${stamp}.md`, content);
  }

  function handleExportPdf() {
    // Must stay synchronous inside the click handler — window.open() called
    // after an awaited step (e.g. behind an async clipboard call) loses the
    // user-gesture context and gets popup-blocked by most browsers.
    openPrintReport({
      title: `${agentName} — Response`,
      subtitle: new Date().toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" }),
      contentHtml: containerRef.current?.innerHTML ?? "",
    });
  }

  async function handleCopy() {
    const ok = await copyCleanText(containerRef.current);
    setCopyState(ok ? "copied" : "failed");
    setTimeout(() => setCopyState("idle"), 1800);
  }

  return (
    <div className="mt-1.5 flex items-center gap-1 text-white/50 opacity-60 transition-opacity hover:opacity-100">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded px-1.5 py-0.5 text-[11px] font-medium hover:bg-white/10 hover:text-white/80"
      >
        {copyState === "copied" ? "Copied" : copyState === "failed" ? "Couldn't copy" : "Copy text"}
      </button>
      <span className="text-white/15">·</span>
      <button
        type="button"
        onClick={handleExportMarkdown}
        className="rounded px-1.5 py-0.5 text-[11px] font-medium hover:bg-white/10 hover:text-white/80"
      >
        Export .md
      </button>
      <span className="text-white/15">·</span>
      <button
        type="button"
        onClick={handleExportPdf}
        className="rounded px-1.5 py-0.5 text-[11px] font-medium hover:bg-white/10 hover:text-white/80"
      >
        Export PDF
      </button>
    </div>
  );
}
