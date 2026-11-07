# BRIEF FOR FABLE — build v2 of slip's interface

Status: **ready to build** · digested from Claude's Pack v1 by Kimi · 2026-11-07
Source of truth for the design: `docs/AUDIT-OF-CLAUDE-V1.md` (verdicts) + Claude's pack (values, marked
ACCEPT above) · Product law: `docs/DESIGN-DECISIONS.md` D-33 → D-86 · Prompt that produced the pack:
`docs/PROMPT-FOR-CLAUDE-REDESIGN-V2.md`.

Read this whole file before touching a keystroke. It is a contract, not a suggestion.

---

## 0. The pipeline you are inside

```
Cam (owner) ──> Claude (design: concept, tokens, screens) ──> Kimi (audit: every row vs the code)
                                                                    │
                                                    accepted rows ──┴──> YOU (Fable: build, pass by pass)
                                                                    │
                                                    delivery report ──> Kimi (gates re-run, live verify) ──> Cam
```

You build **only what is in this brief**. If Claude's pack and this brief disagree, this brief wins. If
this brief and the code disagree, the code wins and you stop and say so. You may not redesign, re-scope or
reinterpret: propose, don't improvise.

**Do not run `scripts/deploy.sh`.** Deployment is Kimi's. You commit, you report, you stop.

---

## 1. The product, in six sentences

`slip` is a free, open-source, **non-custodial, serverless point of sale for Bitcoin**. A merchant pastes
public wallet material once (xpub / descriptor / single pubkey / static address / Lightning address) and
every sale pays **directly into their own wallet**. No backend, no accounts, no analytics, no cookies, no
CDN, no runtime font. slip **cannot spend**: the worst possible bug is a misdisplayed address. It ships as
one file, `dist/index.html`, built by Vite with `vite-plugin-singlefile`, with the inline bootstrap pinned
by a CSP hash. Live: https://slip.giveabit.io · repo `kitsboy/slip`, `master`, MIT · **v0.31.0**, 562 unit
tests, 12/12 browser suites green.

---

## 2. The tree — every path in this brief exists

```
src/
├── main.tsx                  boot; ?explain=1 → customer page
├── App.tsx                   the shell: <Group id> sections, header, phone nav, desktop sidebar
├── index.css                 ★ ALL tokens and utility classes live here (not theme.ts)
├── ui/
│   ├── Till.tsx              counter: catalog, cart rail, rate field (:1131), charge(), receipt
│   ├── History.tsx           Books: today line, rails, digest, CSV, close the day
│   ├── Requests.tsx          Money in: standing requests + budget clock  ← see §5 P-4
│   ├── Counters.tsx          Setup → wallets: paste code, address 0/0, check balance
│   ├── WalletPicker.tsx      eight wallet guides
│   ├── Wizard.tsx            five-step setup (wizard:draft persistence; PIN never stored)
│   ├── Settings.tsx          business, currency, tax, text size, density, assist switches
│   ├── OpenTill.tsx          shift card: open / say who's on / close
│   ├── Readiness.tsx         four rows; counts only non-manual rows (:71)
│   ├── NextStep.tsx          next-action strip
│   ├── AmountPad.tsx         56px keypad + quick amounts
│   ├── TabIcon.tsx           inline SVG icons
│   ├── InfoVideo.tsx         clip mounts only on tap
│   ├── Explain.tsx           the (i) for one number
│   ├── FreshnessRing.tsx     age ring
│   ├── CustomerDisplay.tsx   second window (BroadcastChannel)
│   ├── Explainer.tsx         ?explain=1
│   └── Backup, BookSeal, Glossary, Manual, Tech, HowItWorks, Status, Verify, EmptyState, …
├── core/
│   ├── settings.ts           ShopSettings, AssistOptions, sanitizers
│   ├── theme.ts              dark/light/high-contrast choice — CHOSEN, not tokens
│   ├── ledger.ts             items, invoices, refunds, requests
│   ├── accounts.ts           accounts, repository, active counter
│   ├── shifts.ts             hashed shift log
│   ├── money.ts              BigInt maths — DO NOT TOUCH
│   ├── derive.ts             addresses from xpub/descriptor
│   ├── keys.ts               the one rule (refuses secrets)
│   ├── tabs.router.ts        SECTIONS = sell | money | books | setup | more | learn
│   └── providers/            rates, explorers, lnurl
├── tests/                    vitest + tests/e2e/*.mjs
└── scripts/                  deploy.sh, scan-bundle.sh, contrast-audit.mjs, docs-audit.mjs,
                              shots-matrix.mjs, demo-check.mjs
```

