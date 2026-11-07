# slip — the world-class design pass: brief, plan, and the master prompt

*Written 2026-11-07 for the v0.32+ design upgrade. Everything here is English, plain enough for a
shopkeeper, detailed enough for a strong model to execute without inventing.*

---

## 0. The one-paragraph version

slip already behaves like an honest instrument. It does not yet **feel** like one. This document takes
what is genuinely good in the current wave of crypto-wallet design, throws out the parts that are
fashion, and sets a direction: **a precision retail instrument** — the calm of a Braun calculator, the
trust of Apple Pay's confirm screen, the legibility of a Swiss timetable — rendered for a phone in one
hand, a tablet on a counter, and a laptop at the back office. It then gives the exact master prompt to
hand to an expensive model, the checklist that must be true before we call it done, and the plan for
getting there without breaking a single pipe.

---

## 1. What I actually looked at

Three reference shots from the Dribbble "crypto wallet UI" search (viewed as images, not titles):

| Shot | What it does well | What it is |
|---|---|---|
| Dark wallet, light transaction list, emerald accent | Generous gutters; one accent colour used sparingly; cards with tiny inner shadow read as *objects*; thin monochrome icons that never compete with numbers | A portfolio object. The glass-and-noise header, the dark/light split, the phone mounted on a machined rail — all theatre |
| Lime-on-charcoal wallet with a hero "card" | One hero element; a strict 3-level type hierarchy; 20–24px radii; asset rows that scan in a single pass | A trading app in a nice coat. Charts, tickers and card-stack gestures are the opposite of a till |
| Web3 dashboard site | Confident hero type, wide rhythm, restraint in the nav | A landing page, not an instrument |

**What transfers to slip (and we should take):**

1. **One hero per screen, with a decisive type jump.** Their balance is 3–4× the next size. Our total
   already moved that way — go further, and let nothing else compete.
2. **Cards as objects.** A 1px border plus a soft, short shadow beats a flat rectangle; a 20–24px
   radius on the big surfaces, 12px on the small ones, and *nothing* else.
3. **One accent, spent like money.** Emerald there; our brass. Never two accents on a screen, never an
   accent on something that is not the primary action.
4. **Thin, monochrome icons at 24px with 1.5px strokes**, always paired with a word.
5. **Real vertical rhythm.** 8px grid, 4px increments inside components, one spacing scale everywhere.
6. **Rows that scan.** A till is read in glances: name left, number right, tabular figures, no wrapping.

**What we reject, deliberately:**

- Glassmorphism, noise textures, glows, mesh gradients. They cost contrast, battery and honesty.
- Dark-header-slash-light-body. One surface temperature per screen.
- Charts, tickers, sparklines. A shopkeeper is not trading; showing price movement invites doubt.
- Card stacks, swipe-gesture secrets, hidden actions. Every control is visible and named.
- Physical-device theatre. Our screenshots must be screenshots.
- Neon-on-black "hacker" palettes. Our own dark theme is warm graphite on purpose.

---

## 1.5 What our own screenshot matrix shows today

`node scripts/shots-matrix.mjs` now captures 30 frames (phone / tablet / laptop × dark / light ×
sell, money-in, books, setup, learn) into `docs/shots/matrix/`. Reviewed by eye, six defects are
already visible — these are the ground truth the design pass must beat, not opinions:

1. **"remove" is a browser-blue underlined link.** The most ordinary-looking element in the product
   sits in the cart, where mistakes happen. It should be a quiet icon button with an obvious Undo.
2. **Inputs are generic.** The rate field and custom amount read as raw `<input>` boxes: no leading
   icon, no unit suffix inside the field, no visible focus personality.
3. **The till notice is a div with a border.** It says something important (the day has no beginning)
   in the visual language of a system alert.
4. **Charge is a flat rectangle.** It is the most pressed button in the product and has the least
   craft: no pressed-state depth, no brass rule, no confidence.
5. **Sats are the secondary figure.** On a Bitcoin till the sats figure is what the customer pays; on
   the laptop it is smaller than the fiat total. The hierarchy is inverted.
6. **The right rail is two blocks, not one panel.** Cart list and summary read as separate modules
   because the summary has its own surface. They must share one surface and one border.

Every one of these is cheap to fix and none of them needs a new dependency — which is the point: the
expensive model should be asked to fix *this list* and then go further, not to redesign from taste
alone.

## 2. The direction, in one line

