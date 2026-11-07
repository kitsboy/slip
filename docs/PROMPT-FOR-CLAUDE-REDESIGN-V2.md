# SLIP — the redesign prompt for Claude (v2, complete)

> **For Cam — three steps.**
> 1. Open Claude (Opus / strongest). Start a **new** chat.
> 2. Paste this whole file — from "## ROLE" to the end. Not the boxes above it.
> 3. Attach `docs/slip-design-screenshots.zip` (18 MB, 30 screenshots). If a zip is refused, attach
>    `phone-sell-dark.png`, `tablet-sell-dark.png`, `desk-sell-light.png`, `desk-books-light.png`.
> 4. Bring his whole reply back to Kimi, unchanged — especially his §0.
>
> **This file supersedes `PROMPT-FOR-CLAUDE.md` and v1 of `PROMPT-FOR-CLAUDE-REDESIGN.md`.** Everything
> Claude needs is inside it: the product, the map of the code, every command, every rule, and a glossary of
> every term so nothing is guessed.

---

## ROLE

You are a **principal product designer with a signature** — the person a company hires when the product
works and must now look like nobody else's. You have shipped retail hardware and software at world-class
standard (Square, SumUp, Apple Pay, Stripe Terminal, Braun calibre), and you can write the CSS and React
that realises your own design without a single new dependency.

You are not here to fix six defects. You are here to **replace the visual language**: new concept, new
system, new screens, new motion — while every behavioural promise, honesty label and security rule stays
exactly as it is.

You are not here to be encouraging. Flattery is a failed delivery.

---

## 1. THE PRODUCT

`slip` is a free, open-source, **non-custodial, serverless point of sale for Bitcoin**. A merchant pastes
public wallet material once — an xpub, a descriptor, a single pubkey, a static address, or a Lightning
address — and every sale is paid **directly into their own wallet**. No backend, no accounts, no
analytics, no cookies, no CDN, no runtime font request. slip **cannot spend**. One deployable file:
`dist/index.html` (React + Tailwind + TypeScript, built by Vite with `vite-plugin-singlefile`; the inline
bootstrap script is pinned by a Content-Security-Policy hash).

Live: https://slip.giveabit.io · Repo: `kitsboy/slip`, branch `master`, MIT · Current version **v0.31.0**,
562 unit tests, 12 browser suites green.

Users: a shopkeeper who has never used Bitcoin (primary); a market trader on a phone in sunlight; a café
with a tablet flat on the counter; a small shop with a laptop in the back. Their customers see a second
screen with a QR code and three words of status.

---

## 2. WHAT YOU HAVE

### 2.1 Read in this order

1. `README.md` — what it is, in the owner's own words.
2. `docs/DESIGN-UPGRADE-BRIEF.md` — the direction, the design checklist, and **the six defects already
   observed**. This is your floor, not your ceiling.
3. `docs/DESIGN-DECISIONS.md` — decisions **D-33 → D-86**. Binding. Do not reverse one silently.
4. `docs/DESIGN-BIBLE.md` — existing visual rules.
5. `THREAT_MODEL.md`, `SECURITY.md` — why some attractive ideas are forbidden.
6. `docs/ARCHITECTURE.md`, `docs/FEATURE-MAP.md` — module map.
7. `docs/NAV-MAP.md` — the panel ids and which section each belongs to.

### 2.2 The repository map (real, not indicative)

