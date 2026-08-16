# Riviera — Hotel + Restaurant

A live hotel management system for Riviera: front desk, guests, rooms, payments,
night audit and reporting, with a restaurant/POS module embedded in the same
page. It is in daily production use by real staff against real money. Nothing in
here is a demo.

**This is a real, running app. There is no staging copy and no undo button.**
Read [Before you change anything](#before-you-change-anything) first.

---

## The shape of it

```
app/index.html          the entire application — ~24,500 lines, one file
app/vendor/             flatpickr, xlsx, html2canvas, jspdf — all local, no CDN
app/assets/             logo + letterhead background
supabase.js             the Supabase JS client, vendored
migration/              every schema change, one file per change
vercel.json             hosting: / rewrites to /app/index.html, no-store
backup/                 point-in-time exports kept by hand
```

One HTML file. Two inline `<script>` blocks. No build step, no bundler, no
framework, no npm install — you edit `app/index.html`, push, and Vercel serves
it. `Cache-Control: no-store` on the entry point means a refresh is a deploy.

Roughly 500 commits between July and August 2026.

### The two halves

The file is one page but two applications that share a login and a header:

| | Hotel | Restaurant (POS) |
|---|---|---|
| Code prefix | none | `pos*` |
| Pages | `#view-*` | `#page-*` |
| Tables | `guests`, `booking_rooms`, `guest_payments`, … | `pos_invoices`, `pos_invoice_items`, `pos_locked_days` |
| Router | `showView()` / `ROUTABLE_VIEWS` | `posShowApp()` |

They are deliberately isolated: the POS has its own tables, its own day-lock
table, its own date helpers and its own escaping (`posEscapeHtml`). When work is
scoped to one half, say so — "in hotel" and "in restaurant" are the words used
for that, and `pos*` / `#page-*` is the boundary.

The one place they meet is Front Office: a restaurant charge posted to a room
crosses over and waits there to be collected.

---

## Data

Supabase (PostgREST + Storage + realtime) **is** the database. There is no
server of our own. The in-memory arrays (`entries`, `lockedDays`,
`paymentAttachments`, `posInvoices`, …) are mirrors of the cloud, refreshed by
`pullFreshFromCloud()` and pushed by `pushPendingNow()`.

- A save that can't reach the server is **queued and retried**, never dropped —
  red banner up until it lands.
- `localStorage` holds a snapshot purely so a refresh paints instantly instead
  of staring at a loading screen. **It is never trusted as data.**

### Tables

| Table | What it holds |
|---|---|
| `guests` | One row per entry. Name, CNIC, dates, plus `extra_details` (jsonb) |
| `booking_rooms` | The rooms on an entry — rate, nights, total |
| `guest_payments` | Money in — cash / account / card, per entry |
| `guest_edits` | Append-only audit log. No UPDATE or DELETE is granted, ever |
| `locked_days` | Night audit. A locked date takes no new payments |
| `room_status` | Housekeeping — Ready / Dirty / OOO. Current state, not history |
| `payment_attachments` | Index of payment screenshots; the images are in Storage |
| `pos_invoices` | Restaurant invoices |
| `pos_invoice_items` | Their lines |
| `pos_locked_days` | The restaurant's own day lock |
| `users` | Logins. Ungranted and RLS-blocked — see [Accounts](#accounts) |

### Two conventions that surprise people

**Nothing is ever really deleted.** "Delete" sets `deleted_at` (or `deleted` on
POS invoices). The app reads the `*_active` views, so deleted rows vanish from
every screen — but they are still there and an admin can restore them from the
SQL Editor. There is no hard delete anywhere, and no DELETE grant on most
tables. **A backup that filtered them out would be missing exactly the rows
someone comes looking for**, which is why the Backup feature reads the base
tables and not the views.

**Stay state lives in `extra_details`, not in the columns you'd expect.** The
`guests.res_status` and `booking_rooms.moved_out_date` columns exist but the app
never reads or writes them — the `*_active` views are frozen `select *` and
adding a column to them is not a thing that can be done casually. Check-in,
checkout, no-show, room moves and the rest are hidden entries in the
`extra_details` jsonb array instead (`HIDDEN_DETAIL_KINDS` — `Actual Checkin`,
`Actual Checkout`, `Room Move`, `Adults`, `Children`, `Contact No`). If you go
looking for the checkout date in a column, you will not find it.

---

## Accounts

Five roles, each defined in `public.users` and returned by the security-definer
`check_login_role()`:

| Role | Can do |
|---|---|
| `superadmin` | Everything an admin can, plus the Restaurant module, Front Office, Users and Backup |
| `admin` | The whole hotel — entries, editing, payments, Day Lock, Delete Entity, reports |
| `staff` | Everything except reopening a saved entry for editing |
| `viewer` | Read-only everywhere. Creates, edits and deletes nothing |
| `restaurant` | Only the Restaurant module and Front Office |

**There is no Supabase Auth session here.** The "signed-in user" is a value in
`sessionStorage`, and the anon key is printed in `index.html` where anyone can
read it. Role checks in the browser are therefore *ergonomics, not security* —
they keep the wrong buttons off the wrong screens. The only real gates are in
the database: RLS policies, deliberately absent grants (`users`, `pos_users`,
`pos_counters` are ungranted), and security-definer functions.

This is exactly why **Settings → Users** asks the superadmin for their own
password: with no session to prove who you are, the password is the credential,
and it is sent with and re-verified on every single call. It is held in memory
for the session and never written to disk.

---

## Migrations

Every schema change is a file in `migration/`, grouped by area. They are written
to be **run once in the Supabase SQL Editor and safe to re-run** — `if not
exists`, `create or replace`, `on conflict do update`. Most end with a `select`
that verifies what they created.

```
migration/guests/       soft delete, audit-log actions
migration/payments/     day locks, payment screenshots
migration/pos/          the whole restaurant module + its later columns
migration/reports/      night audit summary, view refreshes
migration/reservations/ reservation status
migration/roles/        viewer role, user management
migration/rooms/        room status, adults/children, breakfast counts, room moves
```

`munshi-10-adaptation/ADAPTATION.sql` is the closest thing to a full schema
dump — the core tables, views, functions, policies and grants in one place.

> **Never run `new_system_schema.sql`.** It drops tables that hold real data.

### Pending

`migration/roles/user_management.sql` and `migration/pos/pos_customer_name.sql`
need running before their features do anything. Both are additive and safe.

---

## Backup

**Settings → Backup**, superadmin only. Three downloads, none of which can write
a single row — the entire section is read-only by construction, because it is
the thing you reach for when something has *already* gone wrong.

1. **All Tables (JSON)** — the restore-from file. Raw rows exactly as stored,
   including soft-deleted ones. Keep this one.
2. **All Images (PDF)** — every payment screenshot, one per page with its
   caption. Asks first: it is the only button that spends storage egress.
3. **All Data, Structured (Excel)** — one sheet per table, readable headings, a
   Contents sheet. For reading. *Not* for restoring — Excel flattens jsonb and
   will happily reinterpret an ID that looks like a number.

Logins are deliberately **not** in the backup: the only thing in `users` is
bcrypt password hashes, which have no business in a Downloads folder. Accounts
are re-created in Settings → Users, not restored.

---

## Before you change anything

These are the traps that have actually cost time here. They are all documented
at their site in the code too.

**Boot order.** `init()` runs early and calls `posBootApp()` synchronously. A
`var x = []` declared *later* in the same script is hoisted as `undefined` at
that moment — `.push()` on it throws, `posBootApp` dies, and everything after it
silently never happens (this is what once emptied Recent Invoices). All such
globals live in one early block beside `posLockedDays`. Add new ones there.

**PostgREST rejects the whole upsert over one unknown column.** Adding a field
to a payload before its migration is run doesn't degrade — it makes *every* save
fail. Gate new columns behind a capability flag set from a row that came back
from the server (see `posHasCustomerNameColumn`), so the app and the migration
can be deployed in either order.

**A plain `select` stops at 1000 rows and doesn't say so.** For anything that
must be complete, page explicitly with `.range()` over a key-ordered `.order()`
— range paging without a stable sort repeats and skips rows.

**CSS specificity.** Id-scoped rules like `#page-x table.rep td` outrank a plain
class selector. New table styling either names every page it applies to or
carries `!important` — and there is a reason the day separator does.

**Storage egress costs real money.** Screenshot image bytes are fetched only on
an explicit click, never on render, hover or preload. `downloadPaymentScreenshotBlob()`
is the only function that pulls them and it has three callers. Keep it that way.

**Karachi time is the only "today".** `todayStr()` / `toKarachiDateStr()`. The
device's own timezone is never the hotel's day. There is no DST to handle.

**New gating never applies backwards.** A rule added today must not retroactively
flag or flood historical records that predate the field it checks.

**Dates.** Stored and filtered as `dd-mm-yyyy` in the POS, ISO in the hotel.
Display formatting is display only — never let it reach a comparison.

### Testing

There is no test framework. Tests are Node scripts that extract the **real**
function bodies out of `index.html` by brace-counting and drive them with stubs
via `new Function(...)`, so a test fails when the shipped code regresses rather
than when a copy of it does. Fourteen of them cover receipts, invoice tables,
day locks, date rules, tax flags, the customer-name field, and backup/users.

They live outside the repo, in the session scratchpad. If you are changing
anything in the POS receipt, the invoice tables or the day-lock logic, ask for
them before you start.

---

## Running it

Open `app/index.html`. That is all — there is nothing to install and nothing to
build. It talks to the production Supabase project as soon as it loads, so
**opening it locally is opening the live app**, with the same buttons and the
same consequences. If you want a scratch copy, point `SUPABASE_URL` /
`SUPABASE_ANON_KEY` at a different project first.

Deployment is a push to `main`.
