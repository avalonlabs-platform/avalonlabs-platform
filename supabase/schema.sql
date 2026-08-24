-- AvalonLabs Platform — Paddle sync tables.
-- Run once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- As of supabase/migrations/20260824081501_security_perf_hardening.sql,
-- new schema changes land as a migration in supabase/migrations/ instead
-- of being added directly to this file. This file is kept as a running
-- full-schema reference and updated in the same PR as any migration that
-- changes something it documents — but it is no longer the mechanism used
-- to apply changes. (public.rls_auto_enable(), touched by that migration,
-- isn't defined here — it predates this file and was created directly in
-- the dashboard; see the migration for its current definition and grants.)
--
-- These mirror Paddle's customer/subscription/transaction state via webhooks
-- (see src/app/api/webhooks/paddle/route.ts). Webhook writes use the service
-- role key and bypass RLS; RLS is enabled here so the public anon key can't
-- read these tables until you add explicit SELECT policies for an account
-- page (e.g. scoped to the authenticated user's email).

CREATE TABLE IF NOT EXISTS customers (
  customer_id TEXT PRIMARY KEY,        -- Paddle "ctm_..."
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(email);

-- `CREATE TABLE IF NOT EXISTS` above is a no-op if `customers` already
-- existed before `email TEXT NOT NULL` was added to this file — the webhook
-- bugs that let subscription.created/transaction.completed write a NULL or
-- empty email happened on exactly that kind of pre-existing table. These
-- retroactively close the gap at the database level, on top of the
-- application-level fix in process-webhook.ts (see ensureCustomerHasEmail /
-- normalizeEmail). If this ALTER fails with "column contains null values",
-- some row still has a NULL email — find and fix it first:
--   select customer_id from customers where email is null or email = '';
ALTER TABLE customers ALTER COLUMN email SET NOT NULL;

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_email_not_empty;
ALTER TABLE customers ADD CONSTRAINT customers_email_not_empty CHECK (email <> '');

-- Belt-and-suspenders on top of src/lib/normalize-email.ts: normalize email
-- at write time in the database too, so a future code path that forgets to
-- call normalizeEmail() before an insert/update still can't leave a
-- non-normalized value that email-based lookups (agent-access,
-- subscription-status, credit-badge, portal) would silently fail to match.
-- Re-fixed in 20260824112929_fix_normalize_customer_email_search_path.sql:
-- the search_path pin below was somehow missing again on production after
-- PR #1 shipped it (verified live via pg_proc.proconfig being NULL, plus
-- \r\n line endings on the live function body suggesting an out-of-band
-- CREATE OR REPLACE against the database directly — the same pattern seen
-- once before with handle_new_user's EXECUTE grants). If this ever shows
-- up a third time, treat it as a signal to lock down who/what has direct
-- SQL-editor access to production, not just re-apply the fix again.
CREATE OR REPLACE FUNCTION public.normalize_customer_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_customer_email_trigger ON customers;
CREATE TRIGGER normalize_customer_email_trigger
  BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION public.normalize_customer_email();

CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id TEXT PRIMARY KEY,    -- Paddle "sub_..."
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  subscription_status TEXT NOT NULL,   -- active | trialing | past_due | paused | canceled
  price_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  scheduled_change TIMESTAMPTZ,        -- non-null when a pause/cancel is pending
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subscriptions_customer_id_idx ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(subscription_status);

-- Covers both subscription-initiating transactions and one-time
-- microservice purchases (subscription_id is null for the latter).
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id TEXT PRIMARY KEY,     -- Paddle "txn_..."
  customer_id TEXT REFERENCES customers(customer_id),
  subscription_id TEXT REFERENCES subscriptions(subscription_id),
  status TEXT NOT NULL,
  price_id TEXT,
  product_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transactions_customer_id_idx ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS transactions_subscription_id_idx ON transactions(subscription_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- No policies defined yet: RLS enabled with zero policies denies all access
-- to the anon/authenticated roles by default. The service-role key used by
-- the webhook handler bypasses RLS entirely, so writes still work. Add
-- SELECT policies here once an account page needs to read a user's own rows.

-- ---------------------------------------------------------------------------
-- Freemium credits — one row per Supabase Auth user (see
-- src/app/api/chat/route.ts). `auth.users` is Supabase-managed, so app data
-- lives in this separate `profiles` table keyed 1:1 by id, populated
-- automatically by the trigger below for both OAuth and email/password
-- signups (Supabase Auth inserts into auth.users the same way either way).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  free_credits INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users may read their own credit balance (dashboard badge). No INSERT/
-- UPDATE/DELETE policy for anon/authenticated — rows are created by the
-- trigger below and credits are only ever decremented server-side via the
-- service-role client, so a user can never grant themselves more credits
-- by calling the Supabase REST API directly with their own session.
--
-- auth.uid() wrapped as (select auth.uid()) — see
-- 20260824102410_rls_perf_and_api_keys_security_gap.sql. Pure InitPlan
-- caching, evaluated once per query instead of once per row; verified this
-- table is only ever queried via the service-role client (src/), so RLS
-- here is defense-in-depth and this rewrite has zero real-usage risk.
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING ((select auth.uid()) = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, free_credits)
  VALUES (NEW.id, 3)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- PR #1 (20260824081501_security_perf_hardening.sql) deliberately left this
-- function's EXECUTE grants untouched pending a real usage check across the
-- whole codebase (web + mobile). That check is done — see
-- 20260824102410_rls_perf_and_api_keys_security_gap.sql — and found zero RPC
-- call sites anywhere, so PUBLIC/anon/authenticated are revoked here too.
-- This does not affect the trigger above: on_auth_user_created fires as
-- part of the auth.users INSERT regardless of EXECUTE grants on the role
-- performing that INSERT — trigger invocation doesn't depend on the
-- invoking role's direct EXECUTE privilege on the trigger function itself.
-- service_role and postgres keep EXECUTE, unchanged.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- One-time backfill for accounts that signed up before this table existed.
-- Safe to re-run — ON CONFLICT skips anyone who already has a row.
INSERT INTO public.profiles (id, free_credits)
SELECT id, 3 FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Atomic, race-safe decrement used by /api/chat after a successful
-- free-credit response: the WHERE guard means two concurrent requests can
-- never both succeed off the last credit, and it returns NULL (rather than
-- going negative) once the balance is already 0.
CREATE OR REPLACE FUNCTION public.decrement_free_credit(user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  remaining INTEGER;
BEGIN
  UPDATE public.profiles
  SET free_credits = free_credits - 1, updated_at = NOW()
  WHERE id = user_id AND free_credits > 0
  RETURNING free_credits INTO remaining;
  RETURN remaining;
END;
$$;

-- Only called server-side via the service-role key (src/app/api/chat/
-- route.ts) — anon never needed REST access to this RPC. PUBLIC is
-- revoked too, not just anon: Postgres grants EXECUTE to PUBLIC by
-- default, and every role (anon included) inherits it, so revoking only
-- from anon would not have closed this off. authenticated keeps its
-- grant for now — see 20260824081501_security_perf_hardening.sql for the
-- full reasoning.
REVOKE EXECUTE ON FUNCTION public.decrement_free_credit(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_free_credit(uuid) FROM anon;

-- ---------------------------------------------------------------------------
-- Mobile Collection/Dashboard history — one row per completed scan/analysis
-- (see mobile/lib/db.ts). Written directly by the mobile client using the
-- user's own session, not the service role — the INSERT policy's WITH CHECK
-- is what stops a user from writing rows under someone else's user_id, so
-- unlike `profiles` this is NOT a fail-closed/server-only table by design.
-- `tool_name` stores an agent id (see src/constants/agents.ts) — the mobile
-- app resolves it back to a display name/emoji via mobile/lib/agents.ts
-- rather than denormalizing those into columns here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  input_data TEXT NOT NULL,
  result_data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_analyses_user_id_created_at_idx
  ON user_analyses(user_id, created_at DESC);

ALTER TABLE user_analyses ENABLE ROW LEVEL SECURITY;

-- auth.uid() wrapped as (select auth.uid()) in both policies below — see
-- 20260824102410_rls_perf_and_api_keys_security_gap.sql. Pure InitPlan
-- caching with identical row-visibility/write semantics to the
-- un-rewritten form. Unlike profiles/api_keys, this table's RLS IS
-- functionally load-bearing (mobile/lib/db.ts queries it via the user's
-- own session, not a service-role client — see the table comment above),
-- so this rewrite was checked specifically against that real usage before
-- being applied, not just against the (already-safe) web app.
DROP POLICY IF EXISTS "Users can view own analyses" ON user_analyses;
CREATE POLICY "Users can view own analyses" ON user_analyses
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own analyses" ON user_analyses;
CREATE POLICY "Users can insert own analyses" ON user_analyses
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- No UPDATE/DELETE policy — history rows are append-only from the client;
-- add one deliberately later if the app grows a "delete this entry" action.

-- ---------------------------------------------------------------------------
-- API keys — long-lived credentials for clients that can't hold a Supabase
-- session (Chrome extension, CLI, third-party integrations). Verified in
-- src/lib/auth-request.ts alongside the existing cookie/Bearer-JWT paths;
-- once resolved to a user, every existing tier/rate-limit/credit check in
-- src/lib/agent-access.ts and src/app/api/chat/route.ts applies unchanged —
-- an API key is just another way to prove who's asking, not a separate
-- access model.
--
-- Only key_hash (SHA-256 hex of the full key) is ever stored — the plaintext
-- key is shown exactly once, at creation, in the POST /api/account/api-keys
-- response. key_prefix is the first 12 chars of the plaintext (e.g.
-- "ak_live_a1b2"), kept only so a user can tell their keys apart in a list
-- without the full secret ever being persisted or re-displayed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Chrome Extension',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users may read their own key metadata (never key_hash's plaintext source —
-- that never existed server-side past the initial hashing) for a "your keys"
-- settings list. No INSERT/UPDATE/DELETE policy for anon/authenticated —
-- minting and revoking both go through the service-role client in
-- src/app/api/account/api-keys/ so a stolen key can never mint a sibling key
-- or un-revoke itself, same reasoning as `profiles` above.
--
-- auth.uid() wrapped as (select auth.uid()) — see
-- 20260824102410_rls_perf_and_api_keys_security_gap.sql. Pure InitPlan
-- caching; verified this table is only ever queried via the service-role
-- client (src/), so RLS here is defense-in-depth and this rewrite has zero
-- real-usage risk.
DROP POLICY IF EXISTS "Users can view own api keys" ON api_keys;
CREATE POLICY "Users can view own api keys" ON api_keys
  FOR SELECT USING ((select auth.uid()) = user_id);

-- A second policy, "Users can manage their own api keys" (FOR ALL, USING
-- auth.uid() = user_id, no WITH CHECK), existed live on production but was
-- never defined in this file — like public.rls_auto_enable() noted above,
-- it predates this file and was created directly in the dashboard. Because
-- it had no WITH CHECK, Postgres used its USING clause for writes too,
-- meaning a user's own session (not just the service-role client) could
-- INSERT/UPDATE/DELETE their own api_keys rows — directly contradicting
-- the "no INSERT/UPDATE/DELETE for anon/authenticated" model documented
-- above. 20260824102410_rls_perf_and_api_keys_security_gap.sql drops it:
-- verified no real code path ever relied on session-based writes to this
-- table (every write goes through the service-role client, as noted
-- above), so nothing was using it — it was dead-but-dangerous surface, not
-- a needed capability. Do not re-add it.
