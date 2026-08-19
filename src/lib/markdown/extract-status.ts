export type StatusLevel = "PASS" | "WARNING" | "CRITICAL" | "INFO";

const STATUS_PATTERN = /^\s*\[STATUS:\s*(PASS|WARNING|CRITICAL|INFO)\]\s*$/i;

/**
 * Pulls a leading `[STATUS: LEVEL]` marker (emitted by agents per the shared
 * response-format directive in src/constants/agents.ts) out of raw markdown
 * so it can be rendered as a dedicated <StatusBadge> instead of literal
 * paragraph text. Only matches within the first few non-empty lines of the
 * message — the directive asks for the badge at the very top of the
 * response, and scanning the whole message risks stripping a coincidental
 * match inside a code sample or quoted text further down.
 */
export function extractStatusBadge(content: string): { status: StatusLevel | null; content: string } {
  const lines = content.split("\n");
  let seen = 0;
  for (let i = 0; i < lines.length && seen < 6; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    seen++;
    const match = STATUS_PATTERN.exec(line.trim());
    if (match) {
      const status = match[1].toUpperCase() as StatusLevel;
      const remaining = [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n").replace(/^\s+/, "");
      return { status, content: remaining };
    }
  }
  return { status: null, content };
}
