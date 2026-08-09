-- POS Day Lock — mirrors the hotel's own locked_days table/flow exactly
-- (lock_date/locked_by/locked_at/unlocked_by/unlocked_at, explicit
-- lock/unlock actions with a typed LOCK/UNLOCK confirm), but kept as its
-- own table rather than reusing locked_days so POS and hotel data stay
-- fully isolated, per the existing pos_* convention.
-- Safe to re-run.

create table if not exists public.pos_locked_days (
  lock_date date primary key,
  locked_by text,
  locked_at timestamptz,
  unlocked_by text,
  unlocked_at timestamptz
);

alter table public.pos_locked_days enable row level security;

-- anon key may read, lock (insert), and unlock/re-lock (update) — but never
-- delete a row, same "no DELETE grant" posture as locked_days and the rest
-- of the pos_* schema.
drop policy if exists "pos_locked_days_select" on public.pos_locked_days;
drop policy if exists "pos_locked_days_insert" on public.pos_locked_days;
drop policy if exists "pos_locked_days_update" on public.pos_locked_days;
create policy "pos_locked_days_select" on public.pos_locked_days for select using (true);
create policy "pos_locked_days_insert" on public.pos_locked_days for insert with check (true);
create policy "pos_locked_days_update" on public.pos_locked_days for update using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pos_locked_days'
  ) then
    alter publication supabase_realtime add table public.pos_locked_days;
  end if;
end $$;
