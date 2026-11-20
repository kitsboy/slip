# Eight approved upgrades — local acceptance matrix

No commit, push or deploy authorized for this writer. Baseline e9d55f1, v0.31.66.
Physical-phone/funded tests and merchant trial excluded. No money movement.

| Item | Existing surface extended | Acceptance / evidence |
|---|---|---|
| 1 Bundle headroom | shared JSX classes | Measure raw/gzip before, diet-only, final; preserve gallery and all tools; budgets unchanged |
| 2 Ready to sell | Readiness | Actual acknowledged wallet, saved rate freshness, connectivity hint, persistence/save failure and dated backup; fixes; no funding certification |
| 3 Exceptions | Till per-invoice guidance | Short, over, expired, seen; explicit coin; no auto marks/refunds |
| 4 Offline | Status / Till | Local vs provider functions; online hint not guarantee; last-check retained |
| 5 Recovery | Backup test/restore | Nonmutating test before confirmation, invalid/password/missing-file help; replacement boundaries |
| 6 Receipt handoff | Existing fragment URL | Native share and full URL copy; success/cancel/failure; privacy and unsigned warnings |
| 7 Busy counter | Till | Opt-in remembered mode; larger targets; secondary tools folded, obvious exit; no deleted tools |
| 8 Accounting | History CSV | Same CSV source preview/download; exact columns, coins/manual/cancelled reconciliation, formula safety |

Baseline artifact: 818780 raw bytes, 246666 gzip bytes (Python gzip default).
Before captures: /root/.hermes/cache/scratch/slip-next8-before/ (round2-polish 80 checks, exit 0).
## Independent-audit blocker follow-up (supersedes prior artifact verification)

The auditor found that an in-flight successful backup test could restore the old boolean
preflight after a password edit. `Backup.tsx` now binds success to a monotonic, memory-only
generation and exact selected File identity. Password/file changes and Cancel immediately
invalidate the generation; stale test success/failure is discarded. Confirmation resets on
generation changes. Import requires the same generation/file before entry and again after
its existing validation/decryption, before any replacement writes. No password is persisted;
existing import-time validation and storage/replacement semantics remain intact.

`tests/e2e/next8.mjs` now defers real WebCrypto decrypt completion, changes the password
WHILE the test is in flight, then releases the old successful result. It checks restore stays
blocked and storage unchanged before a new current-password preflight succeeds. This runs
across all eight width/theme combinations (not merely a password edit after validation).

Follow-up gates: TypeScript, ESLint, full units (**709 passed, 1 opt-in skipped**), build and
budget gate exited 0. New artifact **814396 raw / 249951 gzip bytes**; unchanged raw ceiling
819200, gzip remains above target but below hard ceiling. Logs:
`/root/.hermes/cache/scratch/slip-preflight-units.log`, `slip-preflight-build.log`,
`slip-preflight-next8.log`. Affected browser suite exited **0: 217 next8 checks passed**,
including deferred stale-success rejection in all eight width/theme combinations.
Docs audit and `git diff --check` also exited 0. Writer preview :4183 stopped after completion.
Source is frozen for parent's independent review; no full-run green claim for this artifact.
Parent's independent full run timed out at 600 seconds near the end of next8 without a final
summary: **parent full-suite green is NOT established**. Prior writer full-suite success
below belongs to the pre-audit artifact and does not certify this follow-up artifact.
No commit, push, deploy or funds movement. Only blocker code, its regression and this evidence
were changed in this follow-up.

## Implementation and measurements

Bundle diet first: 47 exact repeated JSX class strings factored into `src/ui/classes.ts`.
No CSS aliasing, removed functions, dropped gallery, dependencies or budget changes.
Diet-only build: **805591 raw / 246735 gzip bytes**, raw saving **13189 bytes**.
Final feature build: **813967 raw / 249787 gzip bytes**, raw saving **4813 bytes**
against baseline and **5233 bytes** below the unchanged 819200-byte ceiling.
Gzip grew, not shrank: 230 KiB target remains unmet; 300 KiB hard ceiling passes.
These gzip figures use Python gzip defaults consistently; build/gate reports round KiB.

The broad component diff is exact class-string factoring, preserving runtime class attributes.
Feature changes live in Readiness, Status, Till, Backup, History and ReceiptHandoff;
`src/core/selling-guidance.ts` is display-only. CSV escaping prefixes dangerous formula-like
cells without changing column order or monetary calculations. Existing money/status,
Web Locks, IndexedDB witnesses, backup encryption and replacement engines are unchanged.

