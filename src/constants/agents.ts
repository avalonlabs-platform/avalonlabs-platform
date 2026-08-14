export interface Agent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  greeting: string;
  /** Returns a mocked reply for the given user message — swap for a real model later. */
  respond: (message: string) => string;
}

function pick<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

export const agents: Agent[] = [
  {
    id: "assistant",
    name: "General Assistant",
    emoji: "✨",
    description: "A flexible agent for day-to-day questions and tasks.",
    greeting: "Hi! Ask me anything — I can help with writing, research, planning, or quick questions.",
    respond: () =>
      pick([
        "Got it — here's a sample response for the demo. In the full product, this would be generated live based on exactly what you asked.",
        "That's a great question. This is a mocked reply for now — sign up and this agent will respond using a real model tailored to your account.",
        "Here's a placeholder answer. Once the live model is wired in, responses like this will be generated in real time from your actual input.",
      ]),
  },
  {
    id: "code-explainer",
    name: "Code Explainer",
    emoji: "🧩",
    description: "Paste a snippet or file, get a plain-language explanation.",
    greeting: "Paste a code snippet and I'll break down what it does, step by step.",
    respond: (message) => {
      if (/loop|for\s*\(|while/i.test(message)) {
        return "This looks like an iteration — walking through a collection and accumulating or transforming values as it goes. In the full product I'd trace through each variable's value on every pass.";
      }
      if (/function|const .* =>|def /i.test(message)) {
        return "This defines a function. I'd normally explain its parameters, what it returns, and any side effects (like network calls or mutations) it has along the way.";
      }
      return "Here's a sample breakdown — I'd normally explain what this code does line by line, flag any edge cases, and note anything that looks unusual. Sign up to run this on your own code.";
    },
  },
  {
    id: "api-analyzer",
    name: "API Analyzer",
    emoji: "🔌",
    description: "Upload a spec or endpoint list, get a structural summary.",
    greeting: "Share an endpoint or OpenAPI spec and I'll summarize its structure and usage.",
    respond: (message) => {
      if (/post|put|patch/i.test(message)) {
        return "This looks like a write operation — it likely mutates server-side state. I'd normally detail the expected request body, auth requirements, and what changes on success.";
      }
      if (/get|fetch|list/i.test(message)) {
        return "This looks like a read operation. I'd normally document the query parameters, pagination behavior, and the shape of the response payload.";
      }
      return "Here's a sample structural summary — endpoint, method, expected inputs, and response shape. Sign up to analyze your real API spec.";
    },
  },
  {
    id: "business-advisor",
    name: "Business Advisor",
    emoji: "📈",
    description: "Get a quick gut-check on a business idea or plan.",
    greeting: "Describe your idea or paste a plan summary and I'll flag strengths and gaps.",
    respond: () =>
      pick([
        "Solid core idea. Three things I'd normally probe: your acquisition channel, unit economics at scale, and what stops a competitor from copying this in a month.",
        "Interesting direction. I'd want to stress-test your retention assumption and your pricing — those are usually where plans like this succeed or stall.",
        "Here's a sample gut-check — the full agent would dig into your specific numbers, market, and competitive landscape.",
      ]),
  },
];

export const defaultAgentId = agents[0].id;
