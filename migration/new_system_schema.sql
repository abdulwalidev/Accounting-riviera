-- =========================================================================
-- Guest Entry System ("new system/") — Supabase (Postgres) schema
-- =========================================================================
-- Runs in the SAME Supabase project as the old payment tracker. It only
-- creates NEW tables (guests / booking_rooms / guest_payments) next to the
-- old ones (entries / payments / expected_totals), so both apps share one
-- dashboard and the existing users row keeps working.
--
-- HOW TO USE
--   1. Open the Supabase project -> SQL Editor -> New query.
--   2. Paste this whole file and click "Run". Safe to re-run.
--   3. This DROPS and recreates guests / booking_rooms / guest_payments if
--      they already exist. That's safe while the new system has no real
--      cloud data yet — if real guest data is already in these tables,
--      STOP and say so first instead of running this.
--
-- Same conventions as the old v2 schema:
--   - TEXT ids (the browser generates its own row ids).
--   - Nothing is ever hard-deleted: "delete" stamps deleted_at via a
--     security-definer function; the anon key is never granted DELETE.
--   - *_active views are what the app reads; *_deleted views are for
--     admin recovery from the SQL Editor only.
--   - check_login() + private users table (bcrypt via pgcrypto; the hash
--     never leaves the database).
-- =========================================================================

create extension if not exists pgcrypto;

drop table if exists public.guest_edits cascade;
drop table if exists public.guest_payments cascade;
drop table if exists public.booking_rooms cascade;
drop table if exists public.guests cascade;

-- ---------- TABLE: guests ----------
-- One row per guest ENTRY (a stay/booking), not per unique person — the
-- app deliberately allows a returning guest (same CNIC) to be saved as a
-- new entry after a confirmation prompt.
create table public.guests (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);

comment on column public.guests.deleted_at is
  'Soft delete marker. NULL = active/visible. Set by soft_delete_guest(), cleared by restore_guest(). Never hard-deleted.';

-- ---------- TABLE: booking_rooms ----------
create table public.booking_rooms (
  id text primary key,
  guest_id text not null references public.guests(id) on delete cascade,
  room_no text not null default '',
  unit_type text not null default '' check (unit_type in ('', 'Room', 'Apartment')),
  rent_per_day numeric(12,2) not null default 0,
  days_count integer not null default 1,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);

comment on column public.booking_rooms.deleted_at is
  'Soft delete marker, same convention as guests.deleted_at. Also stamped when a room row is removed while editing an entry.';

