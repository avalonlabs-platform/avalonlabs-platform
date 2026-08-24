-- Non-destructive verification for
-- 20260824102410_rls_perf_and_api_keys_security_gap.sql
--
-- Every check reads catalog state only (pg_policies, pg_proc,
-- information_schema) — no rows in any application table are read,
-- inserted, or modified. Safe to run against production after the
-- migration applies.

do $
declare
  v_qual text;
  v_check text;
  v_count int;
begin

  -- 1a. profiles."Users can view own profile" now uses (select auth.uid())
  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
    and policyname = 'Users can view own profile';

  if v_qual is distinct from '((SELECT auth.uid()) = id)' then
    raise exception 'profiles."Users can view own profile" USING clause not rewritten as expected, got: %', v_qual;
  end if;

  -- 1b. user_analyses."Users can view own analyses" rewritten
  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'user_analyses'
    and policyname = 'Users can view own analyses';

  if v_qual is distinct from '((SELECT auth.uid()) = user_id)' then
    raise exception 'user_analyses."Users can view own analyses" USING clause not rewritten as expected, got: %', v_qual;
  end if;

  -- 1c. user_analyses."Users can insert own analyses" rewritten
  select with_check into v_check
  from pg_policies
  where schemaname = 'public' and tablename = 'user_analyses'
    and policyname = 'Users can insert own analyses';

  if v_check is distinct from '((SELECT auth.uid()) = user_id)' then
    raise exception 'user_analyses."Users can insert own analyses" WITH CHECK clause not rewritten as expected, got: %', v_check;
  end if;

  -- 1d. api_keys."Users can view own api keys" rewritten
  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'api_keys'
    and policyname = 'Users can view own api keys';

  if v_qual is distinct from '((SELECT auth.uid()) = user_id)' then
    raise exception 'api_keys."Users can view own api keys" USING clause not rewritten as expected, got: %', v_qual;
  end if;

  -- 2. api_keys."Users can manage their own api keys" no longer exists
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'api_keys'
    and policyname = 'Users can manage their own api keys';

  if v_count <> 0 then
    raise exception 'api_keys."Users can manage their own api keys" still exists — expected it dropped';
  end if;

  -- 2b. api_keys still has exactly one policy (the SELECT-only one) —
  -- confirms we didn't accidentally drop or duplicate anything else.
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'api_keys';

  if v_count <> 1 then
    raise exception 'expected exactly 1 policy on api_keys after the drop, found %', v_count;
  end if;

  -- 3a. handle_new_user: PUBLIC no longer has EXECUTE
  select count(*) into v_count
  from information_schema.role_routine_grants
  where routine_name = 'handle_new_user' and grantee = 'PUBLIC';

  if v_count <> 0 then
    raise exception 'PUBLIC still has EXECUTE on handle_new_user()';
  end if;

  -- 3b. handle_new_user: anon no longer has EXECUTE
  select count(*) into v_count
  from information_schema.role_routine_grants
  where routine_name = 'handle_new_user' and grantee = 'anon';

  if v_count <> 0 then
    raise exception 'anon still has EXECUTE on handle_new_user()';
  end if;

  -- 3c. handle_new_user: authenticated no longer has EXECUTE
  select count(*) into v_count
  from information_schema.role_routine_grants
  where routine_name = 'handle_new_user' and grantee = 'authenticated';

  if v_count <> 0 then
    raise exception 'authenticated still has EXECUTE on handle_new_user()';
  end if;

  -- 3d. Regression guard: service_role and postgres still have EXECUTE —
  -- this migration must not touch their access.
  select count(*) into v_count
  from information_schema.role_routine_grants
  where routine_name = 'handle_new_user' and grantee in ('service_role', 'postgres');

  if v_count <> 2 then
    raise exception 'expected service_role and postgres to both still have EXECUTE on handle_new_user(), found % matching grants', v_count;
  end if;

  -- 3e. Regression guard: the AFTER INSERT trigger on auth.users still
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

  -- 3f. Regression guard: handle_new_user's function body itself is
  -- untouched by this migration (only grants changed) — SECURITY DEFINER
  -- and search_path stay pinned to 'public' as set in PR #1 / prior state.
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

  -- 4. Regression guard: the three tables' baseline RLS-enabled state is
  -- unchanged — this migration only touches policies and one function's
  -- grants, never RLS enablement itself.
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

  raise notice 'All checks passed: RLS policies rewritten, dangling api_keys write policy dropped, handle_new_user EXECUTE locked down, triggers/RLS-enablement untouched.';

end $;
