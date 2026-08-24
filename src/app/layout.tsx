import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { siteConfig } from "@/lib/site-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Leads with the exact app name configured on the Google OAuth consent
// screen ("AvalonLabs") rather than the longer "AvalonLabs Platform" —
// Google's branding verification checks that the app name on the consent
// screen matches what's shown on the homepage, and an exact prefix match
// here removes any ambiguity for that automated check.
const title = `${siteConfig.shortName} — AI Agents & SaaS Microservices Platform`;

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  // Explicit applicationName — a separate signal from `title` that some
  // crawlers (including Google's OAuth consent screen branding reviewer)
  // read independently when matching the app name against the OAuth
  // consent screen's configured name. Keep it the exact, bare brand name
  // with no descriptive suffix, matching siteConfig.shortName.
  applicationName: siteConfig.shortName,
  title,
  description: siteConfig.tagline,
  openGraph: {
    title,
    description: siteConfig.tagline,
    url: siteConfig.url,
    siteName: siteConfig.shortName,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: siteConfig.tagline,
  },
  // Google Search Console domain-ownership verification, required as part
  // of the OAuth consent screen branding review.
  verification: {
    google: "VHbwmQxURdvuPySEzy0jiIK7i8iVO8-4MyY-0tQXnSw",
  },
};

// JSON-LD Organization schema — read by Google Search (and other engines)
// to attach a verified name/logo/site to search results (knowledge panel,
// sitelinks search box, etc.), independent of the OAuth consent-screen
// branding review. Logo points at a static PNG rather than logo.svg:
// Google's structured-data guidelines list JPEG/PNG/WebP/GIF as supported
// logo formats and don't document SVG support, so a PNG is the safer
// choice here even though the site's UI can use the SVG freely elsewhere.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteConfig.shortName,
  legalName: siteConfig.legalEntityName,
  url: siteConfig.url,
  logo: `${siteConfig.url}/logo-512.png`,
  description: siteConfig.tagline,
  email: siteConfig.supportEmail,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {/* Static, locally-built JSON (no user input) — safe to inject directly. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
