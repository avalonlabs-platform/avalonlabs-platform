# AvalonLabs Platform — Operating System

A reference map of the whole system: what exists, how the pieces talk to each other, and where the
non-obvious decisions live. Written from the actual code and schema, not from what a fresh read of
the READMEs would suggest — several things below (the Paddle↔Supabase link, the auth model) are only
documented here and in inline code comments, not anywhere else.

**Stage:** pre-launch. The Paddle key in `scripts/.env.ops` is live but intentionally used for
staging/testing before public traffic — confirmed, not a misconfiguration. The Paddle Go-Live
Readiness Audit checklist in `README.md` ("Before going live") is not yet complete.

## 1. Repository layout

```
avalonlabs-platform/
├── src/                  Next.js 16 (App Router) web app — marketing site, dashboard, API routes
├── mobile/               Expo/React Native app (Android, standalone APK via EAS)
├── extension/            Chrome extension (Manifest V3)
├── scripts/              Node operational controllers — status checks, DB audits, reconciliation
├── supabase/schema.sql   Full DB schema — source of truth, run manually in the Supabase SQL Editor
└── AGENTS.md             Next.js version-specific breaking-change warnings — read before editing
                           anything that touches route handlers, params, or cookies()/headers()
```

Three deployable surfaces (web, mobile, extension) share one backend: the Next.js API routes under
`src/app/api/`, one Supabase Postgres database, and one Paddle billing account.

## 2. Web app

Next.js 16, TypeScript, Tailwind v4, deployed on Vercel (`https://avalonlabs-platform.vercel.app`,
no custom domain yet). Homepage, pricing table, legal pages, and the authenticated dashboard live
here.

### Auth (`src/lib/auth-request.ts`)

One function, `getRequestUser(request)`, resolves the caller for every non-public API route. It
tries three credential types on a single `Authorization: Bearer <...>` header (or falls back to the
web's cookie session if the header is absent):

| Client            | Credential                                  | Resolved via                              |
|--------------------|----------------------------------------------|--------------------------------------------|
| Web dashboard      | Supabase SSR cookie session                   | `createServerClient()` + `auth.getUser()`   |
| Mobile app         | `Bearer <supabase_access_token>` (a JWT)      | anon-key client `auth.getUser(token)`       |
| Chrome extension    | `Bearer ak_live_...` (API key, see §5)        | hash lookup in `api_keys`, then `auth.admin.getUserById()` |

An explicitly-supplied but invalid/revoked credential is always treated as unauthenticated — it
never silently falls through to a cookie check. Whichever path resolves, the rest of the stack gets
the same real Supabase `User`, so tier gating and rate limiting never need to know which client is
asking.

### Tiers and access (`src/lib/agent-access.ts`)

**There is no `tier` column anywhere in the database.** Tier is resolved live, on every request:

1. Normalize the caller's email (`lower(trim())` — same logic in `src/lib/normalize-email.ts` and the
   `normalize_customer_email` Postgres trigger, so they can never drift apart).
2. Look up `customers` by that email → `customer_id`.
3. Look up the most-recently-updated row in `subscriptions` for that `customer_id`.
4. If `subscription_status` is `active` or `trialing`, match `price_id` against
   `src/constants/pricing-tiers.ts` to get a tier (`starter` / `pro` / `advanced`).
5. Microservice-linked agents (SQL Optimizer, Security Auditor, Code Explainer, API Analyzer) need
   `pro` or `advanced`, or a completed one-time purchase in `transactions`. General agents (Assistant,
   Business Advisor) are covered by every tier, including Starter.
6. No subscription/purchase covering the agent → fall back to `profiles.free_credits`.

This is why Paddle↔Supabase sync matters more than it looks: if `subscriptions` drifts from what
Paddle actually thinks, access decisions are made on stale data. See §4.

### AI agents (`src/constants/agents.ts`, `src/app/api/chat/route.ts`)

Seven agents (`assistant`, `code-explainer`, `api-analyzer`, `business-advisor`, `sql-optimizer`,
`vision-analyzer`, `security-auditor`). System prompts are a trusted server-side lookup by id — the
client only ever sends an `agentId`, never prompt text. `/api/chat` streams plain text (not SSE) from
`claude-sonnet-5` via the Anthropic SDK, enforcing, in order: auth → agent exists → tier/purchase/
credit access → per-tier in-memory rate limit (30/100/300 requests per 10 min for starter/pro/
advanced) → the actual generation. `/api/agents` (public, no auth) exposes id/name/emoji/description
only, for building pickers without duplicating the list (used by the extension's popup).

## 3. Data model (`supabase/schema.sql`)

| Table | Purpose | Notable columns |
|---|---|---|
| `customers` | Mirrors Paddle customers | `customer_id` (PK, `ctm_...`), `email` (normalized, NOT NULL) |
| `subscriptions` | Mirrors Paddle subscriptions | `subscription_id` (PK, `sub_...`), `customer_id` (FK), `subscription_status`, `price_id` |
| `transactions` | Mirrors Paddle transactions (subscription-initiating and one-time microservice purchases) | `transaction_id` (PK), `subscription_id` (nullable FK) |
| `profiles` | Freemium credit balance, one row per Supabase Auth user | `id` (FK → `auth.users`), `free_credits` |
| `user_analyses` | Append-only history of dashboard tool runs | `user_id`, `tool_name`, append-only by RLS design |
| `api_keys` | Long-lived credentials for clients without a Supabase session (extension, future CLI) | `key_hash` (SHA-256, only thing stored), `key_prefix` (display only), `revoked_at` |

`customers`/`subscriptions`/`transactions` are kept in sync from Paddle by
`src/lib/paddle/process-webhook.ts`, which handles **all nine** Paddle subscription lifecycle events
(`created`, `updated`, `canceled`, `activated`, `trialing`, `paused`, `resumed`, `past_due`,
`imported`) — not just the three you'd guess from a quick read of the SDK. `subscription.activated`
in particular fires on trial→paid conversion and is easy to miss; the mirror table went stale from
exactly that gap once already (see the reconciliation history below).

`scripts/sync-paddle-to-db.mjs` is a standing, idempotent, safe-to-rerun tool for pulling Paddle's
live state directly into these tables if the webhook mirror is ever suspected to have drifted again.

## 4. Mobile app (`mobile/`)

Expo SDK 54, React Native, `expo-router`, three tabs (Action, Collection, Dashboard). Talks to the
same `/api/chat` and `/api/account` as the web app, authenticated via
`Authorization: Bearer <supabase_access_token>`.

- **OAuth** (`mobile/lib/auth.tsx`): native Google/X sign-in via `expo-auth-session` +
  `expo-web-browser`, redirecting to the app's own `avalonlabs://auth/callback` scheme (declared in
  `app.json`) rather than Expo Go's proxy — this is what makes it work in a standalone build.
  Redirect tokens are captured two ways: a live `Linking` event listener (app stays resident) and
  `Linking.getInitialURL()` (app's process was killed while the OAuth browser tab was open — a real
  Android memory-pressure scenario, not just theoretical).