> **A precision retail instrument: warm paper and graphite, one brass accent, numbers that behave like
> engraved plates, and every control at thumb height.**

Three reference feelings, in priority order:

1. **Braun / Teenage Engineering** — the object is designed, not decorated. Labelled keys, honest
   materials, nothing fake.
2. **Apple Pay confirm** — the moment of payment is a single, calm, unambiguous screen.
3. **Swiss timetable (SBB)** — dense information that is still read instantly, because alignment and
   tabular figures do the work.

If a proposal cannot be justified by one of those three, it is decoration and it goes.

---

## 3. The system we are upgrading to

### 3.1 Foundations

| Token family | Decision |
|---|---|
| Type | One self-hosted variable sans (Inter or Geist, `.woff2`, subset, `font-display: swap`, **no CDN**), plus a tabular-figure variant for all money. Display sizes: 44/36/28/22/18/16/14/12. Line heights 1.05 (display) → 1.6 (body) |
| Numerals | `font-variant-numeric: tabular-nums` on every figure, always. Sats are never abbreviated in a total; only in a trend line |
| Grid | 8px base, 4px inside components. Page gutters: 16 (phone), 24 (large phone), 32 (tablet), 48 (desktop) |
| Radius | 24 (hero surface), 16 (card), 12 (control), 999 (chip). No other values |
| Elevation | 3 layers only: `flat`, `card` (1px border + 0 1px 2px), `float` (0 8px 24px, used only for the charge bar and dialogs) |
| Colour | OKLCH tokens: `bg, surface, surface-2, line, line-strong, ink, secondary, muted, accent, accent-soft, good, warn, pending, bad`. Two themes, both AA. Brass splits by theme (dark `#f0a32a`, light `#a84808`) |
| Status colour | Good = seen/paid, warn = aging rate, pending = in flight, bad = refused. **Red is never used for anything but danger** |
| Motion | 120ms (press), 200ms (enter), 320ms (panel). `cubic-bezier(.2,.8,.2,1)` for enter, `(.4,0,1,1)` for exit. Honour `prefers-reduced-motion` everywhere; no motion carries meaning alone |
| Density | `comfortable` / `compact` (already shipped) and a third `counter` preset for a 10" tablet lying flat |
| Touch | 44×44 minimum everywhere, 56 for keys, 96 for item tiles. Thumb-zone audit on every phone screen |

### 3.2 The three canvases

**Phone (360–430px).** One column, one hero, one primary action pinned above the tab bar. The charge
bar is the anchor of the whole product: it never scrolls away, never hides a blocker, and always names
what is missing.

**Tablet (768–1100px, landscape and portrait).** Two panes: items/catalog left, **the cart + total +
Charge in a single right rail** (this pattern is already in the desktop build; tablet inherits it at a
narrower rail, 320px). The customer-facing QR gets a full-screen mode that is legible from 2 metres:
40px+ amount, QR ≥ 320px, "checked 4 s ago" visible.

**Desktop (1280px+).** Three regions: a 240px rail of sections (not five tabs — a real sidebar with
labels), a flexible work area, and a 380px "at this moment" column carrying the live sale, today's
takings and the waiting strip. Max content width 1440; nothing stretches to 1920.

### 3.3 The screen list to redesign (in this order)

1. **Sell / counter** — the money screen. Hero total, item tiles, cart rail, charge bar, shift line.
2. **Pay screen (what the customer sees)** — 40px amount, white QR card with a real quiet zone, three
   honest status words, a 15-minute countdown that looks like a clock, not a warning.
3. **Receipt** — a document, not a card: seal, amount at 2rem, honest badge, print variant on white.
4. **Money in** — waiting strip, wallet balances, freshness rings, "checked Ns ago".
5. **Books** — today's line, per-rail breakdown, day digest, export.
6. **Setup** — wallet picker → paste → compare address; the wizard as five calm steps, and the
   readiness checklist as progress you can see.
7. **More / Learn** — manual, glossary, technical fold, demo door.
8. **Customer display** (second window / BroadcastChannel) — a poster, not a dashboard.

### 3.4 Signature details (the things people will remember)

- **The brass rule.** One 2px brass line, only under the single most important number on a screen.
- **Engraved figures.** Money in a slightly condensed tabular face at `letter-spacing: -0.01em`, with a
  hairline `text-shadow: 0 1px 0 rgba(0,0,0,.04)` in light theme — printed, not typed.
