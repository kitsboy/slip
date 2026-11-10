# Kimi handoff

## 2026-11-10 — the footer, and six stale things repaired

Live is **v0.31.25** (both origin and vanity), CI green on `9826a6d`. Everything in this note is
deployed and verified against the live DOM.

Read `docs/RESUME-2026-11-10.md` before touching the till, and `docs/NEXT-TEN.md` for the ordered
repair list with a "done when" line for each.

Short version:

- The footer is its own component (`src/ui/Footer.tsx`): a live "nothing phones home" count drawn
  large, this build's stamp and book seal, and who made it.
- `camera=(self)` is **live** now (`curl -sI` proves it) — so the camera can finally be tested on a
  phone. Nothing else about the camera is proven.
- Two gates had been lying: `lint-tokens` was red on five deliberate brass uses, and
  `contrast-audit` only ever checked the old light palette. Both are green and now check the page
  that ships.
- `tests/e2e/quick-wins.mjs` had been red since the five-tab shell landed. It passes 18/18 now.
- Do not type a glyph where an SVG will do: `◈` and `₿` both had box risk and are gone.
- Do not commit `docs/matrix-shots/` again — 39 MB of generated PNGs, now ignored.
