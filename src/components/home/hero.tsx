"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { InteractiveDemo } from "@/components/home/interactive-demo";

export function Hero() {
  return (
    <section id="agents" className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10 bg-grid" />

      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl">
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, 20, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto aspect-1155/678 w-[72rem] bg-gradient-to-tr from-glow-indigo via-glow-violet to-glow-cyan opacity-25"
        />
      </div>

      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-sm text-white/70 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-glow-cyan" />
            AI-powered automation, on demand
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            <span className="bg-gradient-to-br from-white via-white to-white/60 bg-clip-text text-transparent">
              AI Agents &amp; SaaS Microservices
            </span>
            <br />
            <span className="bg-gradient-to-r from-glow-indigo via-glow-violet to-glow-cyan bg-clip-text text-transparent">
              for life and business
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60">
            AvalonLabs gives you specialized AI Agents and SaaS Microservices — automated software
            tools that help individuals, small businesses, and enterprises get instant answers to
            everyday problems.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/#pricing"
              className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-transform hover:scale-[1.03]"
            >
              View plans
            </Link>
            <Link
              href="/#contact"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/90 transition-colors hover:bg-white/5"
            >
              Talk to us
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mx-auto mt-16 max-w-2xl"
        >
          <InteractiveDemo />
        </motion.div>
      </div>
    </section>
  );
}
