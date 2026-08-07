-- The original schema restricted booking_rooms.unit_type to only '', 'Room',
-- or 'Apartment'. That's too narrow now that a room booked as N/A (undecided
-- which physical unit) can carry a hand-picked Type instead — "River View",
-- "Mountain View", "Couple Suite", "VIP Deluxe", "2 Bed Apartment", "3 Bed
-- Apartment". Saving one of those was silently rejected by this check
-- constraint, which the app surfaced as a generic "couldn't save to the
-- cloud database" error — easy to mistake for a connectivity problem, but
-- it was actually the database refusing the row outright.
--
-- Drops the restrictive check entirely — the app's own Type dropdown
-- already governs what values get entered, so the database doesn't need
-- to duplicate that whitelist. Safe to re-run.

alter table public.booking_rooms drop constraint if exists booking_rooms_unit_type_check;
