-- =========================================================================
-- CONFIRM EVERYTHING — read-only health check, safe to run any time.
-- Expected result: every row shows ✓ OK. Any ✗ tells you exactly what's off.
-- =========================================================================
with checks(ord, name, ok) as (
  -- new system tables
  select  1, 'table: guests',                          to_regclass('public.guests') is not null
  union all select  2, 'table: booking_rooms',         to_regclass('public.booking_rooms') is not null
  union all select  3, 'table: guest_payments',        to_regclass('public.guest_payments') is not null
  union all select  4, 'table: guest_edits (audit log)', to_regclass('public.guest_edits') is not null
  union all select  5, 'table: users',                 to_regclass('public.users') is not null
  -- old tracker fully removed
  union all select  6, 'old tracker gone: entries',         to_regclass('public.entries') is null
  union all select  7, 'old tracker gone: payments',        to_regclass('public.payments') is null
  union all select  8, 'old tracker gone: expected_totals', to_regclass('public.expected_totals') is null
  -- updated-by columns
  union all select  9, 'column: guests.saved_by',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='guests' and column_name='saved_by')
  union all select 10, 'column: guests.edited_by',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='guests' and column_name='edited_by')
  union all select 11, 'column: guest_payments.created_by',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='guest_payments' and column_name='created_by')
  union all select 12, 'column: users.role',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='role')
  -- views the app reads
  union all select 13, 'view: guests_active',          to_regclass('public.guests_active') is not null
  union all select 14, 'view: booking_rooms_active',   to_regclass('public.booking_rooms_active') is not null
  union all select 15, 'view: guest_payments_active',  to_regclass('public.guest_payments_active') is not null
  -- functions
  union all select 16, 'function: check_login_role()',       to_regprocedure('public.check_login_role(text,text)') is not null
  union all select 17, 'function: soft_delete_guest()',      to_regprocedure('public.soft_delete_guest(text,text)') is not null
  union all select 18, 'function: soft_delete_booking_room()', to_regprocedure('public.soft_delete_booking_room(text,text)') is not null
  union all select 19, 'function: soft_delete_guest_payment()', to_regprocedure('public.soft_delete_guest_payment(text,text)') is not null
  union all select 20, 'function: set_updated_at()',         to_regprocedure('public.set_updated_at()') is not null
  -- accounts
  union all select 21, 'account: admin exists',
    exists (select 1 from public.users where role = 'admin')
  union all select 22, 'account: staff exists',
    exists (select 1 from public.users where role = 'staff')
  -- security posture
  union all select 23, 'RLS on: guests',          (select relrowsecurity from pg_class where oid = 'public.guests'::regclass)
  union all select 24, 'RLS on: booking_rooms',   (select relrowsecurity from pg_class where oid = 'public.booking_rooms'::regclass)
  union all select 25, 'RLS on: guest_payments',  (select relrowsecurity from pg_class where oid = 'public.guest_payments'::regclass)
  union all select 26, 'RLS on: guest_edits',     coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.guest_edits')), false)
  union all select 27, 'RLS on: users',           (select relrowsecurity from pg_class where oid = 'public.users'::regclass)
  union all select 28, 'no DELETE policy anywhere (nothing hard-deletable)',
    not exists (select 1 from pg_policies where schemaname = 'public' and cmd = 'DELETE')
  union all select 29, 'audit log is append-only (no UPDATE policy)',
    not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'guest_edits' and cmd = 'UPDATE')
  union all select 30, 'users table fully locked (zero API policies)',
    not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users')
  -- realtime
  union all select 31, 'realtime: guests',
    exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guests')
  union all select 32, 'realtime: booking_rooms',
    exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'booking_rooms')
  union all select 33, 'realtime: guest_payments',
    exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guest_payments')
)
select name as "check", case when ok then '✓ OK' else '✗ PROBLEM' end as status
from checks
order by ord;
