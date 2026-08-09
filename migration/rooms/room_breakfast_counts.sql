-- Per-room Breakfast Adults / Breakfast Children: how many of that room's
-- Adults/Children actually take breakfast, separate from the room's own
-- Adults/Children totals. Same text-column convention as room_adults.sql /
-- room_children.sql (mandatory on the form, but stored as text there too).
-- Safe to re-run.

alter table public.booking_rooms
  add column if not exists breakfast_adults text;

alter table public.booking_rooms
  add column if not exists breakfast_children text;
