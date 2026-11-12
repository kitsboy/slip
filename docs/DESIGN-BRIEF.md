# slip — Design & Flow Brief (v1 council)

This is the brief Mimi and Nova react to. It is a *style and flow* pass on a working,
non-custodial point-of-sale tool. It changes no money behaviour and adds no endpoints.

## What slip is

`slip` is a free, open-source, **non-custodial, serverless, no-KYC, client-side till**.
A merchant pastes **public** wallet material only (xpub / descriptor / single pubkey /
static address / Lightning address); every sale pays directly into the merchant's own
wallet. The tool can **never** hold, move, refund or recover money. Its whole safety
story is that it cannot spend.

It ships as **one HTML file** (`dist/index.html`, ~777 KB raw / ~229 KB gzip), CSP
hash-pinned, with zero network before a sale. Merchants open it by double-click or from
Cloudflare Pages. Target user: other merchants who install it themselves.

## The ask, translated

Cam wants slip to feel **"as elegant, sexy and modern as Kimi"** — our spokeswoman, a
stylish modern 30-something English woman (ink-black blunt bob with fringe, fair skin,
cat-eye liner, red lip).

That translates into **composure, not decoration**. A till is used with one hand, in
glare, at 11pm, while a customer waits, and it handles money. "Elegant" here means
*fewer elements, precise spacing, nothing that makes a shopkeeper hesitate*. Trust is
the luxury. Private-banking terminal, not a crypto-bro gradient.

**The red lip is not the accent.** In a payments app red already means danger and
refusal, and it must keep that job. The brand's confident accent for primary actions is
separate (today: a warm amber `#f5820a`; the council may refine it).

The till should read as a **beautifully made English object — calm, precise, expensive —
that happens to move money without ever being able to touch it.** Kimi's face and voice
belong in Learn/Manual, the receipt, the loading states and the future video frames, not
in the till flow.

## Hard constraints (non-negotiable — design around these)

1. **Single-file, zero network.** No runtime CDN, no Google Fonts, no telemetry, no
   analytics, no cookies. Any typeface must be an OFL variable font inlined as woff2,
   and you must justify its bundle KB as a budget line. Recommend the system stack
   (SF Pro / Segoe UI / Roboto) — already elegant on the merchant's own device.
2. **Both themes impeccable.** Dark-first (night counter, low glare) AND light (daylight
   shop). Never pure `#000` or pure `#fff`. Shopkeepers work in the sun.
3. **WCAG AA contrast ≥ 4.5:1 in both themes**, ≥ 44 px touch targets, visible focus
   rings, no information carried by colour alone (every status badge has a word too).
4. **The honesty labels are furniture, never hidden.** `submitted` ≠ `confirmed`,
   `seen` ≠ `paid`, manual confirmations say "manual", demo/simulated money is always
   labelled. Styling must make these *clearer*, never bury them.
5. **`prefers-reduced-motion` respected** everywhere.
6. **Red is reserved** for refusal and danger only.
7. **No fake trust signals.** No testimonials, no star ratings, no invented user counts.
8. **Tabular numerals** on every money figure (`font-variant-numeric: tabular-nums`) so
   a running total never jitters.
9. **Icons are inline SVG only** (`BRAND_GLYPH` already exists).

## Required verdict format

Numbered answers with **exact values**, not adjectives:

- **Palette** as hex tokens for both themes (ink/base, surfaces, hairlines, text
  primary/secondary/muted, accent, and the four semantic status colours: confirmed /
  seen-or-submitted / pending / refusal-warning).
- **Type scale** (a five-step scale with real sizes, weights, line-heights).
- **Spacing scale** (base unit, the rhythm).
- **Radius scale** (three values, with a rule for when each applies).
- **Shadow/elevation tokens** (tinted, and only if they earn their place).
- **Motion specs** (durations, easing, what animates and what never does).
- A **named aesthetic** — call the style something, so the copy can match it.

## Acceptance criteria for "world class"

- A first sale completes in **≤ 3 taps** from a cold start.
- Onboarding finishes in **< 2 minutes** with no ambiguous step, and ends on the
  **compare-address** moment (merchant checks address 0/0 against their own wallet).
- **No horizontal overflow** at 360 px or 430 px.
- Contrast and target-size pass in both themes.
- Every status word matches the engine's actual state (the e2e suites assert this).
- `DESIGN.md` records every decision and why, so Kimi's explainer videos can cite it.

## Tie-break rule (stated up front, in the brief)

Where taste and use collide, **usability wins over beauty**. And the **honesty rule is
inviolable**: no "Paid" before observed, no simulated money unlabelled, no claim the tool
cannot back. If you find a way to make an honesty label more beautiful, keep the honesty.

## Evidence to review

- `/root/slip/screenshots/` — 21 current shots (start with `polish-top.png`,
  `audit-till.png`, `audit-assist.png`, `manual/`).
- `/root/slip/docs/FEATURE-MAP.md` — what is shipped vs planned.
- `/root/slip/docs/QA-PASS.md` — 18 findings from the last polish pass, incl. the
  overflow lesson (#15-16) and the "test pinned a false claim" lesson (#14).
- `/root/slip/src/core/theme.ts` — current theme model (dark / light / contrast).
- `/root/slip/src/App.tsx` — current shell + sticky anchor nav (Sell · Money in · Books ·
  Proof · Setup · More · Learn).
- `/root/slip/src/index.css` — current CSS variables and tokens.
- `/root/slip/docs/EDUCATION.md` — 21 cards / 4 lessons the video scripts will draw from.

Work in `/root/slip`. Respond in English. Write your deliverable to disk (do not paste it
into the chat), then report the file path(s) and a three-line summary of your top calls.
