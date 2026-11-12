# Kimi handoff

## 2026-11-12 — a lock on the till, a word for an overpayment, and docs that were lying

Live is **v0.31.59** on both the Pages origin and `slip.giveabit.io`, verified against the live DOM
not just the deploy log. Tree clean, everything pushed to `master` and `v2-foundations`. Commit
`5a7dc10` is the version commit; `dd7099a` is the feature.

Read `docs/RESUME-2026-11-10.md` before touching the till, then `docs/NEXT-TEN.md` — rewritten today
as **What is actually open**, because five of its ten items had shipped and one pointed at a file that
does not exist. A list that lies is worse than no list.

Short version:

- **The till lock** (`core/lock.ts`, `ui/Lock.tsx`, Settings). A 4–8 digit PIN, stored as a salted
  PBKDF2-SHA256 hash (120k iterations) and never as the PIN. A shop with a PIN is locked **on every page
  load** and after N quiet minutes (1/5/10/30/never). Locked is a **whole-app** state: the shell returns
  the lock screen, so there is no header, no tabs and no books. The copy says it is a curtain, not
  encryption, and that a forgotten PIN is unrecoverable — recovery is the backup file.
- **Overpayment** (`core/orders.ts`, `history.ts`, `Till`, `History`, `reconcile`). Every observation now
  records `receivedAtoms`; `overpaidBy()` names the excess above 1%, symmetric with the short rule. It is
  deliberately **not a status**: the merchant has the money, so the sale is complete and the totals stay
  at the ask. Named in words in five places — receipt block, Books row (`· over by N sats`), printed
  receipt, printed day close, CSV column. Demo proves it: **Sales 5, Gross 431,000**, `inv_demo_00` at
  **35,000** with its 2,800 named and in no total.
- **Tests: 640 unit + 1 skipped, 18/18 browser suites.** New: `tests/overpaid.test.ts` (10),
  `tests/e2e/lock.mjs` (15 checks), `tests/e2e/overpaid.mjs` (6 checks).
- **Docs brought back to the truth this session:** `README.md` (it still claimed 436 tests, seven suites,
  485 KB and "there is deliberately no selling screen yet"), `docs/FEATURE-MAP.md` (added the lock,
  overpayment, A4 close, customer sheet, limits, installable, keyboard rows, and repaired a table tail
  that had six rows glued together), `docs/ARCHITECTURE.md` (new modules, the real eleven-gate recipe,
  and the `pkill` warning), `docs/MERCHANT_GUIDE.md` (§3s lock, overpayment subsection), `docs/NAV-MAP.md`
  (lock is a gate inside Settings, not a 22nd panel), `THREAT_MODEL.md` (the unattended counter, and that
  the lock is not encryption), `PRIVACY.md` (what is actually stored, and the stale "when the payment
  engine lands" paragraph), `DECISIONS.md` (D-60 overpayment, D-61 the curtain).
- **`scripts/manual-shot.mjs` can now photograph a section**, not only a panel — the two new manual cards
  describe a part of Settings and a Books row. `npm run manual` → 24/24; `docs/EDUCATION.md` regenerated.

## Watch out for

- **Wire budget is 229 KB against a 230 KB target.** These two features spent the headroom. The next
  addition needs a diet, not a shrug.
- **Deploy credentials:** run `bash scripts/deploy.sh patch` with **no** `CLOUDFLARE_API_TOKEN` exported.
  The script only reads `/root/.hermes/cf-credentials.env` when that variable is unset; a stale export
  makes it skip the file and fail with `missing CLOUDFLARE_ACCOUNT_ID` (it happened twice today).
- **`npm run build` kills `vite preview`.** Build first, then start the preview with `--strictPort`, then
  run the suites. Kill it by PID (`pgrep -f "^node .*slip/node_modules/.bin/vite preview"`), never
  `pkill -f "vite preview"` — that pattern matches the shell issuing it.
- **`vision_analyze` returns 401** on every image this session, so nothing visual has been *seen*: the
  lock screen, the balance of the new manual cards and the customer sheet rest on DOM geometry and
  pixel measurement. If it works for you, look at `screenshots/manual/lock.png` and
  `screenshots/manual/overpaid.png` first.

## What is still unproven (unchanged, and it is the headline)

Camera on a real phone · a funded sale on a real chain (the LTC faucet is behind Turnstile) · a stranger
running `docs/MERCHANT-TRIAL-LTC.md` · a real device install · the A4 close on paper. See
`docs/NEXT-TEN.md` §1–3, §7–8. **No feature written today changes any of those.**

---

## 2026-11-10 — the footer, and six stale things repaired

Live is **v0.31.25** (both origin and vanity), CI green on `9826a6d`. Everything in this note was
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
