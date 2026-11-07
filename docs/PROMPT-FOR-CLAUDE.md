# THE CLAUDE PROMPT — slip, world-class design review & specification pack

**How to use this file.** Open Claude with the strongest model you have, attach the screenshots named in
§2.4 (or the zip), paste everything from the line below to the end of the file. Do not summarise it, do
not trim it, do not let Claude "start over" — the prompt asks for a *review and specification*, not a
redesign from taste. When Claude returns, bring the whole reply back to Kimi, unchanged, who will audit
it line by line against §3 and turn it into the Fable build brief.

---

## ROLE

You are two people in one: a **principal product designer** who has shipped consumer retail software at
world-class standard (Square, SumUp, Apple Pay, Stripe Terminal calibre), and a **staff front-end
engineer** who has maintained large React + TypeScript + Tailwind codebases under strict security and
accessibility constraints. You are allergic to decoration that costs legibility. You write specifications
another engineer can implement without asking you a single question.

You are not here to be encouraging. You are here to find what is wrong with this product's interface,
say precisely how to fix it, and specify the fix in implementable detail. Flattery is a failed delivery.

---

## 1. THE PRODUCT

`slip` is a free, open-source, **non-custodial, serverless point-of-sale for Bitcoin**, live at
https://slip.giveabit.io (source: https://github.com/kitsboy/slip, branch `master`, MIT).

A merchant pastes **public wallet material once** — an xpub, a descriptor, a single pubkey, a static
address, or a Lightning address — and every sale is paid **directly into their own wallet**. There is no
backend, no account, no analytics, no cookies, no CDN, no font request at runtime, and slip **cannot
spend**. One deployable file: `dist/index.html` (React + Tailwind + TypeScript, Vite +
`vite-plugin-singlefile`, CSP hash-pinned inline script).

Users: a shopkeeper who has never used Bitcoin (primary), a market-stall trader on a phone in sunlight,
a café with a tablet flat on the counter, a small shop with a laptop at the back. Secondary: their
customers, who see a second screen with a QR code and three words of status.

The product currently sits at **v0.31.0**, with 562 unit tests and 12 browser suites green.

---

## 2. WHAT YOU HAVE

### 2.1 Read these, in this order (if you have repository access)

| File | Why |
|---|---|
| `README.md` | what it is, in the owner's own words |
| `docs/DESIGN-UPGRADE-BRIEF.md` | **the current direction, system, checklist and plan — this is your starting point, not your competition** |
| `docs/DESIGN-DECISIONS.md` | decisions **D-33 → D-86**. Every one is a constraint you must not silently reverse |
| `docs/DESIGN-BIBLE.md` | the existing visual rules |
| `THREAT_MODEL.md`, `SECURITY.md` | why some "nice" ideas are forbidden |
| `docs/ARCHITECTURE.md` | module map, so your specs land in the right files |

### 2.2 The code surfaces you will be specifying against

`src/index.css` (tokens, type, utilities) · `src/App.tsx` (shell, sections, header, tab bar) ·
`src/ui/Till.tsx` (the counter — the most important file) · `src/ui/{Lightning,PayScreen or invoice view,
History,Counters,Settings,Wizard,WalletPicker,OpenTill,InfoVideo,AmountPad,TabIcon,Readiness,NextStep}.tsx`
· `src/core/{settings,theme,ledger,accounts,shifts}.ts`. Use real class names and real token names in
your specs; if you are unsure a symbol exists, say so rather than inventing it.

### 2.3 Commands that must stay green (the engineering contract)

```
npx tsc -p tsconfig.json --noEmit          # 0 errors
npx eslint .                                # 0
npx vitest run                              # 562+ passing
npm run build                               # single dist/index.html, CSP hash regenerated
node scripts/scan-bundle.sh                 # no off-origin strings
node scripts/contrast-audit.mjs --strict    # all pairs AA
node scripts/docs-audit.mjs --strict        # every panel documented
node tests/e2e/run-all.mjs "http://[::1]:4181/"    # 12/12 suites
node scripts/demo-check.mjs https://slip.giveabit.io/   # 8/8, nothing leaves the device
node scripts/shots-matrix.mjs               # 30 frames into docs/shots/matrix/
```

### 2.4 The screenshot matrix (attach these, or run the script)

30 frames: **phone 390×844, tablet 834×1112, desktop 1440×960 × dark + light × five screens** (sell with
two items in the cart, money-in, books, setup, learn). If you cannot see the images, say so explicitly at
the top of your reply and work only from the descriptions in §1.5 of the brief — do not invent what a
screen looks like.

---

## 3. WHAT I WANT FROM YOU — seven deliverables

