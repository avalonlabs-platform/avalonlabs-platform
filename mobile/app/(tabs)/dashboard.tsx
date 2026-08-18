import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { fetchAccount, type AccountInfo } from "@/lib/api";
import { fetchAnalyses, fetchAnalysesCount, type Analysis } from "@/lib/db";
import { getAgent } from "@/lib/agents";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

const FREE_CREDITS_TOTAL = 3;

export default function DashboardScreen() {
  const { session, signOut } = useAuth();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<Analysis[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setError(null);
    try {
      const [accountData, analysesData, count] = await Promise.all([
        fetchAccount(),
        fetchAnalyses(),
        fetchAnalysesCount(),
      ]);
      setAccount(accountData);
      setRecentAnalyses(analysesData);
      setTotalScans(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load account.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const usageByTool = recentAnalyses.reduce<Record<string, number>>((acc, entry) => {
    const name = getAgent(entry.tool_name)?.name ?? entry.tool_name;
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const topTools = Object.entries(usageByTool)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const creditsUsed = account && !account.subscription ? FREE_CREDITS_TOTAL - account.freeCredits : null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.cyan}
        />
      }
    >
      <Text style={styles.heading}>Dashboard</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      {error && (
        <View style={styles.card}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {account && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Tier status</Text>
          {account.subscription ? (
            <View style={styles.planRow}>
              <Text style={styles.planName}>{account.subscription.tier ?? "Custom plan"}</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{account.subscription.status}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.planName}>Free tier</Text>
          )}

          {creditsUsed !== null && account && (
            <View style={styles.creditsRow}>
              <Text style={styles.cardLabel}>Credits used</Text>
              <Text style={styles.creditsValue}>
                {creditsUsed}/{FREE_CREDITS_TOTAL}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Total scans performed</Text>
        <Text style={styles.usageTotal}>{totalScans}</Text>
        <Text style={styles.usageCaption}>synced across every device on this account</Text>

        {topTools.length > 0 && (
          <View style={styles.agentBreakdown}>
            {topTools.map(([name, count]) => (
              <View key={name} style={styles.agentBreakdownRow}>
                <Text style={styles.agentBreakdownName}>{name}</Text>
                <Text style={styles.agentBreakdownCount}>{count}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  container: {
    padding: 20,
    paddingBottom: 60,
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  email: {
    color: colors.textFaint,
    fontSize: 13,
    marginBottom: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  cardLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  planName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  statusPill: {
    backgroundColor: "rgba(52,211,153,0.15)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    color: colors.emerald,
    fontSize: 11,
    fontWeight: "600",
  },
  creditsRow: {
    marginTop: 14,
  },
  creditsValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  usageTotal: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "700",
  },
  usageCaption: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 4,
  },
  agentBreakdown: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    gap: 8,
  },
  agentBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  agentBreakdownName: {
    color: colors.textMuted,
    fontSize: 13,
  },
  agentBreakdownCount: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  signOutButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  signOutText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
  },
});