## Executed gates

Sequential runbook chain, exit 0 on final run:

- `npx tsc -p tsconfig.json --noEmit`
- `npx eslint .`
- `npx vitest run`: **709 passed, 1 opt-in live-chain skipped**; 62 files passed, 1 skipped.
- `npm run build`: scan-bundle clean; log `/root/.hermes/cache/scratch/slip-next8-build.log`.
- `node scripts/docs-audit.mjs --strict`: 24 entries, passed.
- `node scripts/contrast-audit.mjs --strict`: **29/29** AA pairs.
- `node scripts/lint-tokens.mjs`: exit 0.
- `node scripts/check-budget.mjs`: exit 0, raw/gzip warnings only.
- `node scripts/tap-audit.mjs 'http://[::1]:4183/'`: **0 below 44px floor**, 169 below 48px target.
  The no-argument command initially failed because its historical default is IPv4 :4183;
  the explicit actual preview URL is required. No target threshold was lowered.
- `git diff --check`: exit 0.

Unit evidence: `/root/.hermes/cache/scratch/slip-next8-units.log`.
New `tests/next8.test.ts` was observed RED (missing implementation), then GREEN;
12 added units cover invalid rates, coin-aware exceptions and formula injection.
Registered `tests/e2e/next8.mjs` has 201 checks including 320/390/768/1440, both themes,
24px root-text stress, keyboard busy-mode escape, offline/reconnect transitions,
invalid file/wrong password/preflight invalidation and non-mutation, byte-identical
preview/download, copy failures, and simulated native-share success/cancel/failure.
Actual mounted LTC exception states are driven by synthetic provider observations and
browser clock advance, not invented real-chain evidence.

First full browser run passed all except demo: a fixed 700ms post-exit sleep raced
asynchronous cleanup/navigation. `tests/e2e/demo.mjs` now waits for the non-demo URL
and visible real till. Final full runner against the final artifact exited **0**:
**All 27 browser suites passed**, including site-polish (192), round2-polish (80),
and next8 (201). Exact log: `/root/.hermes/cache/scratch/slip-next8-final-browser.log`.
No source edits or rebuild happened while that runner read dist. Preview :4183 was stopped
after completion; pre-existing :4181 was left untouched. Browser suites regenerated
`screenshots/offline-sale.png` and `screenshots/wizard-done.png`; these are test byproducts,
not intended changes, and remain unstaged for parent exclusion/restoration.

## Captures and evidence

- Before: `/root/.hermes/cache/scratch/slip-next8-before/` (baseline round2 suite).
- After: `/root/.hermes/cache/scratch/slip-next8-after/` (width/theme named surfaces,
  readiness and export locator captures, handoff/recovery and LTC exceptions).
- Browser logs: `/root/.hermes/cache/scratch/slip-next8-final-browser.log` (final),
  `slip-next8-all-browser.log` (first full run), `slip-next8-browser.log` (focused run).
- Diet log: `/root/.hermes/cache/scratch/slip-next8-diet.log`.
- Tap log: `/root/.hermes/cache/scratch/slip-next8-taps.log`.

A 320px receipt inspection found an existing proof row squeezing its text beside the code
at large text size; the row now stacks below 520px. Measured final receipt page/card
horizontal overflow: **0/0** at all eight width/theme combinations. Native-share outcomes
use injected browser APIs; no claim of OS-level delivery. Screenshot vision is advisory;
DOM checks are authoritative for overflow and control presence.

## Limits and handoff

No commit/push/deploy, version change, credentials read, funds moved, physical phone test,
physical printing, merchant trial, new dependencies or backend. No auto printing or refunds.
Remembered busy mode is local to this browser drawer, not device sync. It folds Tools while
preserving its disclosure and controls. Rate evidence is the stored last-used value/time,
not a fresh provider quote or guarantee for a different coin/currency. Backup dates are
requested downloads, not confirmed off-device copies. Restore still spans separately
coordinated records, not an all-or-nothing transaction. Missing/forgotten backup material
cannot be recovered from a server. Parent owns independent review and any release.

Port 4181 was occupied by pre-existing PID 3616437 and was not stopped. Writer preview
used :4183 (tracked process `proc_fc7779a74a83`); only that writer process is stopped at
closeout. Generated screenshot originals are not staged; parent must preserve that rule.
