-- Night Audit: locking a day through the Night Audit page now also stores
-- the real, computed snapshot it showed the user at the moment of posting
-- (room-nights sold, revenue, payments received, arrivals/departures,
-- no-show candidates) — so "Recent Night Audits" can show what the night
-- actually looked like when it was closed, not just who closed it and when.
-- NULL for rows locked before this existed, or locked from elsewhere.
-- Safe to re-run.

alter table public.locked_days
  add column if not exists audit_summary jsonb;