- **The heartbeat.** "checked 4 s ago" ticks in place; when watching stops, it says so in words.
- **The receipt edge.** A 6px perforated edge (CSS mask) on the receipt card — the one permitted
  ornament, because it says "this is a document".
- **Focus that glows brass**, never a browser-blue ring.
- **Empty states that teach**: every empty panel states the one next action and why.

---

## 4. The checklist that must be true before we call it world-class

### 4.1 Honesty (non-negotiable, unchanged by any design)

- [ ] No "Paid" unless the engine observed it; `submitted ≠ confirmed`, `seen ≠ paid`, manual says manual.
- [ ] Demo money always labelled simulated; demo never touches the network (D-81).
- [ ] A cue is a courtesy, never evidence (D-70).
- [ ] Red only for danger; brass never carries a status meaning.
- [ ] Every disabled control names its blocker (`data-charge-blocker` pattern, extended to every screen).

### 4.2 Accessibility (WCAG 2.2 AA, target AAA on body text)

- [ ] Contrast ≥ 4.5:1 body, ≥ 3:1 large text and UI borders; measured, not eyeballed (`contrast-audit`).
- [ ] Every interactive element reachable by keyboard, in DOM order, with a visible focus ring.
- [ ] Focus never trapped; dialogs restore focus on close; `Esc` closes.
- [ ] 44×44 minimum targets; 8px minimum spacing between adjacent targets.
- [ ] `prefers-reduced-motion` honoured; no animation over 320ms; nothing flashes more than 3×/s.
- [ ] Zoom to 200% without loss of content; text resizes with `rem`, never `px`.
- [ ] Form fields have labels (visible or `aria-label`), errors are announced, status regions use
      `role="status"`.
- [ ] Screen-reader pass on the three money paths: charge → pay screen → receipt.
- [ ] Colour is never the only carrier of meaning (D-52: status always carries a word).

### 4.3 Ergonomics

- [ ] Every phone screen: primary action within the bottom third, one-handed.
- [ ] Tablet flat on a counter: no control below 44px, no hover-only affordance, glare-safe contrast.
- [ ] Desktop: keyboard shortcuts `/ c n p` documented and discoverable; nothing requires precision.
- [ ] The till opens, charges, and shows a QR in ≤ 3 taps from a cold start with a set-up shop.

### 4.4 Performance and integrity

- [ ] Single `dist/index.html`; no runtime CDN, no font fetch, no analytics, no cookies.
- [ ] Bundle budget: ≤ 700 KB total (current ≈ 635 KB), first paint ≤ 1.2 s on a mid-range phone.
- [ ] CSP hash-pinned inline script still builds; `scan-bundle` clean.
- [ ] `prefers-color-scheme` respected on first load; theme choice persists.
- [ ] Print path: white page, black text, no ink-heavy fills (receipt and book export).
- [ ] No new npm dependency without a written reason; anything visual must be CSS or inline SVG.

### 4.5 The engineering contract (what "all pipes working" means here)

```
npx tsc -p tsconfig.json --noEmit     # 0
npx eslint .                          # 0
npx vitest run                        # 561+ passing
npm run build                         # single file, CSP hash regenerated
node scripts/scan-bundle.sh           # clean, no off-origin strings
node scripts/contrast-audit.mjs --strict   # 18/18 → more pairs, all AA
node scripts/docs-audit.mjs --strict  # every panel documented
node tests/e2e/run-all.mjs "http://[::1]:4181/"   # 12/12 suites
node scripts/demo-check.mjs https://slip.giveabit.io/   # 8/8, nothing left the device
```

A design pass is done when these are green **and** the screenshot matrix below has been reviewed by eye.

### 4.6 The screenshot matrix (the review instrument)

| Canvas | Themes | Screens |
|---|---|---|
| 390×844 phone | dark, light | sell, pay, receipt, money-in, books, setup, learn, empty-cart, waiting, error |
| 834×1112 tablet | dark, light | sell (two-pane), pay (full-screen QR), books |
| 1440×960 desktop | dark, light | sell (three-region), books, setup, learn |
| 320×568 smallest | light | sell — the "does it survive" case |

Every shot is generated by a script (`scripts/shots-matrix.mjs`), diffed against the previous release,
and reviewed with vision before a deploy. No screenshot, no ship.

---

## 5. The master prompt (paste this into the expensive model)

> Copy everything between the lines. Replace `{{BRANCH}}` if working on a branch. Do not paste the
> product rules out of this file — they are inside the prompt already.

