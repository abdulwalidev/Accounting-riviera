-- Restaurant / POS module — completely separate from every existing hotel
-- table. Nothing here has a foreign key into guests/booking_rooms/
-- guest_payments/users, and no existing table is altered except for one
-- constraint widen at the very bottom (adding 'superadmin' as an allowed
-- value on public.users.role, so one hotel account can also see the
-- restaurant's Front Office screen — no existing row is touched).
--
-- All new tables are lowercase "pos_..." on purpose: Postgres case-folds
-- unquoted identifiers, so a "Pos_orders" table would become "pos_orders"
-- server-side while sb.from('Pos_orders') on the client keeps asking for
-- the quoted (never-created) name and 404s. Lowercase avoids that trap.
--
-- Login mirrors public.users/check_login_role exactly, just against a
-- separate pos_users table + check_pos_login_role() function, so a
-- restaurant account can never authenticate into the hotel app and vice
-- versa. One account (wali@admin) is deliberately seeded into BOTH tables
-- — that is two independent login rows, not a data link.
--
-- Run this once in the Supabase SQL Editor. Safe to re-run.

-- ---------- POS LOGIN ----------
create table if not exists public.pos_users (
  username text primary key,
  password_hash text not null,
  role text not null default 'cashier',
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pos_users_role_check') then
    alter table public.pos_users add constraint pos_users_role_check check (role in ('cashier', 'admin'));
  end if;
end $$;

alter table public.pos_users enable row level security;
-- Deliberately no policies on public.pos_users for anon/authenticated —
-- every read happens only inside the security-definer function below,
-- same posture as public.users/check_login_role.

-- Returns the account's role ('cashier' / 'admin') on a correct password,
-- NULL on a wrong one or unknown username — a caller can't tell which.
create or replace function public.check_pos_login_role(p_username text, p_password text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_role text;
begin
  select password_hash, role into v_hash, v_role from public.pos_users where username = p_username;
  if v_hash is null then
    return null;
  end if;
  if v_hash = crypt(p_password, v_hash) then
    return coalesce(v_role, 'cashier');
  end if;
  return null;
end;
$$;

-- ---------- INVOICE NUMBERING ----------
-- Atomic server-side counter — the old localStorage counter let two
-- terminals mint the same SI-###### number, and delete/collect match
-- records by that number alone, so a collision would touch the wrong row.
create table if not exists public.pos_counters (
  name text primary key,
  value integer not null
);

insert into public.pos_counters (name, value)
values ('invoice_no', 6491)
on conflict (name) do nothing;

alter table public.pos_counters enable row level security;
-- No policies here either — only reachable through the function below.

create or replace function public.pos_next_invoice_no()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  update public.pos_counters set value = value + 1 where name = 'invoice_no' returning value - 1 into v_next;
  return v_next;
end;
$$;

-- ---------- INVOICES ----------
create table if not exists public.pos_invoices (
  id text primary key,
  invoice_no text,
  dept text,
  invoice_date date,
  date_text text,
  room_no text,
  customer text,
  table_no text,
  order_no text,
  location_text text,
  subtotal numeric not null default 0,
  tax_total numeric not null default 0,
  grand_total numeric not null default 0,
  paid numeric not null default 0,
  balance numeric not null default 0,
  mode text,
  posted boolean not null default true,
  sent_to_front_office boolean not null default false,
  collected boolean not null default false,
  collected_by text,
  collected_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Line items are a plain text FK, not a real one — this schema never
-- enforces real FKs (see locked_days/room_status/payment_attachments), so
-- an item row always carries enough (invoice_id) to be found without a
-- join.
create table if not exists public.pos_invoice_items (
  id text primary key,
  invoice_id text not null,
  line_no integer not null default 0,
  name text not null,
  notes text,
  qty numeric not null default 0,
  price numeric not null default 0,
  pct numeric not null default 0,
  extended numeric not null default 0
);

alter table public.pos_invoices enable row level security;
alter table public.pos_invoice_items enable row level security;

drop policy if exists "pos_invoices_select" on public.pos_invoices;
drop policy if exists "pos_invoices_insert" on public.pos_invoices;
drop policy if exists "pos_invoices_update" on public.pos_invoices;
create policy "pos_invoices_select" on public.pos_invoices for select using (true);
create policy "pos_invoices_insert" on public.pos_invoices for insert with check (true);
create policy "pos_invoices_update" on public.pos_invoices for update using (true) with check (true);
-- No DELETE policy on purpose — "delete" in the app is a soft delete
-- (deleted = true), same posture as guests/booking_rooms/guest_payments.

drop policy if exists "pos_invoice_items_select" on public.pos_invoice_items;
drop policy if exists "pos_invoice_items_insert" on public.pos_invoice_items;
drop policy if exists "pos_invoice_items_update" on public.pos_invoice_items;
drop policy if exists "pos_invoice_items_delete" on public.pos_invoice_items;
create policy "pos_invoice_items_select" on public.pos_invoice_items for select using (true);
create policy "pos_invoice_items_insert" on public.pos_invoice_items for insert with check (true);
create policy "pos_invoice_items_update" on public.pos_invoice_items for update using (true) with check (true);
-- Items DO get a delete policy (unlike invoices): a line can be removed
-- while an invoice is still a draft/being edited, with the invoice's own
-- soft-delete flag covering the "whole invoice is gone" case.
create policy "pos_invoice_items_delete" on public.pos_invoice_items for delete using (true);

-- ---------- GRANTS ----------
grant select, insert, update on public.pos_invoices to anon, authenticated;
grant select, insert, update, delete on public.pos_invoice_items to anon, authenticated;
grant execute on function public.check_pos_login_role(text, text) to anon, authenticated;
grant execute on function public.pos_next_invoice_no() to anon, authenticated;
-- pos_users and pos_counters stay ungranted — only reachable through the
-- two functions above.

-- ---------- REALTIME ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pos_invoices'
  ) then
    alter publication supabase_realtime add table public.pos_invoices;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pos_invoice_items'
  ) then
    alter publication supabase_realtime add table public.pos_invoice_items;
  end if;
end $$;

-- ---------- SEED ACCOUNTS ----------
-- If an account already exists its password is left alone — only the
-- role is (re)set, same idiom as migration/add_viewer_role.sql.
insert into public.pos_users (username, password_hash, role)
values ('sehzad@res', crypt('sehzad10', gen_salt('bf')), 'cashier')
on conflict (username) do update set role = 'cashier';

insert into public.pos_users (username, password_hash, role)
values ('wali@admin', crypt('Abdulwali!1', gen_salt('bf')), 'admin')
on conflict (username) do update set role = 'admin';

-- ---------- ONE HOTEL-SIDE CHANGE: superadmin role ----------
-- wali@admin also gets a hotel login so Front Office shows in the top
-- nav (not just tucked in Settings like it is for every other admin).
-- This widens the allowed-values list on public.users.role; it does not
-- touch any existing row's data.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('admin', 'staff', 'viewer', 'superadmin'));

insert into public.users (username, password_hash, role)
values ('wali@admin', crypt('Abdulwali!1', gen_salt('bf')), 'superadmin')
on conflict (username) do update set role = 'superadmin';

-- ---------- SELF-VERIFY ----------
-- Run this SELECT after the migration — every row should show non-null.
select
  1 as step, 'table: pos_users' as what, to_regclass('public.pos_users') is not null as ok
union all select 2, 'table: pos_invoices', to_regclass('public.pos_invoices') is not null
union all select 3, 'table: pos_invoice_items', to_regclass('public.pos_invoice_items') is not null
union all select 4, 'table: pos_counters', to_regclass('public.pos_counters') is not null
union all select 5, 'function: check_pos_login_role', to_regprocedure('public.check_pos_login_role(text,text)') is not null
union all select 6, 'function: pos_next_invoice_no', to_regprocedure('public.pos_next_invoice_no()') is not null
union all select 7, 'account: sehzad@res', exists(select 1 from public.pos_users where username = 'sehzad@res')
union all select 8, 'account: wali@admin (pos)', exists(select 1 from public.pos_users where username = 'wali@admin')
union all select 9, 'account: wali@admin (hotel, superadmin)', exists(select 1 from public.users where username = 'wali@admin' and role = 'superadmin');
