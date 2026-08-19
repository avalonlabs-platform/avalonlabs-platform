import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, type Content, type Part } from "@google/genai";

/**
 * Unified multi-model gateway for /api/chat. Both providers are reduced to
 * the same public shape here — an async generator of plain-text deltas —
 * so route.ts (and every client it streams to: the web dashboard, the
 * Chrome extension side panel, and the mobile app) never has to know which
 * provider actually served a given request. All three clients already
 * consume the response as a raw decoded text stream (see mobile's
 * lib/api.ts and the extension's background.js), not literal
 * `text/event-stream` SSE framing — that raw-text contract is preserved
 * deliberately so this integration needs zero client-side changes, which
 * is the actual goal "uniform streaming output" is serving here.
 */

export type LlmProvider = "anthropic" | "gemini";

/** Only meaningful when the resolved provider is "gemini" — picks which
 *  Gemini tier fits the agent's workload (see GEMINI_MODELS below). */
export type GeminiModelHint = "fast" | "large-context";

// ---------------------------------------------------------------------------
// Neutral content shape — provider-agnostic. route.ts builds this once from
// the request body (text + validated attachments); each adapter below
// translates it into that SDK's own content-block shape.
// ---------------------------------------------------------------------------

export interface NeutralTextPart {
  type: "text";
  text: string;
}

export interface NeutralImagePart {
  type: "image";
  /** e.g. "image/jpeg" — validated by the caller against each provider's
   *  supported set before this is ever constructed. */
  mediaType: string;
  /** Base64, no "data:" prefix. */
  data: string;
}

export interface NeutralDocumentPart {
  type: "document";
  mediaType: string;
  /** Base64 for PDFs; raw UTF-8 text for plain-text attachments — see
   *  `encoding`. */
  data: string;
  encoding: "base64" | "utf8";
  title?: string;
}

export type NeutralPart = NeutralTextPart | NeutralImagePart | NeutralDocumentPart;

export interface NeutralTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StreamChatParams {
  /** Already resolved by resolveProvider() below — this module doesn't
   *  re-derive it, so it stays agent/business-logic agnostic. */
  provider: LlmProvider;
  geminiModelHint?: GeminiModelHint;
  systemPrompt: string;
  history: NeutralTurn[];
  /** The current turn's content — text and/or attachments. */
  userParts: NeutralPart[];
}

export class LlmGatewayError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "LlmGatewayError";
  }
}

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

const VALID_PROVIDERS = new Set<LlmProvider>(["anthropic", "gemini"]);

function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === "string" && VALID_PROVIDERS.has(value as LlmProvider);
}

/**
 * Resolution order, most to least specific:
 *  1. `requestedProvider` — an explicit `provider` field/header on this one
 *     request, if it names a valid provider.
 *  2. `DEFAULT_LLM_PROVIDER` env var, if set to "anthropic" or "gemini" —
 *     an ops-level override that forces every request to one provider
 *     regardless of agent, e.g. as a kill switch if one provider is
 *     misbehaving. Unset, or set to "auto", falls through to (3).
 *  3. `agentPreferredProvider` — the agent's own default (see
 *     src/constants/agents.ts), based on which provider fits its workload.
 *  4. "anthropic" — final fallback if none of the above resolved anything.
 */
export function resolveProvider(opts: {
  requestedProvider?: unknown;
  agentPreferredProvider?: LlmProvider;
}): LlmProvider {
  if (isLlmProvider(opts.requestedProvider)) return opts.requestedProvider;

  const defaultProvider = process.env.DEFAULT_LLM_PROVIDER;
  if (defaultProvider === "anthropic" || defaultProvider === "gemini") return defaultProvider;

  return opts.agentPreferredProvider ?? "anthropic";
}

export function isProviderConfigured(provider: LlmProvider): boolean {
  return provider === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : !!process.env.GEMINI_API_KEY;
}

