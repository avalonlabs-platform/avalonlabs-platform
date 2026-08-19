"use client";

import { useState } from "react";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-light";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import { DiffBlock } from "@/components/dashboard/diff-block";

// Deliberately using the "light" (prism-light) build with only these
// languages registered, rather than the full prism/hljs bundle — keeps the
// client bundle small since these AI agents' outputs are overwhelmingly
// code/config/query snippets in this fixed set. Any language tag outside
// this set still renders correctly (verified in the sandbox) — Prism just
// falls back to unhighlighted monospace text inside the same styled block,
// it doesn't throw.
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("md", markdown);

const LANGUAGE_LABELS: Record<string, string> = {
  tsx: "TSX",
  typescript: "TypeScript",
  ts: "TypeScript",
  jsx: "JSX",
  javascript: "JavaScript",
  js: "JavaScript",
  python: "Python",
  py: "Python",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  json: "JSON",
  sql: "SQL",
  css: "CSS",
  yaml: "YAML",
  yml: "YAML",
  markdown: "Markdown",
  md: "Markdown",
  diff: "Diff",
  patch: "Diff",
};

interface CodeBlockProps {
  language: string;
  meta?: string;
  code: string;
}

/** Renders a fenced code block with a header (filename from the fence's
 *  meta string, e.g. ```tsx src/app/example.tsx — falling back to the
 *  language label when no meta is given), a 1-click copy button, and
 *  line-numbered syntax highlighting. ```diff / ```patch blocks render via
 *  DiffBlock instead, since a unified diff needs +/- line coloring rather
 *  than language token highlighting. */
export function CodeBlock({ language, meta, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const normalizedLanguage = language.toLowerCase();
  const isDiff = normalizedLanguage === "diff" || normalizedLanguage === "patch";
  const label = meta?.trim() || LANGUAGE_LABELS[normalizedLanguage] || language || "Code";
  const cleanCode = code.replace(/\n$/, "");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(cleanCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing more we
      // can do here; the copy button simply won't confirm.
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-white/10">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-3 py-1.5">
        <span className="truncate font-mono text-xs text-white/50">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white/90"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {isDiff ? (
        <DiffBlock code={cleanCode} />
      ) : (
        <SyntaxHighlighter
          language={normalizedLanguage || "text"}
          style={oneDark}
          showLineNumbers
          wrapLongLines
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: "0.75rem",
            padding: "0.75rem 0",
            background: "#0a0d12",
          }}
          lineNumberStyle={{ opacity: 0.3, minWidth: "2.5em" }}
        >
          {cleanCode}
        </SyntaxHighlighter>
      )}
    </div>
  );
}
