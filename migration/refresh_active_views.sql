-- booking_rooms_active/guests_active/guest_payments_active are `select *`
-- views, but Postgres freezes a view's column list at CREATE (OR REPLACE)
-- time — it does NOT auto-pick-up columns added to the underlying table
-- afterwards (contrary to the claim in room_moved_out_date.sql). Every
-- column added to booking_rooms after these views were last (re)created —
-- adults, children, breakfast_adults, breakfast_children — is therefore
-- invisible to the app's own reads (index.html queries booking_rooms_active,
-- never booking_rooms directly), even though the data is saved correctly in
-- the real table. Re-issuing CREATE OR REPLACE VIEW regenerates the column
-- list against the table's current shape. No data is touched — this only
-- redefines what the view exposes. Safe to re-run.

create or replace view public.guests_active as
  select * from public.guests where deleted_at is null;

create or replace view public.booking_rooms_active as
  select * from public.booking_rooms where deleted_at is null;

create or replace view public.guest_payments_active as
  select * from public.guest_payments where deleted_at is null;

grant select on public.guests_active, public.booking_rooms_active, public.guest_payments_active to anon, authenticated;
