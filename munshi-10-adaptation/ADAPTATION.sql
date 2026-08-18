-- =========================================================================
-- ADAPTATION.sql — full 0-to-running Supabase (Postgres) schema for the
-- Munshi 10 Adaptation guest-entry app (this folder), for a BRAND NEW,
-- DEDICATED Supabase project — not the one the parent "new system" app
-- uses. Nothing here depends on any table existing already.
--
-- HOW TO USE
--   1. Create a new Supabase project.
--   2. Project -> SQL Editor -> New query -> paste this whole file -> Run.
--   3. Safe to re-run: every statement is idempotent (create-if-not-exists /
--      create-or-replace / add-column-if-not-exists), so running it twice
--      never drops or duplicates anything. Nothing in this file ever DROPs
--      a table.
--   4. Copy Project Settings -> API -> Project URL and anon public key into
--      SUPABASE_URL / SUPABASE_ANON_KEY in js/app-cloud-core.js.
--
-- WHAT'S IN HERE (consolidates every migration this app has accumulated —
-- see the bottom of this file for exactly which ones):
--   - guests / booking_rooms / guest_payments / guest_edits — the core
--     guest-centric booking model (one row per stay, nested rooms and
--     payments, append-only audit log).
--   - users + check_login_role() — admin/staff login, bcrypt password
--     hashes that never leave the database.
--   - locked_days — Night Audit's "post this night" mechanism.
--   - Soft delete everywhere: nothing is ever hard-deleted, the anon key
--     is never granted DELETE on anything, *_active views are what the
--     app reads, *_deleted views are for admin recovery from the SQL
--     Editor only.
-- =========================================================================

create extension if not exists pgcrypto;

