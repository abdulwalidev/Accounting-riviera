# No Show (Arrivals) — built, tested, currently disabled

Status: **fully written and commented out** in `app/index.html`. Nothing about it runs today; the Arrivals page behaves exactly as it did before the feature existed. Re-enabling is uncommenting, not rewriting.

Every site is tagged with the marker `[FUTURE: No Show]`. To find them all:

```bash
grep -n "FUTURE: No Show" app/index.html
```

There are **12 sites**. Work through them in the order below — each one names exactly what to do.

---

## What the feature does

An advance reservation the guest never turned up for gets a **No Show** button next to **Check-in** on the Arrivals page. Marking it:

- stores a hidden `No Show` extraDetail holding the date it was marked (free-form `extra_details` jsonb — already syncs, no DB change);
- **drops the booking's room-nights**, which frees the room everywhere at once: Room Detail, Dashboard, Inhouse, breakfast covers, availability, Ledgers, Revenue, NPR — and stops the save-time double-booking check warning when the desk resells the room;
- leaves the money completely alone. Booking total, payments and balance stay as they are, and a deposit already taken still shows on the Report page. Whether a no-show forfeits a deposit is a front-desk decision, not this feature's.

It also fixes a quieter bug: an unmarked no-show currently reads **Arrival Due** today, then silently **Extended** once its booked nights lapse — blocking a room nobody ever slept in, with no way to clear it.

Both **Check-in** and **No Show** get an **Undo**. Undo No Show warns, by guest name and date, if the room has since been given to somebody else.

---

## Re-enable checklist

### 1. Arrivals page copy — 2 sites (HTML)

Two `<div class="sub">` lines are wrapped in `<!-- -->` with the No-Show wording; the plain version sits right below each. Swap them: uncomment the marked line, delete the plain one.

### 2. `HIDDEN_DETAIL_KINDS`

```js
const HIDDEN_DETAIL_KINDS = ['Contact No', 'Actual Checkout', 'Actual Checkin', 'Adults', 'Children', 'Room Move'];
```

Add `'No Show'` to the end. Without this the marker shows up as a visible Extra Detail on the guest page.

### 3. `isNoShowEntry` — the helper

A `/* ... */` block just after `isAdvanceReservation`. Uncomment the whole thing (leading `/*` and trailing `*/`).

### 4. `buildLedgersRecords` — the gate (**the heart of it**)

```js
function buildLedgersRecords(includeUnconfirmed /*, includeNoShows */){
```

Restore the second parameter, then uncomment the gate a few lines below:

```js
if(!includeNoShows && isNoShowEntry(entry)) return;
```

This single line is what frees the room everywhere. `includeNoShows=true` has exactly one caller — Undo No Show's clash check.

### 5. `buildArrivalRows` — future-date branch

Restore `&& !isNoShowEntry(entry)` in the marked `if`. (Today's branch needs no equivalent: a no-show has no room-nights left, so `arrivalPending` can't fire.)

### 6. `buildArrivalRows` — the `noShows` list

Uncomment the `/* ... */` block that builds `noShows`, then restore the concat on the return:

```js
return due.concat(checkedIn, noShows)
```

### 7. `renderArrival` — status badge

```js
const STATUS_BADGE = { due: [...], checked_in: [...] };
```

Add back `no_show: ['checkoutdue', 'No Show']`.

### 8. `renderArrival` — the buttons

Widen the last `<th>` from `110px` back to `190px`, then swap the live one-line `action` for the commented-out three-branch version directly above it (Check-in + No Show on a due row; Undo on a no-show row).

### 9. `renderDetail` — the badge on the guest page

Uncomment the two `noShowOn` lines so a no-show entry reads `NO SHOW — marked <date>` under the guest's name. Worth doing: without it the entry looks entirely ordinary while its rooms read free.

### 10. `LOG_ACTION_LABELS`

Add back `res_no_show: 'Marked No Show'` and `res_reactivated: 'No Show undone'`, otherwise the Full Audit page prints the raw action strings.

### 11. `markArrivalNoShow` / `undoArrivalNoShow`

One `/* ... */` block holding both functions, just after `undoArrivalCheckin`. Uncomment the whole thing.

---

## After uncommenting

No migration is needed. `res_no_show` and `res_reactivated` are **already** in the `guest_edits.action` CHECK constraint — see `migration/guests/guest_edits_checked_in_action.sql`. Nothing else about the schema changes; the marker rides on `extra_details` jsonb, same as `Actual Checkin`, `Actual Checkout` and `Room Move`.

Verify with the hoist check — it proves which functions the parser actually saw:

```
typeof isNoShowEntry      // 'function' once re-enabled (currently 'undefined')
typeof markArrivalNoShow  // 'function' once re-enabled
typeof undoArrivalNoShow  // 'function' once re-enabled
```

Then re-run the scenario tests (20 assertions: the gate, the arrival rows, the clash detection, walk-in immunity). They pull the real functions straight out of `index.html`, so they only pass once the code is live again.

---

## Design notes worth keeping

- **Forward-only.** No `No Show` detail, no behaviour change — every existing entry reads exactly as before. Same guarantee as Room Move and the Arrival gate.
- **Money is never touched.** Deliberate. The confirm dialog says so out loud when the guest has already paid something, rather than quietly doing nothing about it.
- **Reversible.** The marker is one detail; removing it restores every room-night exactly.
- **Other no-shows are excluded from the clash check.** Two cancelled bookings on the same room must never read as a double-booking with each other.
- **A walk-in can never be marked No Show.** They aren't arrival-gated, so they never appear on the Arrivals list at all.
- **Not reachable for a future reservation.** The buttons only render when the As Of Date is today.
