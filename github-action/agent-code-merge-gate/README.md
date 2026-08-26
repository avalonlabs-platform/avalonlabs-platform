# AvalonLabs Agent Code Merge Gate

**Status:** extracted and live at [avalonlabs-platform/agent-code-merge-gate](https://github.com/avalonlabs-platform/agent-code-merge-gate), tagged `v1.0.0`. Not yet appearing in Marketplace *search* — that still needs the manual "Publish this Action to the Marketplace" step described below.

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
- uses: avalonlabs-platform/agent-code-merge-gate@v1.0.0
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
      - uses: avalonlabs-platform/agent-code-merge-gate@v1.0.0
        with:
          github-token: ${{ github.token }}
```

`github-token` defaults to `${{ github.token }}` already, so the 3-line
snippet above is only there to make the token explicit — the step alone
(`- uses: avalonlabs-platform/agent-code-merge-gate@v1.0.0`) is functionally
complete on its own once the workflow's `permissions` are set.

**On the `@v1.0.0` pin:** only the exact `v1.0.0` tag exists right now, so
that's what's pinned above rather than the usual GitHub Actions convention
of a moving `@v1` major tag (the pattern `actions/checkout@v4` uses, which
auto-updates through patch/minor releases). To offer that convenience later,
push a moving tag once and repoint it on every future `v1.x.y` release:
```
git tag -f v1 v1.0.0
git push -f https://github.com/avalonlabs-platform/agent-code-merge-gate.git v1
```
Until that's done, consumers should pin the exact version (`@v1.0.0`), not `@v1` — that ref doesn't exist yet and would fail to resolve.

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

## Getting listed on the GitHub Marketplace

The repo itself now satisfies GitHub's structural requirement for
Marketplace eligibility — a public repo with `action.yml` at its root, and a
tagged release (`v1.0.0`). What's still manual, by GitHub's own design (no
API/CLI path exists for either):

1. **Decide on `node_modules`.** This Action currently runs `npm install` at
   every consumer's CI execution (see `action.yml`'s "Install action
   dependencies" step) rather than shipping pre-bundled. That works fine for
   a direct `uses:` reference, but a widely-used Marketplace action is
   usually bundled with something like `@vercel/ncc` into a single file (or
   ships `node_modules` committed) so it doesn't depend on npm registry
   uptime at every consumer's run, not just at publish time. Not a blocker
   to functioning today — worth doing before pushing for wide adoption.
2. **Publish through the release UI.** On the repo's GitHub page: Releases →
   Draft a new release → pick the `v1.0.0` tag → check "Publish this Action
   to the GitHub Marketplace" → follow the 2FA re-verification prompt. This
   is the one step that only exists as a manual, human-confirmed action in
   GitHub's UI — there's no `gh` subcommand or API call for it.
3. **Optional but conventional:** push the moving `v1` tag described above,
   so consumers can write `@v1` and get future `v1.x.y` patches
   automatically instead of pinning the exact version.

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
