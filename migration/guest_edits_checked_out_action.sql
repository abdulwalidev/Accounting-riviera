-- guest_edits.action has a CHECK constraint listing every allowed audit
-- action — the Auto Checkout / Extend page's checkout flow logs a new
-- 'checked_out' action that isn't in that list yet, so every checkout is
-- currently rejected by the database (400, "violates check constraint
-- guest_edits_action_check") and stuck retrying forever. This adds
-- 'checked_out' to the allowed list; everything else stays the same.
-- Safe to re-run.

alter table public.guest_edits drop constraint if exists guest_edits_action_check;
alter table public.guest_edits add constraint guest_edits_action_check
  check (action in ('created', 'edited', 'payment_added', 'res_cancelled', 'res_no_show', 'res_reactivated', 'checked_out'));
