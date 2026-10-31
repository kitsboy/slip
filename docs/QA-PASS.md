# Polish pass — what was reviewed and repaired

A deliberate hardening read of the whole surface: every panel, every sentence, the order they
appear in, and what a keyboard-only user meets first. This file records what was found, because a
fix nobody wrote down gets undone.

## What the review looked at

- **Copy**: every visible string on the page (4,388 words), scanned for stale claims, grammar,
  duplicated words, jargon and debug-sounding text.
- **Flow**: the panel order, and whether a merchant can reach the till without scrolling past 17
  sections.
- **Behaviour**: reconciliation messaging, demo isolation, settings propagation, rehearsal writes.
- **Access**: focus visibility, skip link, `aria-pressed` on toggles, tap target sizes.
- **Truth**: any sentence that claims something the app does not do.

## Found and fixed

| # | Finding | Fix |
|---|---|---|
| 1 | A footer banner still said **“Not a till yet… there is no catalog, no invoice and no payment engine.”** It had been false for four releases. | Replaced with the true statement: everything is live and tested, and slip cannot hold or move money. |
| 2 | Headline read **“Sells pay straight into your own wallet.”** | “Sales pay straight into your own wallet.” |
| 3 | The till chip said **“detection live”** — jargon, and untrue offline. | “watching for payment” / “offline — not watching”. |
| 4 | **“Reconciliation: nothing was open to check.”** displayed permanently under the till, reading like debug output. | Hidden unless there is something to report, and reworded to “Open sales: …”. |
| 5 | Custom amount sat beside a cart with no explanation, so a cashier could not tell if it replaced or added. | Label now reads “Custom amount (USD) — added to the items”. |
| 6 | Seventeen panels in one scroll, in no particular order, with the Manual last. | Grouped by intent (**Sell · Money in · Books · Proof · Setup · More · Learn**) with a sticky sub-nav; Manual reachable from the nav. |
| 7 | Ten assistance switches in a flat list. | Grouped as **Teaching · Quiet the screen · Records and testing**, each with a one-line reason. |
| 8 | Item cards gave no sign an item was already in the cart. | A `×n` badge appears on the card as quantities are added. |
| 9 | Tip jar looked like a mode but did not announce itself to a screen reader. | `aria-pressed`, plus a filled state. |
| 10 | No skip link and no focus ring: keyboard users had to tab through every panel. | “Skip to the till” link and a visible `:focus-visible` outline. |
| 11 | A stale source comment described an app that could not take payments. | Rewritten to describe what ships. |
| 12 | The **Services** list still described the till, the payment engine, receipts, the rate feed, Silent Payments and the agent hooks as “not built yet” — every one of them ships. | Rewritten from the actual build: ten rows marked live with their real guard, two still honestly planned (Fedimint, Liquid). |
| 13 | The hero said **“Stage P10”** while the build was several releases further on. | “Status: working till — sell, close the day, prove it”, and the rails row now names what is live. |
| 14 | A unit test **required** the stale banner text (“Not a till yet”), so the honesty fix would have failed CI — a test that locks in a false claim is worse than no test. | The assertion now forbids that sentence and pins the true one; the test's name matches what it checks. |
| 15 | **Horizontal overflow on a phone**: the page was 500 px wide in a 430 px viewport, clipping the headline and feature chips. The sticky nav's scroll row was widening the shell. | Nav constrained to the content width and allowed to scroll inside it; the shell clamps `overflow-x`. Measured 430 = 430 after the fix. |
| 16 | The skip link was **visible at the top of every page** instead of off-screen until focused — the CSS had never actually landed in the stylesheet. | Rules written into `src/index.css` and verified in the built file (`skip-link` present in `dist/index.html`), with `:focus-visible` rings for keyboard use. |
| 17 | The theme control read “Light” with no glyph. | A small ◐/☀/◑ mark beside the label; the accessible name still says “Theme: … Switch theme.” |
| 18 | The education material was maintained by hand (i.e. not at all). | `npm run docs:education` generates `docs/EDUCATION.md` from the manual cards and explanations; `docs:audit` fails if a card is missing from it. |

## Verifications run after the changes

- `npm run lint` — tsc + eslint clean.
- `npm test` — 503 unit tests green.
- Eleven browser suites green against the live origin.
- `npm run manual` — 21/21 panels photographed.
- `npm run docs:audit --strict` — documentation, screenshots and education pack in step.

## Known limits, stated rather than hidden

- The till can only check a payment while the payment screen is open, or at the next launch.
- Silent Payments cannot be watched: that needs a scan key slip will never hold.
- Fedimint is still unbuilt; it needs a federation to test against.
- A real 100 sat payment needs a human with a wallet — the panel is ready, the money is theirs.