-- ---------- TABLE: guests ----------
-- One row per guest ENTRY (a stay/booking), not per unique person — a
-- returning guest (same CNIC) is deliberately saved as a new entry after a
-- confirmation prompt, not merged into an existing one.
create table if not exists public.guests (
  id text primary key,
  guest_name text not null default '',
  father_name text not null default '',
  cnic text not null default '',
  -- The optional "+ Detail" rows (Address, Nationality, Contact No,
  -- Date of Arrival, ...) as [{"kind": "...", "value": "..."}] — kept as
  -- jsonb because the set of kinds is user-facing and grows over time.
  extra_details jsonb not null default '[]'::jsonb,
  saved_at timestamptz not null default now(),
  edited_at timestamptz,
  saved_by text not null default '',
  edited_by text not null default '',
  check_in date,   -- stay start, reference only — never used in calculations
  check_out date,  -- stay end, reference only — never used in calculations
  -- Reservation status: NULL = active. Set by the Cancel Reservation /
  -- Mark No-show actions on the guest detail page and surfaced by Night
  -- Audit's no-show detector. Never used in totals — purely a workflow flag.
  res_status text check (res_status is null or res_status in ('cancelled', 'no_show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);

comment on column public.guests.deleted_at is
  'Soft delete marker. NULL = active/visible. Set by soft_delete_guest(), cleared by restore_guest(). Never hard-deleted.';

-- ---------- TABLE: booking_rooms ----------
create table if not exists public.booking_rooms (
  id text primary key,
  guest_id text not null references public.guests(id) on delete cascade,
  room_no text not null default '',
  unit_type text not null default '' check (unit_type in ('', 'Room', 'Apartment')),
  rent_per_day numeric(12,2) not null default 0,
  days_count integer not null default 1,
  -- Date the guest left THIS specific room — lets Room Detail tell a real
  -- room change (old room vacated, new room occupied) apart from two rooms
  -- booked at once under one entry.
  moved_out_date date,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);

comment on column public.booking_rooms.deleted_at is
  'Soft delete marker, same convention as guests.deleted_at. Also stamped when a room row is removed while editing an entry.';

-- ---------- TABLE: guest_payments ----------
create table if not exists public.guest_payments (
  id text primary key,
  guest_id text not null references public.guests(id) on delete cascade,
  payment_date date not null,
  pay_type text not null default 'Other',
  mode text not null default 'Cash' check (mode in ('Cash', 'Bank Transfer', 'Card', 'BTC')),
  bank text not null default '',
  remarks text not null default '',
  cash numeric(12,2) not null default 0,
  account numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);

comment on column public.guest_payments.deleted_at is
  'Soft delete marker, same convention as guests.deleted_at.';

-- ---------- TABLE: guest_edits (append-only audit log) ----------
-- One row per action on an entry, with the signed-in account's username +
-- role. No UPDATE/DELETE is granted to the API at all, so history can
-- never be rewritten from the app.
create table if not exists public.guest_edits (
  id text primary key,
  guest_id text not null,
  username text not null default '',
  role text not null default '',
  action text not null default 'edited'
    check (action in ('created', 'edited', 'payment_added', 'res_cancelled', 'res_no_show', 'res_reactivated')),
  at timestamptz not null default now()
);

comment on table public.guest_edits is
  'Append-only audit log. No UPDATE/DELETE is granted to the API at all, so history can never be rewritten from the app.';

-- ---------- TABLE: locked_days (Night Audit) ----------
-- Posting a night's audit locks its date here — no NEW payment can be
-- dated on it afterward (existing payments already saved on that date are
-- left alone). audit_summary is the real, computed snapshot (room-nights
-- sold, revenue, payments received, arrivals/departures, no-show
-- candidates) the Night Audit page showed at the moment it was posted.
create table if not exists public.locked_days (
  lock_date date primary key,
  locked_by text,
  locked_at timestamptz not null default now(),
  unlocked_by text,
  unlocked_at timestamptz,
  audit_summary jsonb
);

-- ---------- TABLE: users (login) ----------
-- ROLES: every account is either
--   'admin' — full access, including "✎ Edit This Entry" (editing mode)
--   'staff' — everything EXCEPT editing mode: can create entries, take
--             payments, search and report, but can never reopen a saved
--             entry for editing
create table if not exists public.users (
  username text primary key,
  password_hash text not null,
  role text not null default 'staff',
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_role_check') then
    alter table public.users add constraint users_role_check check (role in ('admin', 'staff'));
  end if;
end $$;

-- ---------- updated_at AUTO-STAMP ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_guests_updated_at on public.guests;
create trigger trg_guests_updated_at
  before update on public.guests
  for each row execute function public.set_updated_at();

drop trigger if exists trg_booking_rooms_updated_at on public.booking_rooms;
create trigger trg_booking_rooms_updated_at
  before update on public.booking_rooms
  for each row execute function public.set_updated_at();

drop trigger if exists trg_guest_payments_updated_at on public.guest_payments;
create trigger trg_guest_payments_updated_at
  before update on public.guest_payments
  for each row execute function public.set_updated_at();

-- ---------- INDEXES ----------
create index if not exists idx_guests_cnic on public.guests (cnic);
create index if not exists idx_guests_saved_at on public.guests (saved_at);
create index if not exists idx_guests_deleted_at on public.guests (deleted_at);
create index if not exists idx_booking_rooms_guest_id on public.booking_rooms (guest_id);
create index if not exists idx_booking_rooms_deleted_at on public.booking_rooms (deleted_at);
create index if not exists idx_guest_payments_guest_id on public.guest_payments (guest_id);
create index if not exists idx_guest_payments_date on public.guest_payments (payment_date);
create index if not exists idx_guest_payments_deleted_at on public.guest_payments (deleted_at);
create index if not exists idx_guest_edits_guest_id on public.guest_edits (guest_id);
create index if not exists idx_guest_edits_at on public.guest_edits (at);

-- ---------- SOFT DELETE / RESTORE FUNCTIONS ----------
create or replace function public.soft_delete_guest(p_guest_id text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.guests
     set deleted_at = now(), deleted_reason = p_reason
   where id = p_guest_id and deleted_at is null;

  update public.booking_rooms
     set deleted_at = now(), deleted_reason = 'parent guest deleted'
   where guest_id = p_guest_id and deleted_at is null;

  update public.guest_payments
     set deleted_at = now(), deleted_reason = 'parent guest deleted'
   where guest_id = p_guest_id and deleted_at is null;
end;
$$;

create or replace function public.restore_guest(p_guest_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.guests
     set deleted_at = null, deleted_reason = null
   where id = p_guest_id;

  update public.booking_rooms
     set deleted_at = null, deleted_reason = null
   where guest_id = p_guest_id;

  update public.guest_payments
     set deleted_at = null, deleted_reason = null
   where guest_id = p_guest_id;
end;
$$;

-- Used when editing an entry removes a room/payment row: the app upserts
-- the rows that remain and soft-deletes the ones taken out.
create or replace function public.soft_delete_booking_room(p_room_id text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.booking_rooms
     set deleted_at = now(), deleted_reason = p_reason
   where id = p_room_id and deleted_at is null;
end;
$$;

create or replace function public.restore_booking_room(p_room_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.booking_rooms set deleted_at = null, deleted_reason = null where id = p_room_id;
end;
$$;

create or replace function public.soft_delete_guest_payment(p_payment_id text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.guest_payments
     set deleted_at = now(), deleted_reason = p_reason
   where id = p_payment_id and deleted_at is null;
end;
$$;

create or replace function public.restore_guest_payment(p_payment_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.guest_payments set deleted_at = null, deleted_reason = null where id = p_payment_id;
end;
$$;

-- ---------- LOGIN ----------
-- Returns the account's role ('admin' / 'staff') on a correct password,
-- NULL on a wrong one. The hash never leaves the database, and a caller
-- can't tell "no such user" from "wrong password".
create or replace function public.check_login_role(p_username text, p_password text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_role text;
begin
  select password_hash, role into v_hash, v_role from public.users where username = p_username;
  if v_hash is null then
    return null;
  end if;
  if v_hash = crypt(p_password, v_hash) then
    return coalesce(v_role, 'staff');
  end if;
  return null;
end;
$$;

-- ---------- CONVENIENCE VIEWS ----------
create or replace view public.guests_active as
  select * from public.guests where deleted_at is null;

create or replace view public.booking_rooms_active as
  select * from public.booking_rooms where deleted_at is null;

create or replace view public.guest_payments_active as
  select * from public.guest_payments where deleted_at is null;

create or replace view public.guests_deleted as
  select * from public.guests where deleted_at is not null order by deleted_at desc;

create or replace view public.booking_rooms_deleted as
  select * from public.booking_rooms where deleted_at is not null order by deleted_at desc;

create or replace view public.guest_payments_deleted as
  select * from public.guest_payments where deleted_at is not null order by deleted_at desc;

-- ---------- ROW LEVEL SECURITY ----------
alter table public.guests enable row level security;
alter table public.booking_rooms enable row level security;
alter table public.guest_payments enable row level security;
alter table public.guest_edits enable row level security;
alter table public.locked_days enable row level security;
alter table public.users enable row level security;

drop policy if exists "guests_select" on public.guests;
drop policy if exists "guests_insert" on public.guests;
drop policy if exists "guests_update" on public.guests;
create policy "guests_select" on public.guests for select using (true);
create policy "guests_insert" on public.guests for insert with check (true);
create policy "guests_update" on public.guests for update using (true) with check (true);

drop policy if exists "booking_rooms_select" on public.booking_rooms;
drop policy if exists "booking_rooms_insert" on public.booking_rooms;
drop policy if exists "booking_rooms_update" on public.booking_rooms;
create policy "booking_rooms_select" on public.booking_rooms for select using (true);
create policy "booking_rooms_insert" on public.booking_rooms for insert with check (true);
create policy "booking_rooms_update" on public.booking_rooms for update using (true) with check (true);

drop policy if exists "guest_payments_select" on public.guest_payments;
drop policy if exists "guest_payments_insert" on public.guest_payments;
drop policy if exists "guest_payments_update" on public.guest_payments;
create policy "guest_payments_select" on public.guest_payments for select using (true);
create policy "guest_payments_insert" on public.guest_payments for insert with check (true);
create policy "guest_payments_update" on public.guest_payments for update using (true) with check (true);

drop policy if exists "guest_edits_select" on public.guest_edits;
drop policy if exists "guest_edits_insert" on public.guest_edits;
create policy "guest_edits_select" on public.guest_edits for select using (true);
create policy "guest_edits_insert" on public.guest_edits for insert with check (true);
-- deliberately NO update/delete policy for guest_edits — the log is append-only

-- anon key may read, lock (insert), and unlock/re-lock (update) a night —
-- but never delete a row, same "no DELETE grant" posture as everything else.
drop policy if exists "locked_days_select" on public.locked_days;
drop policy if exists "locked_days_insert" on public.locked_days;
drop policy if exists "locked_days_update" on public.locked_days;
create policy "locked_days_select" on public.locked_days for select using (true);
create policy "locked_days_insert" on public.locked_days for insert with check (true);
create policy "locked_days_update" on public.locked_days for update using (true) with check (true);

-- Deliberately no policies on public.users for anon/authenticated — every
-- read of this table happens only inside the security-definer
-- check_login_role() function, never directly from the app.

-- No DELETE policy anywhere on purpose — see GRANTS below.

-- ---------- GRANTS ----------
grant usage on schema public to anon, authenticated;

grant select, insert, update on public.guests to anon, authenticated;
grant select, insert, update on public.booking_rooms to anon, authenticated;
grant select, insert, update on public.guest_payments to anon, authenticated;
grant select, insert on public.guest_edits to anon, authenticated;
grant select, insert, update on public.locked_days to anon, authenticated;

grant select on public.guests_active, public.booking_rooms_active, public.guest_payments_active to anon, authenticated;
-- *_deleted views stay ungranted — admin recovery only, from the SQL Editor.

grant execute on function public.soft_delete_guest(text, text) to anon, authenticated;
grant execute on function public.soft_delete_booking_room(text, text) to anon, authenticated;
grant execute on function public.soft_delete_guest_payment(text, text) to anon, authenticated;
grant execute on function public.check_login_role(text, text) to anon, authenticated;
-- restore_* stay ungranted to anon/authenticated — recovery is admin-only.
-- public.users itself stays ungranted — only reachable through check_login_role().

-- ---------- SEED ACCOUNTS ----------
-- Same accounts as the parent app, so the login screen works unchanged.
-- If it already exists its password is left alone — only the role is set.
insert into public.users (username, password_hash, role)
values ('accountant@riviera', crypt('riviera10', gen_salt('bf')), 'admin')
on conflict (username) do update set role = 'admin';

-- CHANGE THIS PASSWORD after first run:
--   update public.users set password_hash = crypt('new-password', gen_salt('bf'))
--   where username = 'staff@riviera';
insert into public.users (username, password_hash, role)
values ('staff@riviera', crypt('staff10', gen_salt('bf')), 'staff')
on conflict (username) do nothing;

-- To add more accounts later, from the SQL Editor:
--   insert into public.users (username, password_hash, role)
--   values ('name@riviera', crypt('their-password', gen_salt('bf')), 'staff');  -- or 'admin'
-- To change someone's role:
--   update public.users set role = 'admin' where username = 'name@riviera';

-- ---------- REALTIME ----------
-- Changes made on one device show up on every other device instantly (the
-- app also polls every 5 seconds as a guarantee, so this is a nice-to-have,
-- not a hard requirement). Safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guests') then
    alter publication supabase_realtime add table public.guests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'booking_rooms') then
    alter publication supabase_realtime add table public.booking_rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guest_payments') then
    alter publication supabase_realtime add table public.guest_payments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guest_edits') then
    alter publication supabase_realtime add table public.guest_edits;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'locked_days') then
    alter publication supabase_realtime add table public.locked_days;
  end if;
end $$;

-- =========================================================================
-- CONFIRM EVERYTHING — read-only health check, safe to run any time.
-- Expected result: every row shows t (true). Any f tells you exactly
-- what's missing.
-- =========================================================================
with checks(ord, name, ok) as (
  select  1, 'table: guests',            to_regclass('public.guests') is not null
  union all select  2, 'table: booking_rooms',     to_regclass('public.booking_rooms') is not null
  union all select  3, 'table: guest_payments',    to_regclass('public.guest_payments') is not null
  union all select  4, 'table: guest_edits (audit log)', to_regclass('public.guest_edits') is not null
  union all select  5, 'table: locked_days (night audit)', to_regclass('public.locked_days') is not null
  union all select  6, 'table: users',             to_regclass('public.users') is not null
  union all select  7, 'column: guests.res_status',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='guests' and column_name='res_status')
  union all select  8, 'column: booking_rooms.moved_out_date',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='booking_rooms' and column_name='moved_out_date')
  union all select  9, 'column: locked_days.audit_summary',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='locked_days' and column_name='audit_summary')
  union all select 10, 'view: guests_active',        to_regclass('public.guests_active') is not null
  union all select 11, 'view: booking_rooms_active', to_regclass('public.booking_rooms_active') is not null
  union all select 12, 'view: guest_payments_active',to_regclass('public.guest_payments_active') is not null
  union all select 13, 'function: check_login_role()',         to_regprocedure('public.check_login_role(text,text)') is not null
  union all select 14, 'function: soft_delete_guest()',        to_regprocedure('public.soft_delete_guest(text,text)') is not null
  union all select 15, 'function: soft_delete_booking_room()', to_regprocedure('public.soft_delete_booking_room(text,text)') is not null
  union all select 16, 'function: soft_delete_guest_payment()',to_regprocedure('public.soft_delete_guest_payment(text,text)') is not null
  union all select 17, 'function: set_updated_at()',           to_regprocedure('public.set_updated_at()') is not null
  union all select 18, 'account: admin exists', exists (select 1 from public.users where role = 'admin')
  union all select 19, 'account: staff exists', exists (select 1 from public.users where role = 'staff')
  union all select 20, 'RLS on: guests',        (select relrowsecurity from pg_class where oid = 'public.guests'::regclass)
  union all select 21, 'RLS on: booking_rooms', (select relrowsecurity from pg_class where oid = 'public.booking_rooms'::regclass)
  union all select 22, 'RLS on: guest_payments',(select relrowsecurity from pg_class where oid = 'public.guest_payments'::regclass)
  union all select 23, 'RLS on: guest_edits',   (select relrowsecurity from pg_class where oid = 'public.guest_edits'::regclass)
  union all select 24, 'RLS on: locked_days',   (select relrowsecurity from pg_class where oid = 'public.locked_days'::regclass)
  union all select 25, 'RLS on: users',         (select relrowsecurity from pg_class where oid = 'public.users'::regclass)
  union all select 26, 'realtime: guests',         exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='guests')
  union all select 27, 'realtime: locked_days',    exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='locked_days')
)
select ord, name, case when ok then '✓ OK' else '✗ MISSING' end as status
from checks
order by ord;

-- =========================================================================
-- Done. Recovery cheat-sheet (SQL Editor):
--   select * from public.guests_deleted order by deleted_at desc;
--   select public.restore_guest('<id>');
--   select * from public.booking_rooms_deleted;   select public.restore_booking_room('<id>');
--   select * from public.guest_payments_deleted;  select public.restore_guest_payment('<id>');
--   update public.locked_days set unlocked_at = null, unlocked_by = null where lock_date = '<date>'; -- force-reopen
--
-- NEXT STEPS after running this:
--   1. Project Settings -> API -> copy Project URL + anon public key into
--      SUPABASE_URL / SUPABASE_ANON_KEY in js/app-cloud-core.js.
--   2. Change the staff@riviera password (see the SEED ACCOUNTS section
--      above) before handing out real logins.
--
-- This file consolidates, for a brand-new project, everything the parent
-- app's migration history built up over time: new_system_schema.sql,
-- add_edit_tracking.sql, stay_dates_per_guest.sql (all superseded/merged
-- in here), plus this app's own migration/lock_days.sql,
-- migration/room_moved_out_date.sql, migration/soft_delete_guest.sql,
-- migration/reservation_status.sql, migration/night_audit_summary.sql.
-- Those files are still what an EXISTING project with real data should run
-- incrementally — this file is only for standing up a new one from zero.
-- =========================================================================
