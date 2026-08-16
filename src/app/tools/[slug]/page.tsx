import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getToolBySlug, toolPages } from "@/constants/tools";
import { microserviceProducts } from "@/constants/pricing-tiers";
import { ToolDemo } from "@/components/tools/tool-demo";
import { ToolCheckoutButtons } from "@/components/tools/tool-checkout-buttons";

export function generateStaticParams() {
  return toolPages.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) return {};

  const path = `/tools/${tool.slug}`;

  return {
    title: tool.seoTitle,
    description: tool.metaDescription,
    keywords: tool.keywords,
    alternates: { canonical: path },
    openGraph: {
      title: tool.seoTitle,
      description: tool.metaDescription,
      url: path,
      type: "website",
      // A page-level openGraph object replaces (rather than inherits) the
      // root layout's file-convention image, so it must be referenced
      // explicitly — reuses the same site-wide branded share image.
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: tool.seoTitle,
      description: tool.metaDescription,
      images: ["/twitter-image"],
    },
  };
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) notFound();

  const microservice = microserviceProducts.find((m) => m.agentId === tool.slug);
  const priceId = microservice?.priceId ?? "";

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10 bg-grid" />

      <section className="mx-auto max-w-3xl px-6 pt-20 pb-8 text-center">
        <span className="mb-4 inline-block text-4xl">{tool.emoji}</span>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">{tool.headline}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-white/60">{tool.problem}</p>
      </section>

      <section className="mx-auto max-w-2xl px-6 pb-12">
        <ToolDemo agentId={tool.slug} placeholder={tool.demoPlaceholder} examples={tool.demoExamples} />
      </section>

      <section className="mx-auto max-w-2xl px-6 pb-16 text-center">
        <ToolCheckoutButtons agentId={tool.slug} priceId={priceId} />
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-24">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {tool.bullets.map((bullet) => (
            <li
              key={bullet}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/70"
            >
              <span aria-hidden className="mb-2 block text-glow-cyan">
                ✓
              </span>
              {bullet}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
