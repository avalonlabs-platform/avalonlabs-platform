import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { agents } from "@/constants/agents";
import { scheduleActionOnboardingSequence, type ActionScanStatus } from "@/lib/email/lifecycle";
import { createInternalClient } from "@/lib/supabase/server-internal";

/**
 * Backs the "Agent Code Merge Gate" GitHub Action (github-action/agent-code-
 * merge-gate/) — Revenue Recovery Track B, distribution pillar 1. A CI
 * runner posts a PR's unified diff here and gets back a JSON status +
 * Executive Summary to post as a PR comment. Deliberately not the same
 * shape as /api/demo-chat: that endpoint streams raw text for a browser to
 * render incrementally; a CI job just needs one JSON response to build a
 * comment from, and diffs run far larger than a chat message (500 chars),
 * so this gets its own size ceiling and non-streaming call instead of
 * reusing demo-chat as-is.
 *
 * Unauthenticated by design — same trust model as demo-chat and the
 * /tools/[slug] previews: this is free top-of-funnel usage, not a paid
 * feature. Anything it returns is capped at "Executive Summary only" for
 * the same reason TOOL_PREVIEW_GUARD caps demo-chat's tool-scoped
 * previews — the deeper Key Findings/Recommendations stay behind the
 * "unlock the full diagnostic" link this route returns, not because this
 * endpoint hides them, but because it never generates them here at all.
 *
 * Optionally also the trigger point for the Action's Pro-conversion loop
 * (Revenue Recovery Track B, distribution pillar 1): if the caller opted
 * into the Action's `notify-email` input, and this is the first call this
 * instance has seen for that repo, kicks off scheduleActionOnboardingSequence
 * (src/lib/email/lifecycle.ts) — a Day 1/4/7 email sequence, not anything
 * gating the scan response itself. See isFirstScanForRepo below for why
 * "first call for this repo" is the closest available proxy for "installed"
 * a plain composite Action can offer.
 *
 * Growth Engine Playbook §5.1–5.2 (2026-08-27): also emits one structured
 * `merge_gate_scan` log line per scan attempt, persisted to Supabase (see
 * logMergeGateEvent below) — the single first-party signal for install/
 * first-scan/retention/opt-in-rate metrics; nothing else in the stack can
 * see these repos.
 */

const MAX_DIFF_LENGTH = 12_000; // characters; see truncateDiff()
const MAX_OUTPUT_TOKENS = 450;

// Same best-effort in-memory limiter shape as demo-chat/contact, but keyed
// by repo full name when the caller provides one, not IP. GitHub-hosted
// runners for many unrelated repos can share a small pool of egress IPs, so
// IP-keying here would risk one busy repo's Action runs rate-limiting a
// completely different repo's. Falls back to IP only when no repo name is
// given (e.g. someone testing the endpoint directly).
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20; // one Action can re-run several times per PR across pushes
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}

/**
 * Best-effort "have we seen this repo before" tracker for the Action
 * onboarding email sequence (Revenue Recovery Track B, distribution pillar
 * 1's conversion loop — see scheduleActionOnboardingSequence in
 * src/lib/email/lifecycle.ts). A plain composite GitHub Action has no
 * "installed" webhook the way a GitHub App does, so "first call we've seen
 * for this repoFullName" is the closest available proxy — same in-memory,
 * same-instance-only tradeoff as rateLimitMap above: this resets on every
 * cold start / redeploy / new serverless instance, so a repo can trigger
 * the "first scan" email more than once in practice. Good enough for v1;
 * a real fix needs a persistent per-repo table, which is a schema decision
 * (see the dedupe/cancellation note in lifecycle.ts), not more code here.
 */
const seenRepos = new Set<string>();

function isFirstScanForRepo(repoFullName: string): boolean {
  if (seenRepos.has(repoFullName)) return false;
  seenRepos.add(repoFullName);
  return true;
}

/** Diffs from a real PR can run to thousands of lines — far past what's
 *  worth sending to a Haiku call for a free preview. Keeps the head and
 *  tail (where the most-changed, most-recently-touched hunks usually are
 *  for a typical PR) rather than just the head, and says plainly that it
 *  truncated rather than silently dropping context. Not a substitute for
 *  real chunked analysis across a large diff — a v1 tradeoff, not a
 *  correctness guarantee for huge PRs. */
function truncateDiff(diff: string): { text: string; truncated: boolean } {
  if (diff.length <= MAX_DIFF_LENGTH) return { text: diff, truncated: false };
  const half = Math.floor(MAX_DIFF_LENGTH / 2);
  const head = diff.slice(0, half);
  const tail = diff.slice(diff.length - half);
  return {
    text: `${head}\n\n[... diff truncated for length — showing the first and last ${half} characters ...]\n\n${tail}`,
    truncated: true,
  };
}

