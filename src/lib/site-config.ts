/**
 * Central site configuration.
 *
 * Legal/business details (registered entity name, jurisdiction, address,
 * contact emails) live here as the single source of truth — the legal
 * pages, footer, and contact form all read from this file, so any future
 * change (e.g. a new registered entity or contact address) only needs to
 * be made in one place.
 */

const FALLBACK_SITE_URL = "https://www.avalonlabs-platform.com";

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
  // Purpose statement — used as the meta description and OpenGraph/Twitter
  // card description, and echoed in the homepage hero. Leads with the exact
  // app name ("AvalonLabs") and states plainly what the product does, so
  // automated reviewers (e.g. Google OAuth consent screen branding checks)
  // and human visitors alike can tell what this site is for from the first
  // sentence, without needing to read further.
  tagline:
    "AvalonLabs is an AI-powered platform that gives developers, teams, and businesses specialized AI agents, multi-model LLM chat, and SaaS microservices for everyday engineering and business tasks.",
  url: normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),

  // Support & contact — routed through Google Workspace on the live
  // business domain (avalonlabs-platform.com), not a personal inbox.
  supportEmail: "admin@avalonlabs-platform.com",
  legalEmail: "admin@avalonlabs-platform.com",
  privacyEmail: "admin@avalonlabs-platform.com",

  legalEntityName: "AvalonLabs, Inc.",
  legalEntityAddress: "Alekse Šantića 22, 81000 Podgorica, Montenegro",
  governingLawJurisdiction: "Montenegro",

  // Paddle acts as Merchant of Record (reseller) for all checkout transactions.
  paddleMerchantName: "Paddle.com Market Ltd (or Paddle.com, Inc. in the US)",

  // Minimum age policy referenced by /terms and the signup flow.
  minimumAgeWithoutConsent: 13,
  ageOfMajorityDefault: 18,
} as const;
