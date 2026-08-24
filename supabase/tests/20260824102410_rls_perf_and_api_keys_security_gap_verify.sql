-- Non-destructive verification for
-- 20260824102410_rls_perf_and_api_keys_security_gap.sql
--
-- Every check reads catalog state only (pg_policies, pg_proc,
-- information_schema) — no rows in any application table are read,
-- inserted, or modified. Safe to run against production after the
-- migration applies.
--
-- CORRECTED from an earlier version that asserted a second api_keys
-- policy ("Users can manage their own api keys") was dropped, and that
-- handle_new_user's EXECUTE grants changed. Neither is true: that policy
-- never existed on production, and handle_new_user's anon/authenticated
-- EXECUTE was already revoked before this migration (applied out-of-band,
-- untracked). The checks below reflect what this migration actually does.
--
-- CORRECTED AGAIN: checks 1a-1d originally compared qual/with_check
-- against a literal '((SELECT auth.uid()) = id)'-style string. Postgres
-- pretty-prints a scalar subquery with an auto-generated column alias —
-- the real stored text is '(( SELECT auth.uid() AS uid) = id)' — so that
-- literal match failed even though the rewrite was correct. Fixed by
-- normalizing whitespace/case and accepting the alias as optional, so
-- this isn't brittle against exact Postgres pretty-printing again.

do $$
declare
  v_qual text;
  v_check text;
  v_count int;
  v_norm text;
begin

  -- 1a. profiles."Users can view own profile" now uses (select auth.uid())
  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
    and policyname = 'Users can view own profile';

  v_norm := lower(regexp_replace(coalesce(v_qual, ''), '\s+', '', 'g'));
  if v_norm not in ('((selectauth.uid())=id)', '((selectauth.uid()asuid)=id)') then
    raise exception 'profiles."Users can view own profile" USING clause not rewritten as expected, got: %', v_qual;
  end if;

  -- 1b. user_analyses."Users can view own analyses" rewritten
  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'user_analyses'
    and policyname = 'Users can view own analyses';

  v_norm := lower(regexp_replace(coalesce(v_qual, ''), '\s+', '', 'g'));
  if v_norm not in ('((selectauth.uid())=user_id)', '((selectauth.uid()asuid)=user_id)') then
    raise exception 'user_analyses."Users can view own analyses" USING clause not rewritten as expected, got: %', v_qual;
  end if;

  -- 1c. user_analyses."Users can insert own analyses" rewritten
  select with_check into v_check
  from pg_policies
  where schemaname = 'public' and tablename = 'user_analyses'
    and policyname = 'Users can insert own analyses';

  v_norm := lower(regexp_replace(coalesce(v_check, ''), '\s+', '', 'g'));
  if v_norm not in ('((selectauth.uid())=user_id)', '((selectauth.uid()asuid)=user_id)') then
    raise exception 'user_analyses."Users can insert own analyses" WITH CHECK clause not rewritten as expected, got: %', v_check;
  end if;

  -- 1d. api_keys."Users can view own api keys" rewritten
  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'api_keys'
    and policyname = 'Users can view own api keys';

  v_norm := lower(regexp_replace(coalesce(v_qual, ''), '\s+', '', 'g'));
  if v_norm not in ('((selectauth.uid())=user_id)', '((selectauth.uid()asuid)=user_id)') then
    raise exception 'api_keys."Users can view own api keys" USING clause not rewritten as expected, got: %', v_qual;
  end if;

  -- 1e. Regression guard: api_keys still has exactly the one policy it
  -- had before this migration (this migration does not add or drop any
  -- policy, only rewrites the USING clause of the existing one).
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'api_keys';

  if v_count <> 1 then
    raise exception 'expected exactly 1 policy on api_keys, found % — this migration does not add or remove policies on this table', v_count;
  end if;

  -- 2a. handle_new_user: PUBLIC has no EXECUTE
  select count(*) into v_count
  from information_schema.role_routine_grants
  where routine_name = 'handle_new_user' and grantee = 'PUBLIC';

  if v_count <> 0 then
    raise exception 'PUBLIC still has EXECUTE on handle_new_user()';
  end if;

  -- 2b. handle_new_user: anon has no EXECUTE
  select count(*) into v_count
  from information_schema.role_routine_grants
  where routine_name = 'handle_new_user' and grantee = 'anon';

  if v_count <> 0 then
    raise exception 'anon still has EXECUTE on handle_new_user()';
  end if;

  -- 2c. handle_new_user: authenticated has no EXECUTE
  select count(*) into v_count
  from information_schema.role_routine_grants
  where routine_name = 'handle_new_user' and grantee = 'authenticated';

  if v_count <> 0 then
    raise exception 'authenticated still has EXECUTE on handle_new_user()';
  end if;

  -- 2d. Regression guard: service_role and postgres still have EXECUTE —
  -- this migration must not touch their access.
  select count(*) into v_count
  from information_schema.role_routine_grants
  where routine_name = 'handle_new_user' and grantee in ('service_role', 'postgres');

  if v_count <> 2 then
    raise exception 'expected service_role and postgres to both still have EXECUTE on handle_new_user(), found % matching grants', v_count;
  end if;

  -- 2e. Regression guard: the AFTER INSERT trigger on auth.users still
  -- exists, is enabled, and still fires handle_new_user — this migration
  -- must not affect automatic trigger firing on signup.
  select count(*) into v_count
  from pg_trigger
  where tgname = 'on_auth_user_created'
    and tgrelid = 'auth.users'::regclass
    and tgenabled = 'O'
    and not tgisinternal;

  if v_count <> 1 then
    raise exception 'on_auth_user_created trigger missing, disabled, or malformed after migration';
  end if;

  -- 2f. Regression guard: handle_new_user's function body itself is
  -- untouched by this migration (only grants changed) — SECURITY DEFINER
  -- and search_path stay pinned to 'public'.
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'handle_new_user'
    and n.nspname = 'public'
    and p.prosecdef = true
    and p.proconfig @> array['search_path=public'];

  if v_count <> 1 then
    raise exception 'handle_new_user() SECURITY DEFINER / search_path state changed unexpectedly';
  end if;

  -- 3. Regression guard: the three tables' baseline RLS-enabled state is
  -- unchanged — this migration only touches policy USING/WITH CHECK
  -- clauses and one function's grants, never RLS enablement itself.
  select count(*) into v_count
  from pg_tables t
  join pg_class c on c.relname = t.tablename
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
  where t.schemaname = 'public'
    and t.tablename in ('profiles', 'user_analyses', 'api_keys')
    and c.relrowsecurity = true;

  if v_count <> 3 then
    raise exception 'expected RLS still enabled on all of profiles/user_analyses/api_keys, found % with RLS enabled', v_count;
  end if;

  raise notice 'All checks passed: auth_rls_initplan policies rewritten, handle_new_user EXECUTE lockdown codified, triggers/RLS-enablement/policy-count untouched.';

end $$;
