-- Whole-entry soft delete for a guest — mirrors the existing
-- soft_delete_booking_room / soft_delete_guest_payment pattern already used
-- for rooms and payments. Once a guest is soft-deleted, guests_active (and
-- therefore every screen in the app, since rooms/payments are nested under
-- the guest client-side) stops showing it and everything nested under it.
-- Nothing is hard-deleted — restore is a manual SQL Editor operation:
--   update guests set deleted_at = null, deleted_reason = null where id = '...';
-- Safe to run even if this function already exists from the original
-- schema — CREATE OR REPLACE just re-asserts the same behavior.

create or replace function soft_delete_guest(p_guest_id text, p_reason text default null)
returns void
language plpgsql
security definer
as $$
begin
  update guests
  set deleted_at = now(), deleted_reason = p_reason
  where id = p_guest_id and deleted_at is null;
end;
$$;

grant execute on function soft_delete_guest(text, text) to anon, authenticated;