```
/root/slip
├── index.html                 # shell HTML, CSP meta, inline bootstrap (hash-pinned)
├── package.json               # scripts: dev, build, manual, test:e2e …
├── vite.config.ts             # singlefile plugin, CSP hash generation
├── public/                    # static: _headers, manifest.webmanifest, sw.js, videos/
├── src/
│   ├── main.tsx               # boot; routes ?explain=1 to the customer page
│   ├── App.tsx                # the shell: sections, header, phone tab bar, desktop sidebar
│   ├── index.css              # ALL design tokens + utility classes (.btn, .panel, .charge-bar…)
│   ├── ui/                    # 47 components — the whole interface
│   │   ├── Till.tsx           # ★ the counter: catalog, cart, rate, charge bar, receipt
│   │   ├── History.tsx        # Books: today line, per-rail breakdown, digest, export
│   │   ├── Requests.tsx       # Money in: waiting strip and requests
│   │   ├── Counters.tsx       # Setup → Wallets (paste an xpub, compare address 0/0)
│   │   ├── WalletPicker.tsx   # "Which wallet do you use?" — eight guides
│   │   ├── Wizard.tsx         # five-step setup
│   │   ├── Settings.tsx       # business, currency, tax, display size, assist switches
│   │   ├── OpenTill.tsx       # the shift card (open / who's on / close)
│   │   ├── Readiness.tsx      # four-row shop readiness checklist
│   │   ├── NextStep.tsx       # "what do I do now" strip
│   │   ├── AmountPad.tsx      # 56px keypad with quick amounts
│   │   ├── TabIcon.tsx        # inline SVG icons (no icon font, no dependency)
│   │   ├── InfoVideo.tsx      # explainer clip, mounts only on tap
│   │   ├── Explain.tsx        # the (i) that explains one number
│   │   ├── FreshnessRing.tsx  # age ring for a rate or balance
│   │   ├── CustomerDisplay.tsx# the second screen (BroadcastChannel)
│   │   ├── Explainer.tsx      # the customer page at ?explain=1
│   │   └── … (Backup, BookSeal, Glossary, Manual, Tech, HowItWorks, Status, Verify, …)
│   └── core/                  # 40 modules: logic, no markup
│       ├── settings.ts        # ShopSettings + AssistOptions + sanitizers + labels
│       ├── theme.ts           # dark / light / high-contrast
│       ├── ledger.ts          # items, invoices, refunds
│       ├── accounts.ts        # counter accounts, repository, shift-log hooks
│       ├── shifts.ts          # hashed shift log (open / handoff / return / acknowledge)
│       ├── money.ts           # BigInt money maths — do not touch
│       ├── derive.ts          # address derivation from xpub/descriptor
│       ├── keys.ts            # the one rule: refuses secrets
│       └── providers/         # rate feeds, explorers, LNURL
├── tests/                     # vitest unit tests + tests/e2e/*.mjs browser suites
├── scripts/                   # deploy.sh, scan-bundle.sh, contrast-audit.mjs, docs-audit.mjs,
│                              # shots-matrix.mjs, demo-check.mjs, shot-*.mjs
└── docs/                      # 24 documents: decision log, briefs, this prompt
```

**Do not invent a file or a symbol.** If you need something that is not in this map, mark it
**ASSUMPTION** and say what you expected to find.

### 2.3 The commands, and what a pass looks like

| Command | Expected | If it fails |
|---|---|---|
| `npx tsc -p tsconfig.json --noEmit` | no output, exit 0 | a type error — fix before continuing |
| `npx eslint .` | no output, exit 0 | lint error — fix, never disable a rule |
| `npx vitest run` | `Tests 562 passed` | a behavioural contract broke; read the test name |
| `npm run build` | `dist/index.html` written, CSP hash regenerated | build error, or the singlefile plugin complained |
| `node scripts/scan-bundle.sh` | `clean (NNN bytes)` | something off-origin (a CDN URL, a remote font) leaked in |
| `node scripts/contrast-audit.mjs --strict` | `18/18 pairs clear AA.` (more pairs welcome) | a colour pair fails WCAG AA — re-pick the value |
| `node scripts/docs-audit.mjs --strict` | exit 0 | a panel or feature is undocumented |
| `npx vite preview --port 4181 --strictPort` | serves on 4181 | then run the suites below |
| `node tests/e2e/run-all.mjs "http://[::1]:4181/"` | `All 12 browser suites passed.` | a real behaviour regressed; a selector may have moved |
| `node scripts/shots-matrix.mjs` | `30 screenshots in docs/shots/matrix` | the reviewer cannot see your work |
| `node scripts/demo-check.mjs https://slip.giveabit.io/` | `8/8 pipes passed` + `nothing left the device` | the demo touched the network — blocker |

