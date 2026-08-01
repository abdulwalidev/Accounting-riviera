-- Reservation status: lets front desk mark a booking Cancelled or No-show,
-- distinct from a normal active reservation. NULL = active (the default —
-- every existing row already reads this way with no backfill needed).
-- guests_active is `select *`, so it picks up the new column automatically,
-- same pattern as room_moved_out_date.sql. Safe to re-run.

alter table public.guests
  add column if not exists res_status text
  check (res_status is null or res_status in ('cancelled', 'no_show'));
