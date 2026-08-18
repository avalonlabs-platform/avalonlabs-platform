import { supabase } from "./supabase";

const MAX_INPUT_LENGTH = 4000;
const MAX_RESULT_LENGTH = 20000;
// Bounds how far back the app looks — matches the local-history cap this
// replaced (see the old mobile/lib/history.ts MAX_ENTRIES).
const FETCH_LIMIT = 200;

export interface Analysis {
  id: string;
  user_id: string;
  tool_name: string;
  input_data: string;
  result_data: string;
  created_at: string;
}

/** Fire-and-forget from the caller's perspective: a failed save shouldn't
 *  block showing the analysis result the user already got back. */
export async function saveAnalysis(toolName: string, inputData: string, resultData: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;

  const { error } = await supabase.from("user_analyses").insert({
    user_id: userId,
    tool_name: toolName,
    input_data: inputData.slice(0, MAX_INPUT_LENGTH),
    result_data: resultData.slice(0, MAX_RESULT_LENGTH),
  });
  if (error) {
    console.error("saveAnalysis failed:", error.message);
  }
}

export async function fetchAnalyses(): Promise<Analysis[]> {
  const { data, error } = await supabase
    .from("user_analyses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Exact row count, independent of FETCH_LIMIT — used for the Dashboard's
 *  "total scans" stat so it stays accurate past the list-view cap. */
export async function fetchAnalysesCount(): Promise<number> {
  const { count, error } = await supabase
    .from("user_analyses")
    .select("*", { count: "exact", head: true });

  if (error) throw new Error(error.message);
  return count ?? 0;
}
