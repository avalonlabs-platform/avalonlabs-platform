# Migrating to a Dedicated Business Organization Account — Checklist

This is a planning checklist, not something that gets run. Every step below is a manual action on a
web dashboard (or requires interactive login credentials) that only the account owner can perform —
account creation, ownership transfers, and billing changes aren't things that should be automated on
someone's behalf, and in several cases (Paddle especially) the platform doesn't even expose a
self-service path. Where a step's mechanics are confirmed against current official docs, that's
cited; where they aren't (Paddle's account-type conversion, some Expo transfer specifics), that's
flagged explicitly rather than guessed at — verify directly with the provider before acting, since
several of these steps touch live billing and can't be cleanly undone.

**Recommended order** — roughly dependency-first: GitHub before Vercel (Vercel's Git integration
needs to be re-pointed at wherever the repo ends up), Supabase and Paddle before any credential
rotation (rotate once, at the new home, not twice), verification last.

## Phase 0 — Before touching anything

- [ ] Confirm the business entity itself is registered and ready to be the account holder (this
      checklist assumes that's already done — it's a legal/administrative step outside this repo's
      scope).
- [ ] Pick a maintenance window. Vercel's transfer is zero-downtime, but Supabase's isn't always
      (see Phase 3), and Paddle's is unknown — treat this as a "things might briefly wobble" window,
      not a guaranteed no-downtime one.
- [ ] `git log` a full export/backup point: tag the current `main` (`git tag pre-org-migration`),
      and take a manual Supabase backup (Dashboard → Database → Backups) before any project transfer.
- [ ] Inventory every credential in `scripts/.env.ops` and `mobile/.env.local` / `.env.local` — you'll
      be rotating all of them in Phase 7 regardless of how the transfers go.

## Phase 1 — GitHub

- [ ] Create the GitHub Organization (or confirm it already exists).
- [ ] Repo → **Settings → General → Danger Zone → Transfer ownership** → transfer to the new org.
- [ ] Re-add collaborators under the org's team/permission model (personal-repo collaborators don't
      carry over as org team members).
- [ ] Re-check branch protection rules on `main` — confirmed correct post-transfer, not assumed.
- [ ] If any GitHub Actions secrets exist, re-add them under the org repo (repo secrets don't survive
      a transfer as reliably as the repo content itself).

## Phase 2 — Vercel

