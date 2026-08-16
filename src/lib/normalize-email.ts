/** Every stored email is lowercased/trimmed at write time (see process-webhook.ts),
 *  so callers just need to apply the same normalization to their lookup key for a
 *  plain `.eq("email", ...)` to be effectively case-insensitive — no functional
 *  LOWER() index needed. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}
