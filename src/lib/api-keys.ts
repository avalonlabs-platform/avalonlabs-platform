import { createHash, randomBytes } from "crypto";

// Distinguishes an API key from a Supabase access token (a JWT) on the same
// `Authorization: Bearer <...>` header in src/lib/auth-request.ts — a JWT
// never starts with this, so the check is unambiguous either way.
export const API_KEY_PREFIX = "ak_live_";

/** Generates a new plaintext API key. This value exists in full exactly
 *  once, in the POST /api/account/api-keys response — never persisted,
 *  never logged. Everything stored afterward is derived from it via
 *  hashApiKey/apiKeyPrefix below. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(24).toString("base64url");
}

/** One-way, deterministic — the same key always hashes the same way, so a
 *  future request's key can be looked up by hash (see api_keys.key_hash in
 *  supabase/schema.sql) without the plaintext ever being stored or
 *  reversible from what's in the database. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** First 12 chars of the plaintext (e.g. "ak_live_a1b2") — safe to persist
 *  and display, so a user can tell their keys apart in a list without the
 *  full secret ever being shown again after creation. */
export function apiKeyPrefix(key: string): string {
  return key.slice(0, 12);
}