---

## 3. The nine gates — every pass ends green on all of them

| Command | Expected output |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | no output, exit 0 |
| `npx eslint .` | no output, exit 0 |
| `npx vitest run` | `Tests 562 passed` (or more — never fewer) |
| `npm run build` | writes `dist/index.html`, CSP hash regenerated |
| `node scripts/scan-bundle.sh` | `clean (NNN bytes)` — no off-origin URL |
| `node scripts/contrast-audit.mjs --strict` | every pair ≥ AA (target ≥ 7:1 for body) |
| `node scripts/docs-audit.mjs --strict` | exit 0 |
| `npx vite preview --port 4181 --strictPort` then `node tests/e2e/run-all.mjs "http://[::1]:4181/"` | `All 12 browser suites passed.` |
| `node scripts/demo-check.mjs https://slip.giveabit.io/` | `8/8 pipes passed` + `nothing left the device` |

**Never weaken a test to pass a redesign.** If a selector legitimately moves, update the test so it still
asserts the *same meaning* (something visible, something true). A test turned into a no-op is a lie.

---

## 4. The law you may not bend

1. **The one rule.** Never accept, store or transmit a seed phrase, `xprv`/`yprv`/`zprv`/`vprv`/`Ltpv`/
   `Mtpv`/`ttpv`, WIF or a hex private key. Refuse instantly, wipe the field, red warning, **never echo it**.
2. **No custody.** slip can never spend.
3. **Honesty labels inviolable.** `submitted ≠ confirmed`, `seen ≠ paid`, manual says manual, demo says
   simulated, "Paid" only when observed. A cue is a courtesy, never evidence. Every status carries a
   **word**, never colour alone. Manual = dashed badge, simulated = hatched badge — distinguishable in
   grayscale and print.
4. **No network** except merchant-configured endpoints. No fonts, analytics, telemetry, cookies, audio
   files.
5. **Red for danger only.**
6. **Plain language first**; technical vocabulary behind `showTechnical` (default **off**).
7. **Never delete a tool to calm a screen.** Fold it, move it, relabel it.

---

## 5. The passes

Each pass is independently shippable. Until P-6, **the new look lives behind `html[data-skin="v2"]`** and
is opened with `?skin=v2` (read with `location.search` inside the existing bundle — no new CSP surface, no
new storage key). The live default stays the current look until the flag day, so **the till keeps selling
after every commit**.

For every pass: **name the tests your DOM changes touch**, and repair them in the same commit.

### P-0 — the instrument (2 h, do this first)

- `scripts/shots-matrix.mjs`: eight screens (**add pay, receipt, customer, wizard/compare**) × three
  canvases × two themes = **48 frames** into `docs/shots/matrix/`. `money-in` must use `hash: 'requests'`
  (fixed already).
- `?skin=v2` preview hook.
- Deliver: 48 frames, and the two screens that were never photographed before now exist.

### P-1 — foundations (8 h)

Files: `src/index.css` (tokens + primitives), `index.html` (favicon), `src/core/theme.ts` (theme choice only).
Spec: Claude's D2, with these fixed values:

- **Accent stays warm — the family brass.** `--acc: #a84808` light (5.84:1 with white text), `--acc: #f0a32a`
  dark (8.6:1). The *budget* rule is new, the hue is not.
- Neutrals/ink/good/warn/bad/line/edge: Claude's table (ratios independently re-measured: ink/bg 15.59,
  ink-2/bg 7.68, edge/card 4.73, acc-hue figures above).
- Radii: 6 / 12 / 20 / full only. Borders: 1 px, 2 px only. Elevation: E0 / E1 / E2 only.
- Motion: `--m-press 90ms`, `--m-state 160ms`, `--m-feed 240ms`, `--m-exit 160ms`, `--m-ink 400ms`;
  `prefers-reduced-motion` → opacity-only 80 ms.
