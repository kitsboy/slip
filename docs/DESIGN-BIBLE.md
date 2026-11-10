# slip — Design Bible (v1)

Author: Mimi, Creative Director · Give A Bit
Scope: visual system + voice for `slip` (non-custodial POS / watch-only till)
Base: docs/DESIGN-BRIEF.md, src/core/theme.ts, src/index.css, src/App.tsx, src/ui/*, the 21 screenshots
Status: verdict, ready for the council and for implementation

## 0. The named aesthetic

**"quiet brass"** — a brass-trimmed instrument on calm ledger paper.

The till is a brass wheel on a ledger slate: dark starts as a cool void, light as a
warm page. The brass (the money accent) is the one confident, warm, metallic note; the
rest is neutral, hairline-divided, and still. Nothing glows, pulses, or shouts. Kimi's
composure, not her lipstick — the red is reserved for refusal.

Three rules hold it together:
1. **One instrument.** Every panel is one card shape, every control one corner language,
   every divider a hairline. The app reads as a single machined object, not a toolkit.
2. **Brass is the only saturation.** Outside the four status colours (which have meaning
   and a word each), warm and cool neutrals carry everything else. If a third hue shows
   up, it is an error.
3. **Trust is the texture.** The honesty labels are not decoration to polish around; they
   are machined into the instrument as clearly as the buttons. If a styling choice would
   dim a "seen ≠ paid", it loses.

Tie-break honoured verbatim: usability over beauty; honesty labels are furniture.

---

## 1. Palette — hex tokens, both themes

All ratios below are computed WCAG relative-luminance contrast (AA target ≥ 4.5:1 for
text, ≥ 3:1 for large text / non-text UI). Verified with the formula, not guessed.

### Token → value table

| Token | Dark | Light | Notes / verified ratio |
|---|---|---|---|
| `--slip-bg` (ink/base) | `#0a0c0f` | `#f6f4ee` | never pure #000 / #fff |
| `--slip-surface` | `#11151a` | `#fdfdf9` | panel fill — base bg is the behind-plane |
| `--slip-surface-2` | `#161b21` | `#fbfaf6` | raised panel top / soft inset |
| `--slip-line` (hairline) | `#232a33` | `#d3cec6` | input/divider edge, kept strong in light (QA #… ) |
| `--slip-line-strong` | `#2e3742` | `#b4ada2` | focusable control edge, table rules |
| `--slip-ink` (text-primary) | `#f3f5f7` | `#0d1117` | 17.9:1 on bg-dark, 18.6:1 on white-light |
| `--slip-secondary` (text-secondary) | `#b6c1cc` | `#3f4a56` | new token; 9.9:1 dark, 8.2:1 light-on-page |
| `--slip-muted` (text-muted) | `#9aa5b1` | `#4d5763` | 7.25:1 dark-on-surface, 7.21:1 light-on-white |
| `--slip-accent` | `#f0a32a` | `#a84808` | brass; see ▸ accent decision |
| `--slip-accent-soft` | `rgba(240,163,42,0.12)` | `rgba(168,72,8,0.12)` | chip/input tint surface |

### Status colours (four semantics, each with a word, never colour alone)

| Semantic | Token | Dark | Light | Rule |
|---|---|---|---|---|
| confirmed / mined / settled | `--slip-good` | `#3dd68a` | `#15803d` | 9.7:1 dark, 4.56:1 light — the only thing green means |
| seen / submitted / detected | `--slip-warn` | `#e6a700` | `#93560a` | 8.5:1 dark, 5.34:1 light — seen ≠ paid, submitted ≠ confirmed |
| pending / awaiting / unobserved | `--slip-pending` | `#7cb3e8` | `#3b6fa5` | 8.2:1 dark, 4.77:1 light — steel blue, "in progress", not a promise |
| refusal / refused / danger / manual-wipe | `--slip-bad` | `#ec6165` | `#c2262a` | 5.6:1 dark, 5.72:1 light — reserved for danger and refusal only |

Notes:
- `--slip-pending` is **new** — it replaces the current habit of leaning on green for
  everything. Waiting is blue; green is exclusively "money actually arrived".
- Badge fills: status text uses the pure token; a badge/chip uses the token at ~10–14%
  as a tinted background (`color-mix(in oklab, <status> 12%, var(--slip-surface))`),
  with the word in the full-token colour. Word + colour + fill; never colour alone.

### ▸ Accent decision: refine — keep the amber family, split it per theme

Current: `--slip-accent: #f7931a` in CSS, `#f5820a` used as the focus fallback. **Keep
the warm amber identity (it reads as money and matches Bitcoin orange), but split it
into two theme-tuned stops.** On the light theme the current amber fails hard:
`#f5820a` = 2.36:1 and `#f7931a` = 2.09:1 against the page — that is off-brand for a
daylight till and fails WCAG outright.

- **Dark → bright brass `#f0a32a`** — a touch more golden and less neon than `#f7931a`
  so it sits with the warm paper of the light theme; 8.6:1 on dark surface. Use as text,
  icon, border, and as the primary-button **fill** with `#0d1117` text (9.3:1).
- **Light → burnt bronze `#a84808`** — the same brass taken down the scale so it clears
  AA as *text* on a daylight page (5.31:1 on page, 5.73:1 on white). Use as text, border,
  and as the primary-button **fill** with white text (5.84:1).

Same amber, two stops, both themes AA-clean. This resolves the current split-brain where
two amber hexes were drifting (CSS token vs focus fallback).

---

## 2. Type scale — five steps

Typeface: the system stack (already set), no webfont. `-apple-system / Segoe UI /
Roboto / system-ui`. Monospace: `ui-monospace / SFMono / Menlo / Consolas` for figures.
Numbers are set in the mono stack with tabular numerals (see rule).

Sizes in rem (16px base), line-heights unitless, tracking in em.

| Step name | Size | Weight | Line-height | Letter-spacing | Used for |
|---|---|---|---|---|---|
| `display` | 1.875rem (30/36px) | 600 | 1.1 | -0.02em | hero only ("Sales pay straight…") |
| `title` | 1.125rem (18px) | 600 | 1.3 | -0.01em | panel titles, section heads |
| `body` | 0.9375rem (15px) | 400 | 1.5 | 0 | copy, reasons, descriptions |
| `small` | 0.8125rem (13px) | 400 | 1.45 | 0 | captions, help text, hints |
| `eyebrow` | 0.6875rem (11px) | 600 | 1.3 | 0.12em | all-caps labels, section markers |

Bold within a size uses 600 (not 700) — keeps the instrument calm. Uppercase is reserved
for **eyebrows and section labels only**, never on action buttons (see copy pass).

### Tabular-numeral rule (mandatory, money)
Every money figure — amounts, rates, totals, sats, balances — must set
`font-variant-numeric: tabular-nums` **and** use the mono stack (the existing `.figure`
class). This keeps a running total from jittering digit-width as values tick. Recurring
row delimiters (`,`) as the locale dictates; a negative or overline never appears for
money. This is a correctness rule, not a style rule — a jittering total looks broken
and can be misread.

---

## 3. Spacing scale & rhythm

Base unit: **4px**. Everything steps on the 4 grid; no arbitrary 3 or 5 offsets.

Rhythm scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.

- **4** — icon/edit dots, focus-ring gap.
- **8** — gap inside a chip/badge, tight between icon and label, compact internal gutters.
- **12** — between a label and its input; between body lines and captions.
- **16** — panel internal padding; horizontal group gap on mobile.
- **24** — between form fields; between a panel title and its content.
- **32** — between sibling panels/cards.
- **48** — between page sections (sections `mt-12`).
- **64** — page-level rhythm only (hero, between major blocks).

Standard panel padding is **16px** on mobile, **24px** on ≥ 640px. Horizontal page
padding is 20px (the existing `px-5`), never 0 at 360px.

---

## 4. Radius scale — one system

Three radii, one rule each, **plus one pill** for navigation and tags. Never mix inside
a single control.

| Token | Value | Applies when |
|---|---|---|
| `--radius-sm` | 8px | chips, badges, small inset fields, tag pills-in-panels |
| `--radius-md` | 12px | buttons, inputs, selects, inline status blocks |
| `--radius-lg` | 16px | panels/cards, the standout QR surface |
| `pill` | 999px | the anchor nav and filter pills only (all-caps tag look) |

Rule: **the smallest unit in a group sets the radius.** A panel is 16px; a control
sitting inside a panel is 12px (or 8px if it is a chip). A button nested in a card is
12px, not 16px. This is what keeps one instrument from looking like two.

Focus ring: `outline: 2px solid var(--slip-accent); outline-offset: 2px; border-radius:
var(--radius-md)` on the element's own radius (keep the existing focus-visible pattern).
Two focus-outline declarations exist today in `index.css` (a `:focus-visible` with
`border-radius: 6px` near the top, and a second block near the bottom using a
non-existent `var(--accent)` fallback). **Collapse to one** block bound to the accent
token — the duplicated/dead one is precisely the cheap-drift the camera would catch.

---

## 5. Shadow / elevation tokens

**Only if they earn it — and they barely do.** This is a till: elevation should read as
lapping, not float. Shadows earn their place on exactly one surface.

| Token | Dark | Light | Used for |
|---|---|---|---|
| `--shadow-none` | none | none | everything on a resting surface |
| `--shadow-card` | `0 1px 0 rgba(255,255,255,0.03) inset` | none | panels — inset hairline in dark, **no drop shadow in light** |
| `--shadow-float` | `0 8px 24px rgba(0,0,0,0.45)` | `0 8px 24px rgba(170,80,0,0.10)` | customer-facing QR, modals, the floating customer screen |

Tint: dark shadows are near-black with a faint brass-warm lift; light shadows carry the
brass tint, not neutral grey. Rule: **one floating shadow per view; never layer shadows.**
The light theme's erstwhile-faint card borders are solved by the strong hairline tokens
(`#b4ada2` line-strong), not by adding drop shadows — the QA note ("cards read as one
plane") is a hairline fix, and hairlines keep the instrument flush and quiet.

---

## 6. Motion specs

**durations** — short and businesslike:
- 120 ms — discrete state changes (badge colour, focus, button press).
- 180 ms — the standard surface transition (a panel fading/sliding in).
- 240 ms — the maximum anyone may ask the user to wait on (QR fade-in, customer screen).

**easing** — one curve: `cubic-bezier(0.33, 0, 0.15, 1)` (a composed
ease-out-quick), everywhere. No bouncy/overshoot curves. No spring.

**what animates** — and only these:
- The honesty/status badge: a 120 ms colour fade *between states only*. It is never a
  continuous pulse.
- Panel / section entrance: 180 ms fade + 4px rise. Never scale.
- Button press: 120 ms `transform: scale(0.98)`. No lift, no glow.
- Focus ring: 120 ms colour, instant geometry.
- QR appearance: 240 ms fade + 6px ease-settle, once, on creation.

**what never animates** — hard rules:
- **Money figures never animate** — no count-up, no tween on a total. A figure is a
  finished fact; it appears at its value or it updates discretely. (A count-up on money
  reads as a gamble and can be mistaken mid-flip.)
- **Status words never pulse or blink.** "seen", "submitted", "manual" sit still and
  legible. Movement on a state word implies urgency; the truthful word is calm.
- No infinite loops, no shimmer, no skeleton sweep, no parallax, no scroll-triggered
  motion in the till flow. A webpage may shimmer; a till may not.
- The demo banner does not animate — it is static furniture so it can never draw the eye
  away from being a demo.

**reduced motion** — respect `prefers-reduced-motion`:
- Kill all transitions/animations to ~0ms (the existing media rule already does this:
  `animation-duration: 0.001ms !important; transition-duration: 0.001ms !important`).
- Under reduced motion, state changes are instant colour swaps; entrance is a single
  static frame; the QR still appears (it is content, not decoration). Ensure the
  `transform: scale(0.98)` button press is disabled too (wrap it in a no-preference
  media query or drop it to a plain background tint).

---

## 7. Component conventions

One corner system throughout (radius table, §4). All touch targets ≥ 44px tall
(already enforced via `button { min-height: 44px }` and input padding). Inline SVG icons
only.

### Button variants

| Variant | Dark | Light | Use |
|---|---|---|---|
| **primary** | fill `#f0a32a`, text `#0d1117` | fill `#a84808`, text `#ffffff` | the single confident action in any view (Charge, Save, Request invoice, Stamp is primary-true) |
| **secondary** | transparent, hairline `#2e3742`, text `#f3f5f7` | transparent, hairline `#b4ada2`, text `#0d1117` | a real but non-primary action (Customer screen, Cancel) |
| **ghost** | transparent, text `#9aa5b1`→ink on hover | transparent, text `#4d5763`→`#0d1117` on hover | low-commitment affordance (Print, link-like) |
| **danger** | red text `#ec6165` + red hairline, filled red only for Wipe | red text `#c2262a` + red hairline, filled red only for Wipe | refusal, wipe, destructive confirm — the only place red fills |
| **disabled** | text `#9aa5b1` at 45%, hairline `#232a33` | text `#4d5763` at 45%, hairline `#d3cec6` | never green, never amber — disabled is neutral |

Rules: no uppercase on button labels (sentence case — see copy pass). Hover = 1 step
towards the surface (light tint on primary fill, ink text on ghost/secondary). Focus =
`:focus-visible` ring, never the disabled style.

### Input + label + error

- Label: `eyebrow` style (11px, 600, 0.12em, muted) directly above, 12px from the input.
- Input: `--slip-surface-2` fill, `--radius-md`, hairline `--slip-line`; on focus a 2px
  accent ring (`outline`) + the strong hairline, never the soft one.
- Text inside: `body` (15px), ink. Placeholder: `muted` at 60%.
- Hint: `small` muted below at 8px.
- Error: `small`/`body` in `--slip-bad`, **with a word** ("that address is incomplete"),
  and the input border/wash turns bad red too. Never red + symbol only. Errors use
  `role="alert"`; the honest labels use `role="status"`.

### Card vs hairline-group

- **Card (panel)** = `--radius-lg`, `--slip-surface` fill, hairline border, 16/24px
  padding, one inset hairline in dark. For standalone ideas — a wallet, a proof, a panel.
- **Hairline-group** = no per-row cards; a shared `--radius-lg` container divided
  internally by `--slip-line` rows (e.g. a settings list). Use when the rows are one
  subject; cards when each is its own subject. Rule: **divide inside the container, don't
  card the rows.**

### Badge / chip

`--radius-sm` (8px), not the pill, except the anchor nav. Structure: optional 12px inline
SVG dot/icon + word, 11px 600, muted-on-line default. Status variants tint their
background ~12% with their token colour and set the word in the token colour (§1). Every
status badge carries a *word* — this is non-negotiable.

### The honest-UI verification badge (furniture, never hidden)

A reusable `HonestBadge` with a fixed anatomy: **inline SVG glyph + status word +
optional reason line**, tinted by state but *always* word-first.

The four states map exactly onto the §1 status semantics:
- **confirmed** — green, glyph = filled check-circle. Word: "Paid & mined"
  (on-chain) / "Settled" (Lightning).
- **seen / submitted** — gold, glyph = half-circle/eye, word: **"Seen — not yet paid"**,
  "Seen in mempool", "Submitted — not confirmed". Gold always signals "not finished".
- **pending / awaiting** — steel blue, glyph = clock/dots, word: "Awaiting payment",
  "Waiting". Blue is the unprejudiced "we're looking, nothing yet".
- **manual** — always shown as its own badge: glyph = hand/open-key, word **"Manual"**,
  reason "recorded by you — not observed on chain". Never green, never implied confirmed.

This badge is the whole honesty story and it stays **furniture**: same size as other
chips, always visible, never tucked behind a hover or a modal. If it must be reduced,
it shrinks to the word + a 12px glyph — it never disappears.

---

## 8. Before → after copy

Every user-visible string I would change, and the exact replacement. Unchanged strings
are deliberately trusted and left alone.

| # | Where (now) | Before | After | Why |
|---|---|---|---|---|
| 1 | Hero button + header | `SET UP YOUR SHOP` / `START SETUP` / `RUN SETUP AGAIN` (all-caps via `uppercase`) | `Set up your shop` / `Start setup` / `Run setup again` | All-caps action buttons read as a developer template. Reserve uppercase for eyebrows only |
| 2 | Till — pay button | `CHARGE` | `Charge` | the single most money-critical tap on the till — calm, not shouted |
| 3 | Till — action row | `CUSTOMER SCREEN` | `Customer screen` | sentence case; the customer-facing page is feature, not alarm |
| 4 | Lightning | `REQUEST INVOICE` (all-caps, ghost) | `Request invoice` as **primary** | a real positive action earns the solid brass fill, not a faint outline |
| 5 | Tip jar | `TIP JAR MODE` | `Tip jar` (toggling secondary → primary) | compound shout to plain label |
| 6 | Till — status chip | `watching for payment` / `offline — not watching` (text-only, muted) | `Awaiting payment` steel-blue badge / `Offline — not watching` red-tinged badge | status becomes a designed word, not a grey footnote; colour + word |
| 7 | Till — offline line | `· Offline: detection paused, money is not lost.` | `Offline — nothing is being watched right now. Money already in is safe.` | "detection paused" is jargon; "money is not lost" is fine but the lead must be the *paused watching* |
| 8 | Till — manual confirm | `I have the money (manual)` | `I have the money — Manual` (word on the badge) | same honesty, machined into the badge language instead of a parenthetical |
| 9 | Till — split-sale line | `Reconciliation: nothing was open to check` | `No open sale to settle` | "Reconciliation…" is internal log-speak; plain merchant words |
| 10 | Till — watching | `slip is watching this address on …` | `slip is watching this address on …` **tab-monospace** | wrap the address in the figure class so it copies clean and reads exact |
| 11 | Verify — no-match | `'The receipt is well formed, but no sale on THIS device matches…'` | `This receipt is valid, but no sale on this device matches it. It may have been taken on another till — do not treat it as checked.` | keep the honesty, drop the debugging shout of "THIS" |
| 12 | Anchor — ambiguous | `nothing was sent successfully (unknown error)` | `Nothing was submitted — the calendar returned an error` | name the failure, don't echo the log |
| 13 | About / trust strip | `0 requests` · `measured, not promised` | keep — unchanged | already honest and correct; do not touch |
| 14 | Footer | `no accounts · no analytics · no telemetry · MIT licensed` | keep — unchanged | already the right laundry list |
| 15 | Group "why" marks | `Sell` / "Ring up a customer", `Money in` / "Sales that arrive…" | keep labels; raise `why` from `text-muted/80` to `text-muted` | "why" is the scan aid — stop it washing out on light |

Manual (`src/manual/entries.ts`) is already excellent and needs no before/after except
lines that use internal words: `verdict`, `handoff`, `leg`. Where `steps` say "Press
`stamp`…", align button names with the new sentence-case labels (§7) so prose and button
match.

---

## 9. The five changes that most raise perceived quality (ranked)

1. **Give the primary action a real solid fill and sentence case.** Today Charge /
   Request invoice / Setup are faint outlined all-caps buttons — the single cheapest
   look in the screenshots (`audit-till`, `lightning`). Solid brass primary + sentence
   case turns the till from "developer template" to "instrument". (§7, §8 #1–5)
2. **Split the amber into a two-theme brass and bind the broken focus rule.** The light
   theme's `#f5820a`/`#f7931a` fails AA at 2.1–2.5:1 and there are two drifting focus
   declarations (`#f5820a` vs a dead `var(--accent)`). One brass family, two theme stops
   (§1), one focus rule (§4). Bolts the "premium in daylight" claim down.
3. **Give statuses meaning with colour *and* word: steel-blue pending, gold seen, green
   confirmed.** Today awaiting/seen lean greenward and grey out, which undermines the
   single most important honesty claim. Four token statuses, badge-first (§1, §7) —
   this is the trust layer, and it visibly works.
4. **Rebuild the status chip as a designed badge instead of a grey footnote.** The
   "watching/paused" line reads as debugging. Badge anatomy (glyph + word + tint) makes
   detection/settlement state readable at a glance from across a counter. (§7, §8 #6–7)
5. **One radius system and one spacing grid, applied without exceptions.** Currently
   `rounded-lg`/`rounded-full`/`rounded-xl` drift freely and `[10px]`/`[11px]`/`text-xs`
   sizes appear ad hoc. Centralising to the §3-4 scale is the "well-machined" feeling —
   the biggest invisible quality win.

## 10. What reads cheap or untrusted today, and the fix

- **All-caps action buttons** (Charge, Customer screen, Request invoice, Wipe) — reads
  as a terminal/header template. Fix: sentence case, solid primary fill. (§7, §8)
- **Faint light-theme input borders** — the QA pass already raised these; keep the
  strong hairlines `#b4ada2` and the raised light `--slip-line`. Fix is in tokens, not
  shadows. (§1, §5)
- **The "0 requests / measured, not promised" and "none — by construction" lines are
  honest and strong** — do not "prettify" them into weak designer copy. The most
  untrusted thing on screen is a status line that looks like a log entry
  ("Reconciliation: nothing was open to check") — replace per §8 #9.
- **Two competing focus-outline rules + two amber hexes** — internally inconsistent =
  untrustworthy at the pixel level. Fix: one focus rule, one accent family. (§4, §1)
- **Status words drifting to grey or green** — grey reads as "no opinion" and green
  reads as "done". Neither is true for awaiting. Fix: the four-token badge. (§1, §7)
- **The hero "0 requests" breaking-frame is genuinely on-brand** — keep. Cheapness
  never came from honesty; it comes from the buttons and the drift.

---

## The brass rule and the engraved figure

Two marks carry the money, and both are written into `src/index.css`.

**The brass rule** is one 2px line of `--v2-acc`, 56px wide, under the single number a screen exists
for: the pay amount, the receipt, the day's total on Books, and the customer's screen. It is the
`.v2-rule` element, drawn with `aria-hidden` so a screen reader is not told about a line.

- One per screen, never two, and never under a status word — a status is not the reason the screen
  exists.
- Never in print: a brass line prints as a grey smudge. `@media print` removes it.
- It was previously a hardcoded `#f0a32a` border on the charge bar only, which is why the till was
  the one screen that had one, and why the token gate never saw it. Use the token.

**The engraved figure** is `.v2-engrave`: tabular numerals, `letter-spacing: -0.02em`, and in the
light theme a single `0 1px 0 rgba(0,0,0,.05)` hairline under the glyphs so the money reads as
printed rather than typed. The dark theme gets no shadow — a shadow on a night page smears the
digits instead of seating them.

## The receipt is a document

- The amount is set at 40px with the brass rule beneath it.
- The status is the shared `Badge`: solid for a payment slip observed, **dashed** for a manual
  confirmation, **hatched** for a rehearsal. The shape survives a black-and-white print.
- The words are frozen: `seen on chain`, `marked paid by you`, `rehearsal`.
- The code inside the receipt is sized by its own artwork (`width: 168px; padding: 14px; svg width:
  100%`), not by a fixed box. A fixed 128px box clipped a 225px code and lost its quiet zone — a
  code that looks fine and cannot be scanned. Decode it after any change.

---

## Appendix — verified contrast record

All with the WCAG 2.1 formula (relative luminance). AA target 4.5:1 body text.

| Pair | Ratio | Verdict |
|---|---|---|
| `#f3f5f7` on `#0a0c0f` | 17.9 | AAA |
| `#f3f5f7` on `#11151a` | 16.6 | AAA |
| `#9aa5b1` on `#11151a` | 7.25 | AAA |
| `#b6c1cc` on `#11151a` | 9.9 | AAA |
| `#f0a32a` on `#0a0c0f` | 9.3 | AAA |
| `#f0a32a` on `#11151a` | 8.6 | AAA |
| `#0d1117` on `#f0a32a` (dark primary btn) | 9.3 | AAA |
| `#ffffff` on `#a84808` (light primary btn) | 5.84 | AA |
| `#a84808` on `#f6f4ee` | 5.31 | AA |
| `#0d1117` on `#f6f4ee` | 17.2 | AAA |
| `#0d1117` on `#fdfdf9` | 18.6 | AAA |
| `#4d5763` on `#fdfdf9` | 7.21 | AAA |
| `#3f4a56` on `#f6f4ee` | 8.2 | AAA |
| `#3dd68a` on `#11151a` | 9.7 | AAA |
| `#15803d` on `#f6f4ee` | 4.56 | AA |
| `#e6a700` on `#11151a` | 8.5 | AAA |
| `#93560a` on `#f6f4ee` | 5.34 | AA |
| `#7cb3e8` on `#11151a` | 8.2 | AAA |
| `#3b6fa5` on `#f6f4ee` | 4.77 | AA |
| `#ec6165` on `#11151a` | 5.6 | AA |
| `#c2262a` on `#f6f4ee` | 5.3 | AA |

## Targets are measured, not asserted

`npm run tap-audit` (390 wide, six destinations) is the only authority on "every target ≥48". It
counts 22 controls under the 44px floor at the time of writing, down from 61. The four shapes already
fixed were the header chips, the skip link, the round information buttons, the demo colour swatches,
and the readiness action link. Do not quote a target figure from memory — run the script.

## Brass is for the one thing a screen wants

The open tab used to be a filled brass chip. In the first viewport of the till that put **two** brass
fills beside each other — Charge and Sell — and the brief allows one. The open tab is now ink: a 3px
ink rule on top (`aria-current` already said which one), weight 700, on the raised surface. Measured
after the change at 390×844: sell 1 (Charge), money 0, books 0, setup 0, more 0, learn 0.

## The component gallery

`?gallery=1` exists only in the dev server (`import.meta.env.DEV`), so it is audited there and never
ships. Audited at 320, 390 and 1440 in both themes: gallery renders, horizontal overflow 0, no page
errors, one control under 44px (an inline link inside prose).

## The failure block

Every failure a shopkeeper can meet answers the same three questions in the same order: **what
happened** (plain words, no error code), **what is safe** (the honest state of the money, even when
that is "unknown"), **what to do** (one action a person can take in a shop). Amber for "carry on", red
for "stop and look". The raw message stays at 10px underneath — it helps whoever is helping, and it is
never the headline. `role="status"`, never `alert`: mid-sale you are told, not shouted at.

## The manual's search never hides a paragraph

It offers jumps into text that is already on the page. A search field that returns nothing for a word
the manual uses is worse than no search field: it teaches the reader that the answer is not there. So
it indexes prose, not just headings, and its empty state admits the limit in words.

## The five signature moves, measured

1. **The receipt is torn off, not cut.** Half-circles of the page's own colour eat the card's bottom
   edge (`::after`, 12px, repeat-x, inset by the corner radius so the first and last punch are not
   clipped), and the card's bottom border is transparent so there is no straight line above the tear.
   Dropped in print — a printer cuts its own edge. Measured: `::after` content `""`, height 11–12px,
   `radial-gradient`, `padding-bottom: 26px`.
2. **Item tiles carry a thumb.** Measured 103px tall at 390 wide, above the brief's 96px.
3. **Empty panels teach.** Audited all five sections: **0** visible lists render empty and silent, and
   every section has its teaching copy or its limit list.
4. **A heartbeat, where something is live.** A 7px dot that breathes over 2.2s, not a strobe: on the
   waiting strip while a sale is being watched, and beside a standing request that is due. Green, part
   of the ink never the accent, and reduced to one 80ms beat under reduced motion; hidden in print.
   Measured: `animation-name: v2-beat` on money in.
5. **The focus ring is ink, and it is ours.** Two rules were fighting: a brass 2px ring declared early
   and an ink 3px ring declared late, so the brass one was dead in the cascade and the source lied
   about the screen. One rule now — ink 3px, offset 3px, measured with real keyboard focus as
   `solid 3px rgb(247, 242, 234)` — with the page-coloured ring plus ink halo reserved for filled
   brass buttons, and `Highlight` handed back to the system in high contrast mode.

## The bundle budget, redefined honestly

The brief asked for one page under 700 KB. The page is ~711 KB raw and **215 KB over the wire**. The
gate now measures what a phone downloads, with a 230 KB target and a 300 KB ceiling, and keeps a hard
800 KB ceiling on the raw file so a page cannot grow forever behind a gzip number.

Measured composition of the ~650 KB of script: React 18 and its renderer, the two noble crypto
libraries (secp256k1 and the hashes), slip's panels, the demo catalog and the manual. There is **no**
PSBT or transaction-building code in the bundle — importing the payment builders from
`@scure/btc-signer/payment` instead of the package root changed the output by **0 bytes**, which is
proof the library was already tree-shaken. Nothing can be cut without cutting a feature, so nothing
was cut: the measurement was wrong, not the page.
