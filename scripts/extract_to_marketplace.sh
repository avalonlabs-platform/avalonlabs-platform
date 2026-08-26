#!/usr/bin/env bash
# STATUS: already run successfully once — the Action now lives at
# https://github.com/avalonlabs-platform/agent-code-merge-gate, tagged
# v1.0.0. This script is kept for the next version bump (see "Cutting a
# future release" at the bottom), not because it needs to run again today.
#
# Original purpose: extract github-action/agent-code-merge-gate/ out of the
# avalonlabs-platform monorepo into its own standalone public repo with
# action.yml at the root (required for GitHub Marketplace auto-listing),
# tag it, and push it.
#
# Run from the root of your local avalonlabs-platform checkout, in Git Bash
# (ships with Git for Windows) or any shell with `git` on PATH. (The `gh`
# CLI is NOT required — this machine didn't have it installed, so the repo
# itself was created by hand at github.com/new instead; see the README's
# "Getting listed on the GitHub Marketplace" section for that flow.)
set -euo pipefail

REPO_URL="https://github.com/avalonlabs-platform/agent-code-merge-gate.git"

git subtree split --prefix=github-action/agent-code-merge-gate -b merge-gate-extract
git push "$REPO_URL" merge-gate-extract:main
git tag v1.0.0 merge-gate-extract && git push "$REPO_URL" v1.0.0

# --- What this does and doesn't do ---
# Does: gives you a standalone public repo with action.yml at its root and a
# v1.0.0 tag — the two structural things GitHub's Marketplace *requires*
# before it will let you list an action at all. (Already done — this repo
# exists now.)
#
# Does NOT: actually click "Publish this Action to the Marketplace." That
# step only exists in GitHub's release-creation web UI and requires
# re-verifying 2FA on the account — there is no `gh` or API call for it, by
# GitHub's own design (it's the one human-in-the-loop checkpoint before
# something appears in Marketplace search). Still pending: go to
# https://github.com/avalonlabs-platform/agent-code-merge-gate -> Releases
# -> Draft a new release -> pick the v1.0.0 tag -> check "Publish this
# Action to the GitHub Marketplace" -> follow the 2FA prompt.
#
# Also worth doing before wide distribution (not blocking, see the Action's
# own README "Development"/dependency-pin section): decide whether to commit
# node_modules or add an `ncc` bundling build step, since the composite
# action currently runs `npm install` at every consumer's CI execution
# rather than shipping pre-bundled.
#
# --- Cutting a future release (e.g. v1.1.0) ---
# `git subtree split` is safe to re-run — it always creates a fresh branch
# from current history. If a local `merge-gate-extract` branch still exists
# from a previous run, delete it first (`git branch -D merge-gate-extract`)
# or the split will refuse to reuse the name. Then:
#   git subtree split --prefix=github-action/agent-code-merge-gate -b merge-gate-extract
#   git push "$REPO_URL" merge-gate-extract:main
#   git tag v1.1.0 merge-gate-extract && git push "$REPO_URL" v1.1.0
#   git tag -f v1 v1.1.0 && git push -f "$REPO_URL" v1   # if the moving v1 tag exists
