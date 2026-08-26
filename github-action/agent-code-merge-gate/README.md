# AvalonLabs Agent Code Merge Gate

Checks a pull request's diff for the two failure modes most likely to slip
through review when a PR is majority AI-agent-generated:

- **Auth regressions** — a route or handler that lost an auth check it used
  to have, or a new one added without one.
- **Query-indexing risk** — a new or changed query shaped like a full table
  scan, or a filter with no matching index in the same diff.

It posts one PR comment (updated on every push, never duplicated) with a
status badge, an AI-generated Executive Summary from AvalonLabs' Security
Auditor + API Analyzer agents, a list of findings from a fast offline
heuristic scan, and a link to unlock the full diagnostic on AvalonLabs.

## Quick start

```yaml
- uses: avalonlabs/agent-code-merge-gate@v1
  with:
    github-token: ${{ github.token }}
```

Add that as a step in a workflow that triggers `on: pull_request`. The
workflow also needs `pull-requests: write` permission so the Action can post
its comment:

```yaml
on: pull_request
permissions:
  pull-requests: write
  contents: read

jobs:
  merge-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: avalonlabs/agent-code-merge-gate@v1
        with:
          github-token: ${{ github.token }}
```

`github-token` defaults to `${{ github.token }}` already, so the 3-line
snippet above is only there to make the token explicit — the step alone
(`- uses: avalonlabs/agent-code-merge-gate@v1`) is functionally complete on
its own once the workflow's `permissions` are set.

## What the comment looks like

```
### AvalonLabs Agent Code Merge Gate
![AvalonLabs Merge Gate](…CRITICAL-red badge…)

**Executive Summary**
This PR removes an auth guard from a destructive admin route and adds a
new unauthenticated export route with a full-table-scan query.

**Local scan** (offline heuristics — approximate, not exhaustive)
- 🔴 Critical — `src/routes/admin.js:10` — Removed line looks like an auth
  check, with no replacement added in this file's diff: `app.delete(...)`
- 🟠 Warning — `src/routes/reports.js:2` — New route/handler added with no
  auth-guard call found in this file's diff.

[Unlock the full diagnostic on AvalonLabs →](…)
```

The Executive Summary only ever covers what's visible for free — the same
"Executive Summary now, full Key Findings after you unlock" split used
everywhere else in AvalonLabs' free previews. AvalonLabs never sees more
than the diff itself; nothing about your repository is stored beyond the
request needed to generate that one summary.

## Safe on fork pull requests

This Action never runs `actions/checkout` or executes anything from the
PR — it only calls the GitHub API for the diff and to post a comment, and
sends that diff text to AvalonLabs. That makes it safe to run under
`pull_request_target` (which has access to secrets and `pull-requests:
write` against the base repo) for PRs from forks, without the usual risk of
a fork's code running with those permissions — a real concern for any
Action that does check out and execute untrusted PR code under
`pull_request_target`, which this one deliberately avoids needing to do.

## Inputs

| Input | Default | Description |
|---|---|---|
| `github-token` | `${{ github.token }}` | Needs `pull-requests: write` + `contents: read`. |
| `avalonlabs-endpoint` | AvalonLabs' hosted API | Override only for a staging/self-hosted deployment. |
| `fail-on-critical` | `"false"` | Set `"true"` to fail the check (blocking merge, if required) when the result is `CRITICAL`. Off by default — v1 annotates, it doesn't block, until a team opts in. |
| `comment-on-pr` | `"true"` | Set `"false"` to skip the PR comment and only use the outputs below. |

## Outputs

| Output | Description |
|---|---|
| `status` | `PASS`, `INFO`, `WARNING`, `CRITICAL`, or `LOCAL_ONLY` (AvalonLabs call failed or was skipped — only the offline heuristic scan ran). |
| `summary` | The Executive Summary text (empty for `LOCAL_ONLY`). |
| `local-findings-count` | Count of findings from the offline heuristic scan. |

## Resilience

The AvalonLabs API call has a 25-second timeout and never throws — a
network failure, timeout, or bad response falls back to `status: LOCAL_ONLY`
and the comment still posts with the offline heuristic findings alone.
Diffs over 200KB skip the API call entirely (still run heuristics) to avoid
sending huge payloads to a free endpoint; the API itself also truncates
anything over ~12,000 characters it does receive (kept from both ends of
the diff, not just the head).

## Scope and honesty about what this catches

The offline scan is regex/line-based against the diff text, not a real
parser or AST diff — it will miss real risk and occasionally flag
non-issues. It's tuned for common Express/Next.js/Fastify route patterns and
common SQL/ORM query shapes; a codebase that doesn't match those patterns
will get fewer (not more false) findings. Treat every finding as "worth a
second look," not a verdict.

## Publishing this to the GitHub Marketplace

GitHub only auto-lists an action on the Marketplace when its `action.yml`
lives at the **root** of a public repository — a subdirectory action.yml
(like this one, inside a larger platform monorepo) can still be referenced
directly as `your-org/your-monorepo/github-action/agent-code-merge-gate@v1`
and used by anyone, but it will not appear in Marketplace search or get a
Marketplace listing page. To actually publish it:

1. Create a new, dedicated public repository (e.g. `avalonlabs/agent-code-merge-gate`).
2. Copy this folder's contents (`action.yml`, `index.js`, `lib/`,
   `package.json`, this `README.md`) to that repository's root.
3. Commit `node_modules/` too, **or** add a build step that bundles
   dependencies into a single file (e.g. with `@vercel/ncc`) — this repo's
   composite `action.yml` runs `npm install` at execution time instead,
   which works for direct `uses:` references but is generally discouraged
   for a Marketplace-published action (it depends on npm registry
   availability at every consumer's CI run, not just at publish time).
4. Tag a release (`v1`, plus a `v1` moving major tag pointing at the latest
   `v1.x.y` — the GitHub Actions convention).
5. Use the repository's "Publish this Action to the Marketplace" flow via
   the release UI, which requires two-factor authentication on the account.

Until that extraction happens, treat the `uses:` line above as needing your
actual org/repo path once you know where this will live — `avalonlabs/agent-code-merge-gate@v1`
is a placeholder.

## Development

```bash
npm install
node -e "console.log(require('./lib/heuristics').runHeuristics(require('fs').readFileSync('/path/to/a.diff', 'utf8')))"
```

`index.js` exports `run`, `buildCommentBody`, `badgeMarkdownUrl`, and
`renderFindingsList` (guarded behind `require.main === module` so importing
it for a test doesn't trigger a real run) if you want to unit test the
comment-formatting logic without a live GitHub Actions context.

**Dependency pin note**: `@actions/core` and `@actions/github` are pinned to
their last CommonJS-compatible major versions (`^1.11.1` / `^6.0.1`) on
purpose — their current major versions (`3.x` / `9.x` as of August 2026) ship
as ESM-only (`"type": "module"`, no CJS `exports` entry), which breaks the
`require(...)` calls in `index.js` and `lib/heuristics.js`. Bumping past
these majors needs converting this action to ESM (`import`/`export`,
`"type": "module"` in `package.json`), not just a version bump.
