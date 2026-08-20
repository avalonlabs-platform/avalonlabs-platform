/**
 * Vanilla-JS, dependency-free markdown-to-DOM renderer for the extension's
 * side panel. There's no bundler in extension/ (it ships as static files,
 * see scripts/package-extension.mjs), so the richer web-app renderer
 * (react-markdown + react-syntax-highlighter, see
 * src/components/dashboard/markdown-renderer.tsx) can't be reused here —
 * this is a hand-rolled equivalent covering the same shape of agent output
 * (status badge, headings, fenced code blocks, diff blocks, tables, task
 * lists, bullet/numbered lists, inline bold/code/links) minus syntax-
 * highlighting colors, which would require a real tokenizer/theme this
 * surface doesn't have room for.
 *
 * SECURITY: text rendered here can originate from an arbitrary web page —
 * the user selects text on any site, it's sent to the model, and the
 * model's response (which may itself echo back attacker-controlled text)
 * comes back through this renderer into the side panel's privileged
 * extension UI. Every element below is built with createElement/
 * textContent; nothing here ever uses innerHTML or inserts a node built
 * from unescaped string concatenation, so there is no way for rendered
 * content to execute as markup or script.
 */

const STATUS_PATTERN = /\[STATUS:\s*(PASS|INFO|WARNING|CRITICAL)\]/i;
const STATUS_LABELS = {
  PASS: "✓ Pass",
  INFO: "ℹ Info",
  WARNING: "⚠ Warning",
  CRITICAL: "✕ Critical",
};

// Only these URL schemes are ever turned into a real <a href>; anything
// else (javascript:, data:, vbscript:, etc.) renders as plain link text
// with no href, since the URL can originate from untrusted page content.
const SAFE_LINK_SCHEME = /^(https?:|mailto:)/i;

/**
 * Finds a `[STATUS: PASS|INFO|WARNING|CRITICAL]` marker within the first
 * ~6 non-empty lines of `text` (mirrors
 * src/lib/markdown/extract-status.ts's contract for the web app) and
 * returns `{ status, content }` with the marker text removed from that
 * line (and the line dropped entirely if the marker was the only thing on
 * it). Returns `{ status: null, content: text }` if no marker is found.
 */
