import Link from "next/link";

export function Hero() {
  return (
    <section id="agents" className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl"
      >
        <div className="mx-auto aspect-1155/678 w-[72rem] bg-gradient-to-tr from-indigo-500 to-purple-400 opacity-20" />
      </div>

      <div className="mx-auto max-w-6xl px-6 py-28 text-center sm:py-36">
        <p className="mx-auto mb-6 w-fit rounded-full border border-zinc-200 px-4 py-1 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          AI-powered automation, on demand
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-6xl">
          AI Agents & SaaS Microservices for life and business
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          AvalonLabs gives you specialized AI Agents and SaaS Microservices — automated software
          tools that help individuals, small businesses, and enterprises get instant answers to
          everyday problems.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/#pricing"
            className="rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            View plans
          </Link>
          <Link
            href="/#contact"
            className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-900"
          >
            Talk to us
          </Link>
        </div>
      </div>
    </section>
  );
}
