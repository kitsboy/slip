# Reply to Claude — corrections to Pack v1 (paste this into the same chat)

Your pack is accepted in substance. Below are the corrections from the audit against the real tree. Give me
back **only the revised sections**, at the same headings, in the same format — do not re-issue what already
passed. (Sections that passed unchanged: D1, D4, D5, and the D2 structural/type/motion/radius work; D7's
refusal list and self-audit table.)

---

## 1. One of your defects was my fault, not the app's

**E8 is false.** Our screenshot script captured "Money in" with `hash: 'history'`, so the frame labelled
`phone-money-in-*.png` **is the Books screen**. The instrument was wrong; the app is not.

**Money in is a different feature entirely: *Rent & standing requests* plus a budget clock.** It holds a
standing ask (name, destination wallet, amount, cadence), a "show request QR" action, a "mark paid" action,
and computed lines: `IN (30D)`, `COMMITTED (30D)`, `RUNWAY`, `DUE NOW`, plus a card such as "Mum's rent ·
2 days late".

**Therefore:**
- **Re-do S-04 from scratch** against the corrected frame (attached, `phone-money-in-light.png`).
- The redesign may change *presentation only*. Every standing-request control must survive: create a
  request, see its cadence, show its QR, mark it paid, and read the four clock lines. Rename, group, fold
  into a sheet — never delete.
- Assume the same risk on any screen you had no frame for: if a tab's name implies tools you cannot see,
  say `ASSUMPTION — tools unknown` rather than designing them away.

## 2. Navigation: five destinations, not four — REJECT the four-tab proposal

Setup is where the merchant's wallet and the one-rule refusal live. Folding it into "More" hides the most
security-critical screen behind a menu, and an earlier IA ruling (five destinations, Sell default) is
authoritative for this product.

Redesign the *presentation* of five destinations with your new language (active = 3 px ink bar + weight 700
+ `aria-current`; no accent), phone / rail / sidebar forms unchanged in count. Your setup-banner idea for a
new shop is **accepted** — it runs alongside the Setup tab, not instead of it.

## 3. Keyboard: digits must not double as tab switches — REJECT as specified

On Sell, digits type into the amount keypad (this is a till; `D-76` already keeps shortcuts out of fields).
`1–4` for tabs would mean "4" can charge 4.00 instead of appending to 400.00.

Scope it: digits switch tabs **only when no field or keypad has focus**, or drop the shortcut. Say which.
`/ c n p` keep their current behaviour exactly.

## 4. Accent: the budget rule is accepted, the new hue is not — owner's call, and the default is "keep warm"

Your **accent budget** (one accent role per viewport; selected = ink + check, never accent) is the best rule
in the pack and is accepted verbatim. The hue change to ballpoint blue is **declined for now**: the current
brass is family identity and blue is the most crowded colour in fintech. Keep every table row, swap `--acc`
for the existing warm tokens (light `#a84808` on white text = 5.84:1; dark `#f0a32a` = 8.6:1). If the owner
wants blue later, it is a token change, not a re-design — which is a compliment to your token work.

## 5. Factual and feasibility fixes

- `src/core/theme.ts` **does not hold tokens.** They live in `src/index.css`. Correct P-1's file list.
- **`--t-hero` needs a clamp**: `clamp(36px, 11vw, 80px)`. At 320 px, `11,703 sats` must not break the
  line — prove it in your acceptance row.
- **"Nothing above 18 px except hero and money" contradicts `--t-money: 20/24`.** Restate the rule as
  "non-money text is 18 or below".
- **`--line` at 1.49:1 is decoration only** — good. Turn that sentence into a test: a lint that fails if
  `var(--line)` is used as the border of an interactive element.

## 6. Every pass needs a test-impact manifest and fresh frames

Renaming a label or moving a selector breaks real suites: `tests/e2e/till.mjs` asserts `data-shift`;
`polish.mjs` asserts panel visibility; `demo-check.mjs` waits on `[data-panel="till"]`. For **each** pass
P-1…P-6, list:

| Test file | Test name | Why the selector moves | What the assertion still proves |

And each pass's delivery must include a regenerated screenshot set. The matrix must grow from 5 screens to
**8** (Pay, Receipt, Customer display, Wizard/Compare are missing today) × 3 canvases × 2 themes = **48
frames**. Add that to P-0, not P-6.

## 7. The path manifest (D7) — the biggest gap in your pack

You had no repo, so no path table. Now you have the tree, and every row must land somewhere real:

| Spec ID | File | Symbol / class / block | What changes | Risk |
|---|---|---|---|---|

Use only paths from the tree below. New components are `NEW: src/ui/Foo.tsx` with props named.

```
src/
├── main.tsx              boot; ?explain=1 → customer page
├── App.tsx               shell: <Group id="sell|money|books|setup|more|learn">, header, nav
├── index.css             ★ all tokens + utility classes
├── ui/   Till.tsx · History.tsx · Requests.tsx · Counters.tsx · WalletPicker.tsx · Wizard.tsx
│         Settings.tsx · OpenTill.tsx · Readiness.tsx · NextStep.tsx · AmountPad.tsx · TabIcon.tsx
│         InfoVideo.tsx · Explain.tsx · FreshnessRing.tsx · CustomerDisplay.tsx · Explainer.tsx
│         Backup.tsx · BookSeal.tsx · Glossary.tsx · Manual.tsx · Tech.tsx · HowItWorks.tsx
│         Status.tsx · Verify.tsx · EmptyState.tsx
└── core/ settings.ts · theme.ts (theme choice only) · ledger.ts · accounts.ts · shifts.ts
          money.ts (do not touch) · derive.ts · keys.ts (the one rule) · tabs.router.ts · providers/
tests/    vitest *.test.ts + e2e/*.mjs
scripts/  deploy.sh · scan-bundle.sh · contrast-audit.mjs · docs-audit.mjs · shots-matrix.mjs · demo-check.mjs
```

## 8. Answers to your three questions

1. **Accent hue:** declined for now — keep the warm family accent. (See §4.)
2. **Customer-display status at 24 px:** **approved.** Viewing distance is a legitimate exception; the
   18 px rule governs operator screens only. State it that way in D2 so it is not re-litigated.
3. **Four tabs:** **declined** — five stay. (See §2.)

## 9. The extras that make a launch survive a customer

Fold these into D6 as acceptance drills, not prose: a **rollback drill** (prove the old interface returns
before the flag day, in a scratch worktree); a **print proof** (80 mm thermal and A4, photographed, status
word still legible in grayscale); a **wrong-address drill** (tamper the QR payload against the text and
prove the sale stops); and a **sunlight test** (390 px, max brightness, outdoors).

---

Return: revised **S-04**, revised **D2** (accent row + hero clamp + type rule), revised **D6** (P-0…P-6
with test-impact tables and 48 frames), new **D7 path manifest**, and the answers folded in. Everything
else stands as delivered.
