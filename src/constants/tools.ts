export interface ToolDemoExample {
  label: string;
  prompt: string;
}

export interface ToolPageContent {
  /** Matches the id in src/constants/agents.ts and the agentId in
   *  src/constants/pricing-tiers.ts microserviceProducts — this is the
   *  single key that ties a /tools/[slug] page to its agent and its price. */
  slug: string;
  name: string;
  emoji: string;
  seoTitle: string;
  metaDescription: string;
  keywords: string[];
  headline: string;
  problem: string;
  bullets: string[];
  demoPlaceholder: string;
  demoExamples: ToolDemoExample[];
}

export const toolPages: ToolPageContent[] = [
  {
    slug: "sql-optimizer",
    name: "SQL Optimizer",
    emoji: "💾",
    seoTitle: "SQL Optimizer & Index Suggester — AI Query Tuning | AvalonLabs",
    metaDescription:
      "Paste a slow SQL query and get an AI-optimized rewrite, a concrete indexing strategy, and an execution plan explained in plain language. Try free with 3 credits, no subscription required.",
    keywords: [
      "SQL optimizer",
      "query optimization tool",
      "database index suggester",
      "slow query analyzer",
      "SQL execution plan explainer",
      "AI SQL tuning",
    ],
    headline: "Stop guessing why your queries are slow.",
    problem:
      "Paste a slow SQL query and get a rewritten version, a concrete indexing strategy, and a plain-language " +
      "breakdown of the execution plan — in seconds, not hours of EXPLAIN ANALYZE archaeology.",
    bullets: [
      "Optimized query rewrites with the reasoning behind each change",
      "Concrete indexing recommendations — columns, index type, composite ordering",
      "Execution plans explained in plain language, not jargon",
    ],
    demoPlaceholder: "Paste a slow query…",
    demoExamples: [
      {
        label: "Missing index",
        prompt: "Why is this slow and what index do I need? SELECT * FROM orders WHERE customer_email = 'x@y.com' ORDER BY created_at DESC;",
      },
      {
        label: "Full table scan",
        prompt: "Optimize this: SELECT * FROM users WHERE LOWER(email) = 'a@b.com';",
      },
    ],
  },
  {
    slug: "security-auditor",
    name: "Security Auditor",
    emoji: "🛡️",
    seoTitle: "Security & Vulnerability Auditor — OWASP Top 10 AI Audit | AvalonLabs",
    metaDescription:
      "Paste a code snippet, backend route, or API endpoint and get an AI-generated OWASP Top 10 security audit — injection risks, authorization leaks, and concrete exploit scenarios. Try free with 3 credits.",
    keywords: [
      "security vulnerability scanner",
      "OWASP Top 10 audit tool",
      "AI code security review",
      "SQL injection checker",
      "API security audit",
      "authorization leak detector",
    ],
    headline: "Catch the vulnerability before it ships.",
    problem:
      "Paste a code snippet, backend route, or API endpoint and get an OWASP Top 10-focused audit — concrete " +
      "exploit scenarios, not generic checklist advice.",
    bullets: [
      "OWASP Top 10 coverage: injection, broken access control, auth flaws, and more",
      "Concrete exploit scenarios for every finding, not vague warnings",
      "Specific attention to SQL/command injection and authorization leaks",
    ],
    demoPlaceholder: "Paste a code snippet or endpoint…",
    demoExamples: [
      {
        label: "SQL query builder",
        prompt: "Audit this: const query = `SELECT * FROM users WHERE id = ${req.params.id}`;",
      },
      {
        label: "Missing auth check",
        prompt: "Audit this route: app.get('/admin/users', (req, res) => { res.json(getAllUsers()); });",
      },
    ],
  },
  {
    slug: "code-explainer",
    name: "Code Explainer",
    emoji: "🧩",
    seoTitle: "Code Explainer — Plain-Language AI Code Explanations | AvalonLabs",
    metaDescription:
      "Paste any code snippet or file and get an AI-generated, plain-language, step-by-step explanation of what it does. Try free with 3 credits, no subscription required.",
    keywords: [
      "code explainer AI",
      "explain code snippet",
      "understand legacy code",
      "code documentation generator",
      "plain language code explanation",
    ],
    headline: "Understand any code in seconds, not hours.",
    problem:
      "Paste a snippet or file from an unfamiliar codebase or language and get a step-by-step, plain-language " +
      "breakdown of what it actually does.",
    bullets: [
      "Step-by-step control flow, not just a one-line summary",
      "Flags edge cases and anything unusual worth knowing",
      "Written for someone who can code but doesn't know this codebase",
    ],
    demoPlaceholder: "Paste a code snippet…",
    demoExamples: [
      {
        label: "Array method",
        prompt: "Explain: const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);",
      },
      {
        label: "Regex",
        prompt: "Explain what this regex matches: /^(?=.*[A-Z])(?=.*\\d).{8,}$/",
      },
    ],
  },
  {
    slug: "api-analyzer",
    name: "API Analyzer",
    emoji: "🔌",
    seoTitle: "API Analyzer — AI Endpoint & Spec Summarizer | AvalonLabs",
    metaDescription:
      "Paste an API endpoint or OpenAPI spec fragment and get an AI-generated structural summary — inputs, auth, response shape. Try free with 3 credits, no subscription required.",
    keywords: [
      "API analyzer AI",
      "API documentation generator",
      "OpenAPI spec summarizer",
      "endpoint analysis tool",
      "REST API explainer",
    ],
    headline: "Know exactly what an endpoint does before you call it.",
    problem:
      "Paste an endpoint, method, or OpenAPI spec fragment and get a clear structural summary — inputs, auth, " +
      "response shape, and what to watch out for.",
    bullets: [
      "Inputs, auth requirements, and response shape, summarized",
      "Flags whether it's a read or a write operation",
      "Notes pagination and rate-limit behavior when evident",
    ],
    demoPlaceholder: "Paste an endpoint or spec fragment…",
    demoExamples: [
      {
        label: "REST endpoint",
        prompt: "Summarize: POST /v1/subscriptions/{id}/pause — pauses billing for a subscription.",
      },
      {
        label: "Query params",
        prompt: "Summarize this endpoint: GET /users/{id}/orders?status=pending&limit=20",
      },
    ],
  },
];

export function getToolBySlug(slug: string): ToolPageContent | undefined {
  return toolPages.find((t) => t.slug === slug);
}
