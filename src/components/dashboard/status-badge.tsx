import type { StatusLevel } from "@/lib/markdown/extract-status";

const STATUS_STYLES: Record<StatusLevel, string> = {
  PASS: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  INFO: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  WARNING: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  CRITICAL: "bg-red-500/15 text-red-300 ring-red-500/30",
};

const STATUS_ICONS: Record<StatusLevel, string> = {
  PASS: "✓",
  INFO: "ℹ",
  WARNING: "⚠",
  CRITICAL: "✕",
};

export function StatusBadge({ status }: { status: StatusLevel }) {
  return (
    <span
      className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide uppercase ring-1 ${STATUS_STYLES[status]}`}
    >
      <span aria-hidden>{STATUS_ICONS[status]}</span>
      {status}
    </span>
  );
}
