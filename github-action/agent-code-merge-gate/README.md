# AvalonLabs Agent Code Merge Gate

**The pre-merge check for AI-agent-authored code.** Cursor, Copilot,
Devin, and Claude ship fast — and they ship two specific mistakes more
than a human reviewer usually would: a dropped auth check, and a new
query with no index behind it. This catches both, before merge, for free.

## The problem

Your team merges more PRs per week than it used to, because half of
them are agent-authored. Nobody's review bandwidth went up to match.
The two bugs that most reliably slip through in that gap:

- **Auth regressions** — a route or handler that lost an auth check it
  used to have, or a new one shipped with none.
- **Query-indexing risk** — a new or changed query shaped like a full
  table scan, with no matching index anywhere in the same diff.

Neither shows up as a failing test. Both show up three weeks later —
as a support ticket, an incident channel, or a bill spike — once
someone finally traces it back to a PR everyone already approved.

## See it catch a real one

This is an actual comment this Action posts — not a mockup:

```
### AvalonLabs Agent Code Merge Gate
🔴 CRITICAL

**Executive Summary**
This PR removes an auth guard from a destructive admin route and adds a
new unauthenticated export route with a full-table-scan query.

**Local scan** (offline heuristics — approximate, not exhaustive)
🔴 Critical — src/routes/admin.js:10 — Removed line looks like an auth
  check, with no replacement added in this file's diff: app.delete(...)
🟠 Warning — src/routes/reports.js:2 — New route/handler added with no
  auth-guard call found in this file's diff.

[Unlock the full diagnostic on AvalonLabs →]
```

That's an agent-generated Executive Summary from AvalonLabs' Security
Auditor + API Analyzer agents, sitting on top of a fast offline
heuristic pass — so even if AvalonLabs' API is unreachable, you still
get the local findings (see **Resilience** below).

## 3-line setup

```yaml
- uses: avalonlabs-platform/agent-code-merge-gate@v1.0.0
  with:
    github-token: ${{ github.token }}
```

Full workflow (copy-paste, works as-is):

```yaml
on: pull_request
permissions:
  pull-requests: write
  contents: read

jobs:
  merge-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: avalonlabs-platform/agent-code-merge-gate@v1.0.0
        with:
          github-token: ${{ github.token }}
          # notify-email: you@company.com   # optional: get a 3-part setup + findings email
```

`github-token` already defaults to `${{ github.token }}` — the step
alone is functionally complete once your workflow's `permissions` block
is set as above. Nothing else to configure. It doesn't block your merge
by default (`fail-on-critical` is off unless you turn it on) — it's a
comment, not a gate you have to trust blindly on day one.

## What it never does

- Never runs `actions/checkout` or executes anything from the PR — only
  calls the GitHub API for the diff and to post a comment. Safe under
  `pull_request_target` for fork PRs, which is not true of most Actions
  that check out and run untrusted PR code under that trigger.
- Never sees more than the diff text itself. Nothing about your
  repository is stored beyond what's needed to generate that one
  summary.
- Never blocks a merge unless you explicitly opt in with
  `fail-on-critical: "true"`.

## Inputs

| Input | Default | Description |
|---|---|---|
| `github-token` | `${{ github.token }}` | Needs `pull-requests: write` + `contents: read`. |
| `avalonlabs-endpoint` | AvalonLabs' hosted API | Override only for a staging/self-hosted deployment. |
| `fail-on-critical` | `"false"` | Set `"true"` to fail the check on `CRITICAL`. Off by default. |
| `comment-on-pr` | `"true"` | Set `"false"` to skip the PR comment and use outputs only. |
| `notify-email` | `""` | Optional. Get a 3-part email (day 1/4/7) on what your first scan found and what Pro adds. Opt-in only — omit it and nothing is captured. |

## Outputs

| Output | Description |
|---|---|
| `status` | `PASS`, `INFO`, `WARNING`, `CRITICAL`, or `LOCAL_ONLY` if the AvalonLabs call failed and only local heuristics ran. |
| `summary` | The Executive Summary text (empty for `LOCAL_ONLY`). |
| `local-findings-count` | Count of findings from the offline heuristic scan. |

## Resilience

The AvalonLabs API call has a 25-second timeout and never throws — a
network failure, timeout, or bad response falls back to `LOCAL_ONLY`
and the comment still posts with the offline findings alone. Diffs over
200KB skip the API call (heuristics still run); the API itself
truncates anything over ~12,000 characters (kept from both ends of the
diff, not just the head).

## Honest scope

The offline scan is regex/line-based against the diff text, not a real
parser or AST diff — it will miss real risk and occasionally flag
non-issues. Tuned for common Express/Next.js/Fastify route patterns and
common SQL/ORM query shapes. Treat every finding as "worth a second
look," not a verdict.

## Beyond the free scan

This Action is free and stays free — it's the on-ramp, not the product.
AvalonLabs Pro ($49/mo) adds the full Security Auditor + API Analyzer +
SQL Optimizer + Code Explainer suite as a dashboard, plus multi-repo
coverage, Slack alerts, and a GitHub App for org-wide rollout instead of
per-repo YAML.  [See pricing →](https://www.avalonlabs-platform.com/#pricing?utm_source=github&utm_medium=readme&utm_campaign=merge_gate)

## Development

```bash
npm install
node -e "console.log(require('./lib/heuristics').runHeuristics(require('fs').readFileSync('/path/to/a.diff', 'utf8')))"
```

`index.js` exports `run`, `buildCommentBody`, `badgeMarkdownUrl`, and
`renderFindingsList` (guarded behind `require.main === module`) if you
want to unit test comment formatting without a live Actions context.

**Dependency pin note:** `@actions/core`/`@actions/github` are pinned
to `^1.11.1`/`^6.0.1` (last CommonJS-compatible majors) — their current
majors ship ESM-only, which breaks this repo's `require(...)` calls.
Bumping past them needs converting the whole Action to ESM first.
