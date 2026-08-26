/**
 * Day 0/2/4/6 lifecycle nurture sequence for Revenue Recovery Track B
 * (transaction-first, product-led). Scaffolding, not a finished feature —
 * see the trigger-point note at the bottom before treating this as live.
 *
 * Copy below is a first draft matching the plan's intent per email, not
 * final marketing copy — expect to revise wording, and definitely replace
 * the {{unlockUrl}}-style placeholders with real links before this ever
 * sends to a real visitor.
 */
import { sendEmail, buildFromAddress } from "@/lib/email/provider";
import { siteConfig } from "@/lib/site-config";

export type LifecycleNiche = "agent-code-merge-gate" | "postgres-bill-killer" | "handoff-verification";

const NICHE_LABEL: Record<LifecycleNiche, string> = {
  "agent-code-merge-gate": "Agent Code Merge Gate",
  "postgres-bill-killer": "Silent Postgres Bill Killer",
  "handoff-verification": "Client Handoff Verification",
};

/** Day-2 failure-mode teardown, one per niche (Revenue Recovery Track B, pillar 3).
 *  Kept as a short representative anecdote, not a real customer's story —
 *  swap for an actual (consented) case study once one exists. */
const NICHE_TEARDOWN: Record<LifecycleNiche, string> = {
  "agent-code-merge-gate":
    "We recently found an authorization check that existed in a human-written route but silently " +
    "disappeared when an AI coding agent refactored it — it still passed every test, because no test " +
    "covered who was allowed to call it. It shipped, and stayed live for weeks before anyone noticed.",
  "postgres-bill-killer":
    "One missing index on a single hot query was enough to double a Supabase compute bill in a month — " +
    "nothing else about the app changed. The fix was a five-minute index, but nobody looked until the " +
    "invoice forced the question.",
  "handoff-verification":
    "An agency almost shipped a client handoff with a stored XSS hole in an admin form nobody had " +
    "reviewed since the original build. The client had no way to catch it themselves — that's the whole " +
    "reason this report exists.",
};

interface LifecycleEmailInput {
  to: string;
  niche: LifecycleNiche | null;
  /** Link back to the visitor's own free preview / unlock page. Required for
   *  a real send — left optional here only so this module can be exercised
   *  in isolation before that URL-generation piece exists. */
  unlockUrl?: string;
}

function subjectAndBody(day: 0 | 2 | 4 | 6, input: LifecycleEmailInput): { subject: string; text: string } {
  const label = input.niche ? NICHE_LABEL[input.niche] : "your report";
  const unlockUrl = input.unlockUrl ?? `${siteConfig.url}/dashboard`;

  switch (day) {
    case 0:
      return {
        subject: `Your ${label} report is ready`,
        text:
          `Your free preview is ready — the Executive Summary and status are already in your dashboard.\n\n` +
          `We found more than what's visible in the free preview. See the full findings and the ` +
          `recommended fix here:\n${unlockUrl}\n\n` +
          `— ${siteConfig.shortName}`,
      };
    case 2: {
      const teardown = input.niche ? NICHE_TEARDOWN[input.niche] : NICHE_TEARDOWN["agent-code-merge-gate"];
      return {
        subject: `What we usually find (a real failure mode)`,
        text:
          `${teardown}\n\n` +
          `Worth a second look at your own report — it's still waiting for you:\n${unlockUrl}\n\n` +
          `— ${siteConfig.shortName}`,
      };
    }
    case 4:
      return {
        subject: `Unlock your report — $19 for the next 48 hours`,
        text:
          `Your full ${label} findings are $29 normally — $19 if you unlock in the next 48 hours.\n\n` +
          `${unlockUrl}\n\n` +
          (input.niche === "handoff-verification"
            ? `Prefer a person to walk through it with you instead? Reply to this email and we'll set up ` +
              `a short call.\n\n`
            : "") +
          `— ${siteConfig.shortName}`,
      };
    case 6:
      return {
        subject: `Last call — your discount expires today`,
        text:
          `Your $19 window closes today. After that it's back to the standard $29.\n\n${unlockUrl}\n\n` +
          `— ${siteConfig.shortName}`,
      };
  }
}

function daysFromNowIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/**
 * Sends Day 0 immediately and schedules Day 2/4/6 via the provider's native
 * scheduled-send support (Resend's `scheduledAt`, verified to accept ISO
 * timestamps up to 30 days out — see src/lib/email/provider.ts). Each send
 * is independent and best-effort: one failing does not cancel the others.
 *
 * NOT WIRED TO A REAL TRIGGER YET beyond the one guarded call site in
 * src/lib/paddle/process-webhook.ts (fires on a Paddle trial starting, as a
 * stand-in signal for "signed up, hasn't paid yet" — see the comment there
 * for why). The plan's actual trigger — email captured right after the free
 * preview, tagged with which niche page the visitor came from — needs the
 * signup-time niche tagging this file's own doc comment flags as an
 * unbuilt dependency (Revenue Recovery plan, onboarding pillar). There is
 * also no dedupe/cancellation tracking here yet: nothing stops this
 * function from being called twice for the same person (double-sending the
 * sequence), and nothing here cancels the Day 2/4/6 sends if they buy before
 * Day 2. A production version needs a small table (email, niche,
 * scheduled_at, canceled_at) to close both gaps — deliberately left out of
 * this pass since it needs a schema decision, not just application code.
 */
/**
 * Day 1/4/7 onboarding sequence for a *different* funnel than the one above
 * — Revenue Recovery Track B, distribution pillar 1's conversion loop.
 * `scheduleLifecycleSequence` nurtures someone who ran a free preview toward
 * unlocking a single $19/$29 one-time report; this nurtures a developer who
 * installed the free "Agent Code Merge Gate" GitHub Action (see
 * github-action/agent-code-merge-gate/) toward the $49/mo Pro subscription's
 * full specialist agent suite + team dashboard — a structurally different
 * offer (recurring platform access, not a one-time unlock), so it gets its
 * own function and copy rather than overloading the one above with a second
 * pricing model and trigger shape.
 *
 * Trigger: src/app/api/ci/merge-gate/route.ts calls this once, the first
 * time it sees a given repoFullName AND the Action's optional `notify-email`
 * input was set for that run (see action.yml — entirely opt-in; most
 * installs never trigger this at all). There is no GitHub "Action installed"
 * webhook to hook for a plain composite Action (that only exists for GitHub
 * Apps), so "first scan we've seen for this repo, with an email attached" is
 * the closest real proxy for "installed" available here.
 *
 * Same caveats as scheduleLifecycleSequence above: Day 1/4/7 content is
 * rendered once, at trigger time, and handed to the provider's scheduled
 * send — it can't reflect scans that happen between now and Day 7, only
 * what's known at the moment the sequence is kicked off (the first scan's
 * result). And there's still no dedupe/cancellation table, so if the same
 * repoFullName+email pair ever gets treated as "first scan" twice (e.g.
 * after a serverless cold start resets the in-memory tracker in
 * route.ts — see scanTracker there), this sends the sequence twice. Fine
 * for v1; a real dedupe needs the same schema decision already flagged
 * above, not more application code.
 */
export type ActionScanStatus = "PASS" | "INFO" | "WARNING" | "CRITICAL" | "LOCAL_ONLY";

interface ActionOnboardingInput {
  to: string;
  repoFullName: string;
  /** The status of the scan that triggered this sequence — shapes Email 2's
   *  "what we found" framing (a real catch vs. a clean-run reassurance). */
  firstScanStatus: ActionScanStatus;
  /** Count of findings from the Action's own local heuristic scan on that
   *  first run (independent of firstScanStatus, which reflects the AI call).
   *  Optional because a diff over the client-side size cap skips the AI
   *  call entirely but still runs local heuristics — see index.js. */
  firstScanLocalFindings?: number;
}

const ACTION_RISK_LINE: Record<ActionScanStatus, string> = {
  CRITICAL:
    "Your first scan already flagged something worth a look before merge — that's exactly the kind of " +
    "silent regression (an auth check that quietly disappeared, or a query about to full-table-scan) that " +
    "slips through review when a PR is majority AI-generated.",
  WARNING:
    "Your first scan turned up a pattern worth a second look — not necessarily a blocker, but the kind of " +
    "thing worth catching before merge rather than after.",
  INFO:
    "Your first scan came back clean, which is the common case — most PRs don't introduce a regression. " +
    "The value shows up on the ones that do, which is exactly when it's easy to miss in review.",
  PASS:
    "Your first scan came back clean. That's normal — the Merge Gate earns its keep on the PR where " +
    "something slips through, not every PR before it.",
  LOCAL_ONLY:
    "Your first scan ran on local heuristics only (the AI call didn't complete that time) — still enough " +
    "to catch the most common unindexed-query and auth-regression shapes automatically.",
};

