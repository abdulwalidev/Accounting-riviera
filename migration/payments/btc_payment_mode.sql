-- BTC (Bill To Company) — a fourth guest_payments.mode, alongside the
-- original 'Cash', 'Bank Transfer' and 'Card'.
--
-- A BTC row records money that was NOT collected at the desk: a company is
-- being invoiced and will settle it later, often a month later. The guest is
-- allowed to check out in the meantime, which is the whole point of it.
--
-- The original schema pinned mode to a three-value check constraint (see
-- munshi-10-adaptation/ADAPTATION.sql), so without this migration every BTC
-- payment is rejected by the database. The app cannot report that clearly: a
-- refused row surfaces as a generic "couldn't save to the cloud database"
-- error, which reads like a connectivity problem — exactly the trap
-- relax_unit_type_check.sql documents. Run this BEFORE anyone records a BTC.
--
-- The check is kept rather than dropped: mode is the field that decides
-- whether an amount counts as revenue, so a stray value in it would silently
-- move money between "collected" and "owed". Four known values, nothing else.
--
-- ---------------------------------------------------------------------
-- WHAT THIS DOES TO YOUR DATA: nothing. No row is inserted, updated or
-- deleted. No column is added or dropped. It swaps one validation rule for a
-- more permissive one. The *_active views do NOT need recreating either —
-- this changes a constraint, not the column list (contrast
-- migration/reports/refresh_active_views.sql, which exists because ADDING a
-- COLUMN does need that).
--
-- The one thing ADD CONSTRAINT does do is scan the existing rows to check
-- they satisfy the new rule. Every row already holds Cash, Bank Transfer or
-- Card, all of which are still allowed, so it passes. If some unexpected
-- value were on file the statement would abort loudly and change nothing.
--
-- The whole thing runs inside one transaction, so it either fully applies or
-- fully rolls back. It can never leave the table with the old constraint
-- dropped and no new one in its place.
--
-- Safe to re-run: the DROP is a no-op the second time and the ADD simply
-- recreates an identical constraint.
-- ---------------------------------------------------------------------

begin;

alter table public.guest_payments
  drop constraint if exists guest_payments_mode_check;

alter table public.guest_payments
  add constraint guest_payments_mode_check
  check (mode in ('Cash', 'Bank Transfer', 'Card', 'BTC'));

comment on column public.guest_payments.mode is
  'Cash | Bank Transfer | Card | BTC. BTC = Bill To Company: an invoice, not a receipt. '
  'Such a row carries its amount in total with cash = 0 and account = 0, so every '
  'collected-money report (which sums cash/account, or filters through paidPayments() '
  'in index.html) excludes it automatically. It becomes real money by having its mode '
  'switched to one of the other three once the company pays.';

-- Safety net. The DROP above targets one constraint by name. That name is
-- what Postgres generates for the inline column check in ADAPTATION.sql, but
-- if this table were ever built differently the real constraint could be
-- named something else — in which case the DROP silently does nothing, the
-- old three-value rule survives alongside the new one, and BTC payments keep
-- getting rejected with no clue why. This turns that silent failure into a
-- loud one, and because it is inside the transaction, raising here rolls the
-- whole migration back rather than leaving a half-applied state.
do $$
declare leftover text;
begin
  select string_agg(conname || ' -> ' || pg_get_constraintdef(oid), E'\n')
    into leftover
  from pg_constraint
  where conrelid = 'public.guest_payments'::regclass
    and contype = 'c'
    and conname <> 'guest_payments_mode_check'
    and pg_get_constraintdef(oid) ilike '%mode%';

  if leftover is not null then
    raise exception
      'Another constraint still restricts mode and would keep rejecting BTC. Nothing has been changed. Found:%',
      E'\n' || leftover;
  end if;
end $$;

commit;

-- Verification. Expect one row with ok = true.
-- ("check" is quoted deliberately — CHECK is a reserved keyword in Postgres
-- and is a syntax error as a bare column alias.)
select
  'BTC accepted' as "check",
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.guest_payments'::regclass
      and conname = 'guest_payments_mode_check'
      and pg_get_constraintdef(oid) like '%BTC%'
  ) as ok;
