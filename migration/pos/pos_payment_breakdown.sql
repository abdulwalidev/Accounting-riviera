-- Per-payment-type totals on pos_invoices — Charges Summary needs to break
-- the Cash total down by Account Transfer/Card too, but the payment rows'
-- own type dropdown (.pay-type-select in the invoice form) was never
-- captured anywhere: posRecalcAll() only ever summed the raw amounts into
-- a single "paid" figure, discarding which type each row was. These three
-- columns are the missing per-type totals, filled in by the app going
-- forward (existing invoices default to 0 across the board — there's no
-- way to recover their historical split since it was never recorded).
-- Safe to re-run.

alter table public.pos_invoices
  add column if not exists paid_cash numeric not null default 0,
  add column if not exists paid_account_transfer numeric not null default 0,
  add column if not exists paid_card numeric not null default 0;
