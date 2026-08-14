# Future implementations

Features that are **written, tested and commented out** — parked rather than dropped. Each one has a `.md` here listing exactly what to uncomment to switch it back on.

The code stays in `app/index.html`, tagged with a greppable marker so no site is ever missed:

```bash
grep -n "FUTURE: <name>" app/index.html
```

| Feature | Marker | Sites | Notes |
|---|---|---|---|
| [No Show (Arrivals)](no-show.md) | `[FUTURE: No Show]` | 12 | Mark an advance reservation the guest never turned up for; frees the room everywhere, leaves the money alone. Undo included. No migration needed. |

**Rule for anything parked here:** disabled means *provably* disabled — no half-live code paths. For No Show, that was verified by checking the parser genuinely sees no `isNoShowEntry` / `markArrivalNoShow` / `undoArrivalNoShow`, not just by reading the diff.
