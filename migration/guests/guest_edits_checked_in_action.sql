-- guest_edits.action has a CHECK constraint listing every allowed audit
-- action — the Arrival page's check-in confirmation logs a 'checked_in'
-- action that isn't in that list yet, so every check-in's audit row is
-- rejected by the database (400, "violates check constraint
-- guest_edits_action_check") and stuck retrying forever. This adds
-- 'checked_in' to the allowed list; everything else stays the same.
-- No data is touched. Safe to re-run.

alter table public.guest_edits drop constraint if exists guest_edits_action_check;
alter table public.guest_edits add constraint guest_edits_action_check
  check (action in ('created', 'edited', 'payment_added', 'res_cancelled', 'res_no_show', 'res_reactivated', 'checked_out', 'checked_in'));
