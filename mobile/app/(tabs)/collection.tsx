import { useCallback, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { clearHistory, getHistory, type HistoryEntry } from "@/lib/history";
import { colors } from "@/lib/theme";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CollectionScreen() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);

  // Re-read on every focus (not just mount) so a fresh entry from the Action
  // tab shows up immediately when switching back to this tab.
  useFocusEffect(
    useCallback(() => {
      getHistory().then(setEntries);
    }, [])
  );

  function handleClear() {
    Alert.alert("Clear history", "Remove all saved analyses from this device?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await clearHistory();
          setEntries([]);
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <Text style={styles.heading}>Collection</Text>
        {entries.length > 0 && (
          <Pressable onPress={handleClear}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        )}
      </View>

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No analyses yet — run one from the Action tab.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => setSelected(item)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardAgent}>
                  {item.agentEmoji} {item.agentName}
                </Text>
                <Text style={styles.cardTime}>{formatTimestamp(item.createdAt)}</Text>
              </View>
              <Text style={styles.cardQuery} numberOfLines={2}>
                {item.query}
              </Text>
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selected?.agentEmoji} {selected?.agentName}
            </Text>
            <Pressable onPress={() => setSelected(null)}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.modalSectionLabel}>Query</Text>
            <Text style={styles.modalQuery}>{selected?.query}</Text>
            <Text style={styles.modalSectionLabel}>Response</Text>
            <Text style={styles.modalResponse}>{selected?.response}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  clearText: {
    color: colors.red,
    fontSize: 14,
    fontWeight: "500",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    color: colors.textFaint,
    fontSize: 14,
    textAlign: "center",
  },
  list: {
    padding: 20,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  cardAgent: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  cardTime: {
    color: colors.textFaint,
    fontSize: 11,
  },
  cardQuery: {
    color: colors.textMuted,
    fontSize: 13,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  modalClose: {
    color: colors.cyan,
    fontSize: 15,
    fontWeight: "600",
  },
  modalBody: {
    padding: 20,
  },
  modalSectionLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 16,
  },
  modalQuery: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  modalResponse: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
});
