import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { fetchAnalyses, type Analysis } from "@/lib/db";
import { getAgent } from "@/lib/agents";
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
  const [entries, setEntries] = useState<Analysis[]>([]);
  const [selected, setSelected] = useState<Analysis | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(isRefresh: boolean) {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const data = await fetchAnalyses();
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your analyses.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Re-fetch on every focus (not just mount) so a fresh entry from the
  // Action tab shows up immediately when switching back to this tab.
  useFocusEffect(
    useCallback(() => {
      load(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => {
      const toolName = getAgent(entry.tool_name)?.name ?? entry.tool_name;
      return (
        entry.input_data.toLowerCase().includes(q) ||
        entry.result_data.toLowerCase().includes(q) ||
        toolName.toLowerCase().includes(q)
      );
    });
  }, [entries, search]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <Text style={styles.heading}>Collection</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search your analyses"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {filtered.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.empty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.cyan} />}
        >
          <Text style={styles.emptyText}>
            {entries.length === 0 ? "No analyses yet — run one from the Action tab." : "No matches for that search."}
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.cyan} />}
          renderItem={({ item }) => {
            const toolInfo = getAgent(item.tool_name);
            return (
              <Pressable style={styles.card} onPress={() => setSelected(item)}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardAgent}>
                    {toolInfo?.emoji ?? "🔧"} {toolInfo?.name ?? item.tool_name}
                  </Text>
                  <Text style={styles.cardTime}>{formatTimestamp(item.created_at)}</Text>
                </View>
                <Text style={styles.cardQuery} numberOfLines={2}>
                  {item.input_data}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selected ? (getAgent(selected.tool_name)?.emoji ?? "🔧") : ""}{" "}
              {selected ? (getAgent(selected.tool_name)?.name ?? selected.tool_name) : ""}
            </Text>
            <Pressable onPress={() => setSelected(null)}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.modalSectionLabel}>Query</Text>
            <Text style={styles.modalQuery}>{selected?.input_data}</Text>
            <Text style={styles.modalSectionLabel}>Response</Text>
            <Text style={styles.modalResponse}>{selected?.result_data}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
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
  searchRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  errorBox: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
  },
  empty: {
    flexGrow: 1,
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
    paddingTop: 0,
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
