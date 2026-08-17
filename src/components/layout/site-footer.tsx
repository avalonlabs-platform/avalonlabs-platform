import Link from "next/link";
import { siteConfig } from "@/lib/site-config";
import { toolPages } from "@/constants/tools";

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

const toolLinks = toolPages.map((tool) => ({ href: `/tools/${tool.slug}`, label: tool.name }));

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-white/10 bg-background">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent"
      />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <p className="text-lg font-bold text-white">{siteConfig.shortName}</p>
            <p className="mt-2 max-w-xs text-sm text-white/50">{siteConfig.tagline}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Product</p>
            <ul className="mt-3 space-y-2">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-white/50 hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Tools</p>
            <ul className="mt-3 space-y-2">
              {toolLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-white/50 hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Legal</p>
            <ul className="mt-3 space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-white/50 hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              <a href={`mailto:${siteConfig.supportEmail}`} className="text-white/50 hover:text-white">
                {siteConfig.supportEmail}
              </a>
            </p>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-xs text-white/40">
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
