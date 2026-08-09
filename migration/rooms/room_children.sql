-- Per-room Children, alongside the existing per-room Adults (room_adults.sql).
-- Adults/Children have moved off the guest entry itself and onto each room
-- row, so a booking split across rooms can log a different headcount per
-- room. Stored as text (matches the "N/A" / blank convention used
-- elsewhere) rather than an integer.
-- Safe to re-run.

alter table public.booking_rooms
  add column if not exists children text;
