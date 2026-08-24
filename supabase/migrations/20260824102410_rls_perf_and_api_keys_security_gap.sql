-- Addresses the three items explicitly deferred in
-- 20260824093052_security_perf_hardening.sql:
--
--   1. auth_rls_initplan (perf) — 4 of the 5 originally-flagged policies get
--      `auth.uid()` rewritten to `(select auth.uid())` so Postgres evaluates
--      it once per query (InitPlan) instead of once per row. This changes
--      nothing about which rows are visible/writable — see Supabase's own
--      guidance: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
--   2. multiple_permissive_policies (perf) on public.api_keys — two
--      PERMISSIVE policies both apply to SELECT for the same roles, so
--      Postgres evaluates both and ORs the results. The literal lint asks
--      to just dedupe/merge them. Verification below found something more
--      important than the lint: one of the two policies shouldn't exist at
--      all. See the note before the DROP POLICY statement.
--
--   3. handle_new_user — PR #1 left this function's `anon` EXECUTE grant
--      untouched pending a real usage check. That check is now done (see
--      below); this migration revokes EXECUTE from PUBLIC/anon/authenticated.
--
-- Verification performed before writing this migration (per user request to
-- "verify no breaking changes against existing auth/schema flows"):
--
--   - Read every application code path that queries profiles, user_analyses,
--     and api_keys, in both src/ (Next.js web app) and mobile/ (Expo app).
--   - Web app (src/): every query against profiles and api_keys goes through
--     createInternalClient() (service-role, bypasses RLS entirely) — see
--     src/lib/agent-access.ts, src/components/dashboard/credit-badge.tsx,
--     src/app/api/account/route.ts, src/app/api/account/api-keys/route.ts,
--     src/app/api/account/api-keys/[id]/route.ts, src/lib/auth-request.ts.
--     The web app never queries user_analyses at all. So for the web app,
--     RLS on these three tables is defense-in-depth only — not load-bearing
--     for any real request path — which is exactly why it's safe to also
--     drop the api_keys "manage" policy below (see that section).
--   - Mobile app (mobile/): mobile/lib/supabase.ts creates a session-based
--     client with the anon key (not service-role). mobile/lib/db.ts uses
--     that client directly against user_analyses for both INSERT
--     (saveAnalysis) and SELECT (fetchAnalyses, fetchAnalysesCount) — so
--     RLS on user_analyses IS functionally load-bearing for the mobile app.
--     The (select auth.uid()) rewrite below is a pure InitPlan-caching
--     optimization with identical semantics to the un-rewritten form (same
--     equality comparison, evaluated once instead of per row), so this does
--     not change mobile app behavior — but it's called out here because,
--     unlike api_keys/profiles, this table's RLS has real stakes if the
--     rewrite were ever done wrong.
--   - Confirmed via repo-wide search (src/ + mobile/) there are zero RPC
--     call sites for handle_new_user (`rpc("handle_new_user"` /
--     `rpc('handle_new_user'`) anywhere in the codebase. It is only ever
--     invoked as the AFTER INSERT trigger on auth.users (see
--     on_auth_user_created below) — never called directly by any app code,
--     web or mobile.
--   - Attempted to verify this migration against a disposable Supabase
--     branch (mcp__Supabase__create_branch) before touching production, as
--     was done conceptually for PR #1. This project's plan does not support
--     branching (PaymentRequiredException: "Branching is supported only on
--     the Pro plan or above") — no branch was created, no cost was
--     incurred. Verification instead relied on: reading every real query
--     site as above, confirming current policy/grant state against the live
--     database via read-only queries, and Supabase's own documented
--     equivalence guarantee for the (select ...) rewrite. See
--     20260824102410_rls_perf_and_api_keys_security_gap_verify.sql for the
--     non-destructive assertions run against production after this applies.

begin;

-- ============================================================
-- 1. auth_rls_initplan — wrap auth.uid() as (select auth.uid())
-- ============================================================
-- ALTER POLICY (not DROP+CREATE) so each policy is modified in place with
-- no window where it doesn't exist.

alter policy "Users can view own profile"
  on public.profiles
  using ((select auth.uid()) = id);

alter policy "Users can view own analyses"
  on public.user_analyses
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own analyses"
  on public.user_analyses
  with check ((select auth.uid()) = user_id);

alter policy "Users can view own api keys"
  on public.api_keys
  using ((select auth.uid()) = user_id);

-- The 5th flagged policy, api_keys."Users can manage their own api keys",
-- is not rewritten — it's dropped below instead.

-- ============================================================
-- 2. multiple_permissive_policies on public.api_keys
-- ============================================================
-- The lint's literal ask is to dedupe the two overlapping SELECT-applicable
-- policies. But reading what each policy actually grants shows this is a
-- real security gap, not just a performance nit:
--
--   "Users can manage their own api keys" is FOR ALL with only a USING
--   clause (auth.uid() = user_id) and no WITH CHECK. In Postgres RLS, a FOR
--   ALL policy with no explicit WITH CHECK uses its USING clause as the
--   check for writes too — so this policy currently lets a user's own
--   *session* (not just the service-role client) INSERT/UPDATE/DELETE rows
--   in api_keys where user_id = their own id.
--
--   That directly contradicts the security model this repo already
--   documents in supabase/schema.sql: "No INSERT/UPDATE/DELETE policy for
--   anon/authenticated — minting and revoking both go through the
--   service-role client in src/app/api/account/api-keys/ so a stolen key
--   can never mint a sibling key or un-revoke itself." The "manage" policy
--   was never supposed to exist alongside that model.
--
--   Verification confirms it's safe to drop outright: every real write to
--   api_keys (POST /api/account/api-keys, DELETE /api/account/api-keys/[id])
--   goes through createInternalClient() (service-role), which bypasses RLS
--   entirely and is filtered by explicit .eq("user_id", ...) clauses in
--   application code, not by this policy. No code path relies on a user's
--   own session being able to write to api_keys directly. Dropping this
--   policy removes dead-but-dangerous permission surface, and — as a side
--   effect — also resolves the multiple_permissive_policies lint, since
--   there's now only one PERMISSIVE policy applicable to SELECT.

drop policy "Users can manage their own api keys" on public.api_keys;

-- ============================================================
-- 3. handle_new_user — revoke EXECUTE from PUBLIC/anon/authenticated
-- ============================================================
-- handle_new_user() is SECURITY DEFINER with search_path already pinned to
-- 'public' (fixed independently of this deferred item — it was never
-- mutable). The only remaining exposure is that PUBLIC (and therefore
-- anon/authenticated, which inherit from PUBLIC) can call it directly via
-- /rest/v1/rpc/handle_new_user. Direct calls fail today (plpgsql trigger
-- functions error when invoked outside trigger context — there's no NEW
-- record to reference), but leaving needless RPC surface open on an
-- auth.users trigger is exactly the class of finding PR #1 already fixed
-- for decrement_free_credit and rls_auto_enable; this closes it for
-- handle_new_user too, now that usage has been checked as PR #1 deferred.
--
-- This does NOT affect the trigger itself: on_auth_user_created (AFTER
-- INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user())
-- fires as part of the signup INSERT regardless of EXECUTE grants on the
-- role performing that INSERT — trigger invocation is independent of the
-- invoking role's direct EXECUTE privilege on the trigger function.
-- postgres and service_role keep EXECUTE, unchanged.

revoke execute on function public.handle_new_user() from public, anon, authenticated;

commit;