Produce **all seven**. Use the exact IDs (`D1`…`D7`, and the row IDs inside each). The audit that follows
your delivery is mechanical: a missing ID is a failed delivery, not a stylistic difference.

### D1 — Verdict in one page (the "if you read nothing else")

- The single biggest reason this does not yet look or feel world-class, in one sentence.
- The three strongest things that must **not** be lost.
- The five weakest things, ranked by damage to trust or speed.
- The one change with the highest impact per hour of work.
- A blunt confidence statement: what in this product still looks like a template.

### D2 — Token and type system, with exact values

A table with columns: `Token | Current | Proposed | Why | Contrast check`.

- Colour: every surface, line, ink level, accent (dark and light), status colours. Give **OKLCH** values
  and the sRGB fallback; state measured contrast for each pairing you touch.
- Type: family recommendation (**must be self-hostable as a `woff2` subset; no CDN, no Google Fonts**),
  the full scale, line-heights, letter-spacing, and which sizes carry tabular numerals.
- Spacing, radius, border, shadow, motion (durations + easings), focus ring, and the rules for when each
  is permitted. State the **maximum number of accents per screen** and what counts as an accent.
- Two complete themes that both pass AA on every pairing you introduce.

### D3 — Screen-by-screen specification (the heart of the pack)

For **each** of these eight screens, at **each** canvas where it exists:

1. Sell / counter (phone, tablet, desktop)
2. Pay screen — what the customer sees (phone-in-hand, customer display, full-screen QR on tablet)
3. Receipt (screen + print variant on white)
4. Money in (waiting strip, balances, freshness)
5. Books (today line, per-rail breakdown, day digest, export)
6. Setup (wallet picker → paste → compare address; wizard as five steps; readiness)
7. More / Learn (manual, glossary, technical fold, demo door)
8. Customer display window (second screen)

Each spec must contain, in this order:

- **S-xx ID**, screen name, canvas, theme(s).
- **Current state**: what is wrong, referenced to what you can actually see (screenshot frame name) or to
  a `path:line` you read. No vague claims.
- **Target structure**: an ASCII wireframe with real proportions (columns, rail widths, sticky regions,
  safe areas, thumb zone).
- **Exact values**: type sizes, spacings from the scale, radii, surface tokens, border colours.
- **States**: default, hover, pressed, focus-visible, disabled **with the blocker named on screen**,
  loading, empty (that teaches), error, success — and what the honest label says in the money states.
- **Copy**: the exact strings, in plain English, for a shopkeeper who has never used Bitcoin. Mark every
  string that is an honesty string and must be kept verbatim.
- **Motion**: what moves, how far, how long, easing; what happens under `prefers-reduced-motion`.
- **Acceptance**: 2–5 checks a reviewer can perform in a browser, phrased so a test could assert them.
- **Effort**: S / M / L, and whether it is a token change, a component change, or a layout change.

### D4 — Component library (specify once, use everywhere)

For each component below: anatomy, sizes, states, tokens used, accessibility contract, and one sentence
on when **not** to use it.

`Button` (primary/secondary/ghost/danger, 3 sizes), `Money` (hero / inline / tabular / sats-only),
`Card` (hero / standard / flat), `Input` (with unit suffix, leading icon, error, help), `Select`,
`Toggle`, `Chip`, `Badge` (status: good/warn/pending/bad/manual/simulated), `ItemTile` (≥96px, 2-line
name, price, quantity badge), `CartLine` (minus/plus, remove with Undo), `Keypad` (56px keys + quick
amounts), `QRCard` (quiet zone, size rules, white plate only), `StatusLine` (word + colour + timestamp),
`EmptyState`, `Dialog`, `Sheet`, `Toast/InlineNotice`, `Tabs/TabBar`, `Sidebar` (desktop), `DataRow`
(name left, tabular figure right), `Progress` (readiness), `FreshnessRing`, `Countdown`.

### D5 — The signature moves

Exactly **twelve** details that would make a reviewer say "this was designed by someone who cared",
ordered by impact/effort. For each: name, what it is, where it appears, the CSS technique (specific
enough to implement without a dependency), the risk, and the one screen where it must **never** appear
(because it would steal the hero or cost contrast).

### D6 — Defect list against the current build

A table: `ID | Screen | Defect | Evidence (frame or path:line) | Severity (blocker/major/minor) | Fix |
Effort`. Include at minimum these six already-observed defects, and add everything else you find:

- `remove` in the cart is a browser-blue underlined link.
- The rate and custom-amount inputs read as raw `<input>` boxes with no unit suffix or focus personality.
- The till notice ("The till isn't open yet…") is visually a system alert.
- Charge is a flat rectangle with no press depth, no brass rule, no confidence.
- On a Bitcoin till, the **sats figure is smaller than the fiat total** on the desktop rail.
- The right rail reads as two blocks (cart list + summary) instead of one checkout panel.

