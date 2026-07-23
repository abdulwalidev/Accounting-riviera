-- Day locks: once a date is locked, no NEW payment can be dated on it —
-- existing payments already saved on that date are left alone, only future
-- additions (Add Payment, or a new payment row in Guest Entry/Edit) are
-- blocked. Run this once in the Supabase SQL Editor.

create table if not exists locked_days (
  lock_date date primary key,
  locked_by text,
  locked_at timestamptz not null default now(),
  unlocked_by text,
  unlocked_at timestamptz
);

alter table locked_days enable row level security;

-- anon key may read, lock (insert), and unlock/re-lock (update) — but never
-- delete a row, same "no DELETE grant" posture as the rest of this schema.
create policy "locked_days_select" on locked_days for select using (true);
create policy "locked_days_insert" on locked_days for insert with check (true);
create policy "locked_days_update" on locked_days for update using (true) with check (true);

alter publication supabase_realtime add table locked_days;
