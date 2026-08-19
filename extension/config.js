// Same production API base the mobile app uses (see mobile/.env.example) —
// this extension talks to the same Next.js backend via the API-key auth
// path added in src/lib/auth-request.ts, not a separate integration.
export const API_BASE_URL = "https://avalonlabs-platform.vercel.app";

// General Assistant — covered by every subscription tier including Starter
// (see src/lib/agent-access.ts: only microservice-linked agents need Pro/
// Advanced). Good default for a "chat from anywhere" extension.
export const DEFAULT_AGENT_ID = "assistant";
