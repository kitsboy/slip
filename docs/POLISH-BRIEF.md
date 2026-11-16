# slip — Polish brief for an external design/QA model

*Read this first when you pick up slip. It gets you oriented in one pass and, more
importantly, tells you what NOT to redo and what is frozen. The design system and the
product constitution are below; do not design without them.*

---

## 0. Where slip stands right now (verify, don't assume)

- **Live and shipped:** v0.31.61 on both origins — the Pages origin
  (`https://slip-6d6.pages.dev/`) and the vanity host (`https://slip.giveabit.io/`).
  Confirm with `curl -s <url> | grep -o 'slip-version" content="[^"]*'`; both must read
  `v0.31.61` before you claim anything about the running build.
- **Working copy:** `/root/slip`, branch **`master`** on THOR. It is currently green and
  clean. Start from a clean tree.
- **Load the skill first:** `skill_view(name='slip-product-lane')` — it is the full
  operating manual, including the gates, the ship order, and every pitfall learned the
  hard way. This brief is the orienting layer; the skill is the ruleset.
- **Read the constitution before designing:** `docs/DESIGN-DECISIONS.md` (tail — D-33…
  D-83), `docs/VISUAL-GRAMMAR.md` (layout/type/colour/motion rules), and
  `docs/DESIGN-BIBLE.md` (signature moves and how each is measured).

## 1. The queue — what is next

`docs/NEXT-TEN.md` Part 2 is the ordered backlog. **Items 2.1–2.3 are already shipped
(v0.31.60) — do not redo them.** They are: persistent-storage request + honest answer,
the dated backup nudge, and the loud save-failure guard. If a brief or conversation
mentions them as "to do", it is out of date; the code is in `src/core/persist.ts`,
`src/core/backup.ts` (record/lastBackup), `src/core/save-state.ts` + `guardedSetItem` in
`src/core/storage.ts`, and `src/ui/SaveWarning.tsx`.

**The actual queue (one small ship at a time, most impactful first):**
2.4 receipt numbers, 2.5 "yesterday was never closed", 2.6 customer-held record, 2.7
standalone print + raw ESC/POS, 2.8 the two-counter decision (a product decision — do
not drift into it unprompted), 2.9 the bundle diet, 2.10 tap targets 44–48px.

The roadmap also distinguishes **code jobs** from **things still blocked on a human**
(the camera needs a real phone, a funded sale needs a captcha, a stranger's trial needs
a person, real A4 needs paper). A blocked item is not a task you can finish — say that
plainly rather than invent a workaround.

## 2. How to work here (the non-negotiables)

- **The gates are the definition of done.** Before a ship: `npx tsc --noEmit`,
  `npx eslint .`, `npx vitest run` (read the count from output), `npm run build` (must
  end in `scan-bundle: clean`), `node scripts/docs-audit.mjs --strict`,
  `node scripts/contrast-audit.mjs --strict`, `node scripts/lint-tokens.mjs`. A change
  that breaks one is wrong even if it looks better.
- **Budget is a hard ceiling.** The app ships as ONE `dist/index.html` with a hash-pinned
  CSP and runs ~236 KB gzip. No new runtime dependency, font, or media source without a
  stated reason. 2.9 (bundle diet) exists precisely because weight is the enemy.
- **Honesty is not a label, it is the product.** Never say `paid` unless the engine
  observed it; `seen` ≠ `paid`; manual confirmations say manual; demo money says
  simulated. The footer's "nothing phones home" claim is measured (a live request
  counter), and its wording was fixed to hold at any count — do not re-assert a hard
  "no analytics" promise beside a non-zero counter.
- **No custody, ever.** Never accept, store or transmit a seed phrase, mnemonic, private
  key (`xprv`/`yprv`/`zprv`/`Ltpv`/`Mtpv`/WIF/hex). Reject and wipe it. Money math is
  frozen: per-coin totals, the overpayment-as-a-note rule, and everything in `core/`
  are not design targets.
