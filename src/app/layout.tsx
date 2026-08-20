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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
