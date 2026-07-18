-- =========================================================================
-- Riviera Resort Naran — Payment Tracker
-- Supabase (Postgres) schema — v2 (text ids)
-- =========================================================================
-- This replaces the first draft: ids are now TEXT instead of UUID, because
-- the app generates its own row ids in the browser (has done since before
-- Supabase existed) and those ids are not in UUID format. Using TEXT means
-- every row the app has ever created — old or new — can sync as-is, no
-- conversion needed.
--
-- HOW TO USE
--   1. Open your Supabase project -> SQL Editor -> New query.
--   2. Paste this whole file and click "Run".
--   3. This DROPS and recreates entries / payments / expected_totals if
--      they already exist (from the earlier uuid-based version of this
--      file). That's safe right now because the project is brand new —
--      if you've already put real guest data into these tables by hand,
--      STOP and tell me first instead of running this.
--
-- WHAT THIS GIVES YOU
--   - Nothing is ever hard-deleted. "Delete" in the app calls
--     soft_delete_entry(...), which stamps deleted_at instead of removing
--     the row. The app's API key is never granted DELETE at all, so a
--     hard delete isn't possible from the app no matter what.
--   - Recovery: Supabase SQL Editor ->
--         select * from public.entries_deleted order by deleted_at desc;
--         select public.restore_entry('<the id you want back>');
--     brings the row and its payment history back.
--
-- SECURITY NOTE
--   The Project URL and the "anon" / "publishable" key are meant to be
--   embedded in the client (that's what they're for). Never put the
--   "service_role" / "secret" key in the HTML file — that key bypasses
--   every protection this script sets up.
-- =========================================================================

create extension if not exists pgcrypto;

drop table if exists public.payments cascade;
drop table if exists public.entries cascade;
drop table if exists public.expected_totals cascade;
drop table if exists public.users cascade;

-- ---------- TABLE: entries ----------
create table public.entries (
  id text primary key,
  sr integer not null,
  room text not null default '',
  guest_name text not null default '',
  check_in date,
  entry_date date not null,
  entry_type text not null default 'payment' check (entry_type in ('payment', 'advance')),
  room_rent numeric(12,2) not null default 0,
  cash_received numeric(12,2) not null default 0,
  account_received numeric(12,2) not null default 0,
  advance_cash numeric(12,2) not null default 0,
  advance_account numeric(12,2) not null default 0,
  remarks text not null default '',
  check_out_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);

comment on column public.entries.deleted_at is
  'Soft delete marker. NULL = active/visible. Set by soft_delete_entry(), cleared by restore_entry(). Never hard-deleted.';

-- ---------- TABLE: payments ----------
create table public.payments (
  id text primary key,
  entry_id text not null references public.entries(id) on delete cascade,
  payment_date date not null,
  cash numeric(12,2) not null default 0,
  account numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);

comment on column public.payments.deleted_at is
  'Soft delete marker, same convention as entries.deleted_at.';

