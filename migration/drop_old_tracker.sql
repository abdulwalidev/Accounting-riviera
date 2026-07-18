-- =========================================================================
-- DELETE the OLD payment tracker's tables from Supabase.
-- =========================================================================
-- ⚠ Run this ONLY after checking the backup taken on 2026-07-19:
--     backup/old-tracker-backup-2026-07-19/
--       entries.json / .csv        (547 rows, incl. 10 soft-deleted)
--       payments.json / .csv       (7 rows)
--       expected_totals.json / .csv (1 row)
--       restore_data.sql           (re-insert everything if ever needed)
--
-- After this runs, the OLD app (the root index.html) can no longer load or
-- save — it is retired. The NEW system is completely unaffected.
--
-- WHAT THIS KEEPS (shared with the new system — do not remove):
--   - users table            (login accounts for the new system)
--   - check_login()          (harmless; also lets the old app still log in
--                             gracefully to show its "can't load" state)
--   - check_login_role()     (new system login)
--   - set_updated_at()       (trigger function used by the NEW tables too)
--   - guests / booking_rooms / guest_payments and everything theirs
--
-- WHAT THIS REMOVES:
--   - entries, payments, expected_totals (tables + their data + views +
--     triggers + realtime publication membership, via cascade)
--   - the old tracker's soft-delete/restore functions
--
-- To ever bring the old data back:
--   1. run migration/supabase_schema.sql   (recreates the empty tables;
--      NOTE: review its users section first — it resets the accountant
--      password and predates the role column)
--   2. run backup/old-tracker-backup-2026-07-19/restore_data.sql
-- =========================================================================

drop table if exists public.payments cascade;
drop table if exists public.entries cascade;
drop table if exists public.expected_totals cascade;

drop function if exists public.soft_delete_entry(text, text);
drop function if exists public.restore_entry(text);
drop function if exists public.soft_delete_payment(text);
drop function if exists public.restore_payment(text);

-- =========================================================================
-- Done. The dashboard's Table Editor should now show only:
--   guests, booking_rooms, guest_payments, users
-- =========================================================================