You may not weaken a test to make a redesign pass. If a selector legitimately changes, name the test and
keep the assertion's **meaning** (assert something is visible — never loosen a check into a no-op).

### 2.4 The screenshots

30 frames — **phone 390×844, tablet 834×1112, desktop 1440×960 × dark + light × five screens** (sell with
two items in the cart, money-in, books, setup, learn). If you cannot see them, say so in §0 and work from
§1.5 of the upgrade brief. Never describe a screen you have not seen.

---

## 3. THE MANDATE

**Replace the look. Keep the truth.**

At the end of this pass a stranger should know three things from one screenshot, without reading a word:
*it takes money, it is honest, and it was made by someone with taste.* Today they can tell the first two.

You must **choose a position**, not offer options: three candidate art directions maximum (one paragraph
and one named reference each), a clear pick, and why the other two lose. Then build the winner completely.

Constraints on the concept:

- **A retail instrument, not a wallet app.** A till is used in fifteen-second bursts by tired eyes, in
  sunlight, with a customer waiting. No charts, no tickers, no card stacks, no hidden gestures, no
  glassmorphism, no mesh gradients, no neon-on-black, no dark-header/light-body split.
- **It must survive 320px and a 1440px desk** with one component tree — responsive, never forked.
- **CSS and inline SVG only.** No new dependency. At most one self-hosted variable `woff2` subset (or a
  disciplined system stack, argued for).
- **AA in both themes, measured.** Prefer AAA for body text.
- **Dark is not an afterthought.** A till at night is a different room from a till at noon.

---

## 4. NON-NEGOTIABLE PRODUCT LAW

Redesign everything above this line; nothing below it moves.

1. **The one rule.** Never accept, store or transmit a seed phrase, `xprv`/`yprv`/`zprv`/`vprv`/`Ltpv`/
   `Mtpv`/`ttpv`, WIF, or a hex private key. Refuse immediately, wipe the field, warn in red, **never echo
   the material back**.
2. **No custody.** slip can never spend. The worst possible bug is a misdisplayed address.
3. **Honesty labels are inviolable.** `submitted ≠ confirmed`; `seen ≠ paid`; a manual confirmation says
   it is manual; demo money says simulated; never "Paid" unless the engine observed it. A cue (sound,
   colour, motion) is a courtesy, never evidence.
4. **No network except merchant-configured endpoints.** No fonts, scripts, images, analytics, telemetry,
   cookies or audio files. Payment cues are synthesised in the browser.
5. **Red is reserved for danger.** Status always carries a **word** as well as a colour.
6. **Plain language first.** A shopkeeper who has never used Bitcoin understands every default screen;
   technical vocabulary lives behind "show technical names" (default **off**).
7. **Never delete a tool to calm a screen.** Fold it, move it, relabel it — never remove it.

A proposal that needs one of these bent is not a proposal. Designing around constraints is the job.

---

## 5. DELIVERABLES (all of them, with these exact IDs)

### D1 — The position
Three directions (one paragraph + one named reference each), the pick, two rejections and why. Then one
sentence each for the **one shape**, the **one material**, the **one motion idea** that make this product
recognisable at a glance.

### D2 — The new identity, as values
- **Wordmark in inline SVG** (how "slip" is set: weight, tracking, mark; both themes; 16px favicon to hero
  scale). No image files, no remote fonts.
- **Colour:** complete OKLCH palette per theme, with **measured contrast for every pairing you use**.
- **Type:** family decision, full scale, line-heights, tracking, which sizes carry tabular numerals.
- **Structure:** space scale, at most four radii, at most three elevation layers, border widths, motion
  (durations + easings), focus ring, and a **permission table** — which token may appear where.
- **A one-page visual grammar** a new contributor could follow to lay out a screen correctly.

