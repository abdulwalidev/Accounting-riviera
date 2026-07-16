-- Enables Supabase Realtime for the app's tables, so a change made on one
-- device shows up on every other device INSTANTLY (the app also polls every
-- 5 seconds as a guarantee, so skipping this only means up-to-5s delay).
-- Run once: Supabase -> SQL Editor -> paste -> Run. Safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entries') then
    alter publication supabase_realtime add table public.entries;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments') then
    alter publication supabase_realtime add table public.payments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expected_totals') then
    alter publication supabase_realtime add table public.expected_totals;
  end if;
end $$;
