# Design decisions — the "quiet brass" token pass (v0.20.0)

Council ruling: **Mimi** owns colour/type/space, **Nova** owns flow/IA (see `DESIGN-BIBLE.md`,
`NAV-MAP.md`). This pass applies Mimi's palette and component rules without breaking the honesty
invariants. Tie-break, written into the brief: **usability over beauty, honesty over everything.**

## D-51 — Brass is theme-split, not one hue
Dark keeps bright brass `#f0a32a` (8.6:1 on surface). Light uses burnt bronze `#a84808`
(5.31:1 on page, 5.84:1 with white button text). The old single `#f7931a` failed AA on the light
page at **2.09:1** — an accessibility bug, not a taste call. Verified by `scripts/contrast-audit.mjs`.

## D-52 — Status means something, and always carries a word
`pending` = steel blue (`#7cb3e8` dark / `#3b6fa5` light), `seen/submitted` = gold, `confirmed` =
green only. Word-first badges (`.badge`, `.badge-pending|warn|good|bad`): colour alone is never the
message, so "awaiting" no longer leans green and muddies `seen ≠ paid`.

## D-53 — One focus rule, bound to the accent token
The duplicate `:focus-visible` block (one bound to `var(--accent, #f5820a)`) is gone. A single rule
uses `var(--slip-accent)` and `--radius-md`. No amber drift between components.

## D-54 — One radius + spacing system, one motion curve
`--radius-sm|md|lg` (8/12/16) and one `--ease-slip` curve; `.panel` uses `--radius-lg` +
`--shadow-card` (dark: 1px inset highlight; light: none — the strong hairline does the work).

## D-55 — Buttons: solid primary, sentence case
`Charge`, `Request invoice`, `Set up your shop`, `Tip jar` are solid brass/bronze primaries with
sentence case — killing the flat all-caps "dev template" read. `Customer screen` / `Check now` are
secondary; `I have the money (manual)` is ghost; `Wipe this device` is the only destructive red.
Uppercase is reserved for `.eyebrow` alone.

## D-56 — Disabled is neutral but legible
The bible's "muted at 45%" rendered an unreadable ghost on the light page. Disabled keeps a
surface (`--slip-surface-2`), a full-strength muted label, and a hairline — clearly inert, clearly
a button. Never brass, never green. Usability over beauty wins.

## D-57 — Print is a white-background, black-text variant
`@media print` forces a light, ink-economical palette and hides screen chrome (buttons, inputs,
nav) while keeping the record. Cam's standing ask: anything printed must not waste ink.

## D-58 — Fix a test that could only pass before 09:00 UTC
`ops.mjs` seeded invoices at a fixed `T09:00:00Z`. Reconciliation deliberately skips future-dated
invoices, so the sweep found nothing when the suite ran before 09:00 UTC — a time-of-day flake,
masked earlier by a `| tail` status bug. The fixture now anchors timestamps relative to `Date.now()`
(created 30 min ago, expiring 15 min ahead). Deterministic at any hour.

## Verification evidence
- `scripts/contrast-audit.mjs --strict` → **18/18 pairs clear AA** (computed, not asserted).
- `npx vitest run` → 511/511, 24 files.
- `npx tsc --noEmit` → 0; `npx eslint .` → 0; `npm run build` → 0 (scan-bundle clean).
- 8 browser suites green: till, features, ops (17/17 after D-58), guide, assist, demo, polish
  (18/18), shell-measure (10/10). `manual-shot` → 21/21 panels.
- Dark + light till photographed and reviewed: brass primary, steel-blue badge, readable muted text.
