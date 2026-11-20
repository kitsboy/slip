# Second polish — 20 November 2026

Scope: exactly three refinements on v0.31.65; parent owns commit/push/release.

## 1. Faster sale entry and correction

Catalogue search now shares a toolbar with a visible Keypad entry at every width and an Edit sale shortcut that moves keyboard focus to the cart. Clear search resets the filter and returns focus to search. The old mobile-only keypad entry was relocated, not duplicated. The existing amount pad now uses the shared modal boundary: Escape, contained Tab focus, scroll locking and opener restoration. Existing quantity/remove/Undo and amount parsing/computations are unchanged.

## 2. Clearer payment progress

The existing status word and its explanation occupy separate reading lines rather than competing on a cramped flex row. An unpaid sale's next step says to check before paying again; an observed-but-unconfirmed sale says to wait for confirmation and not pay again. These instructions use existing invoice state only: no observer or payment-state change. The existing completed/manual/rehearsal heading is now a polite live status region; its honesty wording is unchanged. Manual and simulated labels remain explicit.

## 3. Easier Books navigation

The day selector moves to a named navigation row at the top of Books with a Today return. The existing Find a sale field moves before the close checklist. Existing report/export/print controls are grouped in a dated fieldset, while the close checklist and its prerequisites remain intact. No ledger, storage, filter, total or export computation changed.

## Budget and boundaries

Removed source-absent legacy utility CSS (`v2-hero`, `v2-title`, `v2-body`, `v2-stamp`, `v2-mono`, `v2-btn-s`, `v2-money-hero`, `v2-money-inline`, `v2-money-sats`, including the unused money-hero fit variant). Repository search found no consumers of those selectors. No dependencies, fonts, network calls, printing feature, money handling or storage-engine changes. The hard 819200-byte ceiling remains unchanged. Current production artifact: **818780 raw bytes** (420 bytes headroom); gzip remains approximately 242 KiB, above the 230 KiB target but below its 300 KiB ceiling.

## Evidence

- Live v0.31.65 baseline captures: `/root/.hermes/cache/scratch/slip-r2-before-live/`, Sell and Books at 320/390/768/1440 in dark/light.
- New-build captures: `/root/.hermes/cache/scratch/slip-r2-after/`, Sell, waiting and Books at all four widths in both themes (24 PNGs); `contact.jpg` is the inspected contact sheet.
- Individual inspected captures included 320 Sell dark, 390 Books light and 1440 waiting dark; the complete contact sheet was also inspected. DOM checks found no Books page overflow at any width.
- `tests/e2e/round2-polish.mjs`: 80 checks, zero failures, including clear-search focus, cart focus, keypad/Escape/opener/scroll restoration, remove/Undo, waiting instruction, Today return, filter order and dated report group.
- `tests/e2e/till.mjs` additionally checks real stubbed waiting/observed next-step distinctions. Existing suites retain manual/simulated and QR honesty coverage.
- Logs under scratch: `slip-r2-build.log`, `slip-r2-unit.log`, `slip-r2-contrast.log`, `slip-r2-tap.log`, `slip-r2-focused.log`, `slip-r2-browser.log`.

## Verification

TypeScript and ESLint pass. Vitest: 697 passed / 1 skipped. Production build and bundle scan pass. Strict docs audit passes (24 entries). Contrast: 29/29 AA. Token lint and budget pass. Tap audit: zero controls under the 44px floor; 159 remain under the preferred 48px target (unchanged baseline). Full browser run: **all 26 suites passed** (the existing 25 plus the registered focused suite), exit 0. Site-polish: 192 checks / zero failures; round2-polish: 80 checks / zero failures. No app edits followed the final build or gate run.

The first tap invocation used the script's default port 4183 and failed to connect; the corrected invocation explicitly used the parent's running 4181 preview. The first focused run exposed missing Escape behavior in the amount pad, which was corrected using the existing shared hook; the final 80-check run passed. The Impeccable launcher lacked execution permission; existing product/visual-grammar context and craft/polish references were used instead.

No funded transaction, physical phone, camera or printer proof. Screenshots are Chromium emulation, and demo payments remain simulated. Parent's preview on 4181 is left running. Incidental test-generated tracked screenshots are restored to their committed originals after all suites finish.
