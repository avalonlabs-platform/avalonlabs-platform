import { Fragment, useState } from "react";
import { Image, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { extractStatus, parseBlocks, type Block, type StatusLevel } from "@/lib/response-format";
import { hapticSelect } from "@/lib/haptics";
import { colors } from "@/lib/theme";

interface ResultCardProps {
  agentEmoji: string;
  agentName: string;
  text: string;
  /** Zero or more photos submitted alongside the prompt — replaces the old
   *  single imageBase64/imageMediaType pair now that a message can carry
   *  more than one attachment (see lib/attachments.ts, MAX_MOBILE_ATTACHMENTS). */
  images?: { base64: string; mediaType: string }[];
}

const STATUS_PALETTE: Record<StatusLevel, { bg: string; fg: string; label: string }> = {
  PASS: { bg: "rgba(52,211,153,0.15)", fg: colors.emerald, label: "✓ PASS" },
  INFO: { bg: "rgba(99,102,241,0.15)", fg: "#a5b4fc", label: "ℹ INFO" },
  WARNING: { bg: "rgba(245,158,11,0.15)", fg: colors.amber, label: "⚠ WARNING" },
  CRITICAL: { bg: "rgba(248,113,113,0.15)", fg: colors.red, label: "✕ CRITICAL" },
};

// Lightweight regex-based token coloring — not a full language-aware
// tokenizer, but distinguishes comments/strings/numbers/keywords well
// enough to make code readable without pulling in a heavy dependency.
const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "class",
  "import", "export", "from", "async", "await", "try", "catch", "finally", "throw", "new",
  "def", "elif", "except", "with", "as", "pass", "lambda", "yield", "public", "private",
  "static", "void", "int", "string", "bool", "true", "false", "null", "undefined", "None",
  "select", "insert", "update", "delete", "from", "where", "join", "group", "order", "by",
]);
const TOKEN_PATTERN =
  /(\/\/.*$|#.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)/gm;

function highlightLine(line: string, keyPrefix: string) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(line))) {
    if (match.index > lastIndex) {
      parts.push(<Text key={`${keyPrefix}-${i++}`}>{line.slice(lastIndex, match.index)}</Text>);
    }
    const [full, comment, string, number, word] = match;
    if (comment) {
      parts.push(<Text key={`${keyPrefix}-${i++}`} style={styles.tokenComment}>{full}</Text>);
    } else if (string) {
      parts.push(<Text key={`${keyPrefix}-${i++}`} style={styles.tokenString}>{full}</Text>);
    } else if (number) {
      parts.push(<Text key={`${keyPrefix}-${i++}`} style={styles.tokenNumber}>{full}</Text>);
    } else if (word && KEYWORDS.has(word)) {
      parts.push(<Text key={`${keyPrefix}-${i++}`} style={styles.tokenKeyword}>{full}</Text>);
    } else {
      parts.push(<Text key={`${keyPrefix}-${i++}`}>{full}</Text>);
    }
    lastIndex = TOKEN_PATTERN.lastIndex;
  }
  if (lastIndex < line.length) {
    parts.push(<Text key={`${keyPrefix}-${i++}`}>{line.slice(lastIndex)}</Text>);
  }
  return parts;
}

function StatusBadge({ status }: { status: StatusLevel }) {
  const palette = STATUS_PALETTE[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.statusBadgeText, { color: palette.fg }]}>{palette.label}</Text>
    </View>
  );
}

