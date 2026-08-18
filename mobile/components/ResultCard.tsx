import { Fragment } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";

interface ResultCardProps {
  agentEmoji: string;
  agentName: string;
  text: string;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}

type Segment = { type: "text"; content: string } | { type: "code"; lang: string; content: string };

const CODE_FENCE = /```(\w*)\n([\s\S]*?)```/g;

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CODE_FENCE.lastIndex = 0;
  while ((match = CODE_FENCE.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "code", lang: match[1] || "text", content: match[2].replace(/\n$/, "") });
    lastIndex = CODE_FENCE.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }
  return segments;
}

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

function CodeBlock({ lang, content }: { lang: string; content: string }) {
  const lines = content.split("\n");
  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeBlockHeader}>
        <Text style={styles.codeBlockLang}>{lang}</Text>
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

export function ResultCard({ agentEmoji, agentName, text, imageBase64, imageMediaType }: ResultCardProps) {
  const segments = parseSegments(text);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>
        {agentEmoji} {agentName}
      </Text>

      {imageBase64 && imageMediaType && (
        <Image
          source={{ uri: `data:${imageMediaType};base64,${imageBase64}` }}
          style={styles.thumbnail}
          resizeMode="cover"
          accessibilityLabel="Photo submitted for analysis"
        />
      )}

      {segments.map((segment, idx) => (
        <Fragment key={idx}>
          {segment.type === "text" ? (
            segment.content.trim() ? <Text style={styles.proseText}>{segment.content.trim()}</Text> : null
          ) : (
            <CodeBlock lang={segment.lang} content={segment.content} />
          )}
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
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  thumbnail: {
    width: "100%",
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  proseText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  codeBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#0a0c10",
    overflow: "hidden",
  },
  codeBlockHeader: {
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
});
