"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { siteConfig } from "@/lib/site-config";
import { createClient } from "@/lib/supabase/client";

const navLinks = [
  { href: "/#agents", label: "AI Agents" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#contact", label: "Contact" },
];

/** Checked client-side so the rest of the page stays statically prerenderable. */
function AuthNav() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  if (signedIn === null) {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-white/5" />;
  }

  if (signedIn) {
    return (
      <Link
        href="/dashboard"
        className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        Dashboard
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link href="/login" className="hidden text-sm font-medium text-white/60 hover:text-white sm:block">
        Log in
      </Link>
      <Link
        href="/signup"
        className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        Get started
      </Link>
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- local SVG,
              no benefit from next/image's remote-image optimization pipeline. */}
          <img src="/logo.svg" alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
          {siteConfig.shortName}
        </Link>
        <div className="hidden items-center gap-8 sm:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-white/60 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <AuthNav />
      </nav>
    </header>
  );
}