Vercel's project transfer is a documented, self-service, zero-downtime feature
([Vercel docs](https://vercel.com/docs/projects/transferring-projects), confirmed current as of this
writing):

- [ ] Create the destination Vercel **Team** for the org (or confirm it exists), and **add a valid
      payment method to it before transferring** — the docs explicitly warn a missing payment method
      on the target team interrupts service.
- [ ] Project → **Settings → General → Transfer Project** → select the target team.
- [ ] Confirmed to transfer automatically: deployments, environment variables (except any set via
      `vercel.json`'s `env`/`build.env` — those need manual migration to Project Settings first),
      domains/aliases, Git repo link, Cron Jobs, security settings.
- [ ] Confirmed **not** to transfer, and must be redone manually after: Integrations (re-add them),
      Monitoring/log data, Log Drains, Secure Compute/Static IP config, Sandboxes/Snapshots. Usage
      counters reset.
- [ ] Re-point the Vercel GitHub integration at the org-owned repo from Phase 1 if it isn't already
      correctly linked post-transfer.
- [ ] Re-run `node scripts/vercel-controller.mjs status` afterward — the `VERCEL_TOKEN` in
      `scripts/.env.ops` is scoped to the *old* account/team and won't see the transferred project;
      you'll need a new token from the destination team first (see Phase 7).

## Phase 3 — Supabase

Also a documented, self-service feature
([Supabase docs](https://supabase.com/docs/guides/platform/project-transfer)), but with real
prerequisites and one confirmed downtime case:

- [ ] Create the destination Supabase **Organization** for the business entity (or confirm it
      exists), and confirm you're at least a member of it.
- [ ] Before transferring, the project must have: **no active GitHub integration** (disconnect it
      first), **no project-scoped roles** (Team/Enterprise plans only — check if this applies), and
      **no configured log drains**. Disconnect/remove each of these first or the transfer will be
      blocked.
- [ ] Project → Settings → General → transfer flow → choose source and target organization.
- [ ] **Known downtime case**: moving from a paid plan to a Free plan causes roughly 1–2 minutes of
      downtime. Confirm the target org's plan before transferring, and time the transfer for low
      traffic if it's a paid→free move.
- [ ] The docs don't explicitly confirm whether the project URL/connection string changes during an
      org transfer — **verify this directly in the Supabase dashboard before assuming
      `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_DB_URL` stay the same.** If they change, every place that
      hardcodes them needs an update: `.env.local` (web + mobile), `scripts/.env.ops`, and
      `mobile/eas.json`'s baked `env` blocks (three build profiles, all three vars each).
- [ ] Free-plan orgs cap at 2 projects — confirm the destination org has room before transferring.
- [ ] Your role in the target org may differ from your role in the source org — confirm you'll still
      have the access this workflow (and `scripts/db-hygiene.mjs`'s pooler connection) needs.
- [ ] After transfer: re-run `node scripts/db-hygiene.mjs` against whatever connection string is
      current, to confirm the data and RLS policies survived intact.

## Phase 4 — Paddle

**No self-service "convert this account to a business entity" or "transfer this account" flow is
publicly documented.** Paddle's public help content only covers choosing between one account for
multiple businesses vs. separate accounts per business — it does not address converting an existing
individual/staging account into a verified business entity, or whether existing customers and
subscriptions carry over automatically. Do not guess at this one:

- [ ] Contact Paddle support directly and ask specifically: (a) can the *existing* account (with its
      current live subscriptions — currently a small trialing/canceled set, per the last
      `db-hygiene.mjs` run) be upgraded/re-verified as a registered business entity in place, or (b)
      does this require a new account, and if so what's the process for migrating existing customers
      and subscriptions across without disrupting billing.
- [ ] Ask Paddle explicitly about the **Go-Live Readiness Audit** in this same conversation — you'll
      need to complete it eventually regardless, and it may be more efficient to fold both into one
      review with Paddle before opening to public traffic.
- [ ] If a new account number is required: every price ID in `src/constants/pricing-tiers.ts`'s env
      vars, the `PADDLE_API_KEY`/`PADDLE_WEBHOOK_SECRET`, and the webhook URL registered in Paddle's
      dashboard (Developer Tools → Notifications) all need updating together — a partial cutover
      (new API key, old webhook secret, or vice versa) will look exactly like the sync bug already
      diagnosed and fixed this session, for a different reason.
- [ ] After whatever Paddle confirms: re-run `node scripts/verify-paddle-catalog.mjs` and
      `node scripts/paddle-controller.mjs subs` against the new credentials to confirm the catalog
      and subscription data are intact and visible.

## Phase 5 — Expo / EAS

Expo confirms project transfers between accounts are supported, but the detailed mechanics (build
history, stored credentials, whether this forces a package-name change) aren't spelled out in the
page that exists specifically to describe transfers — treat the steps below as a starting point, not
a complete procedure, and re-confirm against
[Expo's current docs](https://docs.expo.dev/distribution/app-transfers/) at migration time:

- [ ] Create the destination Expo **Organization account** (or confirm it exists).
- [ ] Complete `eas login` + `eas build:configure` first if this hasn't been done yet (per
      `OPERATING_SYSTEM.md` §4, it hasn't) — easier to link the EAS project once, at its final home,
      than to link it once and transfer it immediately after.
- [ ] Use Expo's project-transfer flow (linked from the App Transfers doc above) to move the EAS
      project to the org account.
- [ ] Confirm separately with Expo/in the dashboard: does the transfer preserve build credentials
      (Android keystore)? Losing the keystore on a build that's already been sideloaded/tested would
      mean future builds can't update in place — worth confirming before transferring, not after.
- [ ] Re-generate `EXPO_TOKEN` scoped to the destination account (Phase 7), and re-run
      `node scripts/expo-controller.mjs` to confirm build history is visible from the new account.

## Phase 6 — Anthropic Console (API access for `/api/chat`)

- [ ] If `ANTHROPIC_API_KEY` is currently tied to a personal Anthropic account, create an
      Organization in the Anthropic Console for the business entity, add a workspace, and issue a new
      workspace-scoped API key.
- [ ] Update `ANTHROPIC_API_KEY` in Vercel's environment variables (Phase 2 already moved the project
      — this is a value update on the new team, not a re-transfer).

## Phase 7 — Rotate every credential, regardless of how the above went

This is the one phase that's entirely under your control today and doesn't depend on any platform's
transfer mechanics. `scripts/.env.ops` has been holding live, working credentials in plaintext for
the whole build-out this session — a clean org migration is also the natural moment to rotate all of
them, transfer mechanics aside:

- [ ] New Paddle API key + webhook secret (scoped to wherever the Paddle account ends up per Phase 4).
- [ ] New Vercel token (scoped to the destination team).
- [ ] New Expo token (scoped to the destination account).
- [ ] New Supabase DB password (via the pooler connection string, Dashboard → Database → Settings) —
      update `SUPABASE_DB_URL` in `scripts/.env.ops` after.
- [ ] Revoke and re-mint any `ak_live_...` extension API keys minted during testing (they're tied to
      a `user_id` in `auth.users`, not to any of the above accounts, so they survive every transfer
      above untouched — rotate them anyway as general hygiene once you're doing everything else).
- [ ] Update `scripts/.env.ops`, `.env.local` (web), `mobile/.env.local`, and `mobile/eas.json`'s
      three baked `env` blocks with every new value. Confirm `scripts/.env.ops` and `.env.local` are
      still covered by the repo's blanket `.env*` gitignore rule after any file renames.

## Phase 8 — Domain (deferred, not yet applicable)

No custom domain is in use yet — still on the default `avalonlabs-platform.vercel.app`. If one gets
added before or during this migration, Vercel's domain-transfer docs
([Transferring Domains](https://vercel.com/docs/domains/working-with-domains/transfer-your-domain))
cover moving it to the destination team; do this after Phase 2's project transfer, not before.

## Phase 9 — Verification

Run the full operational health check from the new home, with the new (Phase 7) credentials:

- [ ] `node scripts/db-hygiene.mjs` — user count, subscription status breakdown, tier-gate hygiene
      check all still sane.
- [ ] `node scripts/vercel-controller.mjs status` — production deployment healthy.
- [ ] `node scripts/paddle-controller.mjs subs` and `node scripts/verify-paddle-catalog.mjs` —
      subscriptions and catalog visible and correct.
- [ ] `node scripts/expo-controller.mjs` — build history visible.
- [ ] Sign in on web, mobile, and the Chrome extension end-to-end — confirm OAuth, tier gating, and
      `/api/chat` all still work from the new accounts before considering this done.
