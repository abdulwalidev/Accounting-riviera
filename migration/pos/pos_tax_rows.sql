-- Per-invoice itemized tax breakdown on pos_invoices — previously only
-- ever kept in memory on the record object right after posting, so
-- reopening a saved invoice (or loading it after any refresh/pull) had no
-- way to know whether Service Charges 10% / GST 10% on Food were actually
-- checked, and the printed receipt's itemized tax section silently fell
-- back to just the combined total for anything not printed in the same
-- session it was posted. This column stores the [{code, name, amt}] array
-- computed at post time so both can be restored exactly. Existing
-- invoices have no history to backfill — the app leaves the tax
-- checkboxes as-is (rather than guessing) for anything with an empty
-- array here. Safe to re-run.

alter table public.pos_invoices
  add column if not exists tax_rows jsonb not null default '[]'::jsonb;
