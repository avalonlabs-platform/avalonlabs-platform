-- Security & performance hardening.
--
-- Fixes three findings from Supabase's built-in database linter
-- (Database > Advisors, or `mcp__Supabase__get_advisors`), verified live
-- against project pdrxettpfqxwviajchvp on 2026-08-24:
--
--   1. unindexed_foreign_keys       — public.transactions.subscription_id
--   2. function_search_path_mutable — public.normalize_customer_email
--   3. anon_security_definer_function_executable /
--      authenticated_security_definer_function_executable —
--      public.decrement_free_credit(uuid), public.rls_auto_enable()
--
-- This is the first migration file in this repo — supabase/schema.sql has
-- until now been the only source of truth, hand-run once in the SQL
-- editor (see its header comment). schema.sql is updated in the same PR
-- to match, so it stays accurate as a full-schema reference; new schema
-- changes going forward should land as a migration here instead.
--
-- Verification queries for every change below live in
-- supabase/tests/20260824081501_security_perf_hardening_verify.sql.
--
-- Out of scope for this migration (found during the same audit, left for
-- a follow-up since they're a different class of change — see PR body):
--   - public.handle_new_user() is also anon/authenticated-executable, but
--     it's the auth.users signup trigger; revoking anon needs a check
--     that nothing calls it directly via /rest/v1/rpc/handle_new_user
--     first.
--   - auth_rls_initplan on profiles/user_analyses/api_keys (wrap
--     auth.uid() as (select auth.uid()) in those policies).
--   - multiple_permissive_policies on public.api_keys.
--   - auth_leaked_password_protection (an Auth setting, not SQL).
--   - rls_enabled_no_policy on customers/subscriptions/transactions is
--     intentional per the existing comment in schema.sql, not a bug.

-- ---------------------------------------------------------------------------
-- 1. Unindexed foreign key: public.transactions.subscription_id
-- ---------------------------------------------------------------------------
-- Every lookup or webhook update that joins transactions -> subscriptions
-- via subscription_id was doing a full table scan of transactions. Not
-- using CONCURRENTLY: this table is currently small (test-fixture volume),
-- this migration already runs multiple statements together, and
-- CONCURRENTLY cannot run inside a transaction block — a plain,
-- transaction-safe CREATE INDEX is the right tradeoff here.
CREATE INDEX IF NOT EXISTS transactions_subscription_id_idx
  ON public.transactions (subscription_id);

-- ---------------------------------------------------------------------------
-- 2. Mutable search_path: public.normalize_customer_email
-- ---------------------------------------------------------------------------
-- A BEFORE INSERT/UPDATE trigger with no search_path pinned resolves
-- `lower`/`trim` (and any future unqualified identifier added to this
-- function) against whatever search_path is active in the calling
-- session. Pin it, matching the SET search_path = public convention
-- already used by decrement_free_credit and handle_new_user below in
-- this same file.
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

-- ---------------------------------------------------------------------------
-- 3. anon-callable SECURITY DEFINER functions
-- ---------------------------------------------------------------------------
-- Both functions are exposed via PostgREST as /rest/v1/rpc/<name> the
-- moment EXECUTE exists for anon or authenticated. Postgres grants
-- EXECUTE to the PUBLIC pseudo-role by default on function creation, and
-- every role — including anon — implicitly inherits PUBLIC's privileges.
-- Confirmed via information_schema.routine_privileges before writing this
-- migration: both functions currently grant EXECUTE to PUBLIC, anon,
-- authenticated, postgres, and service_role. Revoking only from `anon`
-- would NOT close this off, since anon would still reach the function
-- through PUBLIC — so PUBLIC has to be revoked too. authenticated,
-- postgres, and service_role hold their own separate explicit grants and
-- are unaffected by revoking PUBLIC/anon.
--
--   public.decrement_free_credit(user_id uuid) — the free-credit
--   decrement used by /api/chat. It's called server-side with the
--   service-role key (src/app/api/chat/route.ts), never directly from the
--   client, so anon/authenticated access via REST was never required for
--   the app to work. Per the approved scope for this PR, the existing
--   `authenticated` grant is left in place rather than removed outright —
--   worth a tighter follow-up (service_role-only) once that's confirmed
--   against every call site in the client code.
REVOKE EXECUTE ON FUNCTION public.decrement_free_credit(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_free_credit(uuid) FROM anon;

--   public.rls_auto_enable() — a DDL event-trigger function (RETURNS
--   event_trigger), not an ordinary callable RPC; Postgres refuses to
--   invoke an event-trigger function directly regardless of caller, so
--   the anon/authenticated grants were never functionally exploitable.
--   Still removing the anon grant, since an unused EXECUTE grant on a
--   SECURITY DEFINER function is a latent risk if its signature or type
--   ever changes. (`authenticated` is left in place per the approved
--   scope, even though it is equally inert today.)
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
