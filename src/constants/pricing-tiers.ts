export interface PricingTier {
  name: string;
  id: "starter" | "pro" | "advanced";
  description: string;
  audience: string;
  features: string[];
  featured: boolean;
  /** Paddle price IDs, populated via env vars once the catalog exists in Paddle. */
  priceId: { month: string; year: string };
}

export const pricingTiers: PricingTier[] = [
  {
    name: "Starter",
    id: "starter",
    description: "One AI Agent, for individuals solving day-to-day problems.",
    audience: "Individuals",
    features: [
      "1 AI Agent seat",
      "Unlimited chat sessions",
      "Access to core SaaS Microservices (pay-per-use)",
      "Email support",
    ],
    featured: false,
    priceId: {
      month: process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTH ?? "",
      year: process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_YEAR ?? "",
    },
  },
  {
    name: "Pro",
    id: "pro",
    description: "Multiple AI Agents and bundled microservices for small online businesses.",
    audience: "Small businesses",
    features: [
      "5 AI Agent seats",
      "All SaaS Microservices included",
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
}

/** One-time purchase microservices, shown below the subscription tiers. */
export const microserviceProducts: MicroserviceProduct[] = [
  {
    name: "Code Explainer",
    description: "Upload a code file or snippet, get an AI-generated plain-language explanation of what it does.",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_MS_PLAN_REVIEW ?? "",
    agentId: "code-explainer",
  },
  {
    name: "API Analyzer",
    description: "Upload an API spec or endpoint list, get an AI-generated summary of its structure and usage.",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_MS_CONTRACT ?? "",
    agentId: "api-analyzer",
  },
];
