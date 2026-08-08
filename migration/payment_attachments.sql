-- Payment screenshots: one screenshot per payment (bank/card only in
-- practice, but nothing here enforces that — the app only ever offers to
-- attach one for a non-Cash payment). payment_id IS the primary key since
-- this is a strict 1:1 relationship — no separate uid needed, and it also
-- means a re-upload for the same payment is a plain upsert, no orphaned old
-- rows. payment_date/guest_id are denormalized on purpose (this schema
-- never enforces real FKs, see locked_days/room_status) so grouping a whole
-- day's attachments together, or the per-day PDF download, never has to
-- cross-reference guest_payments first. Delete is allowed — attaching the
-- wrong screenshot or removing one is a normal action, this is current
-- state, not an audit log. Run this once in the Supabase SQL Editor, then
-- create the storage bucket below it (SQL Editor can run both).
-- Safe to re-run.

create table if not exists payment_attachments (
  payment_id text primary key,
  payment_date date not null,
  guest_id text,
  storage_path text not null,
  caption text,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

alter table payment_attachments enable row level security;

drop policy if exists "payment_attachments_select" on payment_attachments;
drop policy if exists "payment_attachments_insert" on payment_attachments;
drop policy if exists "payment_attachments_update" on payment_attachments;
drop policy if exists "payment_attachments_delete" on payment_attachments;

create policy "payment_attachments_select" on payment_attachments for select using (true);
create policy "payment_attachments_insert" on payment_attachments for insert with check (true);
create policy "payment_attachments_update" on payment_attachments for update using (true) with check (true);
create policy "payment_attachments_delete" on payment_attachments for delete using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_attachments'
  ) then
    alter publication supabase_realtime add table payment_attachments;
  end if;
end $$;

-- Storage bucket for the actual screenshot files. Private (public=false) —
-- these are financial records, not something to leave world-readable by
-- URL guessing. The app only ever reads/writes through the anon key, so
-- these object policies stay permissive (using (true)) to match every RLS
-- policy above and everywhere else in this schema — the real gate is
-- app-level (isAdmin()), not a database-level auth split.
insert into storage.buckets (id, name, public)
values ('payment-screenshots', 'payment-screenshots', false)
on conflict (id) do nothing;

drop policy if exists "payment_screenshots_select" on storage.objects;
drop policy if exists "payment_screenshots_insert" on storage.objects;
drop policy if exists "payment_screenshots_update" on storage.objects;
drop policy if exists "payment_screenshots_delete" on storage.objects;

create policy "payment_screenshots_select" on storage.objects for select using (bucket_id = 'payment-screenshots');
create policy "payment_screenshots_insert" on storage.objects for insert with check (bucket_id = 'payment-screenshots');
create policy "payment_screenshots_update" on storage.objects for update using (bucket_id = 'payment-screenshots') with check (bucket_id = 'payment-screenshots');
create policy "payment_screenshots_delete" on storage.objects for delete using (bucket_id = 'payment-screenshots');