- **Build profiles** (`mobile/eas.json`): `development`/`preview` build an internal-distribution APK
  (installable directly, no Play Store/TestFlight needed); `production` builds an app bundle for
  eventual store submission. All three profiles bake `EXPO_PUBLIC_*` env vars directly into
  `eas.json` — they're excluded from the EAS Build upload archive otherwise, since `.env.local` is
  gitignored and EAS respects `.gitignore` for what it uploads. (The anon key is intentionally public
  here — same key already ships in the web bundle, protected by Postgres RLS, not by secrecy.)
- **EAS project linkage**: not yet done. No `extra.eas.projectId` in `app.json` — the first
  `eas build` run needs `eas login` (interactive, requires the Expo account holder) before anything
  else works.

## 5. Chrome extension (`extension/`, Manifest V3)

- **`manifest.json`**: `host_permissions` for the production API origin (extensions with declared
  host permissions are exempt from CORS on that origin — no server-side CORS config needed).
- **`popup.html`/`popup.js`**: paste an `ak_live_...` key once (stored in `chrome.storage.local`, not
  `sync` — a bearer credential shouldn't replicate across the user's other Chrome installs), then
  pick an agent (from `/api/agents`) and chat.
- **`background.js`**: holds the actual `fetch()` logic in one place. Two entry points: a long-lived
  port (`chrome.runtime.connect({name: "chat"})`) that relays the popup's streamed chat responses
  chunk-by-chunk, and a right-click "Ask AvalonLabs about..." context menu on any text selection that
  answers via a native OS notification without needing the popup open.
- **API keys** (`src/lib/api-keys.ts`, `src/app/api/account/api-keys/`): minted and revoked only via
  the authenticated web session (`POST`/`GET`/`DELETE`) — never via an API key itself, so a leaked key
  can never mint a sibling key. Only a SHA-256 hash and a 12-char display prefix are ever persisted;
  the plaintext is shown exactly once, in the creation response.
- **Known gap**: no "API Keys" settings UI in the dashboard yet. Keys are currently minted by calling
  the endpoint directly (e.g. from the browser console while signed in). Worth building before this
  ships to real users — right now, losing a key means going back to dev tools to mint a new one.

## 6. Operational controllers (`scripts/`)

All read `scripts/.env.ops` (gitignored via the repo's blanket `.env*` rule — verified, not assumed).
That file holds a **live** Paddle API key, Vercel token, Expo token, and a plaintext Supabase DB
password in the connection string. Treat it as a live-credentials file, not a dev convenience file.

| Script | What it does | Mutates anything? |
|---|---|---|
| `db-hygiene.mjs` | User count, subscription status breakdown, flags active/trialing Paddle customers with no matching Supabase account | No — read-only |
| `vercel-controller.mjs` | `status`: deployment health; `deploy <project>`: triggers a production deploy | `deploy` does |
| `paddle-controller.mjs` | `subs`: subscription overview; `transactions`: recent transactions | No — read-only |
| `expo-controller.mjs` | Recent EAS Cloud Build status | No — read-only |
| `verify-paddle-catalog.mjs` | Confirms configured Paddle price IDs actually exist in the live catalog | No — read-only |
| `sync-paddle-to-db.mjs` | Full reconciliation: pulls every customer/subscription from Paddle, upserts into Supabase | Yes — idempotent upsert |

Direct DB access from these scripts must use the **pooler** connection string
(`aws-0-<region>.pooler.supabase.com`), not `db.<ref>.supabase.co` directly — the direct host is
IPv6-only on this project and fails DNS resolution (`ENOTFOUND`) on IPv4-only networks.

## 7. Open items worth tracking

- Paddle Go-Live Readiness Audit checklist (README §"Before going live") — not complete.
- No custom domain yet — still on the default `*.vercel.app` subdomain.
- EAS project not linked (`eas login` + `eas build:configure` needed before any cloud build runs).
- No API-key management UI for end users (mint/revoke only via direct API calls today).
- `mobile/eas.json`'s `production` profile is unused so far — only `preview` (internal APK) has been
  built and tested.
