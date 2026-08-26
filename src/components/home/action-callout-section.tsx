"use client";

import Link from "next/link";
import { motion } from "framer-motion";

// Same fix as Hero/SiteHeader: a Link to "/#id" only reliably scrolls when
// navigating to "/" from elsewhere — clicked from the home page itself it's
// a no-op, so scroll directly instead.
function scrollToSection(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState(null, "", `/#${id}`);
}

const INSTALL_SNIPPET = `- uses: avalonlabs-platform/agent-code-merge-gate@v1.0.0`;

/**
 * Homepage section for the free "Agent Code Merge Gate" GitHub Action
 * (Revenue Recovery Track B, distribution pillar 1) — placed between Hero
 * and PricingTable so a visitor sees the free, no-signup entry point before
 * the paid tiers, then lands on pricing right after if the "See Pro" link
 * is clicked. Mirrors Hero's visual language (bg-grid, glow gradient blur,
 * pill eyebrow, gradient heading) rather than introducing a new section
 * style, so the homepage still reads as one design system.
 */
export function ActionCalloutSection() {
  return (
    <section id="merge-gate" className="relative overflow-hidden border-t border-white/5 py-24 sm:py-32">
      <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-40" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 -translate-y-1/2 transform-gpu overflow-hidden blur-3xl">
        <div className="mx-auto aspect-1155/678 w-[60rem] bg-gradient-to-tr from-glow-cyan via-glow-violet to-glow-indigo opacity-15" />
      </div>

      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-sm text-white/70 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-glow-cyan" />
            Free GitHub Action — no signup required
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-br from-white via-white to-white/60 bg-clip-text text-transparent">
              Catches AI coding regressions
            </span>{" "}
            <span className="bg-gradient-to-r from-glow-indigo via-glow-violet to-glow-cyan bg-clip-text text-transparent">
              before they ship.
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/60">
            Auth checks that quietly disappear in an AI-agent refactor. Queries that full-table-scan the moment
            real traffic hits them. Agent Code Merge Gate scans every pull request for both, and posts the
            result straight to the PR — before it merges, not after.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="mx-auto mt-12 max-w-xl overflow-hidden rounded-xl border border-border-subtle bg-[#0a0c10] shadow-2xl shadow-black/60"
        >
          <div className="flex items-center gap-3 border-b border-border-subtle bg-white/[0.02] px-4 py-3">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            </div>
            <p className="flex-1 text-center font-mono text-xs text-white/40">.github/workflows/ci.yml</p>
          </div>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-sm text-glow-cyan">
            <code>{INSTALL_SNIPPET}</code>
          </pre>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Link
            href="https://github.com/avalonlabs-platform/agent-code-merge-gate"
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-transform hover:scale-[1.03]"
          >
            Get the free Action on GitHub
          </Link>
          <Link
            href="/#pricing"
            onClick={(event) => scrollToSection(event, "pricing")}
            className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/90 transition-colors hover:bg-white/5"
          >
            See what Pro adds for teams
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