### D3 — Full screen redesign (eight screens, every canvas)
1 Sell/counter (phone, tablet, desktop) · 2 Pay screen + full-screen customer QR · 3 Receipt (screen and
print-on-white) · 4 Money in · 5 Books · 6 Setup (picker → paste → compare; wizard; readiness) ·
7 More/Learn · 8 Customer display window.

For each: **S-xx**; current state with evidence; **ASCII wireframe with real proportions** (columns, rail
widths, sticky regions, safe areas); exact values; nine states (default / hover / pressed / focus /
disabled-with-named-blocker / loading / teaching-empty / error / success); exact copy with honesty strings
marked **FROZEN**; motion incl. `prefers-reduced-motion`; acceptance checks a reviewer can perform in a
browser; effort S/M/L. One hero and one primary action at thumb height per screen. Nothing above 18px
except the hero and the money.

### D4 — Component system
`Button` (3 types × 3 sizes), `Money` (hero/inline/sats), `Card` (hero/standard/flat), `Input` (unit
suffix, leading icon, error, help), `Select`, `Toggle`, `Chip`, `Badge` (good/warn/pending/bad/manual/
simulated), `ItemTile`, `CartLine` (with Undo), `Keypad`, `QRCard`, `StatusLine`, `EmptyState`, `Dialog`,
`Sheet`, `InlineNotice`, `TabBar`, `Sidebar`, `DataRow`, `Progress`, `FreshnessRing`, `Countdown`.
Anatomy, sizes, states, tokens, accessibility contract, and when **not** to use it.

### D5 — Twelve signature moves
Exactly twelve, ranked by impact per hour: name, where, the CSS/SVG technique, the risk, and **one place it
must never appear**.

### D6 — The rebuild plan
Six passes maximum, each independently shippable and each keeping the till selling: scope, files, spec IDs,
gates, frames to review, rollback. Name the pass where the **old look disappears completely**, and say how
the transition avoids a half-redesigned product for a day.

### D7 — The path manifest (this is what makes your pack buildable)
For every spec row, the exact place it lands:

| Spec ID | File | Symbol / class to change | What changes |
|---|---|---|---|
| `S-01` | `src/ui/Till.tsx` | the charge bar block | … |

Every path must exist in §2.2. If you need a new component, write `NEW: src/ui/Foo.tsx` and describe its
props.

### D8 — Honest limits
What you could not see or verify (the **ASSUMPTION** list); what you refuse to do and why (cite a decision
ID, an accessibility rule, or the performance budget); three questions for the owner, each with your
recommended default so work never blocks.

---

## 6. HOW TO WORK

- Concept before pixels; pixels before prose. Decide, then specify to the last value.
- Cite evidence for every claim: screenshot frame name or `path:line`.
- **"Increase hierarchy" is banned.** Give numbers: size, weight, tracking, colour token, spacing.
- No new dependency. CSS and inline SVG only.
- Do not change money maths, ledger/storage keys, the CSP shape, honesty strings, or the
  `showTechnical: false` default.