- Type: system stack, **zero font bytes**; `--t-hero: clamp(36px, 11vw, 80px)`; `--t-money: 20/24`;
  titles 18; body 16; label 14; caption 12; stamp 12/16 700 uppercase +0.08em; mono only for addresses/ids.
  Tabular numerals on every changeable digit.
- `--line` is decoration only → **add a lint test** that fails if `var(--line)` borders an interactive
  element.
- Marks: Claude's SVG wordmark + torn-slip mark, inline, `currentColor`, favicon from the same path.
- Forced colours + `prefers-contrast: more` fallbacks.
- Gates + `?skin=v2` frames (tokens only; layout unchanged). Rollback: revert commit.

### P-2 — components (16 h)

Files: `src/index.css`, `src/ui/{EmptyState,Readiness,NextStep,TabIcon}.tsx`, new `src/ui/primitives/*`.
Spec: Claude's D4, C-01…C-23, exactly as written, including:

- `aria-disabled` + a **named blocker line** under every disabled primary (D-83) — never `disabled`.
- Badge: dot + word; manual dashed; simulated hatched; status words come from the existing FROZEN strings.
- `DataRow` with dotted leaders as `<dl>/<dt>/<dd>`.
- Keypad keys ≥ 64×64; primary 56; every target ≥ 48.
- Acceptance: a component gallery route under `?skin=v2` in both themes, axe-clean, and 320 px with no
  horizontal scroll.

### P-3 — the counter (22 h)

Files: `src/App.tsx` (shell only — **five destinations stay: Sell · Money in · Books · Setup · More**),
`src/ui/{Till,AmountPad,OpenTill,Lightning}.tsx`.
Spec: Claude's S-01, S-02, S-08, shell — with these corrections:

1. **Five tabs, not four.** Setup remains a destination. Apply the new visual language to all five; the
   active state is `3px --ink` bar + weight 700 + `aria-current`, never accent.