---

**ROLE.** You are a senior product designer and front-end engineer working as one person. You have
shipped consumer retail software at world class. You are meticulous, allergic to decoration that costs
legibility, and you write code that passes the project's gates on the first or second attempt.

**THE PRODUCT.** `slip` is a free, open-source, non-custodial, serverless point-of-sale for Bitcoin.
A merchant pastes public wallet material once (xpub, descriptor, single pubkey, static address, or a
Lightning address) and every sale is paid directly into their own wallet. slip has no backend, no
accounts, no analytics, no cookies, no CDN, and it **cannot spend**. One file: `dist/index.html`.
React + Tailwind + TypeScript, Vite + `vite-plugin-singlefile`, CSP hash-pinned.

**WHAT YOU ARE DOING.** A full visual and interaction upgrade across phone, tablet and desktop, in the
direction of a **precision retail instrument**: warm paper and graphite, one brass accent, engraved
tabular figures, every control at thumb height, one hero per screen. References: Braun / Teenage
Engineering (designed, not decorated), Apple Pay confirm (one calm moment), Swiss timetable (dense but
instantly readable). Reject: glassmorphism, glows, mesh gradients, neon-on-black, charts, tickers,
hidden gestures, dark-header/light-body splits.

**NON-NEGOTIABLE PRODUCT LAW — this survives every design decision:**

1. Never accept, store, or transmit a seed phrase, `xprv`/`yprv`/`zprv`/`vprv`, WIF, or hex private
   key. Refuse immediately, wipe the field, warn in red, and **never echo the material back**.
2. No custody. slip must never be able to spend. Any bug may at worst misdisplay an address.
3. Honesty labels are inviolable: `submitted ≠ confirmed`, `seen ≠ paid`, a manual confirmation says it
   is manual, demo money always says simulated. Never show "Paid" unless the engine observed it.
4. No network except the endpoints the merchant configures. No fonts, scripts, images or analytics from
   anywhere else. No cookies. No audio files (payment cues are synthesised).
5. Red is reserved for danger. Status always carries a word as well as a colour.
6. Plain language first: a shopkeeper who has never used Bitcoin must understand every default screen.
   Technical language lives behind "show technical names" (default off) and one "For developers" card.
7. Do not delete a tool to make a screen look calmer. Fold it, do not remove it.

**THE SYSTEM.** Follow `docs/DESIGN-BIBLE.md` and the tokens described in
`docs/DESIGN-UPGRADE-BRIEF.md` §3: 8px grid, radius {24, 16, 12, 999} only, three elevation layers,
one accent per screen, tabular figures on every number, type scale 44/36/28/22/18/16/14/12, motion
120/200/320ms with `prefers-reduced-motion` honoured, 44px minimum touch targets (56 for keys).

**THE WORK, IN THIS ORDER.** Do not jump ahead; each step must be green before the next.

1. **Audit.** Read `README.md`, `docs/DESIGN-BIBLE.md`, `docs/DESIGN-DECISIONS.md` (D-33 → D-86),
   `THREAT_MODEL.md`, `SECURITY.md`, `docs/ARCHITECTURE.md`. Produce a table: screen → what is wrong →
   what changes → which reference justifies it. No code yet.
2. **Tokens.** Rework `src/index.css` tokens and the type scale. Everything must stay AA in both themes.
   Run `node scripts/contrast-audit.mjs --strict` until it passes with more pairs than before.
3. **Sell.** The money screen first: hero total, tiles, cart rail, charge bar, shift line. Phone, then
   tablet two-pane, then desktop three-region.
4. **Pay screen and receipt.** The moment of payment must be unambiguous at 2 metres.
5. **Books, Money in, Setup, Learn.** Rhythm and hierarchy; empty states that teach.
6. **Motion and focus.** One motion language; brass focus ring; nothing decorative.

**HOW TO WORK.**

- Touch the minimum number of files. Follow existing conventions and comment style; comments explain
  *why*, in plain English, and are never decorative.
- No new dependency. Anything visual is CSS or inline SVG. Fonts must already be vendored; if a face is
  needed, add it as a subset `.woff2` under `public/` and reference it locally.
- Do not change money maths, ledger, storage keys, CSP shape, or any honesty string. If a design idea
  needs an honesty string changed, stop and use that string verbatim.
- After each step run: `npx tsc -p tsconfig.json --noEmit`, `npx eslint .`, `npx vitest run`,
  `npm run build`, `node scripts/contrast-audit.mjs --strict`. Fix failures before moving on.