- Nothing you would not build in a day. Six passes, not sixty.
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
## 7. D7 The path manifest
## 8. D8 Honest limits
## 9. Self-audit: ID | delivered | evidence | confidence | what would change my mind
## 10. The owner's summary — ≤200 words, no jargon
```

A missing ID is a failed delivery. Never summarise away a table to save space; continue in a second
message at the exact heading where you stopped.

---

## 8. WHAT HAPPENS NEXT

Your pack goes to the engineering lead for a line-by-line audit: every ID checked against the code, every
contrast value re-measured by script, every "current state" claim verified in a browser, every proposal
tested against §4. Accepted rows are digested into a build brief for a second model that implements them
pass by pass under the same gates; rejected rows come back with the reason.

Be specific, be bold in the identity, be honest about what you could not see. **A confident guess is worse
than a labelled assumption.**

---

## 9. GLOSSARY — every term in this product, in plain English

Read this before you write a word. It exists so nothing is guessed and so your copy stays understandable
to a shopkeeper.

**Money and Bitcoin**
- **xpub / zpub / vpub** — a *public* wallet code. It lets a wallet show every address without being able
  to spend. slip asks for this, never for a private key.
- **Descriptor** — a longer text form of the same thing, sometimes with a checksum.
- **Single pubkey / static address** — one address, reused. Acceptable, weaker privacy.
- **Watch-only** — sees addresses and payments; cannot spend. slip is watch-only by construction.
- **sats (satoshis)** — the small unit: 100,000,000 sats = 1 bitcoin.
- **on-chain** — a payment written into a Bitcoin block. Slow, permanent, final.
- **Lightning** — an instant payment over a second layer; the shop still receives into its own wallet.
- **BOLT-11 invoice** — the Lightning payment request (a long `lnbc…` string).
- **Lightning address** — something like `shop@wallet.example`, a human-readable Lightning endpoint.
- **LNURL-pay** — the protocol behind a Lightning address; slip asks the merchant's own endpoint for an
  invoice.
- **Silent Payments (BIP-352)** — a reusable on-chain address that produces a fresh address per payer.
- **BIP-84 / BIP-48 / BIP-85** — address format (native segwit), multi-account structure, and child-seed
  derivation.
- **Fee / mempool** — the network's working area; a payment can be *seen* there before it is *mined*.
  **Seen is not paid.**
- **Confirmations** — blocks built on top of the block containing the payment.

**Product behaviour**
- **Ledger** — slip's local record of items, invoices and refunds (browser storage).
- **Invoice** — one charge: an address, an exact amount, a status, an expiry (15 minutes).
- **Address index** — which address from the code is used for this sale; reserved at creation, burned once
  shown to a payer. Address #0, #1, #2…
- **Shift / till** — a working day's log (`open`, `handoff`, `return`), hashed so it can be verified.
- **Float** — the cash counted at the start of a shift.
- **Manual confirmation** — the merchant says "I have the money"; labelled as their word, not slip's
  observation.
- **Rehearsal** — a practice sale with a real QR that writes nothing.
- **Demo drawer** — a separate storage area (`slip.demo.*`) so pretend money never touches real records;
  `?demo=1` opens it; the demo answers its own network locally.
- **Customer display** — a second window (or device) showing the amount and the QR.

**Design and engineering**
- **Token** — a named colour/spacing/size value used by name, never a raw hex in a component.
- **OKLCH** — a colour space where lightness, chroma and hue are separate; easier to keep contrast honest.
- **AA / AAA** — WCAG contrast grades. AA = 4.5:1 for body text, 3:1 for large text and UI borders.
- **WCAG 2.2** — the accessibility standard we build to.
- **Tabular numerals** — digits of equal width, so columns of money line up.
- **Thumb zone** — the reachable lower third of a phone screen.
- **Safe area** — the inset a phone's notch/home bar needs (`env(safe-area-inset-*)`).
- **Sticky** — a region that stays on screen while content scrolls behind it (our charge bar).
- **Breakpoints** — Tailwind's `sm/md/lg/xl` width thresholds; the shell changes layout, not components.
- **Elevation** — shadow depth; only three layers permitted.
- **Focus-visible** — the ring shown only for keyboard users; ours is brass, never browser blue.
- **prefers-reduced-motion** — the OS setting that asks for less animation; we must honour it.
- **CSP (Content-Security-Policy)** — the browser rule that forbids loading anything from another origin;
  our inline bootstrap is pinned by a hash.
- **Single-file build** — everything inlined into one `dist/index.html` by `vite-plugin-singlefile`.
- **Unit tests (vitest)** — logic tests in `tests/*.test.ts`.
- **Browser suites (Playwright)** — `tests/e2e/*.mjs`; they drive a real browser and assert what a person
  would see.
- **e2e build** — served from the `npm run build` output via `vite preview` on port 4181.

---

## 10. THE STANDARD

> Make it look like the best tool in the shop — and never, for one second, like it is guessing.

Begin.
