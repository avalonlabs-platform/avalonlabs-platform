export interface PricingTier {
  name: string;
  id: "starter" | "professional" | "enterprise";
  description: string;
  audience: string;
  features: string[];
  featured: boolean;
  /** Paddle price IDs. Populate via env vars once the catalog exists in Paddle. */
  priceId: { month: string; year: string };
  /** Enterprise has no self-serve checkout — routes to contact instead. */
  contactSalesOnly?: boolean;
}

export const pricingTiers: PricingTier[] = [
  {
    name: "Starter",
    id: "starter",
    description: "One AI Mentor Agent, for individuals solving day-to-day problems.",
    audience: "Individuals",
    features: [
      "1 AI Mentor Agent seat",
      "Unlimited chat sessions",
      "Access to core SaaS Microservices (pay-per-use)",
      "Email support",
    ],
    featured: false,
    priceId: {
      month: process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTH ?? "pri_placeholder_starter_month",
      year: process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_YEAR ?? "pri_placeholder_starter_year",
    },
  },
  {
    name: "Professional",
    id: "professional",
    description: "Multiple Mentor Agents and bundled microservices for small online businesses.",
    audience: "Small businesses",
    features: [
      "5 AI Mentor Agent seats",
      "All SaaS Microservices included",
      "Priority response times",
      "Team workspace & shared history",
      "Priority chat + email support",
    ],
    featured: true,
    priceId: {
      month: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTH ?? "pri_placeholder_pro_month",
      year: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_YEAR ?? "pri_placeholder_pro_year",
    },
  },
  {
    name: "Enterprise",
    id: "enterprise",
    description: "Custom Mentor Agent fleets, SLAs, and integrations for growing enterprises.",
    audience: "Enterprises",
    features: [
      "Unlimited Mentor Agent seats",
      "Custom microservice development",
      "Dedicated success manager",
      "Custom contract & invoicing via Paddle",
      "SLA-backed uptime & support",
    ],
    featured: false,
    priceId: { month: "", year: "" },
    contactSalesOnly: true,
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
    name: "Business Plan Reviewer Agent",
    description: "One-time deep-dive review and action plan from a specialized AI mentor.",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_MS_PLAN_REVIEW ?? "pri_placeholder_ms_plan_review",
  },
  {
    name: "Contract Clause Explainer",
    description: "Upload a contract, get a plain-language walkthrough of key terms and risks.",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_MS_CONTRACT ?? "pri_placeholder_ms_contract",
  },
];