function CodeBlock({ lang, content }: { lang: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const lines = content.split("\n");

  async function handleCopy() {
    hapticSelect();
    await Clipboard.setStringAsync(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeBlockHeader}>
        <Text style={styles.codeBlockLang}>{lang}</Text>
        <Pressable onPress={handleCopy} hitSlop={8} style={styles.copyButton} accessibilityRole="button">
          <Text style={styles.copyButtonText}>{copied ? "Copied!" : "Copy"}</Text>
        </Pressable>
      </View>
      <View style={styles.codeBlockBody}>
        {lines.map((line, idx) => (
          <Text key={idx} style={styles.codeLine}>
            {highlightLine(line, `l${idx}`)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function TableBlock({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <View style={styles.table}>
      <View style={[styles.tableRow, styles.tableHeaderRow]}>
        {header.map((cell, idx) => (
          <View key={idx} style={styles.tableCell}>
            <Text style={styles.tableHeaderText}>{cell}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={[styles.tableRow, rowIdx % 2 === 1 && styles.tableRowAlt]}>
          {row.map((cell, cellIdx) => (
            <View key={cellIdx} style={styles.tableCell}>
              <Text style={styles.tableCellText}>{cell}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function ChecklistBlock({ items }: { items: { checked: boolean; text: string }[] }) {
  return (
    <View style={styles.checklist}>
      {items.map((item, idx) => (
        <View key={idx} style={styles.checklistRow}>
          <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
            {item.checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <Text style={[styles.checklistText, item.checked && styles.checklistTextChecked]}>{item.text}</Text>
        </View>
      ))}
    </View>
  );
}

function HeadingBlock({ level, text }: { level: number; text: string }) {
  return <Text style={[styles.heading, level === 1 ? styles.heading1 : level === 2 ? styles.heading2 : styles.heading3]}>{text}</Text>;
}

/** Plain-text version of the response for the native share sheet — the
 *  bracketed [STATUS: ...] marker is already stripped out of `content` by
 *  extractStatus, so it's restated here in a readable form instead of
 *  being silently dropped from what gets shared. */
function buildShareText(agentName: string, status: StatusLevel | null, content: string): string {
  const header = status ? `${agentName} — Status: ${status}` : agentName;
  return `${header}\n\n${content}`.trim();
}

export function ResultCard({ agentEmoji, agentName, text, images }: ResultCardProps) {
  const { status, content } = extractStatus(text);
  const blocks = parseBlocks(content);

  async function handleShare() {
    try {
      await Share.share({ message: buildShareText(`${agentEmoji} ${agentName}`, status, content) });
    } catch {
      // User dismissed the share sheet, or it's unavailable on this
      // device/platform — nothing to surface, this isn't an app error.
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>
          {agentEmoji} {agentName}
        </Text>
        <Pressable onPress={handleShare} hitSlop={8} style={styles.shareButton} accessibilityRole="button">
          <Text style={styles.shareButtonText}>Share ⤴</Text>
        </Pressable>
      </View>

      {status && <StatusBadge status={status} />}

      {images && images.length > 0 && (
        <View style={styles.imageRow}>
          {images.map((image, idx) => (
            <Image
              key={idx}
              source={{ uri: `data:${image.mediaType};base64,${image.base64}` }}
              style={[styles.thumbnail, images.length > 1 && styles.thumbnailMulti]}
              resizeMode="cover"
              accessibilityLabel="Photo submitted for analysis"
            />
          ))}
        </View>
      )}

      {blocks.map((block: Block, idx) => (
        <Fragment key={idx}>
          {block.type === "code" && <CodeBlock lang={block.lang} content={block.content} />}
          {block.type === "table" && <TableBlock header={block.header} rows={block.rows} />}
          {block.type === "checklist" && <ChecklistBlock items={block.items} />}
          {block.type === "heading" && <HeadingBlock level={block.level} text={block.text} />}
          {block.type === "text" && block.content ? <Text style={styles.proseText}>{block.content}</Text> : null}
        </Fragment>
      ))}
    </View>
  );
}

const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  shareButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  shareButtonText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  imageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  thumbnail: {
    width: "100%",
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbnailMulti: {
    width: "48%",
    height: 110,
  },
  proseText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  heading: {
    color: colors.text,
    fontWeight: "700",
  },
  heading1: {
    fontSize: 17,
  },
  heading2: {
    fontSize: 15,
  },
  heading3: {
    fontSize: 14,
    color: colors.textMuted,
  },
  codeBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#0a0c10",
    overflow: "hidden",
  },
  codeBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  codeBlockLang: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: MONO_FONT,
    textTransform: "uppercase",
  },
  copyButton: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.surfaceRaised,
  },
  copyButtonText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "600",
  },
  codeBlockBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  codeLine: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: MONO_FONT,
  },
  tokenComment: {
    color: colors.textFaint,
    fontStyle: "italic",
  },
  tokenString: {
    color: colors.emerald,
  },
  tokenNumber: {
    color: colors.violet,
  },
  tokenKeyword: {
    color: colors.cyan,
    fontWeight: "700",
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
  },
  tableHeaderRow: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  tableRowAlt: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  tableCell: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  tableHeaderText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "700",
  },
  tableCellText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  checklist: {
    gap: 8,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  checkboxMark: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 12,
  },
  checklistText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  checklistTextChecked: {
    color: colors.textFaint,
    textDecorationLine: "line-through",
  },
});
