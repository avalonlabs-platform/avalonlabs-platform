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

## Status as of 2026-08-20

Quick read before diving into the phase-by-phase detail below — updated from what's been reported
and independently verified (git remote, live domain fetch) this session, not assumed:

- **Done, verified**: Phase 1 (GitHub — `origin` confirmed pointed at
  `github.com/avalonlabs-platform/avalonlabs-platform`), Phase 8 (Domain — `www.avalonlabs-platform.com`
  confirmed live and serving correctly via a direct fetch).
- **Done, reported but not independently verified** (no dashboard access from here): Phase 3
  (Supabase — org transfer + admin role reported; project URL unchanged-after-transfer still
  worth a manual double-check per that phase's own caveat), Phase 4 (Paddle — admin role, domain
  review, statement descriptor, and webhook URL all reported done; **legal entity name / product
  website fields are still locked pending Paddle support's response** — that's the one open item).
- **Not yet started / not mentioned**: Phase 2 (Vercel — domain is live, but that's separate from
  whether the *project itself* is owned by an org Team vs. still a personal account), Phase 5
  (Expo/EAS), Phase 6 (Anthropic Console), Phase 7 (credential rotation — explicitly deferred,
  nothing blocking it whenever you're ready).

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

## Phase 1 — GitHub ✅ done (verified 2026-08-20 — local `.git/config` `origin` confirmed pointed at `github.com/avalonlabs-platform/avalonlabs-platform.git`)

- [ ] Create the GitHub Organization (or confirm it already exists).
- [ ] Repo → **Settings → General → Danger Zone → Transfer ownership** → transfer to the new org.
- [ ] Re-add collaborators under the org's team/permission model (personal-repo collaborators don't
      carry over as org team members).
- [ ] Re-check branch protection rules on `main` — confirmed correct post-transfer, not assumed.
- [ ] If any GitHub Actions secrets exist, re-add them under the org repo (repo secrets don't survive
      a transfer as reliably as the repo content itself).

## Phase 2 — Vercel ⬜ status unclear — next action: confirm in Vercel dashboard whether the project is under an org Team or still a personal account

The custom domain being live does **not** by itself mean the project has been transferred to an
org Team — domain setup and project ownership are separate settings. Vercel's project transfer is
a documented, self-service, zero-downtime feature
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

## Phase 3 — Supabase 🟡 reported done — one item worth confirming: project URL unchanged post-transfer

Reported 2026-08-20: project transferred to the `AvalonLabs` org, `admin@avalonlabs-platform.com`
set as Administrator, tables/policies/API keys intact. Not independently verified from here (no
Supabase dashboard access) — worth a quick look to confirm the project genuinely shows under the
new org, and specifically the URL-unchanged question this phase already flags below.

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

## Phase 4 — Paddle 🟡 mostly done — one open item: legal entity name / product website fields locked pending Paddle support

Reported 2026-08-20: `admin@avalonlabs-platform.com` added as Admin, `avalonlabs-platform.com`
passed domain review, statement descriptor updated to `AVALONLABS`, webhook endpoint points at
`www.avalonlabs-platform.com/api/webhooks/paddle`, and a support ticket is open asking Paddle to
update the locked legal entity name and product website fields. **Next action: none on your end
until Paddle responds to that ticket** — no need to re-poll them, just watch for their reply.

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

## Phase 5 — Expo / EAS ⬜ not started — next action: create/confirm the destination Expo Organization, then use the transfer flow linked below

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

## Phase 6 — Anthropic Console (API access for `/api/chat`) ⬜ not started — next action: check whether `ANTHROPIC_API_KEY` is still tied to a personal account

- [ ] If `ANTHROPIC_API_KEY` is currently tied to a personal Anthropic account, create an
      Organization in the Anthropic Console for the business entity, add a workspace, and issue a new
      workspace-scoped API key.
- [ ] Update `ANTHROPIC_API_KEY` in Vercel's environment variables (Phase 2 already moved the project
      — this is a value update on the new team, not a re-transfer).

## Phase 7 — Rotate every credential, regardless of how the above went ⬜ explicitly deferred by you for now — no action needed until you're ready

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

## Phase 8 — Domain ✅ done (verified 2026-08-20 — fetched `https://www.avalonlabs-platform.com` directly and confirmed it's live, serving the correct branded content, no errors)

`avalonlabs-platform.com` is live on Squarespace DNS pointed at Vercel, `NEXT_PUBLIC_SITE_URL` is
set to it in Vercel's env vars, and every hardcoded reference across the web app, extension, and
mobile config has been synced to it (see below). One thing still worth doing if Phase 2's project
transfer happens later: Vercel's domain-transfer docs
([Transferring Domains](https://vercel.com/docs/domains/working-with-domains/transfer-your-domain))
cover moving a domain to a destination team — if the project moves to an org Team after the domain
was already added under the personal account, the domain may need this extra step too.

References updated to the custom domain this session (2026-08-20): `src/lib/site-config.ts`'s
fallback URL and support/legal/privacy contact emails (now `admin@avalonlabs-platform.com`,
Google Workspace, replacing the personal Gmail placeholder), `extension/config.js`'s
`API_BASE_URL`, `extension/manifest.json`'s `host_permissions`, and `mobile/.env.example`,
`mobile/.env.local`, and all three `mobile/eas.json` build profiles' `EXPO_PUBLIC_API_BASE_URL`.
The Chrome extension was also repackaged (`dist/avalonlabs-extension-v1.1.0.zip`) with these
changes baked in — still needs to be loaded unpacked and manually verified in a live browser (see
Phase 9), and hasn't been submitted to the Chrome Web Store yet. The contact form's Resend `from`
address is intentionally still `onboarding@resend.dev` — held pending your own DNS domain
verification inside Resend.

## Phase 9 — Verification

Run the full operational health check from the new home, with the new (Phase 7) credentials:

- [x] Production site loads correctly at the custom domain (verified 2026-08-20 via direct fetch).
- [ ] `node scripts/db-hygiene.mjs` — user count, subscription status breakdown, tier-gate hygiene
      check all still sane.
- [ ] `node scripts/vercel-controller.mjs status` — production deployment healthy.
- [ ] `node scripts/paddle-controller.mjs subs` and `node scripts/verify-paddle-catalog.mjs` —
      subscriptions and catalog visible and correct.
- [ ] `node scripts/expo-controller.mjs` — build history visible.
- [ ] Sign in on web, mobile, and the Chrome extension end-to-end — confirm OAuth, tier gating, and
      `/api/chat` all still work from the new accounts before considering this done.
- [ ] Load `dist/avalonlabs-extension-v1.1.0.zip` unpacked in Chrome (`chrome://extensions` →
      Developer mode → Load unpacked, pointed at the unzipped `extension/` contents) and confirm
      the side panel and floating quick-action pill both work against the live production domain.
- [ ] Run a fresh EAS build (`cd mobile && eas build --profile preview --platform android`) and
      install it on a real device/emulator to field-verify Sprint 3's multimodal/haptics/share
      work — it's only been type-check-verified so far, never actually run.
