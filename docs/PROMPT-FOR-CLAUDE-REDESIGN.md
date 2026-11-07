# THE CLAUDE PROMPT — slip, full re-conception and redesign

**This supersedes `docs/PROMPT-FOR-CLAUDE.md`.** That one asked Claude to *review and specify fixes*. This
one asks him to **re-conceive the product's visual identity and rebuild the interface on it** — a new art
direction, not a polish pass.

Use: attach the 30 screenshots from `docs/shots/matrix/` (regenerate with `node scripts/shots-matrix.mjs`),
give him the repository, paste everything below the line.

---

## ROLE

You are a **principal product designer with a signature** — the person a company hires when the product
works and must now look like nobody else's. You have shipped retail hardware and software at world-class
standard (Square, SumUp, Apple Pay, Stripe Terminal, Braun calibre), and you can write the CSS and React
that realises your own design without a single new dependency.

You are not here to fix six defects. You are here to **replace the visual language**: new concept, new
system, new screens, new motion — while every behavioural promise, honesty label and security rule stays
exactly as it is. Your old work (the review brief) is the floor, not the ceiling.

---

## 1. THE PRODUCT

`slip` is a free, open-source, **non-custodial, serverless point of sale for Bitcoin**. A merchant pastes
public wallet material once — xpub, descriptor, single pubkey, static address or Lightning address — and
every sale lands directly in their own wallet. No backend, no accounts, no analytics, no cookies, no CDN,
no runtime font fetch. slip **cannot spend**. One deployable file: `dist/index.html`. React + Tailwind +
TypeScript, Vite + `vite-plugin-singlefile`, CSP hash-pinned.

Live: https://slip.giveabit.io · Repo: `kitsboy/slip`, branch `master`, MIT. Current version: **v0.31.0**,
562 tests, 12 browser suites green.

Users: a shopkeeper who has never used Bitcoin (primary); a market trader on a phone in sunlight; a café
with a tablet flat on the counter; a small shop with a laptop in the back. Their customers see a second
screen with a QR code and three words of status.

---

## 2. WHAT YOU HAVE

**Read, in this order:** `README.md` → `docs/DESIGN-UPGRADE-BRIEF.md` (the current direction and the six
observed defects) → `docs/DESIGN-DECISIONS.md` (**D-33 → D-86: binding constraints**) →
`docs/DESIGN-BIBLE.md` → `THREAT_MODEL.md`, `SECURITY.md` → `docs/ARCHITECTURE.md`.

**Specify against these files:** `src/index.css` (all tokens and utilities) · `src/App.tsx` (shell, nav,
sections) · `src/ui/Till.tsx` (the counter — the most important screen) · `src/ui/{History,Counters,
Settings,Wizard,WalletPicker,OpenTill,InfoVideo,AmountPad,TabIcon,Readiness,NextStep,Lightning}.tsx` ·
`src/core/{settings,theme,ledger,accounts,shifts}.ts`.

**The screenshots:** 30 frames — phone 390×844, tablet 834×1112, desktop 1440×960 × dark + light × five
screens. If you cannot see them, say so in §0 and work from the brief — never invent what a screen looks
like.

**Gates that must stay green** (they are also your definition of "it works"):

```
npx tsc -p tsconfig.json --noEmit · npx eslint . · npx vitest run (562+) · npm run build
node scripts/scan-bundle.sh · node scripts/contrast-audit.mjs --strict
node scripts/docs-audit.mjs --strict · node tests/e2e/run-all.mjs "http://[::1]:4181/" (12/12)
node scripts/demo-check.mjs https://slip.giveabit.io/ (8/8, nothing leaves the device)
```

---

## 3. THE MANDATE

**Replace the look. Keep the truth.**

At the end of this pass, a stranger should be able to see a screenshot and know three things without
reading a word: *it takes money, it is honest, and it was made by someone with taste.* Today they can tell
the first two. The third is what you are for.

You must **choose a position**, not offer options. Three candidate art directions maximum, each described
in one paragraph with a named reference, then a clear pick and the reason the other two lose. Then build
the winner completely.

Constraints on the concept:

- **It must be a retail instrument, not a wallet app.** A till is used in fifteen-second bursts by tired
  eyes, in sunlight, with a customer waiting. No charts, no tickers, no card stacks, no hidden gestures,
  no glassmorphism, no mesh gradients, no neon-on-black, no dark-header/light-body split.
- **It must survive a 320px screen and a 1440px desk** — the same component tree, no forked layouts.
- **It must be buildable in CSS and inline SVG only.** No new dependency. Fonts: at most one self-hosted
  variable `woff2` subset (or a disciplined system stack, argued for).
- **It must hold AA in both themes** — measured, not eyeballed — and prefer AAA for body text.
- **Dark is not an afterthought.** Both themes are first-class citizens with their own logic (a till at
  night is a different room than a till at noon).

---

## 4. NON-NEGOTIABLE PRODUCT LAW

Redesign everything above this line. Nothing below it moves.

1. **The one rule.** Never accept, store or transmit a seed phrase, `xprv`/`yprv`/`zprv`/`vprv`/`Ltpv`/
   `Mtpv`/`ttpv`, WIF or hex private key. Refuse immediately, wipe the field, warn in red, **never echo
   the material back**.
2. **No custody.** slip can never spend. Worst possible bug: a misdisplayed address.
3. **Honesty labels are inviolable.** `submitted ≠ confirmed`; `seen ≠ paid`; manual confirmations say
   manual; demo money says simulated; never "Paid" unless observed. A cue is a courtesy, never evidence.
