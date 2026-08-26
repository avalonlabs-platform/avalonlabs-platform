begin;

do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_result integer;
  v_blocked boolean := false;
begin
  -- auth.users has an AFTER INSERT trigger (on_auth_user_created ->
  -- handle_new_user()) that auto-creates the matching public.profiles row
  -- via ON DELETE CASCADE FK, so seed auth.users only and let the trigger
  -- create profiles — do not insert into public.profiles directly.
  insert into auth.users (id, email)
  values
    (v_user_a, 'verify-user-a@example.invalid'),
    (v_user_b, 'verify-user-b@example.invalid');

  update public.profiles set free_credits = 5 where id in (v_user_a, v_user_b);

  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  set local role authenticated;

  -- User A must NOT be able to decrement user B's credits.
  begin
    perform public.decrement_free_credit(v_user_b);
  exception when insufficient_privilege then
    v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'REGRESSION: user A decremented user B''s free credits';
  end if;

  if (select free_credits from public.profiles where id = v_user_b) <> 5 then
    raise exception 'REGRESSION: user B credits changed';
  end if;

  -- User A decrementing their OWN credits must still work.
  select public.decrement_free_credit(v_user_a) into v_result;
  if v_result <> 4 then
    raise exception 'REGRESSION: self-decrement returned % (expected 4)', v_result;
  end if;

  reset role;
  raise notice 'decrement_free_credit IDOR fix verified.';
end $$;

rollback;

-- Grant check (run separately, not inside the transaction above):
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name = 'decrement_free_credit'
order by grantee;