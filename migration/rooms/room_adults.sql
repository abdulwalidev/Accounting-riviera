-- Per-room Adults: lets a booking split its headcount across rooms (e.g.
-- a group in 202 + 203 with a different adult count in each), separate
-- from the overall Adults/Children fields on the guest entry itself.
-- Stored as text (matches the "N/A" / blank convention used elsewhere)
-- rather than an integer.
-- Safe to re-run.

alter table public.booking_rooms
  add column if not exists adults text;
