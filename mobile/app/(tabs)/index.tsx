import { useState } from "react";
import {
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
import { sendChatMessage } from "@/lib/api";
import { saveAnalysis } from "@/lib/db";
import { colors } from "@/lib/theme";
import {
  MAX_IMAGE_FILE_BYTES,
  MAX_MOBILE_ATTACHMENTS,
  estimateBase64Bytes,
  nextAttachmentId,
  toAttachmentPayload,
  type MobileAttachment,
} from "@/lib/attachments";
import { hapticComplete, hapticError, hapticSend } from "@/lib/haptics";
import { ScannerModal } from "@/components/ScannerModal";
import { VisionCaptureModal } from "@/components/VisionCaptureModal";
import { AttachmentPreviewBar } from "@/components/AttachmentPreviewBar";
import { SkeletonPulse } from "@/components/SkeletonPulse";
import { ResultCard } from "@/components/ResultCard";

const MAX_MESSAGE_LENGTH = 4000;
const VISION_AGENT_ID = "vision-analyzer";

export default function ActionScreen() {
  const [agent, setAgent] = useState<AgentInfo>(AGENTS[0]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultAgent, setResultAgent] = useState<AgentInfo>(AGENTS[0]);
  const [resultImages, setResultImages] = useState<{ base64: string; mediaType: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [visionVisible, setVisionVisible] = useState(false);
  const [attachments, setAttachments] = useState<MobileAttachment[]>([]);

  function addAttachment(base64: string, mediaType: string) {
    const sizeBytes = estimateBase64Bytes(base64);
    if (sizeBytes > MAX_IMAGE_FILE_BYTES) {
      Alert.alert("Photo too large", "That photo is too large to attach even after compression — try another.");
      return;
    }

    setAttachments((current) => {
      if (current.length >= MAX_MOBILE_ATTACHMENTS) return current;
      // First attachment of a fresh message — default to Vision Analyzer,
      // the agent tuned for reading photographed code/errors/diagrams.
      // The user can still tap a different agent chip afterward; this is
      // just a helpful starting point, not an exclusive vision-only path.
      if (current.length === 0) {
        setAgent(getAgent(VISION_AGENT_ID) ?? agent);
      }
      return [
        ...current,
        {
          id: nextAttachmentId(),
          uri: `data:${mediaType};base64,${base64}`,
          base64,
          mediaType: mediaType as MobileAttachment["mediaType"],
          sizeBytes,
        },
      ];
    });
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((a) => a.id !== id));
  }

  async function runAnalysis(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if ((!text && attachments.length === 0) || running) return;

    const submittedAttachments = attachments;
    const submittedAgent = agent;

    setRunning(true);
    setError(null);
    setResult(null);
    setResultAgent(submittedAgent);
    setResultImages(submittedAttachments.map((a) => ({ base64: a.base64, mediaType: a.mediaType })));
    hapticSend();

    try {
      const payload = submittedAttachments.map((a, idx) => toAttachmentPayload(a, idx));
      const response = await sendChatMessage(submittedAgent.id, text, [], payload);
      setResult(response);
      hapticComplete();

      const label =
        submittedAttachments.length > 0
          ? `[${submittedAttachments.length} Photo${submittedAttachments.length > 1 ? "s" : ""}] ${
              text || "Analyze this image."
            }`
          : text;
      await saveAnalysis(submittedAgent.id, label, response);

      // Only clear the input/attachments once the run actually succeeded —
      // a failure leaves everything in place so the user can just retry.
      setInput("");
      setAttachments([]);
    } catch (e) {
      hapticError();
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

  const canRun = (!!input.trim() || attachments.length > 0) && !running;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Action</Text>
        <Text style={styles.subheading}>Pick an agent, scan a code, attach a photo, or paste input, then run it.</Text>

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

        <AttachmentPreviewBar attachments={attachments} onRemove={removeAttachment} />

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
          style={[styles.runButton, !canRun && { opacity: 0.5 }]}
          onPress={() => runAnalysis()}
          disabled={!canRun}
        >
          {running ? (
            <Text style={styles.runButtonText}>Running…</Text>
          ) : (
            <Text style={styles.runButtonText}>Run Analysis</Text>
          )}
        </Pressable>

        {error && (
          <View style={styles.resultBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {running && !result && <SkeletonPulse />}

        {result && (
          <ResultCard
            agentEmoji={resultAgent.emoji}
            agentName={resultAgent.name}
            images={resultImages}
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
        onCaptured={(base64, mediaType) => addAttachment(base64, mediaType)}
        remainingSlots={MAX_MOBILE_ATTACHMENTS - attachments.length}
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
