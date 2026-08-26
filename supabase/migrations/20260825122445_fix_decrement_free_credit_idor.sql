begin;

-- decrement_free_credit(user_id uuid) was SECURITY DEFINER with no check that
-- the passed-in user_id matched the calling user — any authenticated client
-- could decrement ANY user's free_credits via /rest/v1/rpc/decrement_free_credit.
-- EXECUTE was already emergency-revoked from anon/authenticated live in
-- production on 2026-08-25 pending this migration; this codifies that revoke
-- and adds an auth.uid() guard as defense-in-depth.
--
-- Verified via the actual call site (src/app/api/chat/route.ts) that this
-- function is ONLY ever invoked server-side through createInternalClient()
-- (SUPABASE_SERVICE_ROLE_KEY), which already bypasses RLS and retains
-- EXECUTE regardless of these grants — so authenticated/anon are intentionally
-- NOT re-granted here. If a legitimate client-side caller is added later,
-- re-grant EXECUTE to authenticated explicitly at that time.

create or replace function public.decrement_free_credit(user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  if auth.uid() is null or user_id <> auth.uid() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  update public.profiles
  set free_credits = free_credits - 1, updated_at = now()
  where id = user_id and free_credits > 0
  returning free_credits into remaining;

  return remaining;
end;
$$;

revoke execute on function public.decrement_free_credit(uuid) from public, anon, authenticated;
grant execute on function public.decrement_free_credit(uuid) to service_role;

-- Only include this line if you want authenticated re-granted instead:
-- grant execute on function public.decrement_free_credit(uuid) to authenticated;

commit;