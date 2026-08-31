-- guest_edits.action has a CHECK constraint listing every allowed audit
-- action — the new per-room checkout ("Checkout Room/s" on Checkout/Pending)
-- logs a 'room_checked_out' action that isn't in that list yet, so the audit
-- row is rejected by the database (400, "violates check constraint
-- guest_edits_action_check") and the push queue retries it forever.
--
-- The guest data itself is NOT affected: pushPendingNow upserts the guests
-- row first and clears it from the queue before the guest_edits block runs,
-- so the room checkout saves either way. Only the audit line is lost, and
-- only until this runs. A refresh clears an already-stuck row.
--
-- Third time this constraint has needed widening (see the checked_in and
-- checked_out siblings) — if you add a new logGuestAction() value, add it
-- here in the same commit.
--
-- This adds 'room_checked_out'; everything else stays the same.
-- Safe to re-run.

alter table public.guest_edits drop constraint if exists guest_edits_action_check;
alter table public.guest_edits add constraint guest_edits_action_check
  check (action in ('created', 'edited', 'payment_added', 'res_cancelled', 'res_no_show', 'res_reactivated', 'checked_in', 'checked_out', 'room_checked_out'));
