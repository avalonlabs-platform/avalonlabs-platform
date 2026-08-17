import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "avalonlabs.history.v1";
const MAX_ENTRIES = 200;

export interface HistoryEntry {
  id: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  query: string;
  response: string;
  createdAt: string;
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addHistoryEntry(
  entry: Omit<HistoryEntry, "id" | "createdAt">
): Promise<HistoryEntry[]> {
  const existing = await getHistory();
  const newEntry: HistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const updated = [newEntry, ...existing].slice(0, MAX_ENTRIES);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
