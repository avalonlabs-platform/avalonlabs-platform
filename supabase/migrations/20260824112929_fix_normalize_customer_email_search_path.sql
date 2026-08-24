-- Re-fixes function_search_path_mutable on public.normalize_customer_email.
--
-- This exact finding was already fixed once, in
-- 20260824081501_security_perf_hardening.sql (`SET search_path = public`
-- added to this function). Re-running the security advisor after PR #3
-- merged showed it flagged again. Verified directly against production
-- (not just trusting the advisor) via:
--
--   select p.proname, p.prosecdef, p.proconfig, l.lanname
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   join pg_language l on l.oid = p.prolang
--   where n.nspname = 'public' and p.proname = 'normalize_customer_email';
--
-- which returned proconfig = NULL — search_path is not pinned on the live
-- function. pg_get_functiondef() on the live function shows the correct
-- BEGIN/END body (email normalization logic unchanged) but confirms the
-- `SET search_path = public` clause is genuinely absent, and the returned
-- text uses \r\n line endings — inconsistent with what a migration
-- applied through this repo's tooling would produce, and consistent with
-- the function having been re-created directly against the database at
-- some point after PR #1 applied (the same kind of untracked, out-of-band
-- edit already seen once before with handle_new_user's EXECUTE grants in
-- 20260824102410_rls_perf_and_api_keys_security_gap.sql). Flagging this
-- pattern rather than just re-fixing silently: something is periodically
-- editing this database directly, outside the migration-tracked
-- workflow, and undoing tracked fixes when it does. Worth a conversation
-- about locking down direct SQL-editor access before launch, independent
-- of this migration.
--
-- Fix is identical in substance to PR #1's: pin search_path so
-- lower()/trim() (and anything else added to this function later) always
-- resolve against a fixed, known schema rather than whatever search_path
-- is active in the calling session.

begin;

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

commit;
