-- Deletes the caller's account: the auth user and, through each user table's
-- `on delete cascade` from auth.users, every row they own. Supabase Auth's own tables
-- (sessions, refresh tokens, identities) cascade from auth.users too.
--
-- The caller must have signed in with a password in the last 5 minutes. The JWT's amr claim
-- holds each sign-in method with its time in seconds, and a refreshed token keeps the original
-- time (checked against local Supabase Auth on 2026-11-21), so a stolen or long-lived session
-- can't delete the account. The app signs in again with the password just before calling this,
-- and Supabase Auth rate-limits those attempts.
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  amr jsonb := auth.jwt() -> 'amr';
  signed_in_at bigint;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if jsonb_typeof(amr) = 'array' then
    select max((entry ->> 'timestamp')::bigint)
      into signed_in_at
      from jsonb_array_elements(amr) as entry
      where entry ->> 'method' = 'password'
        and jsonb_typeof(entry -> 'timestamp') = 'number';
  end if;

  if signed_in_at is null or signed_in_at < extract(epoch from now()) - 300 then
    raise exception 'deleting the account needs a password sign-in in the last 5 minutes'
      using errcode = '28000';
  end if;

  delete from auth.users where id = uid;
end;
$$;

comment on function public.delete_account() is
  'Deletes the caller''s account and every row they own. Needs a password sign-in in the last 5 minutes (SQLSTATE 28000 otherwise).';

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