// ---------------------------------------------------------------------------
// Gemini's inline-request size guard.
//
// Gemini's docs are explicit that inline (non-Files-API) requests — system
// instruction + prompt text + inline attachment bytes combined — are capped
// at 20MB total. The attachment ceilings in src/lib/attachments/constants.ts
// (MAX_PDF_FILE_BYTES = 20MB raw, ~26.7MB once base64-encoded) were sized
// for Anthropic's more generous 32MB total-request limit, so a large PDF
// that's perfectly valid for Anthropic can exceed what Gemini will accept
// inline. Rather than let that surface as a confusing Gemini-side rejection,
// route.ts checks this before ever attempting Gemini and routes those
// requests to Anthropic instead — the correct capability-aware outcome
// anyway, since Anthropic is the one that can actually handle the larger
// payload.
// ---------------------------------------------------------------------------

// Conservative — leaves headroom under Gemini's stated 20MB inline cap for
// the system prompt, JSON structure, and history text alongside the
// attachment bytes themselves.
const GEMINI_INLINE_SAFE_LIMIT_BYTES = 18 * 1024 * 1024;

export function exceedsGeminiInlineLimit(parts: NeutralPart[]): boolean {
  let total = 0;
  for (const part of parts) {
    if (part.type === "text") {
      total += Buffer.byteLength(part.text, "utf8");
    } else {
      // Both base64 and utf8-encoded document/image data are already
      // string byte lengths comparable to what actually goes over the
      // wire — base64 strings are 1 byte per char (ASCII), so this is an
      // accurate count either way.
      total += part.data.length;
    }
  }
  return total > GEMINI_INLINE_SAFE_LIMIT_BYTES;
}

// ---------------------------------------------------------------------------
// Anthropic adapter
// ---------------------------------------------------------------------------

const ANTHROPIC_MODEL = "claude-sonnet-5";
const MAX_OUTPUT_TOKENS = 4096;

function toAnthropicContent(parts: NeutralPart[]): Anthropic.MessageParam["content"] {
  // Preserve the plain-string shape for ordinary text-only turns — matches
  // existing behavior/tests rather than always wrapping in a content-block
  // array.
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text;

  const blocks: Anthropic.MessageParam["content"] = [];
  for (const part of parts) {
    if (part.type === "text") {
      blocks.push({ type: "text", text: part.text });
    } else if (part.type === "image") {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: part.mediaType as Anthropic.Base64ImageSource["media_type"],
          data: part.data,
        },
      });
    } else if (part.encoding === "base64") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: part.data },
        title: part.title,
      });
    } else {
      blocks.push({
        type: "document",
        source: { type: "text", media_type: "text/plain", data: part.data },
        title: part.title,
      });
    }
  }
  return blocks;
}

async function* streamAnthropic(params: StreamChatParams): AsyncGenerator<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new LlmGatewayError("ANTHROPIC_API_KEY is not set.", 500);

  const anthropic = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [
    ...params.history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user" as const, content: toAnthropicContent(params.userParts) },
  ];

  const stream = anthropic.messages.stream({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: params.systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

// ---------------------------------------------------------------------------
// Gemini adapter
// ---------------------------------------------------------------------------

// Verified against the current model list (ai.google.dev/gemini-api/docs/
// models) rather than the older "2.0 Flash / 1.5 Pro" names — both of those
// have since been superseded/deprecated. gemini-2.5-flash and
// gemini-2.5-pro are the current stable IDs matching the same two
// capability tiers (fast/high-throughput vs. large-context/thorough).
const GEMINI_MODELS: Record<GeminiModelHint, string> = {
  fast: "gemini-2.5-flash",
  "large-context": "gemini-2.5-pro",
};

function toGeminiParts(parts: NeutralPart[]): Part[] {
  return parts.map((part) => {
    if (part.type === "text") return { text: part.text };
    if (part.type === "image") return { inlineData: { mimeType: part.mediaType, data: part.data } };
    if (part.encoding === "base64") {
      // PDFs: Gemini accepts inline base64 PDF bytes the same way as images.
      return { inlineData: { mimeType: part.mediaType, data: part.data } };
    }
    // Plain-text attachments (txt/csv/json/log) have no distinct "document"
    // part type in Gemini's API — fold them into a text part, labeled with
    // the filename so it still reads clearly alongside the prompt.
    return { text: part.title ? `[${part.title}]\n${part.data}` : part.data };
  });
}

async function* streamGemini(params: StreamChatParams): AsyncGenerator<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new LlmGatewayError("GEMINI_API_KEY is not set.", 500);

  const ai = new GoogleGenAI({ apiKey });
  const contents: Content[] = [
    ...params.history.map(
      (turn): Content => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.content }],
      })
    ),
    { role: "user", parts: toGeminiParts(params.userParts) },
  ];

  const model = GEMINI_MODELS[params.geminiModelHint ?? "fast"];
  const response = await ai.models.generateContentStream({
    model,
    contents,
    config: {
      systemInstruction: params.systemPrompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  });

  for await (const chunk of response) {
    if (chunk.text) yield chunk.text;
  }
}

