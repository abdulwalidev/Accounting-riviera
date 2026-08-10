-- Adds a second restaurant-role login: reception@restaurant / riviera10.
-- Same pattern as migration/pos/pos_restaurant_role.sql (sehzad@res) — a
-- plain public.users row with role 'restaurant', which check_login_role()
-- already accepts (that migration already widened the role check
-- constraint, so nothing to alter here). Run this once in the Supabase
-- SQL Editor. Safe to re-run.

insert into public.users (username, password_hash, role)
values ('reception@restaurant', crypt('riviera10', gen_salt('bf')), 'restaurant')
on conflict (username) do update set role = 'restaurant', password_hash = crypt('riviera10', gen_salt('bf'));
