-- =========================================================================
-- Check-in / Check-out dates live on the GUEST ENTRY, not per room — run
-- once. Guests always stay consecutively under one record, so one pair of
-- dates per entry is right. Reference only: never used in any calculation.
--
-- This REPLACES add_room_stay_dates.sql (per-room was the wrong level).
-- Safe whether or not that one was ever run: it adds the guest columns and
-- removes the per-room ones if they exist (they never held real data).
-- =========================================================================

alter table public.guests add column if not exists check_in date;
alter table public.guests add column if not exists check_out date;

comment on column public.guests.check_in is
  'Stay start, reference only — never used in any calculation.';
comment on column public.guests.check_out is
  'Stay end, reference only — never used in any calculation.';

alter table public.booking_rooms drop column if exists check_in;
alter table public.booking_rooms drop column if exists check_out;