function createProviderStream(provider: LlmProvider, params: StreamChatParams): AsyncGenerator<string> {
  return provider === "anthropic" ? streamAnthropic(params) : streamGemini(params);
}

// ---------------------------------------------------------------------------
// Fallback orchestration
//
// A stream can only safely fall back to the other provider *before* any
// chunk has reached the client — once real output has started, switching
// providers mid-response would splice two different models' voices
// together into one garbled reply, which is worse than a clean error. So
// each attempt is "primed" (its first chunk is pulled, but not yielded to
// the actual caller yet) before route.ts's stream controller sees anything;
// only a failure at that priming step triggers a fallback attempt against
// the other provider. A failure *after* priming (mid-stream) is not
// retried — it surfaces as a plain-text notice appended to what's already
// been sent, same as before this change.
// ---------------------------------------------------------------------------

type PrimeResult =
  | { ok: true; first: string | null; rest: AsyncGenerator<string> }
  | { ok: false; error: unknown };

async function primeGenerator(gen: AsyncGenerator<string>): Promise<PrimeResult> {
  try {
    const { value, done } = await gen.next();
    return { ok: true, first: done ? null : value, rest: gen };
  } catch (error) {
    return { ok: false, error };
  }
}

function isRetryableProviderError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status === 429 || status >= 500;
  }
  // Network-level failures (fetch throwing, connection reset, etc.) are
  // also worth a fallback attempt against the other provider.
  if (error instanceof TypeError) return true;
  return false;
}

function errorStatus(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 600) return status;
  }
  return 502;
}

/**
 * Streams a chat completion, attempting `params.provider` first and falling
 * back to the other configured provider if the primary isn't configured, or
 * fails with a retryable error (rate limit / upstream 5xx / connection
 * error) before producing any output. Yields plain-text deltas — the exact
 * shape every existing client (web, mobile, Chrome extension) already
 * parses, so nothing downstream of this function needs to change.
 */
export async function* streamChatCompletion(params: StreamChatParams): AsyncGenerator<string> {
  const primary = params.provider;
  const secondary: LlmProvider = primary === "anthropic" ? "gemini" : "anthropic";
  const primaryConfigured = isProviderConfigured(primary);
  const secondaryConfigured = isProviderConfigured(secondary);

  if (!primaryConfigured && !secondaryConfigured) {
    throw new LlmGatewayError("No AI provider is configured on the server.", 500);
  }

  if (primaryConfigured) {
    const primed = await primeGenerator(createProviderStream(primary, params));
    if (primed.ok) {
      if (primed.first !== null) yield primed.first;
      yield* primed.rest;
      return;
    }

    console.error(`LLM router: ${primary} failed before producing output —`, primed.error);
    if (!secondaryConfigured || !isRetryableProviderError(primed.error)) {
      throw new LlmGatewayError(
        `The ${primary} provider is unavailable right now and no fallback is configured.`,
        errorStatus(primed.error)
      );
    }
    console.warn(`LLM router: falling back from ${primary} to ${secondary}.`);
  } else {
    console.warn(`LLM router: ${primary} is not configured — routing to ${secondary} instead.`);
  }

  const fallback = await primeGenerator(createProviderStream(secondary, params));
  if (fallback.ok) {
    if (fallback.first !== null) yield fallback.first;
    yield* fallback.rest;
    return;
  }

  console.error(`LLM router: fallback provider ${secondary} also failed —`, fallback.error);
  throw new LlmGatewayError(
    "Both AI providers are currently unavailable — please try again shortly.",
    errorStatus(fallback.error)
  );
}