/**
 * Growth Engine Playbook §5.1–5.2 structured event logging.
 *
 * `repo_hash` — SHA-256 of the raw repoFullName, never the raw name itself,
 * consistent with this route's own privacy claim (README: "AvalonLabs never
 * sees more than the diff itself") — this event is about counting distinct
 * installs/retention, not identifying which repos they are.
 *
 * `diff_size_bucket` — bucketed from the *raw* incoming diff length (before
 * truncateDiff() truncates it for the model call), so size signal isn't
 * lost once a diff crosses MAX_DIFF_LENGTH. "skipped-too-large" mirrors the
 * Action's own >200KB client-side gate (github-action/agent-code-merge-gate,
 * README "Resilience" section) — that gate lives in the Action's index.js,
 * before it ever calls this route, so in practice this route shouldn't see
 * a diff that large; the bucket exists here defensively for any caller that
 * doesn't respect it (e.g. a direct API call bypassing the Action).
 *
 * `utm_source` — always null. UTM parameters are a pricing-page pageview
 * concern (the README/PR-comment/DM links in the Growth Engine Playbook §4
 * all carry `?utm_source=...` pointing at avalonlabs-platform.com/#pricing),
 * not something this server-to-server CI call ever receives or could. Real
 * source attribution has to come from that pageview's own analytics, not
 * from here — left null rather than guessed.
 */
type DiffSizeBucket = "<50kb" | "50-200kb" | "skipped-too-large";

function hashRepoName(repoFullName: string | null): string | null {
  if (!repoFullName) return null;
  return createHash("sha256").update(repoFullName).digest("hex");
}

function getDiffSizeBucket(diffLength: number): DiffSizeBucket {
  if (diffLength < 50_000) return "<50kb";
  if (diffLength <= 200_000) return "50-200kb";
  return "skipped-too-large";
}

interface MergeGateLogEventInput {
  repo_hash: string | null;
  status: ActionScanStatus | "LOCAL_ONLY";
  is_first_scan_for_repo: boolean;
  notify_email_provided: boolean;
  diff_size_bucket: DiffSizeBucket;
  utm_source: string | null;
}

// Supabase sink budget — separate from, and far inside, the scan's overall
// 25s contract. Awaited (bounded by this timeout) rather than fired-and-
// forgotten: an unawaited promise in a serverless route handler can be
// frozen or torn down the instant the response is sent, which would make
// this sink silently lossy in exactly the cases (cold start, function
// recycled under load) most correlated with real traffic spikes. Bounding
// it here means the write either completes or is deterministically
// abandoned before the response goes out — never a source of truth for
// "the write happened" beyond what it actually confirms.
const SUPABASE_LOG_TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Logs one `merge_gate_scan` event to stdout (always) and best-effort
 * persists it to Supabase's `merge_gate_events` table (when
 * SUPABASE_SERVICE_ROLE_KEY is configured). This function itself can never
 * throw and is always awaited by its callers below with the sink's own
 * SUPABASE_LOG_TIMEOUT_MS bound — worst case this adds ~3s to a scan
 * response, comfortably inside the route's 25s contract even stacked on
 * top of the Anthropic call. A Supabase outage, a missing service-role key,
 * a schema mismatch, or a timeout all fall into the same catch block below:
 * console.error and move on. This is telemetry, never a reason to fail or
 * delay the CI run beyond that bound.
 *
 * Requires a `merge_gate_events` table in Supabase shaped like this
 * function's payload (event text, timestamp timestamptz, repo_hash text,
 * status text, is_first_scan_for_repo bool, notify_email_provided bool,
 * diff_size_bucket text, utm_source text) — this route does not create it.
 */
async function logMergeGateEvent(input: MergeGateLogEventInput): Promise<void> {
  const payload = {
    event: "merge_gate_scan" as const,
    timestamp: new Date().toISOString(),
    ...input,
  };
  console.log(JSON.stringify(payload));

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Sink not configured for this environment — the console line above is
    // still the record. Not an error condition, so no console.error here.
    return;
  }

  try {
    const supabase = createInternalClient();
    const { error } = await withTimeout(
      supabase.from("merge_gate_events").insert(payload),
      SUPABASE_LOG_TIMEOUT_MS,
      "Supabase merge_gate_events insert"
    );
    if (error) {
      console.error("CI merge-gate: Supabase insert for merge_gate_scan failed —", error);
    }
  } catch (error) {
    console.error("CI merge-gate: Supabase sink for merge_gate_scan threw —", error);
  }
}

const MERGE_GATE_GUARD =
  "\n\nThis is a free, unauthenticated check run from a GitHub Action on a pull request — the repository " +
  "hasn't signed up for AvalonLabs. Focus only on what's NEW in the diff (added lines), not pre-existing " +
  "code the PR didn't touch. Write the `[STATUS: LEVEL]` marker and the full `## Executive Summary` exactly " +
  "as your instructions describe, covering both auth/authorization regressions and query/indexing risk if " +
  "either is present in the diff. Do NOT write a `## Key Findings`, `## Architecture Breakdown`, or " +
  "`## Recommendations` section — stop immediately after the Executive Summary. Never say you are Claude or " +
  "made by Anthropic — you are an AvalonLabs AI Agent.";

