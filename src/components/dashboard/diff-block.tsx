type DiffLineKind = "add" | "remove" | "hunk" | "meta" | "context";

function classifyLine(line: string): DiffLineKind {
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  return "context";
}

const LINE_STYLES: Record<DiffLineKind, string> = {
  add: "bg-emerald-500/10 text-emerald-300",
  remove: "bg-red-500/10 text-red-300",
  hunk: "bg-indigo-500/10 text-indigo-300",
  meta: "text-white/40",
  context: "text-white/70",
};

const LINE_MARKERS: Record<DiffLineKind, string> = {
  add: "+",
  remove: "-",
  hunk: "",
  meta: "",
  context: " ",
};

/** Renders a unified diff (```diff / ```patch fenced blocks) with added/
 *  removed lines colored distinctly — used for code refactors and revisions
 *  instead of plain syntax highlighting, which has no notion of +/- lines. */
export function DiffBlock({ code }: { code: string }) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <pre className="overflow-x-auto bg-[#0a0d12] py-2 text-xs leading-relaxed">
      <code className="grid font-mono">
        {lines.map((line, i) => {
          const kind = classifyLine(line);
          const marker = LINE_MARKERS[kind];
          const rest = marker && line.startsWith(marker) ? line.slice(1) : line;
          return (
            <span key={i} className={`block px-4 py-0.5 whitespace-pre ${LINE_STYLES[kind]}`}>
              <span className="mr-2 inline-block w-2 select-none opacity-70">{marker}</span>
              {rest || " "}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
