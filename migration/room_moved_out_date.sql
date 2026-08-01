-- "Change Room" feature: each booking_rooms row can now carry the date the
-- guest left THAT specific room, so Room Detail can tell a genuine room
-- change (old room vacated, new room occupied) apart from two rooms booked
-- at the same time under one entry. booking_rooms_active is `select *`, so
-- it picks up the new column automatically — no view change needed.
-- Safe to re-run.

alter table public.booking_rooms
  add column if not exists moved_out_date date;
