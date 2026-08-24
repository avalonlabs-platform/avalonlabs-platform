import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./normalize-email";

// normalizeEmail is the client-side half of a contract with the database:
// supabase/schema.sql's normalize_customer_email trigger applies the exact
// same lower(trim(...)) transform at write time. If this drifts from that
// trigger, email-based lookups (agent-access, subscription-status,
// credit-badge, portal — see the function's own doc comment) silently stop
// matching. These cases exist to catch that drift, not just to exercise
// the one-line implementation.
describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
  });

  it("is idempotent", () => {
    const once = normalizeEmail("User@Example.com");
    expect(normalizeEmail(once)).toBe(once);
  });

  it("returns null for null, undefined, and empty/whitespace-only input", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });

  it("does not mutate already-normalized input", () => {
    expect(normalizeEmail("already@normal.com")).toBe("already@normal.com");
  });
});
