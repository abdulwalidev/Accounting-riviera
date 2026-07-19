-- =========================================================================
-- ADD "updated by" TRACKING to the new system — run once in the SQL Editor.
-- =========================================================================
-- Purely additive: no drops, nothing existing is touched. Safe on the live
-- database. (new_system_schema.sql now includes all of this too, but that
-- file DROPS the tables — never re-run it on live data; run THIS instead.)
--
-- WHAT THIS ADDS
--   - guests.saved_by / guests.edited_by  — who created / last edited
--   - guest_payments.created_by           — who took each payment
--   - guest_edits                         — append-only change log: one row
--     per action (entry created / entry edited / payment added) with the
--     account username + role. Nobody can update or delete log rows via
--     the API — not even the app itself.
-- =========================================================================

alter table public.guests add column if not exists saved_by text not null default '';
alter table public.guests add column if not exists edited_by text not null default '';
alter table public.guest_payments add column if not exists created_by text not null default '';

create table if not exists public.guest_edits (
  id text primary key,
  guest_id text not null,
  username text not null default '',
  role text not null default '',
  action text not null default 'edited' check (action in ('created', 'edited', 'payment_added')),
  at timestamptz not null default now()
);

comment on table public.guest_edits is
  'Append-only audit log. No UPDATE/DELETE is granted to the API at all, so history can never be rewritten from the app.';

create index if not exists idx_guest_edits_guest_id on public.guest_edits (guest_id);
create index if not exists idx_guest_edits_at on public.guest_edits (at);

alter table public.guest_edits enable row level security;

drop policy if exists "guest_edits_select" on public.guest_edits;
drop policy if exists "guest_edits_insert" on public.guest_edits;
create policy "guest_edits_select" on public.guest_edits for select using (true);
create policy "guest_edits_insert" on public.guest_edits for insert with check (true);
-- deliberately NO update and NO delete policy — the log is append-only

grant select, insert on public.guest_edits to anon, authenticated;

-- Realtime for the audit log, so the Change History panel updates on other
-- devices instantly instead of on the next 5-second poll. Safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guest_edits') then
    alter publication supabase_realtime add table public.guest_edits;
  end if;
end $$;

-- =========================================================================
-- Done. The app writes to these automatically from now on; rows saved
-- before today simply show no name.
-- =========================================================================
