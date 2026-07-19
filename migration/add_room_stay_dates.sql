-- =========================================================================
-- ADD reference-only Check-in / Check-out dates to room rows — run once.
-- Purely additive, safe on the live database. These dates are for the
-- record only: rent math stays entirely on rent_per_day × days_count.
-- =========================================================================

alter table public.booking_rooms add column if not exists check_in date;
alter table public.booking_rooms add column if not exists check_out date;

comment on column public.booking_rooms.check_in is
  'Reference only — never used in any calculation.';
comment on column public.booking_rooms.check_out is
  'Reference only — never used in any calculation.';
