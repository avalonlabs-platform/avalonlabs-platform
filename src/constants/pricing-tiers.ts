export interface PricingTier {
  name: string;
  id: "starter" | "pro" | "advanced";
  description: string;
  audience: string;
  features: string[];
  featured: boolean;
  /** Paddle price IDs, populated via env vars once the catalog exists in Paddle. */
  priceId: { month: string; year: string };
  /**
   * Trial length as configured on this tier's Paddle price(s), if any. Only
   * set where confirmed against the actual Paddle catalog — Starter's is
   * verified (7-day trial, $0 due today at checkout). Pro/Advanced aren't
   * set here because their Paddle trial config hasn't been confirmed yet;
   * check Paddle's dashboard for each price before adding a value, since an
   * unverified number shown on the card is worse than no badge at all.
   */
  trialDays?: number;
}

// NOTE on repricing Pro to $49/mo (Revenue Recovery Track B, step 1):
// the dollar amount itself lives in Paddle's catalog (the object behind
// NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTH/_YEAR), not in this file — usePaddlePrices
// fetches the live formatted total from Paddle at render time. This file only
// controls the copy shown around that price. To actually change the number:
// create the new $49/mo (and equivalent yearly) price object in the Paddle
// dashboard, then point NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTH/_YEAR at the new
// price id (a new id, not an edit-in-place, if any live subscriber is on the
// old price — Paddle price objects are immutable once subscriptions exist).
export const pricingTiers: PricingTier[] = [
  {
    name: "Starter",
    id: "starter",
    description:
      "General-purpose AI help for individuals — writing, planning, and quick business gut-checks.",
    audience: "Individuals",
    features: [
      "1 AI Agent seat",
      "Unlimited chat sessions",
      "General Assistant, Business Advisor & Vision Analyzer included",
      "Email support",
    ],
    featured: false,
    priceId: {
      month: process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTH ?? "",
      year: process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_YEAR ?? "",
    },
    trialDays: 7,
  },
  {
    name: "Pro",
    id: "pro",
    description:
      "Every specialist dev tool, unlimited runs, for teams shipping code who need it running continuously.",
    audience: "Engineering teams",
    features: [
      "5 AI Agent seats",
      "SQL Optimizer, API Analyzer, Code Explainer & Security Auditor — unlimited runs",
      "Everything in Starter included",
      "Priority response times",
      "Team workspace & shared history",
      "Priority chat + email support",
    ],
    featured: true,
    priceId: {
      month: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTH ?? "",
      year: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_YEAR ?? "",
    },
  },
  {
    name: "Advanced",
    id: "advanced",
    description: "Unlimited AI Agents, custom microservices, and priority SLAs for growing enterprises.",
    audience: "Enterprises",
    features: [
      "Unlimited AI Agent seats",
      "Custom microservice development",
      "Dedicated success manager",
      "SLA-backed uptime & support",
    ],
    featured: false,
    priceId: {
      month: process.env.NEXT_PUBLIC_PADDLE_PRICE_ADVANCED_MONTH ?? "",
      year: process.env.NEXT_PUBLIC_PADDLE_PRICE_ADVANCED_YEAR ?? "",
    },
  },
];

export interface MicroserviceProduct {
  name: string;
  description: string;
  priceId: string;
  /** Dashboard agent this one-time purchase unlocks (see src/constants/agents.ts). */
  agentId: string;
  /** Short front-and-center framing shown above the price on the card
   *  (Revenue Recovery Track B: lead with the one-time report, not the
   *  subscription). Keep to a few words — the full pitch is in `description`. */
  tagline: string;
}

/**
 * One-time purchase "Specialist Reports" — Track B's primary paid CTA.
 * Rendered above the subscription tiers in pricing-table.tsx (previously
 * below, under the generic heading "One-time SaaS Microservices"): cold,
 * no-trust traffic gets a single flat price for the one specific problem
 * they came for, with no recurring commitment. The dollar amount itself
 * comes from Paddle at render time (see usePaddlePrices) — this file only
 * supplies the copy and which agent each purchase unlocks.
 */
export const microserviceProducts: MicroserviceProduct[] = [
  {
    name: "Code Explainer",
    description: "Upload a code file or snippet, get an AI-generated plain-language explanation of what it does.",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_MS_PLAN_REVIEW ?? "",
    agentId: "code-explainer",
    tagline: "One report, flat price — no subscription",
  },
  {
    name: "API Analyzer",
    description: "Upload an API spec or endpoint list, get an AI-generated summary of its structure and usage.",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_MS_CONTRACT ?? "",
    agentId: "api-analyzer",
    tagline: "One report, flat price — no subscription",
  },
  {
    name: "SQL Optimizer & Index Suggester",
    description:
      "Paste a slow SQL query, get an AI-generated optimized rewrite, indexing strategy, and execution plan explanation.",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_MS_SQL_OPTIMIZER ?? "",
    agentId: "sql-optimizer",
    tagline: "One report, flat price — no subscription",
  },
  {
    name: "Security & Vulnerability Auditor",
    description:
      "Paste a code snippet, route, or endpoint, get an AI-generated OWASP Top 10 audit covering injection and authorization risks.",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_MS_SECURITY_AUDITOR ?? "",
    agentId: "security-auditor",
    tagline: "One report, flat price — no subscription",
  },
];
