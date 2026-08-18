-- READ-ONLY. Changes nothing. Run this before btc_payment_mode.sql to see
-- what state the database is actually in.
--
-- Deliberately ONE statement: the Supabase SQL editor only shows the result
-- of the last statement in a script, so a multi-query version silently hides
-- the answer you actually came for. It also always returns exactly one row,
-- so "no constraint at all" reads as a clear message rather than as an empty
-- result you could mistake for the query not having run.
--
-- How to read the result:
--
--   btc_already_allowed = true
--       The migration has already been applied. Nothing left to do.
--
--   btc_already_allowed = false, and mode_constraints names
--   guest_payments_mode_check
--       Normal starting state. Run btc_payment_mode.sql.
--
--   mode_constraints = 'NONE — no check constraint on this table'
--       An earlier run dropped the constraint without replacing it. No data
--       was lost and nothing is broken, but mode is currently unvalidated.
--       Run btc_payment_mode.sql; it puts the constraint back.
--
--   mode_constraints names something OTHER than guest_payments_mode_check
--       Tell me before running the migration. Its DROP targets that one name,
--       so a different name needs handling (the migration will refuse to
--       apply rather than half-work, but I would rather adjust it first).

select
  coalesce(
    (select string_agg(conname || '  ::  ' || pg_get_constraintdef(oid), '   |   ')
       from pg_constraint
      where conrelid = 'public.guest_payments'::regclass
        and contype = 'c'),
    'NONE — no check constraint on this table'
  ) as mode_constraints,

  coalesce(
    (select bool_or(pg_get_constraintdef(oid) like '%BTC%')
       from pg_constraint
      where conrelid = 'public.guest_payments'::regclass
        and contype = 'c'),
    false
  ) as btc_already_allowed,

  (select count(*) from public.guest_payments)                          as payment_rows,
  (select count(*) from public.guest_payments
    where mode not in ('Cash', 'Bank Transfer', 'Card', 'BTC'))         as rows_that_would_block_migration;
