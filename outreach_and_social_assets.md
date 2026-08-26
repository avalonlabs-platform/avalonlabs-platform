# Outreach & social assets — Agent Code Merge Gate (2026-08-26 update)

**Live repo:** https://github.com/avalonlabs-platform/agent-code-merge-gate — extracted, tagged `v1.0.0`, and pushed. `@v1.0.0` is the correct pin to use in copy below until a moving `v1` tag is pushed (see the Action's own README for that one-time step); `@v1` does not resolve yet.

## Template A — CTO / VP Eng, Agent Code Merge Gate (updated)

Updated to offer the free check *or* the GitHub Action as parallel options, instead of only offering a manual one-off check. Risk-and-money framing kept intact from the original.

**Subject:** your last Copilot-authored PR and your auth model

**Body:**

> Quick one — how many of your merged PRs this month were majority AI-generated? I ran our Security Auditor against a public repo in your space and found an authorization check that only existed in the human-written version, not the AI-refactored one that replaced it. Nobody caught it because it passed every test.
>
> You can either test our free 1-file check or drop our 3-line GitHub Action into your CI to catch AI auth drops automatically:
>
> — Free check, no signup: https://www.avalonlabs-platform.com/tools/security-auditor
> — Or straight into CI: `- uses: avalonlabs-platform/agent-code-merge-gate@v1.0.0`
>
> No pitch if it comes back clean.

This reference is live — the repo is extracted, tagged, and pushed. It's not yet listed on Marketplace *search* (that still needs the manual publish-with-2FA step in the Action's README), which doesn't affect this direct `uses:` line at all — Marketplace search discoverability and a working direct reference are separate things.

## Template B — Solo founder, Silent Postgres Bill Killer (unchanged)

Not touched — you only asked for Template A. Kept here for reference since both live in the same outreach set:

**Subject:** your Supabase bill, one query

**Body:**

> Saw you're running [stack] on Supabase. Most usage-based Postgres bill spikes trace back to one or two unindexed queries doing full table scans under load — I've seen it double a bill in a month with nothing else changing. Paste me your slowest query (or the one you suspect) and I'll tell you the exact fix, free, in a few minutes. If it turns out to be nothing, you've lost five minutes; if it's something, you've probably just found real monthly savings.

## Social / developer post snippet

Written to work as-is on X, LinkedIn, or dev.to (drop the hashtags for LinkedIn/dev.to if they don't fit your voice there).

```
Your AI coding agent doesn't know your auth model.

We watched an AI-agent refactor quietly drop an authorization check that
only existed in the human-written version it replaced. It passed every
test. Nobody caught it until someone went looking.

So we shipped a GitHub Action that checks for this on every PR:

- uses: avalonlabs-platform/agent-code-merge-gate@v1.0.0
  with:
    github-token: ${{ github.token }}

Three lines. It pulls the diff, runs an offline scan for auth regressions
and unindexed queries, and calls our Security Auditor + API Analyzer
agents for a real Executive Summary — then posts one PR comment:

### AvalonLabs Agent Code Merge Gate
[STATUS BADGE]

**Executive Summary**
This PR removes an auth guard from a destructive admin route and adds a
new unauthenticated export route with a full-table-scan query.

**Local scan**
Critical — src/routes/admin.js:10 — Removed line looks like an auth check,
with no replacement added in this file's diff.
Warning — src/routes/reports.js:2 — New route added with no auth-guard
call found in this file's diff.

Unlock the full diagnostic on AvalonLabs →

No new dashboard, no context switch — it shows up where you already
review code.

Try it free (no signup): https://www.avalonlabs-platform.com/tools/security-auditor
Drop it in CI: https://github.com/avalonlabs-platform/agent-code-merge-gate

#buildinpublic #devtools #AIagents
```

This is ready to post as-is — both links are live. Marketplace search listing (the extra step of it showing up when someone browses/searches Marketplace, rather than just being installable by direct reference) is still pending the manual publish step in the Action's README; that doesn't block posting this or anyone using the `uses:` line today.
