-- Verification for migrations/20260824081501_security_perf_hardening.sql.
--
-- This repo has no pgTAP/Supabase test-runner set up yet, so these are
-- plain, read-only introspection assertions rather than a pgTAP suite —
-- each DO block RAISEs an EXCEPTION (aborting with a clear message) if a
-- change didn't apply. Safe to run repeatedly against any environment;
-- nothing here mutates data. Run after applying the migration, e.g.:
--   supabase db execute -f supabase/tests/20260824081501_security_perf_hardening_verify.sql
-- or paste into the SQL editor. A silent, no-output run means every
-- assertion passed.

-- 1. Index exists on transactions.subscription_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'transactions'
      AND indexname = 'transactions_subscription_id_idx'
  ) THEN
    RAISE EXCEPTION 'FAIL: transactions_subscription_id_idx is missing';
  END IF;
END $$;

-- 2. normalize_customer_email has search_path pinned
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'normalize_customer_email'
      AND p.proconfig IS NOT NULL
      AND 'search_path=public' = ANY (p.proconfig)
  ) THEN
    RAISE EXCEPTION 'FAIL: normalize_customer_email search_path is not pinned to public';
  END IF;
END $$;

-- 3a. decrement_free_credit: anon/PUBLIC EXECUTE revoked, authenticated kept
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'decrement_free_credit'
      AND grantee IN ('PUBLIC', 'anon')
  ) THEN
    RAISE EXCEPTION 'FAIL: decrement_free_credit still grants EXECUTE to PUBLIC or anon';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'decrement_free_credit'
      AND grantee = 'authenticated'
  ) THEN
    RAISE EXCEPTION 'FAIL: decrement_free_credit lost its authenticated EXECUTE grant (out of approved scope)';
  END IF;
END $$;

-- 3b. rls_auto_enable: anon/PUBLIC EXECUTE revoked, authenticated kept
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'rls_auto_enable'
      AND grantee IN ('PUBLIC', 'anon')
  ) THEN
    RAISE EXCEPTION 'FAIL: rls_auto_enable still grants EXECUTE to PUBLIC or anon';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'rls_auto_enable'
      AND grantee = 'authenticated'
  ) THEN
    RAISE EXCEPTION 'FAIL: rls_auto_enable lost its authenticated EXECUTE grant (out of approved scope)';
  END IF;
END $$;

-- 4. Regression guard: handle_new_user was explicitly out of scope and
-- must be untouched by this migration (still anon/authenticated/PUBLIC
-- executable, exactly as before).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'handle_new_user'
      AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'FAIL: handle_new_user anon grant changed — this function was explicitly out of scope for this migration';
  END IF;
END $$;