export function extractStatusBadge(text) {
  const lines = text.split("\n");
  let nonEmptyCount = 0;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (line.trim() === "") continue;
    nonEmptyCount++;

    const match = line.match(STATUS_PATTERN);
    if (match) {
      const status = match[1].toUpperCase();
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

function createStatusBadgeElement(status) {
  const badge = document.createElement("div");
  badge.className = `av-status-badge av-status-${status.toLowerCase()}`;
  badge.textContent = STATUS_LABELS[status] ?? status;
  return badge;
}

/** True if `line` starts a block type other than "paragraph" — used to end
 * paragraph continuation. */
function isBlockStart(line) {
  return (
    /^```/.test(line) ||
    /^#{1,3}\s/.test(line) ||
    /^>/.test(line) ||
    /^[-*]\s/.test(line) ||
    /^\d+\.\s/.test(line) ||
    line.includes("|")
  );
}

function splitTableRow(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  return /^[\s|:-]+$/.test(line) && line.includes("-");
}

/** Splits markdown body text into an ordered list of block descriptors. */
function parseBlocks(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block: ```lang optional/meta/filename
    const fenceMatch = line.match(/^```(\S+)?\s*(.*)$/);
    if (fenceMatch) {
      const lang = (fenceMatch[1] || "").toLowerCase();
      const meta = (fenceMatch[2] || "").trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence (or end of input if unterminated)
      blocks.push({ type: "code", lang, meta, code: codeLines.join("\n") });
      continue;
    }

    // Table: this line has a "|" and the next line is a "---|---" separator.
    if (line.includes("|") && lines[i + 1] !== undefined && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join(" ") });
      continue;
    }

    // Task list / bullet list / numbered list
    const taskMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (taskMatch || bulletMatch || numberedMatch) {
      const isTaskList = Boolean(taskMatch);
      const ordered = !isTaskList && !bulletMatch && Boolean(numberedMatch);
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const tm = l.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
        const bm = l.match(/^[-*]\s+(.*)$/);
        const nm = l.match(/^\d+\.\s+(.*)$/);
        if (isTaskList && tm) {
          items.push({ checked: tm[1].toLowerCase() === "x", text: tm[2] });
          i++;
        } else if (!isTaskList && !ordered && bm && !tm) {
          items.push({ text: bm[1] });
          i++;
        } else if (!isTaskList && ordered && nm) {
          items.push({ text: nm[1] });
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: isTaskList ? "tasklist" : ordered ? "orderedlist" : "bulletlist", items });
      continue;
    }

    // Paragraph: gather contiguous plain-text lines.
    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", text: paraLines.join(" ") });
  }

  return blocks;
}

/**
 * Renders inline markdown (`code`, **bold**, [text](url)) into `parent` as
 * real DOM nodes/text nodes — never innerHTML.
 */
function renderInline(parent, text) {
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (match[1] !== undefined) {
      const code = document.createElement("code");
      code.className = "av-inline-code";
      code.textContent = match[1];
      parent.appendChild(code);
    } else if (match[2] !== undefined) {
      const strong = document.createElement("strong");
      strong.textContent = match[2];
      parent.appendChild(strong);
    } else if (match[3] !== undefined) {
      const label = match[3];
      const url = match[4];
      if (SAFE_LINK_SCHEME.test(url.trim())) {
        const a = document.createElement("a");
        a.textContent = label;
        a.href = url.trim();
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        parent.appendChild(a);
      } else {
        // Unsafe/unknown scheme — render as plain text, no live link.
        parent.appendChild(document.createTextNode(label));
      }
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function copyToClipboard(button, text) {
  const original = button.textContent;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      button.textContent = "Copied!";
    })
    .catch(() => {
      button.textContent = "Copy failed";
    })
    .finally(() => {
      setTimeout(() => {
        button.textContent = original;
      }, 1500);
    });
}

function renderCodeHeader(labelText, code) {
  const header = document.createElement("div");
  header.className = "av-code-header";

  const label = document.createElement("span");
  label.className = "av-code-label";
  label.textContent = labelText;

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "av-copy-btn";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", () => copyToClipboard(copyBtn, code));

  header.append(label, copyBtn);
  return header;
}

function renderCodeBlock(container, block) {
  const wrapper = document.createElement("div");
  wrapper.className = "av-code-block";
  wrapper.appendChild(renderCodeHeader(block.meta || block.lang || "code", block.code));

  const pre = document.createElement("pre");
  pre.className = "av-code-pre";
  const code = document.createElement("code");
  code.textContent = block.code;
  pre.appendChild(code);
  wrapper.appendChild(pre);

  container.appendChild(wrapper);
}

function renderDiffBlock(container, block) {
  const wrapper = document.createElement("div");
  wrapper.className = "av-diff-block";
  wrapper.appendChild(renderCodeHeader(block.meta || "diff", block.code));

  const pre = document.createElement("pre");
  pre.className = "av-diff-pre";

  for (const line of block.code.split("\n")) {
    const lineEl = document.createElement("div");
    if (line.startsWith("+") && !line.startsWith("+++")) {
      lineEl.className = "av-diff-add";
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      lineEl.className = "av-diff-del";
    } else {
      lineEl.className = "av-diff-ctx";
    }
    lineEl.textContent = line;
    pre.appendChild(lineEl);
  }

  wrapper.appendChild(pre);
  container.appendChild(wrapper);
}

function renderTable(container, block) {
  const table = document.createElement("table");
  table.className = "av-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const cell of block.header) {
    const th = document.createElement("th");
    renderInline(th, cell);
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  block.rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    tr.className = rowIndex % 2 === 0 ? "av-row-even" : "av-row-odd";
    for (const cell of row) {
      const td = document.createElement("td");
      renderInline(td, cell);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.appendChild(table);
}

function renderList(container, block, tag) {
  const list = document.createElement(tag);
  list.className = "av-list";
  for (const item of block.items) {
    const li = document.createElement("li");
    renderInline(li, item.text);
    list.appendChild(li);
  }
  container.appendChild(list);
}

function renderTaskList(container, block) {
  const list = document.createElement("ul");
  list.className = "av-tasklist";
  for (const item of block.items) {
    const li = document.createElement("li");
    li.className = "av-task-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    // Uncontrolled/interactive, same as the web app's checklist rendering
    // (src/components/dashboard/markdown-renderer.tsx): this only toggles
    // the pure-CSS :has() strikethrough below for this render, it never
    // writes anything back to the agent response.
    if (item.checked) checkbox.checked = true;

    const label = document.createElement("span");
    renderInline(label, item.text);

    li.append(checkbox, label);
    list.appendChild(li);
  }
  container.appendChild(list);
}

function renderHeading(container, block) {
  const heading = document.createElement(`h${Math.min(block.level + 2, 6)}`);
  heading.className = `av-heading av-heading-${block.level}`;
  renderInline(heading, block.text);
  container.appendChild(heading);
}

function renderParagraph(container, block) {
  const p = document.createElement("p");
  p.className = "av-paragraph";
  renderInline(p, block.text);
  container.appendChild(p);
}

function renderBlockquote(container, block) {
  const quote = document.createElement("blockquote");
  quote.className = "av-blockquote";
  renderInline(quote, block.text);
  container.appendChild(quote);
}

function renderBlock(container, block) {
  switch (block.type) {
    case "code":
      if (block.lang === "diff" || block.lang === "patch") {
        renderDiffBlock(container, block);
      } else {
        renderCodeBlock(container, block);
      }
      break;
    case "table":
      renderTable(container, block);
      break;
    case "heading":
      renderHeading(container, block);
      break;
    case "blockquote":
      renderBlockquote(container, block);
      break;
    case "tasklist":
      renderTaskList(container, block);
      break;
    case "bulletlist":
      renderList(container, block, "ul");
      break;
    case "orderedlist":
      renderList(container, block, "ol");
      break;
    case "paragraph":
    default:
      renderParagraph(container, block);
      break;
  }
}

/**
 * Clears `container` and renders `text` (raw agent-response markdown) into
 * it as safe DOM nodes. Extracts a leading `[STATUS: ...]` marker into a
 * badge above the body content when present.
 */
export function renderMarkdown(container, text) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const { status, content } = extractStatusBadge(text ?? "");
  if (status) {
    container.appendChild(createStatusBadgeElement(status));
  }

  const blocks = parseBlocks(content);
  for (const block of blocks) {
    renderBlock(container, block);
  }
}