function actionSubjectAndBody(
  day: 1 | 4 | 7,
  input: ActionOnboardingInput
): { subject: string; text: string } {
  const proUrl = `${siteConfig.url}/#pricing?utm_source=lifecycle_email&utm_medium=email&utm_campaign=action_onboarding&repo=${encodeURIComponent(input.repoFullName)}`;
  const dashboardUrl = `${siteConfig.url}/dashboard?utm_source=lifecycle_email&utm_medium=email&utm_campaign=action_onboarding`;

  switch (day) {
    case 1:
      return {
        subject: `${input.repoFullName} is now covered by Agent Code Merge Gate`,
        text:
          `Agent Code Merge Gate is live on ${input.repoFullName}. Every new pull request now gets a free ` +
          `scan for auth/authorization regressions and unindexed-query risk, posted straight to the PR as a ` +
          `comment.\n\n` +
          `Your first scan found ${input.firstScanLocalFindings ?? 0} local-heuristic finding(s) and came ` +
          `back status ${input.firstScanStatus} from the AI check.\n\n` +
          `Nothing else to set up — it runs on every PR from here. — ${siteConfig.shortName}`,
      };
    case 4:
      return {
        subject: `What Agent Code Merge Gate is catching on ${input.repoFullName}`,
        text:
          `${ACTION_RISK_LINE[input.firstScanStatus]}\n\n` +
          `The free Action runs one local heuristic pass plus one AI check per PR. AvalonLabs Pro runs the ` +
          `full specialist agent suite (security, API, and query-performance review together) across your ` +
          `whole repo, not just PR diffs, with a dashboard showing what's been caught over time:\n${dashboardUrl}\n\n` +
          `— ${siteConfig.shortName}`,
      };
    case 7:
      return {
        subject: `Give your whole team the full agent suite — AvalonLabs Pro`,
        text:
          `A week in on ${input.repoFullName}: the free Merge Gate Action is still running on every PR, no ` +
          `action needed from you.\n\n` +
          `If it's already caught something worth merging around, Pro ($49/mo) extends the same coverage ` +
          `with the full specialist agent suite and a team dashboard — everyone on the repo gets visibility, ` +
          `not just whoever reads the PR comment:\n${proUrl}\n\n` +
          `— ${siteConfig.shortName}`,
      };
  }
}

/**
 * Sends Day 1 immediately, schedules Day 4 and Day 7 via the provider's
 * native scheduled-send support — same mechanism and same caveats as
 * scheduleLifecycleSequence (best-effort, independent per-email sends, no
 * dedupe/cancellation store yet).
 */
export async function scheduleActionOnboardingSequence(input: ActionOnboardingInput) {
  const from = buildFromAddress(siteConfig.shortName);
  const days: Array<1 | 4 | 7> = [1, 4, 7];

  const results = await Promise.allSettled(
    days.map((day) => {
      const { subject, text } = actionSubjectAndBody(day, input);
      return sendEmail({
        to: input.to,
        from,
        subject,
        text,
        ...(day > 1 && { scheduledAt: daysFromNowIso(day - 1) }),
      });
    })
  );

  results.forEach((result, i) => {
    if (result.status === "rejected" || !result.value.ok) {
      console.error(
        `email/lifecycle: Action onboarding Day ${days[i]} send failed for repo "${input.repoFullName}"`,
        result
      );
    }
  });
}

export async function scheduleLifecycleSequence(input: LifecycleEmailInput) {
  const from = buildFromAddress(siteConfig.shortName); // same sender resolution as /api/contact and the Action onboarding sequence
  const days: Array<0 | 2 | 4 | 6> = [0, 2, 4, 6];

  const results = await Promise.allSettled(
    days.map((day) => {
      const { subject, text } = subjectAndBody(day, input);
      return sendEmail({
        to: input.to,
        from,
        subject,
        text,
        ...(day > 0 && { scheduledAt: daysFromNowIso(day) }),
      });
    })
  );

  results.forEach((result, i) => {
    if (result.status === "rejected" || !result.value.ok) {
      console.error(`email/lifecycle: Day ${days[i]} send failed for niche "${input.niche ?? "none"}"`, result);
    }
  });
}
