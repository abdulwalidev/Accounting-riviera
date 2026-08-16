-- Exact customer name on pos_invoices. The existing `customer` column is
-- really a customer TYPE (Walkin Customer / Room Service / a guest
-- category) — it's what the autocomplete offers and what the Guests
-- (Non-Paying) tables key off. This column holds the actual person, for
-- the invoices where there is one to record.
--
-- Defaults to 'N/A', which is exactly what the form shows until someone
-- unticks the N/A box beside NAME, so existing invoices read the same as
-- new walk-ins rather than looking like data went missing.
--
-- The app does NOT send this column until it has seen it on a row pulled
-- from the cloud (see posInvoicePayload / posRowFromDb), so deploying the
-- app before running this is safe — names simply aren't persisted until
-- the first pull after it. Safe to re-run.

alter table public.pos_invoices
  add column if not exists customer_name text not null default 'N/A';
