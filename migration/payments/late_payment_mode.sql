-- 'Late Payment' — a fourth guest_payments.mode, alongside the original
-- 'Cash', 'Bank Transfer' and 'Card'.
--
-- A Late Payment row records money that was NOT collected at the desk: the
-- guest (or the company paying for them) settles later, often a month later.
-- They are allowed to check out in the meantime, which is the whole point.
-- The app's nav button says "BTC" for short; the stored value and every
-- on-screen label is "Late Payment".
--
-- ---------------------------------------------------------------------
-- IF YOU ALREADY RAN THE EARLIER 'BTC' VERSION OF THIS MIGRATION: run this
-- one too. That version allowed the value 'BTC'; the app now writes
-- 'Late Payment', so without this every save is rejected. This migration
-- supersedes it and works from either starting point.
--
-- WHAT THIS DOES TO YOUR DATA: effectively nothing. The UPDATE below only
-- touches rows whose mode is literally 'BTC' — and there are none unless
-- somebody recorded one during the brief window that value was live. It
-- exists so any such row converts cleanly instead of blocking the new
-- constraint. No row is inserted or deleted, and no column is added or
-- dropped, so the *_active views do NOT need recreating (contrast
-- migration/reports/refresh_active_views.sql, which exists because adding a
-- COLUMN does need that).
--
-- The whole thing runs in one transaction: it either fully applies or fully
-- rolls back, and can never leave the table with no constraint on mode.
--
-- Safe to re-run.
-- ---------------------------------------------------------------------

begin;

-- Dropped first so the UPDATE below cannot fight whichever version of the
-- constraint is currently in place.
alter table public.guest_payments
  drop constraint if exists guest_payments_mode_check;

-- Carry over anything recorded under the old name. Expected: 0 rows.
update public.guest_payments
   set mode = 'Late Payment'
 where mode = 'BTC';

alter table public.guest_payments
  add constraint guest_payments_mode_check
  check (mode in ('Cash', 'Bank Transfer', 'Card', 'Late Payment'));

comment on column public.guest_payments.mode is
  'Cash | Bank Transfer | Card | Late Payment. A Late Payment is a promise, not a receipt: '
  'the row carries its amount in total with cash = 0 and account = 0, so every '
  'collected-money report (which sums cash/account, or filters through paidPayments() '
  'in index.html) excludes it automatically. It becomes real money by having its mode '
  'switched to one of the other three once payment actually arrives.';

-- Safety net. The DROP above targets one constraint by name. That name is
-- what Postgres generates for the inline column check in ADAPTATION.sql, but
-- if this table were ever built differently the real constraint could be
-- named something else — in which case the DROP silently does nothing, the
-- old rule survives alongside the new one, and Late Payment rows keep getting
-- rejected with no clue why. This turns that silent failure into a loud one,
-- and because it is inside the transaction, raising here rolls the whole
-- migration back rather than leaving a half-applied state.
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
      'Another constraint still restricts mode and would keep rejecting Late Payment. Nothing has been changed. Found:%',
      E'\n' || leftover;
  end if;
end $$;

commit;

-- Verification. Expect one row with ok = true.
-- ("check" is quoted deliberately — CHECK is a reserved keyword in Postgres
-- and is a syntax error as a bare column alias.)
select
  'Late Payment accepted' as "check",
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.guest_payments'::regclass
      and conname = 'guest_payments_mode_check'
      and pg_get_constraintdef(oid) like '%Late Payment%'
  ) as ok;
