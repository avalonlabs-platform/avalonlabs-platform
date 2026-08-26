"use strict";

const core = require("@actions/core");
const github = require("@actions/github");
const { runHeuristics } = require("./lib/heuristics");

const COMMENT_MARKER = "<!-- avalonlabs-agent-code-merge-gate -->";
const MAX_DIFF_BYTES_FOR_API_CALL = 200_000; // client-side sanity cap; the API also truncates server-side
const API_TIMEOUT_MS = 25_000;

const STATUS_BADGE = {
  PASS: { color: "brightgreen", icon: "✓" },
  INFO: { color: "blue", icon: "ℹ" },
  WARNING: { color: "orange", icon: "⚠" },
  CRITICAL: { color: "red", icon: "✕" },
  LOCAL_ONLY: { color: "lightgrey", icon: "•" },
};

const SEVERITY_LABEL = { critical: "🔴 Critical", warning: "🟠 Warning", info: "🔵 Info" };

function badgeMarkdownUrl(status) {
  const { color } = STATUS_BADGE[status] ?? STATUS_BADGE.LOCAL_ONLY;
  const label = encodeURIComponent("AvalonLabs Merge Gate");
  const message = encodeURIComponent(status.replace("_", " "));
  return `https://img.shields.io/badge/${label}-${message}-${color}`;
}

/** Calls the AvalonLabs merge-gate API for an AI-generated status + Executive
 *  Summary. Never throws — a network failure, timeout, or non-200 response
 *  all resolve to `null`, so the caller always has local heuristics to fall
 *  back on instead of failing the whole Action over an optional enrichment. */
