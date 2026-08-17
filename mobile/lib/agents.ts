/** Mirrors src/constants/agents.ts on the web app — id/name/emoji/description
 *  only. System prompts stay server-only; the mobile app just needs an id to
 *  send to /api/chat, same as the web dashboard does. Keep these two lists
 *  in sync by hand when an agent is added/renamed on the web side. */
export interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  description: string;
  greeting: string;
  /** True for the four agents also sold as a standalone one-time purchase
   *  (see src/constants/pricing-tiers.ts microserviceProducts) — Starter
   *  subscribers don't get these included, only Pro/Advanced or a purchase. */
  isMicroservice: boolean;
}

export const AGENTS: AgentInfo[] = [
  {
    id: "assistant",
    name: "General Assistant",
    emoji: "✨",
    description: "A flexible agent for day-to-day questions and tasks.",
    greeting: "Ask me anything — writing, research, planning, or quick questions.",
    isMicroservice: false,
  },
  {
    id: "code-explainer",
    name: "Code Explainer",
    emoji: "🧩",
    description: "Paste a snippet or file, get a plain-language explanation.",
    greeting: "Paste a code snippet and I'll break down what it does, step by step.",
    isMicroservice: true,
  },
  {
    id: "api-analyzer",
    name: "API Analyzer",
    emoji: "🔌",
    description: "Upload a spec or endpoint list, get a structural summary.",
    greeting: "Share an endpoint or OpenAPI spec and I'll summarize its structure and usage.",
    isMicroservice: true,
  },
  {
    id: "business-advisor",
    name: "Business Advisor",
    emoji: "📈",
    description: "Get a quick gut-check on a business idea or plan.",
    greeting: "Describe your idea or paste a plan summary and I'll flag strengths and gaps.",
    isMicroservice: false,
  },
  {
    id: "sql-optimizer",
    name: "SQL Optimizer",
    emoji: "💾",
    description: "Paste a slow query, get an optimized rewrite and indexing plan.",
    greeting: "Paste a slow query — and its schema or execution plan, if you have them.",
    isMicroservice: true,
  },
  {
    id: "security-auditor",
    name: "Security Auditor",
    emoji: "🛡️",
    description: "Paste code or an endpoint, get an OWASP-focused vulnerability audit.",
    greeting: "Paste a code snippet, backend route, or API endpoint to audit.",
    isMicroservice: true,
  },
];

export function getAgent(id: string): AgentInfo | undefined {
  return AGENTS.find((a) => a.id === id);
}
