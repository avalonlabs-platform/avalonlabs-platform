/**
 * Central site configuration.
 *
 * Placeholders wrapped in [brackets] are legal/business details that must be
 * confirmed before go-live (registered entity name, jurisdiction, address).
 * Everything here is consumed by the legal pages, footer, and contact form
 * so it only needs to be corrected in one place.
 */
export const siteConfig = {
  name: "AvalonLabs Platform",
  shortName: "AvalonLabs",
  tagline: "AI Mentor Agents & SaaS Microservices for people and businesses who need answers now.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.avalonlabs.com",

  // Support & contact
  supportEmail: "support@avalonlabs.com",
  legalEmail: "legal@avalonlabs.com",
  privacyEmail: "privacy@avalonlabs.com",

  legalEntityName: "AvalonLabs, Inc.",
  legalEntityAddress: "Alekse Šantića 22, 81000 Podgorica, Montenegro",
  governingLawJurisdiction: "Montenegro",

  // Paddle acts as Merchant of Record (reseller) for all checkout transactions.
  paddleMerchantName: "Paddle.com Market Ltd (or Paddle.com, Inc. in the US)",

  // Minimum age policy referenced by /terms and the signup flow.
  minimumAgeWithoutConsent: 13,
  ageOfMajorityDefault: 18,
} as const;
