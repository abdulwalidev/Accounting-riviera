-- Room housekeeping status: Ready(Vacant) / Dirty / OOO, tracked per room
-- and completely separate from booking occupancy (Occupied/Extended, which
-- is still computed live from check-in + nights and never touches this
-- table). A confirmed checkout flips a room to Dirty (never straight to
-- Vacant) — staff mark it Vacant again once it's actually been cleaned.
-- Re-extending a guest (undoing an accidental checkout) deletes this row
-- outright, which is why delete is allowed here — this table is current
-- state, not an audit log. Run this once in the Supabase SQL Editor.
-- Safe to re-run (including re-running after the first version of this
-- file, which didn't have the delete policy).

create table if not exists room_status (
  room_no text primary key,
  status text not null default 'Ready' check (status in ('Ready', 'Dirty', 'OOO')),
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table room_status enable row level security;

drop policy if exists "room_status_select" on room_status;
drop policy if exists "room_status_insert" on room_status;
drop policy if exists "room_status_update" on room_status;
drop policy if exists "room_status_delete" on room_status;

create policy "room_status_select" on room_status for select using (true);
create policy "room_status_insert" on room_status for insert with check (true);
create policy "room_status_update" on room_status for update using (true) with check (true);
create policy "room_status_delete" on room_status for delete using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_status'
  ) then
    alter publication supabase_realtime add table room_status;
  end if;
end $$;