2. **DEMO ribbon sits in normal flow above the header** (Claude's A1 header overprint fix), text FROZEN.
3. **The Bitcoin price field leaves the sale path** into a Tools sheet; its value stays visible as a
   read-only line in the cart slip; **storage keys unchanged**.
4. **Keyboard digits must not double as tab switches** while a keypad or field has focus. Scope them
   (no focused control → tab), or omit them. Existing shortcuts `/ c n p` keep their behaviour (D-76).
5. Charge bar: sticky, 56 px primary, named blocker when unavailable; `data-charge-blocker` preserved.
6. Cart line removal keeps the Undo notice (D-83) — 6 s, `role="status"`.
7. Acceptance, in a browser: Charge visible without scrolling at 390×844; `scrollWidth === 320` at 320;
   tab order Search → chips → tiles → Tools → Charge; zero marketing headline on Sell after the first sale;
   ≤ 1 accent fill per viewport; a paid sale still returns to a usable counter with "Next sale".

### P-4 — money screens (16 h) — **re-specified, because the captured evidence was wrong**

`phone-money-in-*.png` in Claude's pack was actually **Books** (a defect in our instrument, now fixed). So:

- **Money in (`Requests.tsx`) keeps every standing-request tool**: request label, cadence, amount, wallet,
  "pay this request" QR, the budget clock, and the waiting strip. Redesign the *presentation* — DataRows,
  tags, one group header, refunds reachable in a sheet — and **keep the tool count identical**. Use
  Claude's S-04 layout ideas only where they do not delete a request control.
- **Books (`History.tsx`)**: hero slip with the day total (Claude's S-05), leaders instead of four boxed
  tiles, digest chunked, `Close the day` primary, CSV unchanged (same columns — golden test).
- **Receipt**: screen slip + `@media print` black-on-white, 80 mm, status word survives B/W, print via the
  existing Blob URL path (never `document.write`).
- Acceptance: an unconfirmed sale never appears under "Confirmed"; "Stamp" never says "confirmed"; FROZEN
  strings byte-identical; CSV columns unchanged; Money in still lists a standing request after a reload.

### P-5 — setup & more (22 h)

Files: `src/ui/{Counters,Wizard,WalletPicker,Settings}.tsx`, `src/core/settings.ts` (**no key renames**).
Spec: Claude's S-06 and S-07, plus:

1. **Readiness counts what it lists** — the backup row is `manual`; label it "Optional" instead of counting
   it, so "2 of 3 done" never sits above four rows (E12, a real defect).
2. **Compare step is mandatory** after a paste: first receive address in 4-char groups, first and last 6
   bold, "They match" / "They don't match"; "don't match" reaches a stop state that no dismissal can turn
   into a sale; compare against the **derived** address, never a re-parse.
3. Addresses everywhere: 4-char groups, bold ends, `slashed-zero`; **Copy copies the ungrouped string**; the
   QR payload is never touched by formatting.
4. Private-key paste: wipe < 100 ms, never render back, red notice with words.
5. Setup never shows `xpub`/`BIP-` vocabulary with `showTechnical` off.
6. More: rows + Proof card (FROZEN strings, single `--good` dot) + Learn accordion with search; **every
   former Learn paragraph still present in the DOM** (diff the text content, don't trust your eyes).

### P-6 — flag day (8 h)

- Make v2 the default, delete the v1 skin and the flag, remove dead classes, refresh every screenshot,
  update `docs/DESIGN-BIBLE.md` and CHANGELOG, bump minor.
- Tag `pre-v2` **before** the merge commit so one revert restores the old interface.
- Gates: all nine, plus `demo-check` against the deployed origin run by Kimi.
- Deliver: the 48 frames, the revert proof (a working till after reverting in a scratch worktree), and the
  delivery report.

---

## 6. Delivery report — the format you return

```
PASS: P-3
COMMITS: <sha> <subject>            (one per pass, never a squash of two passes)
FILES: <path> — <what changed, one line each>
SPEC: S-01 S-02 S-08 shell           (which IDs are now built, and which are partial)
TESTS REPAIRED: <file> — <test name> — <why it moved, not what you deleted>
GATES: tsc 0 · eslint 0 · vitest NNN · build 0 · scan clean(NNN) · contrast NN/NN · docs 0 · e2e 12/12
FRAMES: docs/shots/matrix/<list>
NOT DONE: <anything you refused, deferred or could not verify — with the reason>
ASSUMPTIONS: <anything you had to decide that this brief did not settle>
NEXT: <the next pass, or the blocker>
```

A pass with a red gate is not delivered. A pass without frames cannot be reviewed. **"It looks better" is
not a delivery report** — the frames and the gate output are.

---

## 7. Glossary (so you never guess)

Bitcoin terms — **xpub/zpub** public wallet code (watch-only), **descriptor** longer form, **static
address** one reused address, **watch-only** can see, cannot spend, **sats** 1e8 per bitcoin, **on-chain**
mined, **Lightning** instant second layer, **BOLT-11** `lnbc…` request, **Lightning address**
`shop@host`, **LNURL-pay** the protocol behind it, **Silent Payments (BIP-352)** reusable address, fresh
per payer, **BIP-84/48/85** address format / account structure / child-seed derivation, **mempool** where a
payment is *seen* before mined — **seen is not paid**, **confirmations** blocks on top.

Product terms — **ledger** local record, **invoice** one charge with address + amount + status + 15 min
expiry, **address index** which address this sale uses (#0, #1…), **shift** the day's hashed log,
**handoff** who holds the till, **float** cash counted at open, **manual confirmation** the merchant's
word, not slip's observation, **rehearsal** a practice sale that writes nothing, **demo drawer**
`slip.demo.*` + `?demo=1`, network answered locally, **customer display** second window showing amount + QR,
**standing request** a recurring ask (rent on the 1st) — Money in's real subject.

Design/engineering — **token** a named value, **OKLCH** colour space, **AA/AAA** WCAG contrast grades
(4.5:1 body, 3:1 large/UI), **tabular numerals** equal-width digits, **thumb zone** lower third, **safe
area** `env(safe-area-inset-*)`, **sticky** stays while content scrolls, **breakpoints** Tailwind
`sm/md/lg/xl`, **elevation** shadow depth, **focus-visible** keyboard-only ring, **reduced motion**,
**CSP** Content-Security-Policy, **single-file build**, **unit tests** vitest, **browser suites**
Playwright, **e2e build** the built file served by `vite preview` on 4181.

---

## 8. The one line to keep in mind

> A shopkeeper with a customer waiting must be able to take the money in two taps, and a stranger looking
> at a screenshot must be able to tell that this till never lies.

Begin with P-0, stop at the delivery report.
