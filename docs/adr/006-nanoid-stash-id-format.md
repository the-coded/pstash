# ADR-006: Nanoid-Suffixed Stash ID Format

**Status:** Accepted
**Date:** 2026-05-27

## Context

Each stash entry needs a unique identifier. The ID must be:
- Unique across machines (multi-machine sync via git)
- Human-readable (users reference stashes by index, but IDs appear in paths and logs)
- Sortable chronologically (for listing newest-first)
- Filesystem-safe (valid directory name on macOS, Linux, Windows)

## Decision

**Stash IDs follow the format `YYYY-MM-DD_HH-mm_XXXX` where `XXXX` is a 4-character nanoid.**

### Implementation

```typescript
// src/core/stasher.ts
export function generateStashId(timestamp: Date = new Date()): string {
  const iso = timestamp.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:mm"
  const datePart = iso.slice(0, 10)                // "YYYY-MM-DD"
  const timePart = iso.slice(11, 16).replace(":", "-") // "HH-mm"
  return `${datePart}_${timePart}_${nanoid(4)}`
}
// → "2026-03-12_01-05_k7x2"
```

### Design rationale

- **UTC always** — `Date.toISOString()` guarantees UTC, preventing timezone-dependent IDs
- **Minute precision** — seconds are unnecessary (stashing is a deliberate action, not automated)
- **4-char nanoid suffix** — 62^4 = ~14.7 million combinations per minute per project, effectively preventing collisions between machines
- **Underscore separators** — filesystem-safe, no special chars
- **Lexicographic = chronological** — `YYYY-MM-DD_HH-mm` sorts correctly with `.sort().reverse()`

## Consequences

### Positive

- **Human-readable** — `2026-03-12_01-05_k7x2` is immediately understandable
- **Collision-proof** — nanoid suffix handles concurrent multi-machine saves
- **Sortable** — no need for a secondary sort key; directory listing is chronological
- **Filesystem-safe** — no colons, spaces, or special characters
- **Compact** — 21 characters total

### Negative

- **Minute-level granularity** — two stashes from the same machine in the same minute differ only by the nanoid suffix (acceptable trade-off for readability)
- **nanoid dependency** — adds a small runtime dependency (though nanoid is tiny)
- **Not a UUID** — can't be used as a database primary key if we ever add one (unlikely)

### Alternatives Considered

- **UUID v4** — rejected; not human-readable (`a8f3b2c1-...`), not sortable
- **Timestamp only** (no suffix) — rejected; collision risk on multi-machine setups
- **Auto-increment integer** — rejected; not meaningful, merge conflicts on multi-machine sync
- **Unix timestamp** — rejected; not human-readable (`1741744523`)