-- ---------- TABLE: expected_totals ----------
create table public.expected_totals (
  expected_date date primary key,
  expected_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create trigger trg_entries_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create trigger trg_expected_totals_updated_at
  before update on public.expected_totals
  for each row execute function public.set_updated_at();

-- ---------- INDEXES ----------
create index idx_entries_entry_date on public.entries (entry_date);
create index idx_entries_room on public.entries (room);
create index idx_entries_deleted_at on public.entries (deleted_at);
create index idx_payments_entry_id on public.payments (entry_id);
create index idx_payments_payment_date on public.payments (payment_date);
create index idx_payments_deleted_at on public.payments (deleted_at);

-- ---------- SOFT DELETE / RESTORE FUNCTIONS ----------
create or replace function public.soft_delete_entry(p_entry_id text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.entries
     set deleted_at = now(), deleted_reason = p_reason
   where id = p_entry_id and deleted_at is null;

  update public.payments
     set deleted_at = now(), deleted_reason = 'parent entry deleted'
   where entry_id = p_entry_id and deleted_at is null;
end;
$$;

create or replace function public.restore_entry(p_entry_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.entries
     set deleted_at = null, deleted_reason = null
   where id = p_entry_id;

  update public.payments
     set deleted_at = null, deleted_reason = null
   where entry_id = p_entry_id;
end;
$$;

create or replace function public.soft_delete_payment(p_payment_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payments
     set deleted_at = now()
   where id = p_payment_id and deleted_at is null;
end;
$$;

create or replace function public.restore_payment(p_payment_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payments set deleted_at = null where id = p_payment_id;
end;
$$;

-- ---------- CONVENIENCE VIEWS ----------
create or replace view public.entries_active as
  select * from public.entries where deleted_at is null;

create or replace view public.payments_active as
  select * from public.payments where deleted_at is null;

create or replace view public.entries_deleted as
  select * from public.entries where deleted_at is not null order by deleted_at desc;

create or replace view public.payments_deleted as
  select * from public.payments where deleted_at is not null order by deleted_at desc;

-- ---------- ROW LEVEL SECURITY ----------
alter table public.entries enable row level security;
alter table public.payments enable row level security;
alter table public.expected_totals enable row level security;

create policy "entries_select" on public.entries for select using (true);
create policy "entries_insert" on public.entries for insert with check (true);
create policy "entries_update" on public.entries for update using (true) with check (true);

create policy "payments_select" on public.payments for select using (true);
create policy "payments_insert" on public.payments for insert with check (true);
create policy "payments_update" on public.payments for update using (true) with check (true);

create policy "expected_totals_select" on public.expected_totals for select using (true);
create policy "expected_totals_insert" on public.expected_totals for insert with check (true);
create policy "expected_totals_update" on public.expected_totals for update using (true) with check (true);

-- No DELETE policy anywhere on purpose — see GRANTS below.

-- ---------- GRANTS ----------
grant usage on schema public to anon, authenticated;

grant select, insert, update on public.entries to anon, authenticated;
grant select, insert, update on public.payments to anon, authenticated;
grant select, insert, update on public.expected_totals to anon, authenticated;

grant select on public.entries_active, public.payments_active to anon, authenticated;
-- entries_deleted / payments_deleted stay ungranted — only visible from
-- the Supabase dashboard (SQL Editor / Table Editor) as the project owner.

grant execute on function public.soft_delete_entry(text, text) to anon, authenticated;
grant execute on function public.soft_delete_payment(text) to anon, authenticated;
-- restore_entry / restore_payment stay ungranted to anon/authenticated —
-- recovery is admin-only, from the SQL Editor. Say the word if you'd
-- rather the app itself have a self-serve "Undo delete" button.

-- =========================================================================
-- LOGIN — a plain users table, not Supabase Auth (by request, for now).
-- The table itself is never readable via the API — RLS is on with no
-- policies at all, so anon/authenticated get zero direct access to it,
-- password hashes included. The ONLY way in is the check_login()
-- function below: it looks up the row itself (as the function owner,
-- bypassing RLS) and returns just true/false — the password hash never
-- leaves the database.
-- =========================================================================
create table public.users (
  username text primary key,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
-- Deliberately no policies and no grants on this table for anon/authenticated.

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

-- The one account you asked for. Re-running this file updates the
-- password if you ever change it here.
insert into public.users (username, password_hash)
values ('accountant@riviera', crypt('riviera10', gen_salt('bf')))
on conflict (username) do update set password_hash = excluded.password_hash;

-- To add another account later, from the SQL Editor:
--   insert into public.users (username, password_hash)
--   values ('newuser@riviera', crypt('their-password', gen_salt('bf')));
-- To change a password:
--   update public.users set password_hash = crypt('new-password', gen_salt('bf'))
--   where username = 'accountant@riviera';

-- =========================================================================
-- Done.
-- =========================================================================
