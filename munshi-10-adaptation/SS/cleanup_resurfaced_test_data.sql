-- One-off cleanup: removes the 3 leftover test entries that resurfaced from
-- old browser localStorage into the new (otherwise empty) Supabase project.
-- Run in the NEW project's SQL Editor only. Not part of the app's normal
-- migration set — delete this file once you've run it.

-- STEP 1 — review first. Confirm this is exactly the 3 rows you expect
-- ("23" and two "wali" entries, CNIC 3410141852561) before deleting anything.
select id, guest_name, father_name, cnic, saved_at
from public.guests
where guest_name in ('23', 'wali')
order by saved_at;

-- STEP 2 — once STEP 1 looks right, uncomment and run this block.
-- booking_rooms and guest_payments both have `on delete cascade` on
-- guest_id, so deleting the guest row removes its rooms/payments too.
-- This is a real DELETE, not the app's soft-delete — permanent, no
-- restore. Safe here only because this project is brand new.

-- delete from public.guests
-- where guest_name in ('23', 'wali');
