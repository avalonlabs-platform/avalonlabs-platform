"use client";

import { forwardRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/dashboard/code-block";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { extractStatusBadge } from "@/lib/markdown/extract-status";

interface MdastCodeNode {
  type: string;
  lang?: string | null;
  meta?: string | null;
  data?: { hProperties?: Record<string, unknown> };
  children?: MdastCodeNode[];
}

/**
 * Copies each fenced code block's meta string (the text after the language
 * on the opening fence — e.g. ```tsx src/app/example.tsx) into hProperties
 * so it survives the mdast->hast conversion as a `data-meta` attribute.
 * Without this, remark drops `meta` entirely during that conversion and the
 * CodeBlock header below has no filename to show — verified against a real
 * react-markdown v10 + remark-gfm v4 render in the sandbox before shipping.
 */
function remarkCodeMeta() {
  return (tree: MdastCodeNode) => {
    function visit(node: MdastCodeNode) {
      if (node.type === "code") {
        node.data = node.data || {};
        node.data.hProperties = {
          ...(node.data.hProperties || {}),
          "data-meta": node.meta || "",
        };
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}

const components: Components = {
  code(props) {
    const { className, children, node, ...rest } = props;
    void node;
    const languageMatch = /language-(\w+)/.exec(className || "");
    if (!languageMatch) {
      return (
        <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-cyan-200">{children}</code>
      );
    }
    const language = languageMatch[1];
    const meta = (rest as Record<string, unknown>)["data-meta"];
    return (
      <CodeBlock language={language} meta={typeof meta === "string" ? meta : undefined} code={String(children)} />
    );
  },
  pre(props) {
    // CodeBlock already renders its own wrapper (a <div>, not a <pre>) — so
    // the default <pre> react-markdown wraps block code in would otherwise
    // produce invalid nested-block markup. Unwrap it here.
    return <>{props.children}</>;
  },
  table(props) {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full border-collapse text-left text-sm">{props.children}</table>
      </div>
    );
  },
  thead(props) {
    return (
      <thead className="bg-white/[0.06] text-xs tracking-wide text-white/50 uppercase">{props.children}</thead>
    );
  },
  th(props) {
    return <th className="border-b border-white/10 px-3 py-2 font-medium">{props.children}</th>;
  },
  tbody(props) {
    return <tbody className="[&>tr:nth-child(even)]:bg-white/[0.025]">{props.children}</tbody>;
  },
  td(props) {
    return <td className="border-b border-white/5 px-3 py-2 align-top text-white/80">{props.children}</td>;
  },
  input(props) {
    const { type, checked, node, ...rest } = props;
    void node;
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          defaultChecked={checked}
          className="mr-1.5 h-3.5 w-3.5 align-middle accent-indigo-500"
        />
      );
    }
    return <input type={type} checked={checked} {...rest} />;
  },
  li(props) {
    const { className, children, node, ...rest } = props;
    void node;
    return (
      <li
        className={`${className ?? ""} [&:has(>input:checked)]:text-white/40 [&:has(>input:checked)]:line-through`}
        {...rest}
      >
        {children}
      </li>
    );
  },
  a(props) {
    const { node, ...rest } = props;
    void node;
    return (
      <a
        {...rest}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-300 underline decoration-indigo-300/40 underline-offset-2 hover:text-indigo-200"
      />
    );
  },
  h1(props) {
    return <h2 className="mt-4 mb-2 text-base font-semibold text-white first:mt-0">{props.children}</h2>;
  },
  h2(props) {
    return (
      <h3 className="mt-4 mb-2 text-sm font-semibold tracking-wide text-white/90 uppercase first:mt-0">
        {props.children}
      </h3>
    );
  },
  h3(props) {
    return <h4 className="mt-3 mb-1.5 text-sm font-semibold text-white/90 first:mt-0">{props.children}</h4>;
  },
  p(props) {
    return <p className="mb-2.5 last:mb-0">{props.children}</p>;
  },
  ul(props) {
    return <ul className="mb-2.5 ml-4 list-disc space-y-1 last:mb-0">{props.children}</ul>;
  },
  ol(props) {
    return <ol className="mb-2.5 ml-4 list-decimal space-y-1 last:mb-0">{props.children}</ol>;
  },
  blockquote(props) {
    return (
      <blockquote className="my-2.5 border-l-2 border-indigo-400/40 pl-3 text-white/60 italic">
        {props.children}
      </blockquote>
    );
  },
  strong(props) {
    return <strong className="font-semibold text-white">{props.children}</strong>;
  },
  hr() {
    return <hr className="my-4 border-white/10" />;
  },
};

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = forwardRef<HTMLDivElement, MarkdownRendererProps>(function MarkdownRenderer(
  { content },
  ref
) {
  const { status, content: body } = extractStatusBadge(content);

  return (
    <div ref={ref} className="text-sm leading-relaxed text-white/90">
      {status && <StatusBadge status={status} />}
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkCodeMeta]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
});
