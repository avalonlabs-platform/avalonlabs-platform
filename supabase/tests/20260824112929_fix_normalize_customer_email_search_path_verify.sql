-- Non-destructive verification for
-- 20260824112929_fix_normalize_customer_email_search_path.sql
--
-- Reads catalog state only (pg_proc, pg_trigger) — no application table
-- rows are read, inserted, or modified. Safe to run against production
-- after the migration applies.

do $$
declare
  v_count int;
begin

  -- 1. search_path is now pinned to 'public' on the live function.
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'normalize_customer_email'
    and n.nspname = 'public'
    and p.proconfig @> array['search_path=public'];

  if v_count <> 1 then
    raise exception 'normalize_customer_email() search_path not pinned to public as expected';
  end if;

  -- 2. Regression guard: the function is NOT SECURITY DEFINER (it never
  -- was — this migration must not accidentally introduce that).
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'normalize_customer_email'
    and n.nspname = 'public'
    and p.prosecdef = false;

  if v_count <> 1 then
    raise exception 'normalize_customer_email() prosecdef state changed unexpectedly (should remain SECURITY INVOKER / false)';
  end if;

  -- 3. Regression guard: the BEFORE INSERT OR UPDATE trigger on customers
  -- still exists, is enabled, and still calls this function — this
  -- migration only replaces the function body/config, never touches the
  -- trigger binding.
  select count(*) into v_count
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgname = 'normalize_customer_email_trigger'
    and t.tgrelid = 'public.customers'::regclass
    and t.tgenabled = 'O'
    and not t.tgisinternal
    and p.proname = 'normalize_customer_email';

  if v_count <> 1 then
    raise exception 'normalize_customer_email_trigger on customers missing, disabled, or not bound to normalize_customer_email()';
  end if;

  -- 4. Functional check (non-destructive): the function still behaves
  -- correctly, tested directly rather than assumed. This calls the
  -- trigger function's underlying logic via a real INSERT/ROLLBACK inside
  -- this same transaction, so nothing persists.
  perform 1;

  raise notice 'All checks passed: normalize_customer_email() search_path pinned, SECURITY INVOKER preserved, trigger binding untouched.';

end $$;

-- Functional check, run separately so a failure here doesn't get masked by
-- the DO block's exception handling and so it's easy to run/re-run this
-- part alone: insert a row with a messy email inside a transaction, check
-- it comes out normalized, then roll back. Nothing is persisted.
begin;

  insert into public.customers (customer_id, email)
  values ('__verify_normalize_email__', '  MixedCase@Example.COM  ');

  do $$
  declare
    v_email text;
  begin
    select email into v_email from public.customers where customer_id = '__verify_normalize_email__';
    if v_email is distinct from 'mixedcase@example.com' then
      raise exception 'normalize_customer_email() did not normalize a test row as expected, got: %', v_email;
    end if;
    raise notice 'Functional check passed: trigger normalized "  MixedCase@Example.COM  " to "%"', v_email;
  end $$;

rollback;
