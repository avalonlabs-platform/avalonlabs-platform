/**
 * Parses an agent response's markdown body into a flat list of render
 * blocks for ResultCard.tsx — mobile's counterpart to the web dashboard's
 * src/components/dashboard/markdown-renderer.tsx and the Chrome
 * extension's markdown.js. Same overall shape (status marker extraction,
 * fenced code blocks, tables, task-list checklists) as those two, scoped to
 * what the Sprint 3 spec asks the mobile chat bubble to render: status
 * badges, code fences, checklists, and tables. Plain prose (including
 * regular non-checkbox bullet lists) renders as-is, matching ResultCard's
 * existing baseline behavior — this sprint didn't ask for full inline
 * markdown (bold/links) on mobile, so that's intentionally out of scope
 * here, same as before this change.
 */

export type StatusLevel = "PASS" | "INFO" | "WARNING" | "CRITICAL";

export type Block =
  | { type: "code"; lang: string; content: string }
  | { type: "heading"; level: number; text: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "checklist"; items: { checked: boolean; text: string }[] }
  | { type: "text"; content: string };

const STATUS_PATTERN = /\[STATUS:\s*(PASS|INFO|WARNING|CRITICAL)\]/i;

/**
 * Finds a `[STATUS: PASS|INFO|WARNING|CRITICAL]` marker within the first
 * ~6 non-empty lines of `text` (mirrors src/lib/markdown/extract-status.ts's
 * contract on the web app) and returns `{ status, content }` with the
 * marker text removed from that line.
 */
export function extractStatus(text: string): { status: StatusLevel | null; content: string } {
  const lines = text.split("\n");
  let nonEmptyCount = 0;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (line.trim() === "") continue;
    nonEmptyCount++;

    const match = line.match(STATUS_PATTERN);
    if (match) {
      const status = match[1].toUpperCase() as StatusLevel;
      const stripped = line.replace(STATUS_PATTERN, "").trim();
      const newLines = lines.slice();
      if (stripped === "") {
        newLines.splice(idx, 1);
      } else {
        newLines[idx] = stripped;
      }
      return { status, content: newLines.join("\n") };
    }

    if (nonEmptyCount >= 6) break;
  }

  return { status: null, content: text };
}

function isTableSeparator(line: string): boolean {
  return /^[\s|:-]+$/.test(line) && line.includes("-");
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function isBlockStart(line: string): boolean {
  return (
    /^```/.test(line) ||
    /^#{1,3}\s/.test(line) ||
    /^[-*]\s+\[[ xX]\]\s/.test(line) ||
    line.includes("|")
  );
}

export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block.
    const fenceMatch = line.match(/^```(\S+)?\s*.*$/);
    if (fenceMatch) {
      const lang = (fenceMatch[1] || "text").toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence (or end of input if unterminated)
      blocks.push({ type: "code", lang, content: codeLines.join("\n") });
      continue;
    }

    // Table: this line has a "|" and the next line is a "---|---" separator.
    if (line.includes("|") && lines[i + 1] !== undefined && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // Heading.
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // Task-list checklist (the Recommendations section from
    // RESPONSE_FORMAT_DIRECTIVE in src/constants/agents.ts).
    const taskMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      const items: { checked: boolean; text: string }[] = [];
      while (i < lines.length) {
        const tm = lines[i].match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (!tm) break;
        items.push({ checked: tm[1].toLowerCase() === "x", text: tm[2] });
        i++;
      }
      blocks.push({ type: "checklist", items });
      continue;
    }

    // Plain prose paragraph — gathered until a blank line or the start of
    // another block type. Internal newlines are preserved (React Native's
    // <Text> renders "\n" as a real line break), so multi-line prose or
    // ordinary (non-checkbox) bullet lists still read naturally.
    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "text", content: paraLines.join("\n").trim() });
  }

  return blocks;
}
