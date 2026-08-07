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
  tagline: "AI Agents & SaaS Microservices for people and businesses who need answers now.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://avalonlabs-platform.vercel.app",

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
