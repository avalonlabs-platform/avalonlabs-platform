// Same production API base the mobile app uses (see mobile/.env.example) —
// this extension talks to the same Next.js backend via the API-key auth
// path added in src/lib/auth-request.ts, not a separate integration.
export const API_BASE_URL = "https://avalonlabs-platform.vercel.app";

// General Assistant — covered by every subscription tier including Starter
// (see src/lib/agent-access.ts: only microservice-linked agents need Pro/
// Advanced). Good default for a "chat from anywhere" extension.
export const DEFAULT_AGENT_ID = "assistant";

/**
 * The floating selection pill's three quick actions (content.js) — each
 * maps to whichever existing agent (src/constants/agents.ts) is the best
 * fit, plus a prompt prefix that frames the selected text for that agent.
 * "Review Contract" has no dedicated agent, so it routes to General
 * Assistant with contract-review framing rather than adding an 8th agent
 * just for this extension surface.
 */
export const QUICK_ACTIONS = {
  explain: {
    label: "Explain Code",
    agentId: "code-explainer",
    promptPrefix: "Explain what this code does:",
  },
  security: {
    label: "Security Audit",
    agentId: "security-auditor",
    promptPrefix: "Audit this code or endpoint for security vulnerabilities:",
  },
  contract: {
    label: "Review Contract",
    agentId: "assistant",
    promptPrefix:
      "Review this contract text for risks, one-sided terms, ambiguous clauses, and missing protections. " +
      "You are not a lawyer and this isn't legal advice, but flag concrete concerns:",
  },
};
