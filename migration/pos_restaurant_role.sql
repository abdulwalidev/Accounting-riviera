-- Adds a fourth hotel-login role, 'restaurant' — the login screen is now
-- shared: restaurant staff (sehzad@res) sign in through the same
-- public.users / check_login_role() as everyone else, instead of the
-- separate pos_users table added in migration/pos_module.sql. That table
-- and its check_pos_login_role() function are UNTOUCHED and still the
-- real gate on pos_invoices data — this migration only adds a matching
-- hotel-login row with the same username/password, which the app uses to
-- silently sign the same person into the embedded POS on their behalf
-- (see attemptLogin() in app/index.html). Existing roles are untouched;
-- this only widens the allowed set and adds one account. Run this once
-- in the Supabase SQL Editor. Safe to re-run.

create extension if not exists pgcrypto;

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('admin', 'staff', 'viewer', 'superadmin', 'restaurant'));

insert into public.users (username, password_hash, role)
values ('sehzad@res', crypt('sehzad10', gen_salt('bf')), 'restaurant')
on conflict (username) do update set role = 'restaurant';