-- ---------- TABLE: guest_payments ----------
create table public.guest_payments (
  id text primary key,
  guest_id text not null references public.guests(id) on delete cascade,
  payment_date date not null,
  pay_type text not null default 'Other',
  mode text not null default 'Cash' check (mode in ('Cash', 'Bank Transfer', 'Card')),
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
-- One row per action (entry created / entry edited / payment added) with
-- the signed-in account's username + role. No UPDATE/DELETE is granted to
-- the API at all, so history can never be rewritten from the app.
create table public.guest_edits (
  id text primary key,
  guest_id text not null,
  username text not null default '',
  role text not null default '',
  action text not null default 'edited' check (action in ('created', 'edited', 'payment_added')),
  at timestamptz not null default now()
);

comment on table public.guest_edits is
  'Append-only audit log. No UPDATE/DELETE is granted to the API at all, so history can never be rewritten from the app.';

-- ---------- updated_at AUTO-STAMP ----------
-- set_updated_at() already exists in this project (old schema); recreate
-- defensively so this file also works in a fresh project.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_guests_updated_at
  before update on public.guests
  for each row execute function public.set_updated_at();

create trigger trg_booking_rooms_updated_at
  before update on public.booking_rooms
  for each row execute function public.set_updated_at();

create trigger trg_guest_payments_updated_at
  before update on public.guest_payments
  for each row execute function public.set_updated_at();

-- ---------- INDEXES ----------
create index idx_guests_cnic on public.guests (cnic);
create index idx_guests_saved_at on public.guests (saved_at);
create index idx_guests_deleted_at on public.guests (deleted_at);
create index idx_booking_rooms_guest_id on public.booking_rooms (guest_id);
create index idx_booking_rooms_deleted_at on public.booking_rooms (deleted_at);
create index idx_guest_payments_guest_id on public.guest_payments (guest_id);
create index idx_guest_payments_date on public.guest_payments (payment_date);
create index idx_guest_payments_deleted_at on public.guest_payments (deleted_at);
create index idx_guest_edits_guest_id on public.guest_edits (guest_id);
create index idx_guest_edits_at on public.guest_edits (at);

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

create policy "guests_select" on public.guests for select using (true);
create policy "guests_insert" on public.guests for insert with check (true);
create policy "guests_update" on public.guests for update using (true) with check (true);

create policy "booking_rooms_select" on public.booking_rooms for select using (true);
create policy "booking_rooms_insert" on public.booking_rooms for insert with check (true);
create policy "booking_rooms_update" on public.booking_rooms for update using (true) with check (true);

create policy "guest_payments_select" on public.guest_payments for select using (true);
create policy "guest_payments_insert" on public.guest_payments for insert with check (true);
create policy "guest_payments_update" on public.guest_payments for update using (true) with check (true);

alter table public.guest_edits enable row level security;
create policy "guest_edits_select" on public.guest_edits for select using (true);
create policy "guest_edits_insert" on public.guest_edits for insert with check (true);
-- deliberately NO update policy for guest_edits — the log is append-only

-- No DELETE policy anywhere on purpose — see GRANTS below.

-- ---------- GRANTS ----------
grant usage on schema public to anon, authenticated;

grant select, insert, update on public.guests to anon, authenticated;
grant select, insert, update on public.booking_rooms to anon, authenticated;
grant select, insert, update on public.guest_payments to anon, authenticated;
grant select, insert on public.guest_edits to anon, authenticated;

grant select on public.guests_active, public.booking_rooms_active, public.guest_payments_active to anon, authenticated;
-- *_deleted views stay ungranted — admin recovery only, from the dashboard.

grant execute on function public.soft_delete_guest(text, text) to anon, authenticated;
grant execute on function public.soft_delete_booking_room(text, text) to anon, authenticated;
grant execute on function public.soft_delete_guest_payment(text, text) to anon, authenticated;
-- restore_* stay ungranted to anon/authenticated — recovery is admin-only.

-- ---------- LOGIN (shared with the old tracker) ----------
-- The users table + check_login() already exist if the old schema ran in
-- this project; these idempotent statements make this file self-sufficient
-- for a fresh project too, without touching existing accounts.
--
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

-- projects that ran the old schema have a users table without the role
-- column — add it in place, existing accounts default to 'staff'
alter table public.users add column if not exists role text not null default 'staff';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_role_check') then
    alter table public.users add constraint users_role_check check (role in ('admin', 'staff'));
  end if;
end $$;

alter table public.users enable row level security;
-- Deliberately no policies and no grants on this table for anon/authenticated.

-- Old tracker keeps calling this; unchanged on purpose.
create or replace function public.check_login(p_username text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select password_hash into v_hash from public.users where username = p_username;
  if v_hash is null then
    return false;
  end if;
  return v_hash = crypt(p_password, v_hash);
end;
$$;

grant execute on function public.check_login(text, text) to anon, authenticated;

-- New system calls this: returns the account's role ('admin' / 'staff') on
-- a correct password, NULL on a wrong one. The hash still never leaves the
-- database, and a caller can't tell "no such user" from "wrong password".
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

grant execute on function public.check_login_role(text, text) to anon, authenticated;

-- The admin account. If it already exists its password is left alone —
-- only the role is set.
insert into public.users (username, password_hash, role)
values ('accountant@riviera', crypt('riviera10', gen_salt('bf')), 'admin')
on conflict (username) do update set role = 'admin';

-- A staff account (no editing mode). CHANGE THIS PASSWORD after first run:
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
-- Changes made on one device show up on every other device instantly
-- (the app also polls every 5 seconds as a guarantee). Safe to re-run.
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
end $$;

-- =========================================================================
-- Done. Recovery cheat-sheet (SQL Editor):
--   select * from public.guests_deleted order by deleted_at desc;
--   select public.restore_guest('<id>');
--   select * from public.booking_rooms_deleted;   select public.restore_booking_room('<id>');
--   select * from public.guest_payments_deleted;  select public.restore_guest_payment('<id>');
-- =========================================================================