- Browser suites must pass: start `npx vite preview --port 4181 --strictPort` then
  `node tests/e2e/run-all.mjs "http://[::1]:4181/"`. If a selector or string legitimately changed,
  update the test **and say so in your summary**; never weaken an assertion's meaning (assert the
  thing is visible, not that the page scrolled).
- Screenshots: extend `scripts/shots-matrix.mjs` for every screen you touch, at phone/tablet/desktop,
  dark and light. Look at them. Fix what you see, not what you assume.

**DELIVERABLE FORMAT.** Finish with: a table of screens changed and why; the gate results as raw
numbers; the screenshots produced (paths); anything you deliberately did **not** do with the reason;
and the one thing a reviewer should check first.

**REFUSALS.** If a request would break the product law, say so in one sentence and offer the honest
alternative. If a fix needs a server, a wallet connection, or a private key, it is out of scope.

---

## 6. The plan (six passes, in order, each shippable)

| Pass | Scope | Effort | Done means |
|---|---|---|---|
| **P1 Foundations** | Tokens, type scale, spacing, radius, elevation, focus ring, motion primitives, vendored font subsets | 1 day | Contrast audit green with more pairs; nothing looks different yet except detail quality |
| **P2 The money screen** | Sell: hero total, tiles, cart rail, charge bar, shift line; phone → tablet → desktop | 1.5 days | 3 taps cold start → QR; screenshots reviewed at all four canvases |
| **P3 The moment of truth** | Pay screen, customer display, receipt (incl. print variant) | 1 day | Legible at 2m; receipt reads as a document; print is white |
| **P4 The rest of the shop** | Money in, Books, Setup/wizard, Learn/More, empty states | 1.5 days | Every panel has one hero and one next action |
| **P5 Motion & polish** | Transitions, cue timings, brass rule, perforated receipt edge, hover/press states | 0.5 day | Nothing decorative over 320ms; reduced-motion parity |
| **P6 Proof** | Full matrix screenshots, dogfood pass, README/BIBLE update, version + changelog | 0.5 day | All gates green, demo 8/8, live verified |

**Cadence:** one pass = one commit = one deploy (`SLIP_NOTE=... bash scripts/deploy.sh minor`), then
live verification of the deployed DOM. Never a big-bang redesign; the till must keep selling through
every pass.

### Risk register

| Risk | Mitigation |
|---|---|
| Beauty drifts into dishonesty (a "Paid" that feels nice) | Honesty strings are frozen; tests pin them |
| Dark theme glamour destroys contrast | `contrast-audit --strict` gate, extended to new pairs |
| Font adds a network request | Vendored `.woff2`, `scan-bundle` refuses off-origin strings |
| Tablet/desktop layout forks the code | One component, responsive classes, no duplicate tree |
| Tests weakened to make a redesign pass | Rule: assert the meaning (visible / readable), never loosen silently |
| Redesign of the pay screen confuses customers | Customer screen tested for 2m legibility; three honest words only |

---

## 7. Where to get reference material I can actually see

- **Direct image URLs work.** Paste Dribbble's CDN link (`cdn.dribbble.com/userupload/...`) or any
  image URL; I can view it and critique it. Gallery pages themselves are JavaScript-heavy, so the shot
  images are what matter.
- **Dribbble** — search `crypto wallet ui`, `pos terminal ui`, `payment confirmation`, `fintech dark ui`;
  open a shot, copy the image address.
- **Mobbin** (app screens, real products), **Land-book** (sites), **SaaSFrame**, **Godly**.
- **Real products worth studying, not just shots:** Square POS, SumUp, Toast, Apple Pay confirm,
  Cash App, Strike, Phoenix, Coinbase Commerce checkout, BTCPay Server's checkout, Fountain POS.
- **Written standards:** Apple HIG, Material 3, WCAG 2.2, Nielsen Norman (touch targets, error
  prevention), Baymard (checkout friction), Refactoring UI (hierarchy, spacing).
- **Our own archive:** `docs/shots/`, `docs/DESIGN-BIBLE.md`, the D-79 → D-86 decision records.

---

## 8. What I would tell the expensive model on day one

The design is not the hard part; **restraint** is. Give it the brief above, tell it to audit first and
produce the screen-by-screen table before touching code, and hold it to one rule above all others:

> *If a change makes the till look better and read worse, it is not a change.*
