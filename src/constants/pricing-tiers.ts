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
}

/** One-time purchase microservices, shown below the subscription tiers. */
export const microserviceProducts: MicroserviceProduct[] = [
  {
    name: "Business Plan Analyzer",
    description: "Upload a business plan document and get automated AI-generated feedback and suggestions.",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_MS_PLAN_REVIEW ?? "",
  },
  {
    name: "Contract Clause Explainer",
    description: "Upload a contract, get an AI-generated plain-language summary of what each clause means.",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_MS_CONTRACT ?? "",
  },
];
