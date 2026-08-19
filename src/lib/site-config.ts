/**
 * Central site configuration.
 *
 * Placeholders wrapped in [brackets] are legal/business details that must be
 * confirmed before go-live (registered entity name, jurisdiction, address).
 * Everything here is consumed by the legal pages, footer, and contact form
 * so it only needs to be corrected in one place.
 */

const FALLBACK_SITE_URL = "https://avalonlabs-platform.vercel.app";

/**
 * NEXT_PUBLIC_SITE_URL is set per-environment (Vercel dashboard for
 * production/preview, .env.local for dev) and is consumed directly by
 * `new URL(siteConfig.url)` in src/app/layout.tsx's `metadataBase` — an
 * invalid value there throws and fails the entire production build, not
 * just this one field. This has already happened once with a value pasted
 * as rendered Markdown link syntax
 * ("[www.avalonlabs-platform.com](https://www.avalonlabs-platform.com)")
 * instead of a bare URL. Rather than trust the raw env var, extract/repair
 * the common ways this goes wrong and fall back to a known-good URL instead
 * of ever throwing, so a bad env var value degrades gracefully instead of
 * taking down the build.
 */
function normalizeSiteUrl(raw: string | undefined): string {
  if (!raw) return FALLBACK_SITE_URL;

  // A value pasted as Markdown link syntax, e.g.
  // "[www.example.com](https://www.example.com)" — pull the URL out of the
  // parens rather than trying to parse the whole string as one.
  const markdownLink = raw.match(/\(https?:\/\/[^\s)]+\)/i);
  const candidate = (markdownLink ? markdownLink[0].slice(1, -1) : raw).trim();

  // Missing protocol (e.g. "www.avalonlabs-platform.com") — assume https.
  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

  try {
    // Round-trip through URL both to validate it and to normalize away any
    // trailing slash/path, so every consumer gets a clean origin to build on.
    return new URL(withProtocol).origin;
  } catch {
    console.error(
      `site-config: NEXT_PUBLIC_SITE_URL "${raw}" is not a valid URL — falling back to ${FALLBACK_SITE_URL}. ` +
        "Fix the value in Vercel's Project Settings > Environment Variables."
    );
    return FALLBACK_SITE_URL;
  }
}

export const siteConfig = {
  name: "AvalonLabs Platform",
  shortName: "AvalonLabs",
  tagline: "AI Agents & SaaS Microservices for people and businesses who need answers now.",
  url: normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),

  // Support & contact — TEMPORARY: using a real, controlled inbox since no
  // domain is owned yet. Replace with support@/legal@/privacy@<real domain>
  // once a domain is purchased, before Paddle audit submission.
  supportEmail: "momcilosavic1234567@gmail.com",
  legalEmail: "momcilosavic1234567@gmail.com",
  privacyEmail: "momcilosavic1234567@gmail.com",

  legalEntityName: "AvalonLabs, Inc.",
  legalEntityAddress: "Alekse Šantića 22, 81000 Podgorica, Montenegro",
  governingLawJurisdiction: "Montenegro",

  // Paddle acts as Merchant of Record (reseller) for all checkout transactions.
  paddleMerchantName: "Paddle.com Market Ltd (or Paddle.com, Inc. in the US)",

  // Minimum age policy referenced by /terms and the signup flow.
  minimumAgeWithoutConsent: 13,
  ageOfMajorityDefault: 18,
} as const;
