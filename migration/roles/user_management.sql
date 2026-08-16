-- Superadmin user management — the Settings > Users page.
--
-- WHY THIS IS AN RPC AND NOT A TABLE GRANT
-- public.users has RLS on and NO policies for anon/authenticated, and the
-- table itself is never granted (see munshi-10-adaptation/ADAPTATION.sql).
-- That is deliberate: password_hash must never be selectable from the
-- browser. This app also has no Supabase Auth session — the "signed in
-- user" is just a value in sessionStorage, and the anon key is public in
-- index.html. So there is nothing server-side that could tell a real
-- superadmin apart from anyone who opened DevTools.
--
-- Every function below therefore re-verifies the CALLER'S OWN username +
-- password against the same bcrypt hash check_login_role() uses, and
-- refuses unless that account is role 'superadmin'. That is why the Users
-- page asks the superadmin for their password before it will show
-- anything: the password is the credential for each call, held in memory
-- for the session only and never written to storage.
--
-- password_hash is never returned by any function here. Passwords are only
-- ever written, never read back — a forgotten password is reset, not
-- recovered.
--
-- Run this once in the Supabase SQL Editor. Safe to re-run.

create extension if not exists pgcrypto;

-- Re-assert the full role set (each earlier migration widened it by hand;
-- this makes the whole list explicit in one place). 'superadmin' and
-- 'restaurant' were added by migration/pos/pos_restaurant_role.sql.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('superadmin', 'admin', 'staff', 'viewer', 'restaurant'));

-- ---------- caller check ----------
-- Internal only — deliberately NOT granted to anon/authenticated, so it
-- can't be used as an oracle for "is this account a superadmin".
create or replace function public.admin_assert_superadmin(p_admin text, p_pass text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_role text;
begin
  select password_hash, role into v_hash, v_role from public.users where username = p_admin;
  -- Same posture as check_login_role: a caller can't tell "no such user"
  -- from "wrong password" from "not a superadmin".
  if v_hash is null or v_hash <> crypt(p_pass, v_hash) or v_role <> 'superadmin' then
    raise exception 'NOT_AUTHORISED';
  end if;
end;
$$;

-- ---------- list ----------
-- Never returns password_hash. Ordered superadmin-first, then by name, so
-- the accounts that matter most are at the top of the page.
create or replace function public.admin_list_users(p_admin text, p_pass text)
returns table (username text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.admin_assert_superadmin(p_admin, p_pass);
  return query
    select u.username, u.role, u.created_at
      from public.users u
     order by case u.role
                when 'superadmin' then 0
                when 'admin' then 1
                when 'staff' then 2
                when 'restaurant' then 3
                else 4
              end,
              u.username;
end;
$$;

-- ---------- create / edit ----------
-- One function for both: an existing username is updated, a new one is
-- created. p_password '' (or null) on an existing account means "leave the
-- password exactly as it is" — editing someone's role must not silently
-- reset their password.
--
-- Returns 'created' or 'updated'.
create or replace function public.admin_save_user(
  p_admin text, p_pass text,
  p_username text, p_password text, p_role text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_password text := coalesce(p_password, '');
  v_exists boolean;
  v_old_role text;
  v_superadmins integer;
begin
  perform public.admin_assert_superadmin(p_admin, p_pass);

  if v_username = '' then
    raise exception 'USERNAME_REQUIRED';
  end if;
  if v_username ~ '\s' then
    raise exception 'USERNAME_HAS_SPACES';
  end if;
  if p_role is null or p_role not in ('superadmin', 'admin', 'staff', 'viewer', 'restaurant') then
    raise exception 'BAD_ROLE';
  end if;

  select true, role into v_exists, v_old_role from public.users where username = v_username;
  v_exists := coalesce(v_exists, false);

  if not v_exists and length(v_password) < 6 then
    raise exception 'PASSWORD_TOO_SHORT';
  end if;
  if v_exists and v_password <> '' and length(v_password) < 6 then
    raise exception 'PASSWORD_TOO_SHORT';
  end if;

  -- Lockout guards. Demoting yourself, or demoting the only superadmin
  -- left, would leave nobody who can ever open this page again — and the
  -- only way back would be the SQL Editor.
  if v_exists and v_old_role = 'superadmin' and p_role <> 'superadmin' then
    if v_username = lower(btrim(p_admin)) then
      raise exception 'CANNOT_DEMOTE_SELF';
    end if;
    select count(*) into v_superadmins from public.users where role = 'superadmin';
    if v_superadmins <= 1 then
      raise exception 'LAST_SUPERADMIN';
    end if;
  end if;

  if v_exists then
    update public.users
       set role = p_role,
           password_hash = case when v_password = '' then password_hash
                                else crypt(v_password, gen_salt('bf')) end
     where username = v_username;
    return 'updated';
  end if;

  insert into public.users (username, password_hash, role)
  values (v_username, crypt(v_password, gen_salt('bf')), p_role);
  return 'created';
end;
$$;

-- ---------- delete ----------
-- A real DELETE, not a soft one: public.users is a credential list, not a
-- record of anything that happened. The audit trail (guest_edits) stores
-- the username as plain text, so deleting an account never disturbs the
-- history of what that account did.
create or replace function public.admin_delete_user(p_admin text, p_pass text, p_username text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_role text;
  v_superadmins integer;
begin
  perform public.admin_assert_superadmin(p_admin, p_pass);

  select role into v_role from public.users where username = v_username;
  if v_role is null then
    raise exception 'NO_SUCH_USER';
  end if;
  if v_username = lower(btrim(p_admin)) then
    raise exception 'CANNOT_DELETE_SELF';
  end if;
  if v_role = 'superadmin' then
    select count(*) into v_superadmins from public.users where role = 'superadmin';
    if v_superadmins <= 1 then
      raise exception 'LAST_SUPERADMIN';
    end if;
  end if;

  delete from public.users where username = v_username;
  return 'deleted';
end;
$$;

-- ---------- GRANTS ----------
-- Only the three entry points, all of which start by re-verifying the
-- caller. admin_assert_superadmin stays ungranted on purpose.
grant execute on function public.admin_list_users(text, text) to anon, authenticated;
grant execute on function public.admin_save_user(text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_delete_user(text, text, text) to anon, authenticated;

revoke execute on function public.admin_assert_superadmin(text, text) from anon, authenticated;

-- ---------- VERIFY ----------
select 1 as step, 'function: admin_list_users'   as item, to_regprocedure('public.admin_list_users(text,text)') is not null as ok
union all select 2, 'function: admin_save_user',   to_regprocedure('public.admin_save_user(text,text,text,text,text)') is not null
union all select 3, 'function: admin_delete_user', to_regprocedure('public.admin_delete_user(text,text,text)') is not null
union all select 4, 'at least one superadmin exists', (select count(*) from public.users where role = 'superadmin') > 0
order by 1;
