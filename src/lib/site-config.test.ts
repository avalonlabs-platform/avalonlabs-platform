import { describe, expect, it } from "vitest";
import { normalizeSiteUrl } from "./site-config";

const FALLBACK = "https://www.avalonlabs-platform.com";

// Regression coverage for the production incident: NEXT_PUBLIC_SITE_URL was
// set to the literal text "next_public_site_url=https" (a "KEY=value" line
// pasted into the value field instead of just the value). That string parses
// as a syntactically valid URL — WHATWG hostnames allow "_" and "=" — so it
// slipped past the try/catch and became a live OAuth redirectTo pointing at
// a nonexistent host, breaking Google/X sign-in for every visitor right
// after they granted access. These cases pin down that this specific shape,
// and the already-known Markdown-link shape, both degrade to the fallback
// instead of producing a broken-but-"valid" URL again.
describe("normalizeSiteUrl", () => {
  it("returns the fallback when the env var is unset", () => {
    expect(normalizeSiteUrl(undefined)).toBe(FALLBACK);
  });

  it("normalizes a clean URL to its origin", () => {
    expect(normalizeSiteUrl("https://www.avalonlabs-platform.com/some/path")).toBe(FALLBACK);
  });

  it("assumes https when the protocol is missing", () => {
    expect(normalizeSiteUrl("www.avalonlabs-platform.com")).toBe(FALLBACK);
  });

  it("extracts the URL out of pasted Markdown link syntax", () => {
    expect(normalizeSiteUrl("[www.avalonlabs-platform.com](https://www.avalonlabs-platform.com)")).toBe(
      FALLBACK
    );
  });

  it("falls back on a pasted 'KEY=value' line instead of shipping a broken host", () => {
    // This is the exact string observed in production — decoded from the
    // OAuth redirect_to param that was sending every social sign-in to a
    // dead address.
    expect(normalizeSiteUrl("next_public_site_url=https")).toBe(FALLBACK);
  });

  it("falls back on other punctuation that parses but isn't a real domain", () => {
    expect(normalizeSiteUrl("some_bad=value")).toBe(FALLBACK);
    expect(normalizeSiteUrl("localhost")).toBe(FALLBACK);
  });

  it("falls back on a syntactically invalid value", () => {
    expect(normalizeSiteUrl("::not a url::")).toBe(FALLBACK);
  });
});