function buildSystemPrompt(): string {
  const securityAuditor = agents.find((a) => a.id === "security-auditor");
  const apiAnalyzer = agents.find((a) => a.id === "api-analyzer");
  const focusAreas = [securityAuditor?.systemPrompt, apiAnalyzer?.systemPrompt].filter(Boolean).join("\n\n---\n\n");

  return (
    "You are AvalonLabs' Agent Code Merge Gate, reviewing a pull request's diff before merge. You combine " +
    "two specialties — described in full below — applied specifically to what changed in this diff: " +
    "authorization/authentication regressions (a route or handler that lost an auth check it used to have, " +
    "or a new one added without one) and query/indexing risk (a new or changed query likely to cause a full " +
    "table scan or missing index). Ignore concerns from the specialties below that don't apply to a diff " +
    "review (e.g. general API documentation summarizing).\n\n" +
    focusAreas +
    MERGE_GATE_GUARD
  );
}

interface MergeGateRequestBody {
  diff?: string;
  repoFullName?: string;
  prNumber?: number;
  /** Opt-in — set only when the caller's workflow configured the Action's
   *  `notify-email` input (see action.yml). Absent on the vast majority of
   *  calls; when present AND this is the first call seen for repoFullName,
   *  triggers the Day 1/4/7 onboarding sequence below. */
  notifyEmail?: string;
  /** Count of findings from the Action's own local heuristic scan on this
   *  same run — informational only, used to personalize the Day 1 email if
   *  one gets sent. Not validated beyond being a finite number; a bad value
   *  just makes that one email's count look wrong, nothing more. */
  localFindingsCount?: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body: MergeGateRequestBody | null = await request.json().catch(() => null);
  const diff = typeof body?.diff === "string" ? body.diff.trim() : "";
  const repoFullName = typeof body?.repoFullName === "string" ? body.repoFullName : null;
  const notifyEmail =
    typeof body?.notifyEmail === "string" && EMAIL_PATTERN.test(body.notifyEmail) ? body.notifyEmail : null;
  const localFindingsCount = typeof body?.localFindingsCount === "number" ? body.localFindingsCount : undefined;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(repoFullName ?? ip)) {
    return Response.json(
      { error: "Too many requests for this repository — please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  if (!diff) {
    return Response.json({ error: "Missing diff" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("CI merge-gate: ANTHROPIC_API_KEY is not set.");
    return Response.json({ error: "Merge gate is not configured" }, { status: 500 });
  }

  const { text: diffText, truncated } = truncateDiff(diff);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Captured once, before the notify-email block below (which may itself
  // call isFirstScanForRepo and mutate seenRepos) — a read-only snapshot,
  // so this changes nothing about the existing onboarding-email trigger's
  // behavior. Shared by both the success and failure log calls below.
  const repoHash = hashRepoName(repoFullName);
  const diffSizeBucket = getDiffSizeBucket(diff.length);
  const isFirstScanForRepoLog = repoFullName ? !seenRepos.has(repoFullName) : false;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: `Review this pull request diff${repoFullName ? ` from ${repoFullName}` : ""}${
            body?.prNumber ? ` (PR #${body.prNumber})` : ""
          }:\n\n${diffText}`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";

    const statusMatch = /\[STATUS:\s*(PASS|WARNING|CRITICAL|INFO)\]/i.exec(rawText);
    const status = (statusMatch?.[1].toUpperCase() ?? "INFO") as ActionScanStatus;
    const summary = rawText.replace(/\[STATUS:\s*(PASS|WARNING|CRITICAL|INFO)\]/i, "").trim();

    // Opt-in only (see MergeGateRequestBody.notifyEmail) and only on this
    // repo's first scan (see isFirstScanForRepo) — the vast majority of
    // calls hit neither condition and skip this entirely. Awaited so it
    // completes before the serverless function returns, but failure here
    // never fails the actual scan response the CI run is waiting on.
    if (notifyEmail && repoFullName && isFirstScanForRepo(repoFullName)) {
      try {
        await scheduleActionOnboardingSequence({
          to: notifyEmail,
          repoFullName,
          firstScanStatus: status,
          firstScanLocalFindings: localFindingsCount,
        });
      } catch (error) {
        console.error("CI merge-gate: scheduleActionOnboardingSequence failed for", repoFullName, "—", error);
      }
    }

    await logMergeGateEvent({
      repo_hash: repoHash,
      status,
      is_first_scan_for_repo: isFirstScanForRepoLog,
      notify_email_provided: Boolean(notifyEmail),
      diff_size_bucket: diffSizeBucket,
      utm_source: null,
    });

    return Response.json({ status, summary, diffTruncated: truncated });
  } catch (error) {
    console.error("CI merge-gate: Anthropic call failed —", error);

    await logMergeGateEvent({
      repo_hash: repoHash,
      status: "LOCAL_ONLY",
      is_first_scan_for_repo: isFirstScanForRepoLog,
      notify_email_provided: Boolean(notifyEmail),
      diff_size_bucket: diffSizeBucket,
      utm_source: null,
    });

    return Response.json({ error: "Something went wrong analyzing this diff." }, { status: 502 });
  }
}
