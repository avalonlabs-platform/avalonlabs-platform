import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

const legalLinks = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund", label: "Refund & Cancellation Policy" },
];

const productLinks = [
  { href: "/#agents", label: "AI Agents" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#contact", label: "Contact" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <p className="text-lg font-bold text-zinc-900 dark:text-white">{siteConfig.shortName}</p>
            <p className="mt-2 max-w-xs text-sm text-zinc-600 dark:text-zinc-400">{siteConfig.tagline}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Product</p>
            <ul className="mt-3 space-y-2">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Legal</p>
            <ul className="mt-3 space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              <a
                href={`mailto:${siteConfig.supportEmail}`}
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              >
                {siteConfig.supportEmail}
              </a>
            </p>
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
          <p>
            &copy; {year} {siteConfig.legalEntityName}. All rights reserved.
          </p>
          <p className="mt-1">{siteConfig.legalEntityAddress}</p>
          <p className="mt-1">
            Payments are processed by Paddle.com, acting as our authorized resellers and Merchant
            of Record for all orders.
          </p>
        </div>
      </div>
    </footer>
  );
}
