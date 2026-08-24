-- Follow-up to 20260824081501_security_perf_hardening.sql, addressing the
-- deferred `auth_rls_initplan` finding.
--
-- CORRECTION: an earlier version of this migration also included a
-- `DROP POLICY "Users can manage their own api keys" ON api_keys;`
-- statement and framed it as closing a real security gap. That policy
-- does not exist on the live database — verified via a direct
-- `select * from pg_policies where tablename = 'api_keys'` query, which
-- also confirms `multiple_permissive_policies` is not currently flagged
-- for this project. Both were an error in the original verification pass
-- (working from stale/incorrect assumptions instead of a live query) and
-- have been removed. See the PR body/comments for the full correction.
--
-- What's actually still live and real, verified via
-- mcp__Supabase__get_advisors(type=performance) immediately before writing
-- this file:
--
--   auth_rls_initplan (WARN) — exactly 4 policies, matching the 4 rewrites
--   below: profiles."Users can view own profile",
--   user_analyses."Users can view own analyses",
--   user_analyses."Users can insert own analyses",
--   api_keys."Users can view own api keys".
--
-- Also verified live (information_schema.role_routine_grants):
--   public.handle_new_user() currently grants EXECUTE only to `postgres`
--   and `service_role` — anon/authenticated/PUBLIC are already revoked in
--   production. This was NOT done by 20260824081501_security_perf_hardening.sql
--   (that migration explicitly deferred it) and isn't tracked by any
--   migration in this repo — it was applied directly against the database
--   at some point outside this workflow. Left untouched here, but section 2
--   below codifies it into a tracked migration so that building a fresh
--   environment from supabase/migrations/ in order reproduces production's
--   actual current state instead of silently regressing this table's
--   grants back open.
--
-- Verification performed (per the request to "verify no breaking changes
-- against existing auth/schema flows"):
--   - Read every application code path that queries profiles,
--     user_analyses, and api_keys, in both src/ (Next.js web app) and
--     mobile/ (Expo app).
--   - Web app (src/): every query against profiles and api_keys goes
--     through createInternalClient() (service-role, bypasses RLS
--     entirely). The web app never queries user_analyses at all.
--   - Mobile app (mobile/): mobile/lib/supabase.ts uses a session-based
--     client with the anon key. mobile/lib/db.ts queries user_analyses
--     directly through that client for both INSERT (saveAnalysis) and
--     SELECT (fetchAnalyses, fetchAnalysesCount) — so RLS on
--     user_analyses IS functionally load-bearing for the mobile app. The
--     (select auth.uid()) rewrite below is a pure InitPlan-caching
--     optimization with identical semantics to the un-rewritten form (per
--     Supabase's documented guidance), so this does not change mobile
--     app behavior, but it's the one table in this migration where that
--     matters in practice rather than just in theory.
--   - Attempted to verify on a disposable Supabase branch first, as with
--     PR #1's intent — this project's plan does not support branching
--     (PaymentRequiredException: "Branching is supported only on the Pro
--     plan or above"). No branch was created, no cost incurred.
--     Verification instead relied on the code reads above plus live
--     read-only catalog/advisor queries against production.

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

-- ============================================================
-- 2. Codify handle_new_user's already-applied EXECUTE lockdown
-- ============================================================
-- No-op against current production (the grants are already gone — see
-- above), but closes the drift between production and "replay every
-- migration on a fresh database," and gives this state a tracked history
-- instead of only existing as an untracked manual change.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

commit;
