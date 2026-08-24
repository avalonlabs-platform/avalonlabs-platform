import { describe, expect, it } from "vitest";
import { API_KEY_PREFIX, apiKeyPrefix, generateApiKey, hashApiKey } from "./api-keys";

// This module is the entire security boundary for API-key auth (see
// src/lib/auth-request.ts): a plaintext key exists exactly once, in the
// creation response, and every later request is verified only by the hash
// stored in api_keys.key_hash. A regression here (a non-deterministic hash,
// a prefix that leaks enough of the secret, a weak/predictable generator)
// is a credential-handling bug, not a cosmetic one — hence testing it
// directly rather than only through the API route that calls it.
describe("generateApiKey", () => {
  it("starts with the documented prefix", () => {
    expect(generateApiKey().startsWith(API_KEY_PREFIX)).toBe(true);
  });

  it("generates a different key every call", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey()));
    expect(keys.size).toBe(50);
  });

  it("only contains base64url-safe characters after the prefix", () => {
    const key = generateApiKey();
    const suffix = key.slice(API_KEY_PREFIX.length);
    expect(suffix).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hashApiKey", () => {
  it("is deterministic — the same key always hashes the same way", () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it("produces a 64-char lowercase hex sha256 digest", () => {
    expect(hashApiKey("ak_live_test")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different keys hash differently", () => {
    expect(hashApiKey(generateApiKey())).not.toBe(hashApiKey(generateApiKey()));
  });

  it("never reproduces the plaintext key in its output", () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).not.toContain(key);
  });
});

describe("apiKeyPrefix", () => {
  it("returns exactly the first 12 characters", () => {
    const key = generateApiKey();
    expect(apiKeyPrefix(key)).toBe(key.slice(0, 12));
    expect(apiKeyPrefix(key)).toHaveLength(12);
  });

  it("matches the documented example shape", () => {
    // Doc comment on apiKeyPrefix gives "ak_live_a1b2" as the example shape.
    expect(apiKeyPrefix("ak_live_a1b2c3d4e5f6")).toBe("ak_live_a1b2");
  });
});
