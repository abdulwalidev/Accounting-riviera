-- Adds a third account role, 'viewer' — read-only, no create/edit/delete
-- anywhere in the app (Guest Entry and Add Payment are grayed out, every
-- edit/checkout/check-in/delete button is hidden). Existing roles ('admin',
-- 'staff') are untouched; this only widens the allowed set and adds two
-- new accounts. Run this once in the Supabase SQL Editor. Safe to re-run.

create extension if not exists pgcrypto;

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('admin', 'staff', 'viewer'));

-- CHANGE THESE PASSWORDS after first run if you want something other than
-- what's below:
--   update public.users set password_hash = crypt('new-password', gen_salt('bf'))
--   where username = 'haroon@riviera';
insert into public.users (username, password_hash, role)
values ('haroon@riviera', crypt('haroon527', gen_salt('bf')), 'viewer')
on conflict (username) do update set role = 'viewer';

insert into public.users (username, password_hash, role)
values ('guest@riviera', crypt('rivieraguest', gen_salt('bf')), 'viewer')
on conflict (username) do update set role = 'viewer';
