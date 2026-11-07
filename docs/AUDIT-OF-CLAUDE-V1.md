# Audit — Claude's Pack v1 (`slip — re-conception and redesign`)

Auditor: Kimi · 2026-11-07 · against `master` @ the v0.31.0 tree (562 unit tests, 12/12 browser suites).
Verdict scale: **ACCEPT** (buildable as written) · **ACCEPT-WITH-EDIT** (idea stands, values or scope change)
· **REJECT** (do not build) · **BLOCKED** (needs a new capture or the owner's word first).

**Headline: the best design pack this project has received. Build ~80% of it — after four corrections.**

The pack is disciplined, measurable and unusually honest about its own blind spots. It also contains one
false defect, one collision with an existing keyboard rule, one contradiction of an earlier IA ruling, and
one whole feature it did not know existed. Those four are the difference between a beautiful rebuild and a
broken shop.

---

## 1. What I verified myself

Every claim below was checked against the tree or by script, not accepted on trust.

| # | Claude's claim | Method | Verdict |
|---|---|---|---|
| E3 | The Bitcoin price field sits on the sale path before any item | `src/ui/Till.tsx:1131` `htmlFor="tl-rate"` is inside the Till render | **TRUE** |
| E12 | Readiness says "2 of 3 done" while listing four rows | `src/ui/Readiness.tsx:71-79` counts `checkable` (rows where `manual !== true`); the backup row is `manual` (`:50`) so the count is 3 while the list is 4 | **TRUE — a real defect, and a good catch** |
| E13 | Learn is ≈12,000 CSS px tall | vision + full-page capture | **TRUE** |
| E15 | The "0 requests · phoning nobody" proof is buried in grey 12 px text | vision on every frame | **TRUE** |
| E5 | ≈9 accent uses in one viewport | vision on `phone-sell-light` | **TRUE** |
| **E8** | **Money in and Books show the same page** | `src/App.tsx:430-448` — Money in renders `<Requests/>`, Books renders `<History/>`. They are different modules with different content | **FALSE — and the fault is mine** |
| D2 | Palette contrast ratios | recomputed WCAG from his hexes: ink/bg 15.59 (he said 15.64), acc/bg 6.75 (6.76), on-acc/acc 7.29 (7.27), ink-2/bg 7.68 (7.64), edge/card 4.73 (4.71) | **TRUE within 0.05 — his numbers are honest** |

### Why E8 is false, and what it costs

`scripts/shots-matrix.mjs` captured "Money in" with `hash: 'history'` — the Books section id. So the frame
Claude was given labelled `phone-money-in-light.png` **is Books**. The instrument was wrong, not the app.

Consequence: S-04 ("Money in" = *what has arrived, and what still hasn't*) is designed on a false premise —
it assumes the tab is a duplicate of Books. It is not. Money in is **standing requests and the budget
clock**: rent on the 1st, a recurring ask, a QR for a payer standing at the counter, and the blunt
"how long will the money last" clock. Claude never saw it because I never photographed it.

**Fix applied in this audit:** `shots-matrix.mjs` now captures `money-in → hash: 'requests'`. S-04 is
**BLOCKED** until a true frame exists; the Fable brief specifies it as "keep every standing-request tool,
redesign the presentation around it".

---

## 2. Row-by-row verdicts

### D1 — the position: **ACCEPT**

*Thermal Slip* (Braun ET 66 + the receipt itself) is the right answer, and his reasoning is better than the
idea: he rejects B ("wallet app", fails in sunlight, everybody's language) and C (depends on a serif, and
the law forbids fonts) on grounds that are checkable, not tasteful. The three one-liners — torn slip,
matte paper + one ink, "the feed" — are specific enough to build and consistent with the product's name.

One addition: the tear is the product's **only** decorative move. Name that as a rule, or it will be
copied onto every card within two passes.

### D2 — identity: **ACCEPT-WITH-EDIT**

Accepted in full: measured palette with a permission table, the four-radius limit, two border widths, three
elevation layers, five motion tokens with real easings, `prefers-reduced-motion`, `prefers-contrast`, forced
colours, and — the best single sentence in the pack — **"selected states are ink with a check, never
accent"**. That is a real design rule, not a preference.

Edits:

1. **The accent hue is the owner's call, and my recommendation is the opposite of Claude's default.** He
   proposes ballpoint blue `#224ac0` to escape the "Bitcoin orange" cliché. But slip's current brass
   (`#f0a32a` / `#a84808`) is family identity — the same warm marker as the rest of the estate — and blue
   is the most crowded colour in fintech. **Keep the discipline he invented (an accent *budget* of one) and
   change the hue only if Cam says so.** Do not silently re-brand.
2. **System font stack: accept, with a caveat.** The law forbids font fetches and the single-file budget
   argues against a 40 KB base64 face. But a zero-font identity must then be carried by shape, space and
   colour alone — which is exactly what the tear and the accent budget do. Accept.
3. **`--t-hero` 48/64/80 is large enough to break a 320 px screen with a long currency** — cap the hero at
   `clamp(36px, 11vw, 80px)` and test `11,703 sats` at 320.
4. **Type says "nothing above 18 px except hero and money", then defines `--t-money` at 20.** Say "18"
   means non-money text; the number 20 is otherwise a self-contradiction a builder will trip on.
5. `--line` at 1.49:1 is correctly declared decoration-only. **This rule needs a test**, not a sentence:
   a grep that fails the build if `var(--line)` appears on a border of an interactive element.

### D3 — screens: **ACCEPT-WITH-EDIT**

S-01 (counter), S-03 (receipt), S-05 (Books), S-06 (setup + compare), S-07 (More/Learn), S-08 (customer
display) are buildable: wireframes with proportions, nine states, copy marked FROZEN, acceptance checks a
reviewer can run.

Edits:

1. **S-04 Money in — BLOCKED.** Re-spec after the true capture. Must contain: standing requests (label,
   cadence, amount, wallet), the budget clock, "pay this request" QR, and the waiting strip. The tab is
   *asks and arrivals*, not just arrivals.
2. **The four-tab navigation: REJECT.** Setup is where a merchant's wallet and the one rule live. Nova's
   earlier IA ruling (five destinations, Sell default) is authoritative, and folding Setup into More hides
   the most security-critical screen behind a menu. **Keep five tabs**, apply the new visual language to
   them. Revisit only with the owner's word.
3. **Keyboard `1–4` = tab switch: REJECT as specified.** On Sell, digits type into the amount keypad
   (D-76 shortcuts already exclude fields). Two meanings for one key is how a till charges 4.00 instead of
   400.00. Scope: digits act as tabs **only when no keypad or field has focus**, or drop them.
4. **Rate field removal from the sale path: ACCEPT** (into Tools, with the value still visible in the cart
   slip). This is the strongest usability change in the pack — one field fewer before the first sale.
5. **S-02 / S-03 / S-08 are low-confidence** (NOT SEEN). Accept as *proposals*; they are re-audited against
   real captures before their pass starts.
6. **Wallet compare step: ACCEPT, with a hard rule** — "They don't match" must lead to a stop state that
   cannot be dismissed into a sale, and the comparison must use the derived address, never a re-parse.

### D4 — components: **ACCEPT**

C-01…C-23 are the most valuable section for Fable: anatomy, sizes, states, accessibility contract, and a
"don't" line each. Two notes: Badge's **manual = dashed, simulated = hatched, distinguishable without
colour** is exactly the honesty standard this product claims; keep it byte-identical in print. And
`aria-disabled` with a **named blocker** (C-01) preserves D-83's rule that a disabled press names its
reason — do not let a builder switch to `disabled`.

### D5 — signature moves: **ACCEPT**

Twelve, ranked, each with the technique, the risk and **one place it must never appear**. M-01 (the tear),
M-03 (perforation leaders), M-05 (ink underline success) and M-08 (chunked address with bold ends) are the
four worth the effort. M-07's monogram fallback also fixes a genuine defect (platform emoji, E7).

M-02 as written would re-brand the accent; keep the *budget*, defer the hue (see D2.1).

### D6 — the rebuild plan: **ACCEPT-WITH-EDIT**

The `data-skin="v2"` dark-launch with a single flag-day pass is the right engineering answer to "never ship
a half-redesigned shop", and rollback-on-revert is honest. Edits:

1. **Every pass must list its test impact.** Renaming a label or moving a selector breaks real suites —
   `tests/e2e/till.mjs` asserts `data-shift`, `polish.mjs` asserts panel visibility, `demo-check.mjs` waits
   on `[data-panel="till"]`. A pass that changes DOM without naming the tests it will repair is not
   shippable.
2. **A new screenshot set is a deliverable of every pass**, not of P-6 only. The matrix must grow to the
   eight real screens (Pay, Receipt, Customer display, Wizard/Compare are missing today) — **48 frames**.
3. **P-1's `src/core/theme.ts` token wiring is wrong**: tokens live in `src/index.css`. `theme.ts` chooses
   the theme; it does not hold values.
4. **Add P-0 (2 h): fix the instrument** — the eight screens, a `?skin=` preview hook, and a chevron-free
   nav path — so every later pass is judged on true images. (Half done in this audit.)

### D7 — honest limits: **ACCEPT**

The ASSUMPTION list is the most professional part of the pack, and the refusals are correct. One addition:
**map each refusal to its decision ID** so a future contributor cannot re-litigate it from taste
(D-33 Lightning via LNURL, D-76 shortcuts, D-81 demo offline, D-82 no invented money, D-83 named blockers,
D-86 the first sale opens the till).

### Self-audit table: **ACCEPT**

Honest confidence values, and it correctly flags its own low-confidence rows. No pack that says
"Low-Medium, I never saw it" should be trusted less for saying so.

---

## 3. What is missing (my additions, not his errors)

1. **Test-impact manifest per pass** (see D6.1) — the single thing most likely to stall Fable.
2. **A true Money in screen** and four missing screens in the matrix.
3. **A rollback drill**: prove `?skin=v1` (or a revert) actually restores a working till *before* the flag
   day, not after.
4. **A print proof**: one receipt on 80 mm thermal and one on A4, photographed. Print CSS fails silently
   and nobody checks it.
5. **A wrong-address drill**: tamper the QR payload against the text and prove the sale stops. Claude
   specifies the guard; the drill proves it.
6. **A sunlight test**: 390 px phone, max brightness, outdoors. Every "calm neutral" palette dies here;
   it is the one test no screenshot can stand in for.

---

## 4. Corrections to send back to Claude

| # | Correction | Kind |
|---|---|---|
| 1 | Money in ≠ Books. `phone-money-in-*.png` was Books (my bug). Money in is standing requests + budget clock. Re-do S-04. | evidence |
| 2 | Four tabs rejected — keep five; Setup stays a destination. | scope |
| 3 | Digits-as-tabs collides with the keypad. Scope or drop. | collision |
| 4 | Accent hue: keep the warm family accent; the budget rule is accepted. Owner decides the hue. | authority |
| 5 | Every pass needs a test-impact list and a fresh 48-frame capture. | buildability |
| 6 | `theme.ts` does not hold tokens; `src/index.css` does. | factual |
| 7 | Hero needs `clamp()` and a 320 px test with a long value. | feasibility |
| 8 | `--line` decoration-only needs a lint test, not a sentence. | enforcement |

Answer to his three questions: **Q1 cyan/blue — declined for now, keep warm, owner's call. Q2 customer
display 24 px — approved** (distance is a legitimate exception; the 18 px rule governs operator screens).
**Q3 four tabs — declined**, five stay.
