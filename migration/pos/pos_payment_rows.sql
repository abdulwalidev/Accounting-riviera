-- Per-row payment detail on pos_invoices — posOpenRecordInForm() only ever
-- had the aggregate paid/paid_cash/paid_account_transfer/paid_card totals
-- to work with, so reopening an invoice showed the payment list blank (or
-- stale, left over from whatever was previously open) and any payment row
-- defaulted its date to today instead of the invoice's own date. This
-- column stores the actual rows (date/amount/type) entered on the invoice
-- form so reopening restores them exactly. Existing invoices have no
-- history to backfill (never recorded per-row before) — the app falls
-- back to reconstructing one row per nonzero paid_* total for those.
-- Safe to re-run.

alter table public.pos_invoices
  add column if not exists payments jsonb not null default '[]'::jsonb;