async function callAvalonLabs(endpoint, diff, repoFullName, prNumber, notifyEmail, localFindingsCount) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        diff,
        repoFullName,
        prNumber,
        notifyEmail: notifyEmail || undefined,
        localFindingsCount,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      core.warning(`AvalonLabs merge-gate API returned ${response.status} — falling back to local heuristics only.`);
      return null;
    }

    const body = await response.json();
    if (!body?.status || typeof body.summary !== "string") {
      core.warning("AvalonLabs merge-gate API returned an unexpected shape — falling back to local heuristics only.");
      return null;
    }
    return body;
  } catch (error) {
    core.warning(`AvalonLabs merge-gate API call failed (${error.message}) — falling back to local heuristics only.`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function renderFindingsList(findings, headSha, repoUrl) {
  if (findings.length === 0) {
    return "_No unindexed-query or auth-regression patterns matched by the local scan._";
  }
  return findings
    .map((f) => {
      const location = headSha ? `[\`${f.file}:${f.line}\`](${repoUrl}/blob/${headSha}/${f.file}#L${f.line})` : `\`${f.file}:${f.line}\``;
      return `- ${SEVERITY_LABEL[f.severity] ?? f.severity} — ${location} — ${f.message}`;
    })
    .join("\n");
}

function buildCommentBody({ status, summary, diffTruncated, findings, headSha, repoUrl, unlockUrl, proUrl }) {
  const badge = `![AvalonLabs Merge Gate](${badgeMarkdownUrl(status)})`;
  const summarySection =
    status === "LOCAL_ONLY"
      ? "_AvalonLabs' AI-backed Executive Summary was unavailable for this run — showing local heuristic findings only._"
      : summary || "_No summary text returned._";

  // Deliberately one short, plain-text line — not a badge, not bolded, not
  // repeated per-finding. This runs on every PR of every repo that installs
  // the free Action, so it has to read as a footer aside, not a paywall;
  // see the note in scanTracker.record() in src/app/api/ci/merge-gate for
  // the (opt-in, email-based) version of this nudge that isn't tied to
  // rendering a comment at all.
  const proNudge = `_This scan runs the free local heuristics + one AI check. [AvalonLabs Pro](${proUrl}) runs the ` +
    `full specialist agent suite across your whole repo, with a team dashboard and history — no CI wiring required._`;

  // Each array entry is one markdown "block" (heading, paragraph, or list) —
  // joined with a blank line between blocks so GitHub renders headings and
  // paragraphs correctly, rather than one long run-together line.
  const blocks = [
    COMMENT_MARKER,
    `### AvalonLabs Agent Code Merge Gate\n${badge}`,
    `**Executive Summary**\n${summarySection}`,
    diffTruncated ? "_Note: this diff was large enough that AvalonLabs analyzed a truncated version (start + end)._" : null,
    `**Local scan** _(offline heuristics — unindexed-query and auth-regression patterns; approximate, not exhaustive)_\n${renderFindingsList(findings, headSha, repoUrl)}`,
    `[Unlock the full diagnostic on AvalonLabs →](${unlockUrl})`,
    proNudge,
  ];

  return blocks.filter(Boolean).join("\n\n");
}

async function upsertComment(octokit, owner, repo, issueNumber, body) {
  // Unpaginated — only checks the first page (30 comments) for the marker.
  // Fine for this Action's own comment, which it always finds near the top
  // of a PR it's already commented on, but a PR with 30+ other comments
  // before this one's first run could in theory miss it and post a
  // duplicate. Switch to octokit.paginate(...) if that turns out to matter.
  const { data: comments } = await octokit.rest.issues.listComments({ owner, repo, issue_number: issueNumber });
  const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
  } else {
    await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
  }
}

async function run() {
  const pullRequest = github.context.payload.pull_request;
  if (!pullRequest) {
    core.warning("No pull_request in the event payload — this Action only does something on pull_request events. Skipping.");
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    core.setFailed("No github-token available — set `with: github-token: ${{ github.token }}` (this is the default).");
    return;
  }

  const endpoint = process.env.AVALONLABS_ENDPOINT || "https://www.avalonlabs-platform.com/api/ci/merge-gate";
  const failOnCritical = process.env.FAIL_ON_CRITICAL === "true";
  const commentOnPr = process.env.COMMENT_ON_PR !== "false";
  const notifyEmail = (process.env.NOTIFY_EMAIL || "").trim() || null;

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const prNumber = pullRequest.number;
  const repoFullName = `${owner}/${repo}`;

  core.info(`Fetching diff for ${repoFullName}#${prNumber}...`);
  const { data: diff } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });

  const findings = runHeuristics(diff);
  core.info(`Local heuristic scan found ${findings.length} finding(s).`);

  let apiResult = null;
  if (Buffer.byteLength(diff, "utf8") > MAX_DIFF_BYTES_FOR_API_CALL) {
    core.warning(
      `Diff is ${Buffer.byteLength(diff, "utf8")} bytes, over the ${MAX_DIFF_BYTES_FOR_API_CALL}-byte client-side cap — skipping the AvalonLabs API call for this run and using local heuristics only.`
    );
  } else {
    apiResult = await callAvalonLabs(endpoint, diff, repoFullName, prNumber, notifyEmail, findings.length);
  }

  const status = apiResult?.status ?? "LOCAL_ONLY";
  const summary = apiResult?.summary ?? "";
  const unlockUrl = `https://www.avalonlabs-platform.com/tools/security-auditor?utm_source=github_action&utm_medium=pr_comment&utm_campaign=agent_code_merge_gate&repo=${encodeURIComponent(repoFullName)}`;
  const proUrl = `https://www.avalonlabs-platform.com/#pricing?utm_source=github_action&utm_medium=pr_comment&utm_campaign=agent_code_merge_gate_pro&repo=${encodeURIComponent(repoFullName)}`;

  if (commentOnPr) {
    const body = buildCommentBody({
      status,
      summary,
      diffTruncated: Boolean(apiResult?.diffTruncated),
      findings,
      headSha: pullRequest.head?.sha,
      repoUrl: pullRequest.base?.repo?.html_url ?? `https://github.com/${repoFullName}`,
      unlockUrl,
      proUrl,
    });
    await upsertComment(octokit, owner, repo, prNumber, body);
    core.info("Posted/updated PR comment.");
  }

  await core.summary
    .addHeading("AvalonLabs Agent Code Merge Gate")
    .addRaw(`Status: **${status}**\n\n`)
    .addRaw(summary || "_No AI-backed summary this run._")
    .addRaw(`\n\nLocal findings: ${findings.length}`)
    .write();

  core.setOutput("status", status);
  core.setOutput("summary", summary);
  core.setOutput("local-findings-count", String(findings.length));

  if (failOnCritical && status === "CRITICAL") {
    core.setFailed("AvalonLabs Agent Code Merge Gate returned CRITICAL and fail-on-critical is enabled.");
  }
}

// Only auto-runs when executed directly (`node index.js`, as action.yml
// does) — guarded so this file can also be `require()`d from a test script
// to exercise the pure helpers below without triggering a real run.
if (require.main === module) {
  run().catch((error) => {
    core.setFailed(`Agent Code Merge Gate failed unexpectedly: ${error.message}`);
  });
}

module.exports = { run, buildCommentBody, badgeMarkdownUrl, renderFindingsList };