- **The page stays a dim warm night in every theme but high contrast.** Cam cannot read a
  bright page, and pale grey type on it is unreadable. Light text on a dark ground,
  labels at 16px in the ink colour (never 11px grey), cards a step lighter than the
  ground, solid bars. The open tab is ink-ruled, not brass; brass (`#f0a32a`) fills at
  most one primary control per screen. Do not "brighten" the page to look more modern —
  that is the single most likely mistake.

## 3. Visual-polish starter cut-list (suggested order)

These are the highest-leverage frames for a first polish pass. For each one, capture it
with `node scripts/shots-matrix.mjs` against the preview server on `:4181`, judge it by
**one yes/no question per element checked in the DOM** (never a broad "judge this UI"),
and measure the element you changed with `getBoundingClientRect`/`getComputedStyle`.

1. **The counter's first viewport** (phone 390×844 and 320×700): a tappable item and
   Charge must both fit inside the viewport height, `scrollWidth === clientWidth`, exactly
   one total at total size (sats lead on a Bitcoin till, fiat-small beneath).
2. **The pay screen** — at least 16px white padding around the QR, the QR decodable
   (`jsqr`) not just looking square, the price code fitted not clipped.
3. **The receipt** — holds its width at 320, stacks correctly under 520, honest status
   badge.
4. **Books / day close** — the day's line leads with the shopkeeper's number; print
   stays the till roll, A4 is a separate clean sheet with the same words.
5. **The customer screen** (`?display=1`) — shop name, one figure, QR; no wallet label.
6. **The footer** — three blocks at 16px ink, the request counter named hosts fitting
   the column at 390 and 1440.
7. **Setup / onboarding** — first viewport carries one page-name heading, body text
   computes to ≥16px, explanations live behind the `?`.

The full design-pass plan (P-0…P-6), the paste-ready external-model prompt, and the pass
acceptance are in `docs/BRIEF-FOR-FABLE-V2.md` §5 and `docs/DESIGN-UPGRADE-BRIEF.md`
§5+. Only claim a pass done after checking its state against the repo — the brief's pass
list is a plan, not a progress record.

## 4. Avoid these specific mistakes (each is in the skill with detail)

- **Do not run a browser suite against the live site or a stale preview.** Rebuild, then
  start `vite preview --port 4181 --strictPort` in its own background call; suites go
  against `http://[::1]:4181/`. A stale server tests the previous build.
- **Do not run `run-all.mjs` concurrently with vitest** — they fight over the preview and
  false-red.
- **Do not re-implement 2.1–2.3** (done). **Do not re-add a PDF library** for printing
  (~300–400 KB against budget — the browser's "Save as PDF" already works).
- **Do not hand-patch `ledger.ts` saves** — the guard exists; route through it.
- **Follow ship order exactly:** commit+push feature work → `deploy.sh` (bumps version,
  rebuilds, proves live) → commit+push the bump. Deploying an unpushed tree is how a
  version gets lost. After push, say "pushed, CI pending" until CI confirms.
- **The `?skin=v1` escape hatch is gone** — a query never selects the skin; the default
  (and only) look reports `data-skin="v2"`. The old till lives at the git tag `pre-v2`.

## 5. If you are told to "make it look great" without more detail

Deliver a **plan first and stop for the owner's go**: per-pass scope, files touched,
what it ships, the gates, an hour estimate. On slip the owner names a subset ("do all 5")
or leaves the pick to you; if you pick, ship one UI feature per pass, no feature repeats a
previous pick, each pass is its own commit+push+deploy so the till keeps selling between
passes, and the report ends with the next items numbered most-ambitious-first.

To the model reading this: the prior agents' job was to make this app *not need* a hero to
save it. Treat it as world-class and fragile — every improvement must survive the gates,
the budget, the honesty rules, and the dim-warm-page identity.