### D7 — Rollout plan, risks, and what you refuse to do

- A pass-by-pass plan (six passes maximum), each independently shippable, each with: scope, files
  touched, gate to pass, screenshot set to review, and the rollback if it goes wrong.
- A risk register: design risk → failure mode → mitigation → how a test catches it.
- **What you deliberately refuse to do**, and why (each refusal must cite either a decision ID, an
  accessibility rule, or a performance budget).
- Three questions you would ask the owner before starting, with your recommended default answer so work
  is never blocked.

---

## 4. NON-NEGOTIABLE PRODUCT LAW

These survive every design decision. If a design idea requires breaking one, drop the idea and offer the
honest alternative in the same breath.

1. **The one rule.** Never accept, store, or transmit a seed phrase, `xprv`/`yprv`/`zprv`/`vprv`/`Ltpv`/
   `Mtpv`/`ttpv`, WIF, or hex private key. Refuse immediately, wipe the field, warn in red, and **never
   echo the material back**.
2. **No custody.** slip must never be able to spend. The worst possible bug may misdisplay an address —
   nothing more.
3. **Honesty labels are inviolable.** `submitted ≠ confirmed`. `seen ≠ paid`. A manual confirmation says
   it is manual. Demo money always says simulated. Never show "Paid" unless the engine observed it. A
   cue (sound, colour, animation) is a courtesy, never evidence.
4. **No network except merchant-configured endpoints.** No fonts, scripts, images, analytics or telemetry
   from anywhere else. No cookies. No audio files (payment cues are synthesised).
5. **Red is reserved for danger.** Status always carries a **word** as well as a colour.
6. **Plain language first.** A shopkeeper who has never used Bitcoin must understand every default
   screen. Technical vocabulary lives behind "show technical names" (default **off**) and one "For
   developers" card.
7. **Do not delete a tool to make a screen calmer.** Fold it, move it, label it — never remove it.

---

## 5. HOW TO ACTUALLY DO THE WORK

- **Audit before you design.** Read, look, list. Produce D1 and D6 first, then design the system (D2,
  D4), then the screens (D3), then the flourish (D5), then the plan (D7).
- **Cite evidence.** Every criticism carries either a screenshot frame name or `path:line`. If you cannot
  verify something, write **ASSUMPTION** and say what would confirm it.
- **Be specific to the last pixel.** "Increase hierarchy" is banned. "Total: 44px/700, `-0.02em`,
  `font-variant-numeric: tabular-nums`; sats line 16px/500 at 70% ink; nothing else above 18px in the
  rail" is the standard.
- **No new dependency.** Anything visual is CSS or inline SVG. Fonts must be vendored `.woff2` subsets.
- **Do not change money maths, ledger, storage keys, CSP shape, or any honesty string.** If a change
  needs an honesty string altered, stop and quote it back to me.
- **Do not weaken a test to make a redesign pass.** If a selector legitimately changes, say which test
  and why, and keep the assertion's *meaning* (assert visibility, not a scroll distance).
- **Write for the implementer, not the gallery.** If two people could build different things from your
  spec, the spec is wrong.

---

## 6. OUTPUT FORMAT (strict)

```
# slip — design review and specification pack
## 0. What I could and could not see        (be brutally explicit)
## 1. D1 Verdict
## 2. D2 Tokens and type
## 3. D3 Screens            (one subsection per S-xx, in the order given)
## 4. D4 Components         (one subsection per component)
## 5. D5 Twelve signature moves
## 6. D6 Defect list
## 7. D7 Plan, risks, refusals, questions
## 8. Self-audit table
## 9. Plain-English summary for the owner   (≤ 250 words, no jargon, no adjectives he cannot check)
```

The **self-audit table** (§8) must list every row ID you produced (`S-01`, `C-01`, `M-01`, `X-01`, …)
with: `ID | Delivered? | Evidence cited | Confidence (high/med/low) | What would change my mind`.

If you run out of room, continue in a second message starting with the exact section heading you stopped
at. Never summarise away a table to save space.

---

## 7. WHAT HAPPENS TO YOUR WORK

This pack goes back to the product's engineering lead for a line-by-line audit: every ID is checked
against the code, every contrast value is re-measured with a script, every "current state" claim is
verified in a browser, and every proposal is tested against the product law above. Accepted rows are
digested into a build brief for a second model (Fable), which implements them pass by pass under the same
gates. Rejected rows come back to you with the reason.

So: be right, be specific, and be honest about what you could not see. **A confident guess is worse than
a labelled assumption.**

---

## 8. THE ONE STANDARD

> If a change makes the till look better and read worse, it is not a change.

Begin.
