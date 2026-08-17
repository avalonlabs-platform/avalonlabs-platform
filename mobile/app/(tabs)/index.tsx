import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AGENTS, type AgentInfo } from "@/lib/agents";
import { sendChatMessage } from "@/lib/api";
import { addHistoryEntry } from "@/lib/history";
import { colors } from "@/lib/theme";

const MAX_MESSAGE_LENGTH = 4000;

export default function ActionScreen() {
  const [agent, setAgent] = useState<AgentInfo>(AGENTS[0]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    const text = input.trim();
    if (!text || running) return;

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await sendChatMessage(agent.id, text, []);
      setResult(response);
      await addHistoryEntry({
        agentId: agent.id,
        agentName: agent.name,
        agentEmoji: agent.emoji,
        query: text,
        response,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setError(message);
      if (message.toLowerCase().includes("plan") || message.toLowerCase().includes("credit")) {
        Alert.alert("Access required", message);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Action</Text>
        <Text style={styles.subheading}>Pick an agent, paste your input, run it.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.agentRow}>
          {AGENTS.map((a) => {
            const active = a.id === agent.id;
            return (
              <Pressable
                key={a.id}
                onPress={() => setAgent(a)}
                style={[styles.agentChip, active && styles.agentChipActive]}
              >
                <Text style={styles.agentChipEmoji}>{a.emoji}</Text>
                <Text style={[styles.agentChipText, active && styles.agentChipTextActive]}>{a.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* "Viewfinder" input panel — terminal-style framing matching the web tool pages. */}
        <View style={styles.viewfinder}>
          <View style={styles.viewfinderHeader}>
            <View style={styles.dotRow}>
              <View style={[styles.dot, { backgroundColor: "#ff5f56" }]} />
              <View style={[styles.dot, { backgroundColor: "#ffbd2e" }]} />
              <View style={[styles.dot, { backgroundColor: "#27c93f" }]} />
            </View>
            <Text style={styles.viewfinderTitle}>{agent.id}</Text>
          </View>
          <TextInput
            style={styles.viewfinderInput}
            value={input}
            onChangeText={setInput}
            placeholder={agent.greeting}
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            textAlignVertical="top"
          />
        </View>

        <Pressable
          style={[styles.runButton, (!input.trim() || running) && { opacity: 0.5 }]}
          onPress={runAnalysis}
          disabled={!input.trim() || running}
        >
          {running ? <ActivityIndicator color="#fff" /> : <Text style={styles.runButtonText}>Run Analysis</Text>}
        </Pressable>

        {error && (
          <View style={styles.resultBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {result && (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>{agent.emoji} {agent.name}</Text>
            <Text style={styles.resultText}>{result}</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 60,
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  subheading: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 18,
  },
  agentRow: {
    marginBottom: 16,
  },
  agentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  agentChipActive: {
    borderColor: colors.indigo,
    backgroundColor: "rgba(99,102,241,0.15)",
  },
  agentChipEmoji: {
    fontSize: 14,
  },
  agentChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "500",
  },
  agentChipTextActive: {
    color: colors.text,
  },
  viewfinder: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: "#0a0c10",
    overflow: "hidden",
    marginBottom: 16,
  },
  viewfinderHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  dotRow: {
    flexDirection: "row",
    gap: 5,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  viewfinderTitle: {
    color: colors.textFaint,
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  viewfinderInput: {
    minHeight: 140,
    padding: 14,
    color: colors.text,
    fontSize: 14,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  runButton: {
    backgroundColor: colors.indigo,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 20,
  },
  runButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  resultBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 16,
  },
  resultLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  resultText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  errorText: {
    color: colors.red,
    fontSize: 14,
  },
});
