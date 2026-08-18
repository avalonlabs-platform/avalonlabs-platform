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
import { AGENTS, getAgent, type AgentInfo } from "@/lib/agents";
import { sendChatMessage, sendVisionMessage } from "@/lib/api";
import { saveAnalysis } from "@/lib/db";
import { colors } from "@/lib/theme";
import { ScannerModal } from "@/components/ScannerModal";
import { VisionCaptureModal } from "@/components/VisionCaptureModal";
import { ResultCard } from "@/components/ResultCard";

const MAX_MESSAGE_LENGTH = 4000;
const VISION_AGENT_ID = "vision-analyzer";

export default function ActionScreen() {
  const [agent, setAgent] = useState<AgentInfo>(AGENTS[0]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [visionVisible, setVisionVisible] = useState(false);
  const [capturedImage, setCapturedImage] = useState<{ base64: string; mediaType: string } | null>(null);

  async function runVisionAnalysis(base64: string, mediaType: string) {
    if (running) return;
    const visionAgent = getAgent(VISION_AGENT_ID) ?? agent;

    setAgent(visionAgent);
    setCapturedImage({ base64, mediaType });
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await sendVisionMessage(visionAgent.id, base64, mediaType, input.trim(), []);
      setResult(response);
      await saveAnalysis(visionAgent.id, "[Photo] " + (input.trim() || "Analyze this image."), response);
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

  async function runAnalysis(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || running) return;

    setRunning(true);
    setError(null);
    setResult(null);
    setCapturedImage(null);

    try {
      const response = await sendChatMessage(agent.id, text, []);
      setResult(response);
      await saveAnalysis(agent.id, text, response);
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

  function handleScanned(data: string) {
    setScannerVisible(false);
    setInput(data);
    runAnalysis(data);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Action</Text>
        <Text style={styles.subheading}>Pick an agent, scan a code or paste input, run it.</Text>

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
            <View style={styles.viewfinderHeaderLeft}>
              <View style={styles.dotRow}>
                <View style={[styles.dot, { backgroundColor: "#ff5f56" }]} />
                <View style={[styles.dot, { backgroundColor: "#ffbd2e" }]} />
                <View style={[styles.dot, { backgroundColor: "#27c93f" }]} />
              </View>
              <Text style={styles.viewfinderTitle}>{agent.id}</Text>
            </View>
            <View style={styles.headerButtonRow}>
              <Pressable style={styles.scanButton} onPress={() => setScannerVisible(true)}>
                <Text style={styles.scanButtonText}>📷 Scan</Text>
              </Pressable>
              <Pressable style={styles.scanButton} onPress={() => setVisionVisible(true)}>
                <Text style={styles.scanButtonText}>📸 Photo</Text>
              </Pressable>
            </View>
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
          onPress={() => runAnalysis()}
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
          <ResultCard
            agentEmoji={agent.emoji}
            agentName={agent.name}
            imageBase64={capturedImage?.base64 ?? null}
            imageMediaType={capturedImage?.mediaType ?? null}
            text={result}
          />
        )}
      </ScrollView>

      <ScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanned={handleScanned}
      />

      <VisionCaptureModal
        visible={visionVisible}
        onClose={() => setVisionVisible(false)}
        onCaptured={(base64, mediaType) => {
          setVisionVisible(false);
          runVisionAnalysis(base64, mediaType);
        }}
      />
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
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  viewfinderHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  headerButtonRow: {
    flexDirection: "row",
    gap: 8,
  },
  scanButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scanButtonText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
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
  errorText: {
    color: colors.red,
    fontSize: 14,
  },
});
