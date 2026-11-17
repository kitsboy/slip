# Approved upgrades 1–7

Working tree only: no commit, push or deployment authorized in this task.

## Acceptance and sequence

1. Durable browser ledger coordination (Web Locks + IndexedDB authoritative witness), including atomic invoice/index creation, retry, restore, wipe and demo exit. Ordinary reads never return failed overlays. Custom test stores retain synchronous operations.
2. Customer-held digital receipt: fragment-carried self-contained record, no account/email/server record; honest observed/manual/demo wording; explicitly unsigned.
3. Daily receipt numbers allocated in the coordinated ledger, retained on cancellation; deterministic additive legacy migration; same reference on receipt/Books/CSV.
4. Guided day close: unresolved records, per-coin totals, export and backup checklist; explicit persisted close only when actual prerequisites hold.
5. Previous unclosed-day reminder linking the selected day's Books.
6. Test backup: decrypt, checksum/schema/hash-chain validation, contents summary, no writes.
7. Customer and receipt amount/QR/status hierarchy and 320px/large-text browser checks; no internal wallet labels.

## Evidence

Initial tree clean at `14ab84c` (v0.31.63). Read resume, development runbook, shift concurrency and proposal queue. Existing ledger has synchronous independent read/modify/write operations and separately committed derivation books: Web Lock alone cannot fix Chromium's stale renderer caches. Reuse/generalize the durable shift witness rather than transient markers.

Physical phone/camera/install/funded/printer checks are not claimed. Existing print controls remain; automatic printing and ESC/POS are explicitly out of scope.

## Implemented behavior

- Browser ledger mutations reuse the strict-durability prepared/committed IndexedDB witness under a record-specific Web Lock. Charge creates both split legs and burns their indexes in one draft transaction. Requests use the same atomic reserve/create path. Retry, restore, wipe and demo exit participate; ordinary reads remain disk-only, failed overlays remain recovery-only. Reconciliation checks the latest status before replacing a stale observation. All ledger write consumers were traced through Till, Lightning, SilentPay, Requests, Watchlist, AnchorPanel, History, Backup, Settings and demo seed. Browser writes require await; custom stores retain synchronous methods.
- Digital receipt QR encodes the self-contained record in a URL fragment, with a dedicated `?receipt=1` page. The fragment excludes wallet labels. Manual, observed and simulated wording are distinct; the page explicitly says unsigned/editable and not proof of merchant identity. Keep the complete URL: a saved HTML file alone may not preserve its fragment. Opening the link initially loads the app shell from its origin, but the receipt data is not uploaded. Physical camera scanning is unproven.
- UTC creation-day references use `YYYY-MM-DD-NNN`. Legacy allocation is deterministic (creation/id order), additive and persisted on the next mutation. Existing numbers survive updates/cancellation. Books, customer receipt, manual printed receipt, report and CSV share the reference; the read-only `window.slip.invoices()` surface includes it. Cancelled CSV rows retain the reference and explicitly zero takings.
- Books lists unresolved records, per-coin totals, a current report-download request and merchant-confirmed downloaded backup. The latest exported backup's ledger snapshot must match the selected day's fingerprint. A close is stored only after all prerequisites and a fresh authoritative transaction check. Subsequent day changes reopen it. Download requests are not claimed as OS-verified completed files. Books highlights the most recent previous unclosed day with an action selecting its date.
- Test my backup decrypts, authenticates, checks checksum, schemas, integer fields/indexes and staff hash chain without writes. It summarizes counters, sales and staff events; wrong passphrase/corruption rejects. Internal consistency is not proof the events happened.
- Customer display preserves amount/QR/status hierarchy, excludes internal labels, distinguishes manual/demo status, and formats Litecoin as LTC rather than sats. Customer receipt and display fit 320/390/1440 widths with 24px root text in browser proofs.

## Initial implementation evidence (superseded by review verification below)

All commands ran locally against this working tree; no commit/push/deploy occurred.

- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint .`: exit 0.
- `npx vitest run`: exit 0; **56 files passed, 678 tests passed, one opt-in live-chain test skipped**. Log: `$TMPDIR/slip-unit.log`.
- `npm run build`: exit 0, CSP/bundle scan clean. Log: `$TMPDIR/slip-build.log`.
- `node scripts/docs-audit.mjs --strict`: exit 0, 24 manual entries.
- `node scripts/contrast-audit.mjs --strict`: exit 0, 29/29 AA pairs.
- `node scripts/lint-tokens.mjs`: exit 0.
- `node scripts/check-budget.mjs`: exit 0; **786 KB raw / 238 KB gzip** as reported by gate; below 800/300 KB hard ceilings, **8 KB above gzip target** (warning retained, not hidden).
- `git diff --check`: exit 0.
- `node tests/e2e/run-all.mjs 'http://[::1]:4181/'`: exit 0; **All 22 browser suites passed.** Log: `$TMPDIR/slip-browser.log`. New ledger/upgrades suites are registered in runner.
- Ledger and shifts browser suites each passed **five consecutive additional paired runs**, including successful-writer closure/stale successor and failed-write retry/closure/stale successor. Each ledger run retained all five invoices with unique indexes and daily references. Shift logs: `$TMPDIR/slip-shifts-1.log` through `slip-shifts-5.log`.
- Upgrades browser suite decodes the actual receipt SVG using jsQR and compares its payload to the link; opens the receipt in a fresh browser context with no merchant state; tests 320/390/1440 large-text overflow; confirms real downloaded backup test success and wrong-passphrase refusal leave localStorage byte-identical; confirms explicit day close survives reload.
- Screenshots `$TMPDIR/slip-receipt-320.png` and `slip-customer-320.png` were visually inspected. A vision suggestion that the address might overflow was not reproduced: it has `break-all`, and measured page overflow is zero.

## Independent-review fixes and current verification

The initial green gates above did not establish correctness at protocol failure boundaries.
They are historical, not current release approval.

- Retain original intent across prepared-IDB, mirror and final-IDB acknowledgement failures; only durable acknowledgement clears pending/warnings. Both ledger and shift boundaries have injected-abort regressions. Explicit replacement can recover failed mirrors; null deletion intents also remain retryable.
- Invoice cancellation/manual acceptance and both observation legs revalidate full captured records against authoritative drafts and patch only current status fields. Delayed sweeps return only committed changes. Regression proves a delayed 40 cannot replace a newer 70 with the same status.
- Backup holds both coordinated locks to capture authoritative ledger/staff records. Prepared candidates and failed deltas are separate recovery notes, not silently substituted for committed books. Close evidence is the exact exported ledger. Built-browser test forces an exporting renderer's ledger read stale after another tab's commit, decrypts the downloaded file and verifies both invoices/indexes survive.
- Shared pre-write backup validation checks consumed collections, integer amounts, dates, IDs, receipt uniqueness, index books and invoice/refund relationships; absent additive collections and older files without books remain supported. Restore runs validation before its first write.
- Books provides confirmed manual acceptance for every blocking state and unpaid cancellation only where no received/seen/confirmed money exists. Browser regression cancels an expired zero-received sale, manually accepts a partial sale without losing its received amount, exports CSV/backup and closes/reloads the day.
- Customer receipts include network and split second-leg reference/coin/amount/address/status; no cross-coin addition. Real Till flow with fixture explorer responses completes both legs and opens the customer page. Real Litecoin Till producer is tested through the second-page display and receipt, not just a synthetic BroadcastChannel message. These are browser fixtures, NOT funded-chain evidence.
- Signet readiness captures baseline amounts/transaction count before showing a 10,000 test-sat request. Historical balance cannot pass: regression requires a fresh confirmed increase and new transaction. Lightning remains explicitly REAL MONEY, not testnet readiness. The investigator's opt-in live-chain pass used a historical mining payout, not a fresh sale. No transfer was performed here.
- Keep the FULL receipt link including its fragment; saved HTML alone is not promised to work. Receipt render tests cover signet, Bitcoin testnet4 and Litecoin testnet worthless labels and separate simulated wording.

Current commands all exit 0: TypeScript, ESLint, full Vitest (**697 passed, one opt-in live test skipped; 61 passing files**), build/CSP scan (**816155 raw bytes**), docs strict (24 entries), contrast strict (29/29), tokens, budget (**797 KB raw / 241 KB gzip**, 11 KB over target but under both hard ceilings), explicit-URL tap audit (0 below 44px; 168 below 48px target), and **all 23 registered browser suites**. Logs: `$TMPDIR/slip-review-units.log`, `slip-review-build.log`, `slip-review-browser.log`. The review-blockers suite is registered in run-all.

Five additional consecutive ledger+shift browser race pairs passed: `$TMPDIR/slip-review-ledger-{1..5}.log` and `slip-review-shifts-{1..5}.log`. Generated tracked screenshots are excluded from the changes. No runtime dependencies, commits, pushes or deployment.

Limit: existing backups containing internally inconsistent historical index books are rejected rather than silently repaired; the demo fixture's missing books were corrected. Cross-device, physical printer/phone, and fresh funded checks remain unproven. New regressions were not all run red before implementation; protocol boundaries, malformed collections and transition helpers were, while expanded browser proofs were added after fixes. Independent parent review remains required.

## Rendered payment-QR follow-up (supersedes earlier QR coverage)

The previous display-message/receipt regression did **not** prove the merchant's actual scanned payment QR. Reviewer correctly found hardcoded Bitcoin schemes still in Till primary and split/enlarged renderers and standing requests; the same trace also found the counter address-preview renderer. All four now choose scheme from the relevant wallet/invoice coin. Remaining literal `paymentUri('bitcoin')` calls are deliberately Bitcoin-only: the signet readiness request and the Bitcoin vector self-test. Existing BroadcastChannel producers already select each leg's coin.

Before any production change, `tests/e2e/payment-qr.mjs` rasterized the actual rendered SVGs and decoded them with jsQR. The completed RED run failed exactly five LTC checks (counter preview, single merchant sale, standing request, second split compact and enlarged); all five BTC equivalents passed. After the four renderer fixes, all ten exact URI/address/amount/label comparisons pass. The split is mixed BTC/LTC with a Base58 LTC address, so scheme selection cannot accidentally depend on `ltc1` prefixes. Explorer fixtures hold sales unpaid; no transfers or settlement claims are involved. This suite is registered in `run-all`.

Follow-up gates: TypeScript, ESLint, **697 units passed / one opt-in skipped**, build/CSP, docs strict, tokens, **29/29 contrast**, budget **797 KB raw / 242 KB gzip** (12 KB over target, under ceilings), explicit-URL tap audit (**0 below 44px**, 168 below 48px target), and **all 24 browser suites passed**. Logs: `$TMPDIR/slip-payment-qr-{red,green,build,units}.log` and `slip-payment-qr-browser-final.log`. Two initial full-suite attempts exposed the existing workflow test's immediate stale-message check racing its asynchronous cancellation; the test now waits for committed cancellation or stale refusal before retrying, without changing runtime cancellation behavior.

Browser suites ran from a scratch copy of the test harness, with the same built preview URL, so generated screenshot writes never touched the parent's tracked screenshot changes. Parent screenshot files were left untouched. No dependencies, commits, pushes, deployment or funds operations.

## Limits and integration review

Same-origin tabs only; no cross-device books. Close older app versions before using the new coordination protocol. Stale synchronous display reads can temporarily lag, but never become the next mutation's base. Missing Web Locks/IndexedDB rejects mutations; interrupted prepared witnesses deliberately require retry or explicit replacement. The mirror and witness are not one cross-database transaction. No runtime dependencies added. Test fixtures use public wallet material only; no wallets/secrets inspected, no funds sent. Phone camera/install/persistence and funded-chain/physical printer evidence remain separate human/device checks, as documented in `NEXT-TEN.md`.

Changed paths are discoverable with `git status --short`: core ledger/storage/shift witness, history/orders/findsale/reconciliation; async UI consumers; demo/main entry; new day-close/digital-receipt/test-backup modules and customer page; unit/browser tests; architecture/concurrency/queue documentation. Generated tracked browser screenshots are reverted, not part of the patch. Parent must independently review and choose commit/release/deploy.