4. **No network but merchant endpoints.** No fonts, scripts, images, analytics, telemetry, cookies, audio
   files. Payment cues are synthesised.
5. **Red is for danger only.** Status always carries a word as well as a colour.
6. **Plain language first.** Technical vocabulary lives behind "show technical names" (default off).
7. **Never delete a tool to calm a screen.** Fold, move, relabel — never remove.

Any proposal that needs one of these bent is not a proposal: drop it and write the honest alternative.
Designing around a constraint is the job, not the obstacle.

---

## 5. DELIVERABLES (all of them, with these exact IDs)

### D1 — The position

`CONCEPT` — three directions (one paragraph each, one named reference each), the pick, the two rejections
and why. Then, in one sentence each: the **one shape**, the **one material**, the **one motion idea** that
will make this product recognisable. A stranger should be able to describe it after one glance.

### D2 — The new identity, as values

- A **logo/wordmark** treatment in inline SVG (how "slip" is set, at what weight, with what mark, in both
  themes, at 16px favicon scale and at hero scale). No image files, no fonts from a CDN.
- Colour: complete OKLCH palette for both themes with **measured contrast for every pairing you use**.
- Type: family decision, full scale, line-heights, tracking, and the rule for which sizes carry tabular
  numerals. State the maximum number of accents per screen and define what counts as an accent.
- Space, radius (**at most four values**), border widths, elevation (**at most three layers**), motion
  (durations, easings), focus ring, and the *permission table*: which of these may appear where.
- A **one-page visual grammar**: three sentences a new contributor could follow to lay out a screen
  correctly without you.

### D3 — Full screen redesign (all eight, all canvases)

1 Sell/counter (phone, tablet, desktop) · 2 Pay screen + full-screen customer QR · 3 Receipt (screen and
print-on-white) · 4 Money in · 5 Books · 6 Setup (picker → paste → compare; wizard; readiness) ·
7 More/Learn · 8 Customer display window.

For each: **S-xx**, current state (with evidence), **ASCII wireframe with real proportions**, exact
values, all nine states (default/hover/pressed/focus/disabled-with-named-blocker/loading/teaching-empty/
error/success), exact copy with honesty strings marked **FROZEN**, motion, acceptance checks a reviewer
can perform in a browser, and effort. Every screen gets **one hero** and **one primary action at thumb
height**. Nothing above 18px except the hero and the money.

### D4 — Component system

Every component rebuilt for the new identity: `Button` (3 types × 3 sizes), `Money` (hero/inline/sats),
`Card` (hero/standard/flat), `Input` (unit suffix, leading icon, error, help), `Select`, `Toggle`, `Chip`,
`Badge` (good/warn/pending/bad/manual/simulated), `ItemTile`, `CartLine` (with Undo), `Keypad`, `QRCard`,
`StatusLine`, `EmptyState`, `Dialog`, `Sheet`, `InlineNotice`, `TabBar`, `Sidebar`, `DataRow`,
`Progress`, `FreshnessRing`, `Countdown`. Anatomy, sizes, states, tokens, accessibility contract, and when
**not** to use it.

### D5 — Twelve signature moves

Exactly twelve details that make the product unmistakably yours, ranked by impact per hour, each with the
CSS/SVG technique, the risk, and **one place it must never appear**.

### D6 — The rebuild plan

Six passes maximum, each independently shippable and each keeping the till selling: scope, files, spec
IDs, gates, screenshot frames to review, rollback. Include the pass where the **old look disappears
completely** and say how the transition avoids a half-redesigned product for a day.

### D7 — Honest limits

What you could not see or verify (**ASSUMPTION** list). What you refuse to do and why (cite a decision ID,
an accessibility rule or the performance budget). Three questions for the owner, each with your recommended
default so nothing blocks.

---

## 6. HOW TO WORK

- **Concept before pixels; pixels before prose.** Decide the position, then specify it to the last value.
- **Cite evidence** for every claim about the current product: screenshot frame name or `path:line`.
- **"Increase hierarchy" is banned.** Give numbers: size, weight, tracking, colour token, spacing.
- **No new dependency.** CSS and inline SVG only; one vendored `woff2` subset at most.
- **Do not change** money maths, ledger/storage keys, CSP shape, honesty strings, or the
  `showTechnical: false` default.
- **Do not propose anything you would not be able to build in a day.** Six passes, not sixty.
- If two engineers could build different things from your spec, the spec is wrong.

---

## 7. OUTPUT FORMAT (strict)

```
# slip — re-conception and redesign
## 0. What I could and could not see
## 1. D1 The position
## 2. D2 The new identity, as values
## 3. D3 Screens (S-01 …)
## 4. D4 Components (C-01 …)
## 5. D5 Twelve signature moves (M-01 …)
## 6. D6 The rebuild plan (P-1 … P-6)
## 7. D7 Honest limits
## 8. Self-audit: ID | delivered | evidence | confidence | what would change my mind
## 9. The owner's summary — ≤200 words, no jargon
```

A missing ID is a failed delivery. Never summarise away a table to save space; continue in a second
message at the exact heading where you stopped.

---

## 8. WHAT HAPPENS NEXT

Your pack goes to the engineering lead for a line-by-line audit: every ID checked against the code, every
contrast value re-measured by script, every "current state" claim verified in a browser, every proposal
tested against §4. Accepted rows are digested into a build brief for a second model that implements them
pass by pass under the same gates; rejected rows come back with the reason.

Be specific, be bold in the identity, and be honest about what you could not see. **A confident guess is
worse than a labelled assumption.**

---

## 9. THE STANDARD

> Make it look like the best tool in the shop — and never, for one second, like it is guessing.

Begin.
