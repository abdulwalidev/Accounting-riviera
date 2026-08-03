-- "Change Room" feature: each booking_rooms row can now carry the date the
-- guest left THAT specific room, so Room Detail can tell a genuine room
-- change (old room vacated, new room occupied) apart from two rooms booked
-- at the same time under one entry.
-- NOTE: booking_rooms_active is `select *`, but Postgres freezes a view's
-- column list at CREATE (OR REPLACE) time — it does NOT auto-expose columns
-- added to the table afterwards. Any new booking_rooms column (this one
-- included) needs refresh_active_views.sql re-run after adding it, or the
-- app (which reads through the view, not the table) will silently see it as
-- blank/null forever. That exact gap went unnoticed for adults/children/
-- breakfast_adults/breakfast_children until now.
-- Safe to re-run.

alter table public.booking_rooms
  add column if not exists moved_out_date date;
