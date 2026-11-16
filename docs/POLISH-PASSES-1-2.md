# Polish passes 1–2 — saving/recovery and the selling screen

## Delivered

- Failed writes tracked independently per record. Unrelated writes cannot clear an unresolved warning. Ordinary consumers read disk only; recovery export explicitly accesses pending values.
- Retry rebases independent concurrent changes and refuses conflicts. Failed retries retain the original local delta. localStorage remains best-effort read-modify-write, not an atomic cross-tab transaction.
- Encrypted backup includes the unsaved cart and raw failed records. Export does not clear failures. Recovery notes are informational and are not automatically replayed on restore; saved ledger data follows the existing restore path.
- Browser persistence checked live at boot; Ask again actually requests protection. Backup remains necessary.
- Split payment codes are displayed/published only after both legs are saved. A failure retains the cart and blocks a new charge until pending writes are resolved.
- Selling screen has one dominant total, compact Charge with the amount retained in its accessible name, phone Review sale shortcut, current-sale heading, 44px cart controls, visible Tools labels, currency suffix in rate field, accessible category selection, and readable status messages.

## Verification before release

- TypeScript and ESLint passed.
- 659 unit tests passed; 1 opt-in live-chain test skipped.
- All 19 browser suites passed, including encrypted recovery, full-disk retry, unrelated-write isolation, and a second split-leg failure.
- Documentation audit, token audit, 29/29 contrast pairs passed.
- At 320×700, 390×844, 834×560, 1440×960: zero page overflow, a complete item and Charge inside the viewport. Phone/desktop screenshots inspected.
- Bundle under hard ceiling; gzip roughly 233 KiB, above the 230 KiB target (warning only). No runtime dependencies added.

## Scope

Only the first two approved passes. Receipt/customer-display polish and Books/footer polish remain unimplemented. Real camera, physical print, and funded payment tests remain human/device exercises; browser results do not prove them.
