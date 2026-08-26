import Anthropic from "@anthropic-ai/sdk";
import { agents } from "@/constants/agents";
import { scheduleActionOnboardingSequence, type ActionScanStatus } from "@/lib/email/lifecycle";

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

    return Response.json({ status, summary, diffTruncated: truncated });
  } catch (error) {
    console.error("CI merge-gate: Anthropic call failed —", error);
    return Response.json({ error: "Something went wrong analyzing this diff." }, { status: 502 });
  }
}
