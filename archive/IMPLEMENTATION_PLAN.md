# New System — Implementation Plan

Going forward, `new system/index.html` (Guest Entry Form) is the app we build on.
Everything battle-tested in the current project (`/index.html`) — the Supabase
cloud database, sync/retry logic, login, soft delete — gets ported into it,
and the UI colors get reworked.

> **STATUS (19 Jul 2026): implemented.** The cloud layer is fully ported
> (login, cloud-first load, per-save push + fast retry, offline banner,
> soft delete on edit, realtime, keepalive flush, legacy localStorage
> import). Schema: `migration/new_system_schema.sql` — **run it once in the
> SQL Editor before first use** (same Supabase project as the old tracker,
> so the existing login account keeps working). Decisions taken on the open
> questions: same Supabase project; navy+gold re-theme already in place
> satisfies §4; Expected Totals not carried over; old flat tracker data
> stays in the old app (both coexist); bank/unit lists stay hardcoded.
> `xlsx.full.min.js` is now self-hosted next to the page, and the page loads
> `../supabase.js`.
>
> **Accounts & roles:** every account is `admin` or `staff`. Staff can do
> everything except editing mode ("✎ Edit This Entry") — the button is
> hidden and every code path into it is blocked. Roles come from the new
> `check_login_role()` RPC (the old tracker's `check_login()` is untouched).
> Default accounts: `accountant@riviera` / `riviera10` (admin) and
> `staff@riviera` / `staff10` (staff — change this password after the first
> schema run).

---

## 1. What the new system is today

A single-file guest management app, **localStorage only** (no cloud yet):

| Area | What it has |
|---|---|
| Guest Entry | Guest name, father name, address, contact, CNIC — all validated (digit counts, letters-only names, dup-CNIC warning) |
| Rooms | Multi-row booking; room/apartment autocomplete from a fixed unit list; duplicate-room highlighting; rent × days totals |
| Payments | Per-entry payment rows: date, type (Reservation/Check-in/Pending/Other), mode (Cash/Bank Transfer/Card), bank (Alfalah/MCB), cash vs account amounts |
| Summary | Booking total, paid, balance due, status (Paid/Partial/Pending) |
| Search | Search all guests by any field, "only balance due" filter, sorted by due |
| Detail | Edit guest info, view rooms + payment history, add follow-up payments with overpay guards |
| Report | Payments grouped by day, date-range + text filters, Excel export, print/PDF |
| Save flow | Confirm modal that requires typing "CONFIRM" before saving |

Overall: the entry-side UX and validation are already solid — better guardrails
than the old app had. What's missing is everything the old project learned the
hard way: **the data all lives in localStorage**, which is exactly what caused
the vanishing-rows problems the current project spent five commits fixing.

## 2. What carries over from the current project

The current app's architecture is: **cloud is the single source of truth**,
localStorage is never trusted for data. Port all of this:

1. **Supabase client setup** — self-hosted `supabase.js` (was moved local
   because Edge/Brave Tracking Prevention blocked the CDN copy). Serve `xlsx`
   and the Inter font locally too, for the same reason.
2. **Cloud-first load** — loading overlay on startup, "can't reach the cloud
   database" banner, automatic retry, `online` event re-sync.
3. **Per-save push with fast retry** — every save goes to Supabase
   immediately; failures queue and retry near-instantly; sendBeacon-style
   flush on page close so nothing is stranded.
4. **Soft delete** — nothing hard-deleted; `deleted_at` stamping via RPC, the
   anon key is never granted DELETE. Admin-only restore from SQL Editor.
5. **Login** — `check_login()` RPC against the private `users` table
   (bcrypt via pgcrypto, hash never leaves the DB). Same account model.
6. **Realtime** (from `migration/enable_realtime.sql`) — other open devices
   see changes live.
7. **Legacy data migration** — one-time import of any existing
   `localStorage.guestEntries` into the cloud on first run, then clear it.

## 3. New Supabase schema (needs to be written)

The existing `migration/supabase_schema.sql` models the **old** flat
entry-per-row tracker (sr/room/rent/cash/account). The new system is
**guest-centric with nested rooms and payments**, so it needs new tables:

```
guests            id (text pk), guest_name, father_name, address, contact,
                  cnic, created_at, updated_at, deleted_at, deleted_reason

booking_rooms     id (text pk), guest_id -> guests, room_no, rent_per_day,
                  days_count, total, + timestamps/soft-delete columns

guest_payments    id (text pk), guest_id -> guests, payment_date, pay_type,
                  mode, bank, cash, account, total, + timestamps/soft-delete
```

Keep the same conventions as the v2 schema: TEXT ids (app generates its own),
`set_updated_at()` triggers, `*_active` / `*_deleted` views, RLS with
select/insert/update only, `soft_delete_*` / `restore_*` security-definer
functions, `check_login()`, and the users table with zero API access.

Decide before writing it: reuse the same Supabase project (add tables next to
the old ones) or a fresh project. Reusing keeps one dashboard and the existing
users row.

## 4. UI color change

The new system currently uses a cream/paper palette:
`--ink:#22303C` (dark slate), `--paper:#F6F3EC` (cream), `--amber:#FBD65D`
(table headers), `--cash:#3E6B4F` (green), `--account:#35618A` (blue).

All colors flow through `:root` CSS variables plus a handful of hardcoded
tints (row stripes `#EAF4EE`/`#E9F1F8`, badges `#d1e7dd`/`#d7e6f2`, status
chips). Re-theming = swap the variables and sweep the ~12 hardcoded hex
values into new variables first.

**Open: target palette not chosen yet** — waiting on direction (e.g. keep the
cash-green / account-blue distinction? dark mode? brand colors?).

## 5. Suggested build order

1. **Design & run new Supabase schema** (guests / booking_rooms /
   guest_payments + policies + login) — everything depends on it.
2. **Port the cloud layer** into the new system: client init, cloud-first
   load, per-save push, retry queue, offline banner, login screen.
3. **Rewire each feature** off localStorage onto the cloud: save entry →
   insert guest+rooms+payments; detail edits → updates; add payment →
   insert; search/report → read from the in-memory cloud snapshot.
4. **Soft delete + realtime + legacy localStorage import.**
5. **Re-theme the UI** (new palette applied via CSS variables).
6. **Verify end-to-end**: two browsers open at once, kill the network
   mid-save, refresh mid-typing — the failure modes the old app already fixed.

## 6. Open questions

- **Color palette** — which direction? (Section 4.)
- **Same Supabase project or new one?** (Section 3.)
- **Expected Totals feature** from the old tracker — does it have an
  equivalent in the new system's Report, or is it dropped?
- **Old app's data** — does the flat entries/payments data need to be
  migrated into the new guest-centric model, or do both apps coexist and the
  new one starts clean?
- Bank list (Alfalah/MCB) and unit list are hardcoded — fine for now, or
  should they live in the DB so they're editable without code changes?
