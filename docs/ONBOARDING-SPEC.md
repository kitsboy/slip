# slip — Onboarding Specification (Nova)

Product verdict on the first-run flow. Target: **< 2 minutes**, one decision per screen, a
visible progress indicator, back always available, a resumable step, ending on the
**compare-address** moment. This spec is about flow and trust, not styling.

## 0. The throughput target

A complete, legitimate setup finishes in **< 2 minutes**. The measured gate (Playwright, §8)
is a **first real sale attempt from cold start in < 60 seconds**. The wizard is a guided
path, not a gate: a visitor can always leave setup, and the "pretend shop first"
door is one visible tap on the first screen. Nobody is ever locked behind five screens
before they can read the page.

## 1. One rule for all of slip

> **Never paste a seed phrase, an extended private key (xprv), or a private key.**
> slip only ever wants *public* material: an xpub / BIP-380 descriptor / single public key
> / static address / Lightning address.

This is stated plainly on screen 1 today — but a sentence on a screen is a claim. The wall
becomes *trustworthy* when it is demonstrated, so the paste field itself refuses.

### Live refusal demo (the trust moment)

- The wallet input (both in Setup and in the wizard's wallet step) runs a
  passive-detector on paste: if the pasted text matches a 12/24-word BIP-39 seed, or a
  private-key / xprv prefix (`xprv`, `xprv9`…, `tprv`), it **refuses and explains** rather
  than accepting a parse failure.
- Refusal copy (exact, red = danger only): **“This is a private key. slip can never hold
  it — paste your public wallet address instead.”** The field stays empty and focused; the
  text is not stored anywhere (no deferred write).
- On screen 1 the wizard offers a small, non-destructive tile: **“Try it — paste a seed and
  watch it refuse.”** Pasting a made-up seed into the stub field triggers the same refusal,
  so a fresh user *sees* the wall work on their own device, offline, with no data written.
- Because the refusal is a detector, not a policy string in the UI, use a **test fixture**:
  the e2e must assert a broadword seed and an xprv are refused (same suite that pins
  honesty, so the demo can't silently rot).

## 2. Doorways before the wizard

Two doors sit on the hero/welcome (before screen 1 of the wizard), one decision each:

1. **“Pretend shop first”** — primary. Opens `?demo=1` in a new tab: a seeded café, its own
   storage drawer, a simulated explorer, auto-confirming. Always labelled "pretend". Exiting
   wipes the demo drawer and returns to the real app. This is for anyone not ready to touch
   a real wallet.
2. **Leave setup** — always on the screen, and the tabs leave too. Nobody is locked in.
   The wizard can be opened again from the header.

After the very first session, the hero no longer shows the two doors; the wizard is reached
via `[Setup▾]` → "run setup again" (as today).

## 3. Screen-by-screen beats (the five-screen wizard, restructured)

Current wizard is 5 steps and ends on a **review** step that carries a stale "no till yet"
claim (see §6 — this is false and must not survive). Restructured beats, one decision each,
a visible 5-segment progress bar at top, **Back** always present (disabled only on step 1),
and a live Leave setup escape every step.

Progress indicator: five equal segments (already exist as `WIZARD_STEPS`); the segment
counts honestly (a step that was skipped to "workbench" never shows as done).

- **1 · "You keep the money" — decision: let the tool try once.** States the one rule, the
  refusal demo tile (§1), the "pretend shop first" door, and "start on a test network until
  a full sale works". Only advance button is **Continue**; the two doors and the workbench
  skip are the alternatives. No input on this screen.
- **2 · "Your shop" — decision: name the shop.** Single field (shop name, receipt header)
  + currency + tax %, each with a one-line "why". One decision, not three: the name is
  required to continue; currency/tax have safe defaults and can be changed later. Back =
  step 1.
- **3 · "Your wallet" — decision: paste *public* material + check address 0/0.** The
  xpub/descriptor field **with the live refusal detector** (§1). Below the paste, slip
  derives the first three addresses; beside the first, its path `m/…/0/0`. The decision is
  a checkbox: **"I opened my wallet and address 0/0 is** `<the derived address>` **"** —
  this is the **compare-address moment**. The Continue gate is the derivation gate
  (tested in core, not a disabled-attribute). Back = step 2.
- **4 · "Who's on the till" — decision: set a PIN or defer.** PIN 4–8 digits; only a hash is
  stored; "you can skip this and set it later — the hand-off will ask for it". Back = step 3.
- **5 · "Compare once more, then open the counter" — decision: accept.** The final screen is
  **not a summary**; it is the compare-address moment restated as the finish line. It shows
  the confirmed wallet's **address 0/0, large and monospaced**, the shop name, currency,
  tax, PIN (set/not set), and a single strong sentence: **"If this address doesn't match the
  first address in your wallet, go back and check it."** One verify-again checkbox
  ("I checked address 0/0 in my own wallet and it matches") gating **Finish setup**.
  Back = step 4.

The wizard therefore *ends* on compare-address — screen 3 introduces it, screen 5 makes it
the completion condition. No "review your answers" filler; the trust moment is the exit.

## 4. Resumability

- Draft state (shop name, currency, tax, counter label, network, PIN-not-set-yet) persists
  to the device's storage on every step change, namespaced like all slip persistence. A
  refresh or a closed tab reopens the wizard at the same step with the fields filled.
- The **wallet-confirmation checkbox is never auto-filled**: address 0/0 re-derivation and
  the user's "I opened my wallet" acknowledgment are the one thing that must be re-made
  after any resume. The demo drawer is exempt (never resumes a real wallet).
- Onboarding completion is stored once (today `onboardedAt`); a resume after completion
  opens the workbench, not the wizard.

## 5. States for the main panels (one sentence + one action each)

Every surface below keeps its `data-panel` id (§5 of NAV-MAP) and gets its stated
empty / loading / error treatment. Each offers exactly one next action.

| Panel | Empty / idle | Loading | Error |
|-------|--------------|---------|-------|
| **Till** (`till`) | "Your catalog is empty — load a template or add an item." → [Load café template] | "Opening the counter…" (no action) | "This wallet can't take a payment until address 0/0 is checked." → [Open Setup] |
| **Money in** (`requests`) | "No standing money yet — add a rent or a subscription." → [Add a request] | "Checking your 30-day budget…" | "We couldn't read the schedule — refresh." → [Try again] |
| **Books / history** (`history`) | "No sales on record — close a sale and it lands here." → [Open the till] | "Reading the day's sales…" | "The ledger couldn't be opened for this device." → [Restore a backup] |
| **Proof / verify** (`verify`) | "Paste a receipt to check it against your books." → (input already focused) | "Checking the receipt…" | "This receipt isn't in your books — it may be from another shop or build." → [Try another] |
| **Wallets** (`wallets`) | "No wallet yet — add a counter to take payments." → [Add wallet] | "Deriving your addresses…" | "We couldn't read that code — paste it again." → [Re-paste] |
| **Watchlist** (`watchlist`) | "Nothing being watched — add an address to track it." → [Add address] | "Watching…" read-time ring spin | "That address came back unreadable." → [Check again] |
| **Backup / restore** (`backup`) | "No backup on this device yet — make one before you lose its details." → [Create a `.slip` file] | "Reading your backup…" | "This file couldn't be opened — it may be from another build." → [Choose another file] |

Loading and error use the neutral palette; **red is reserved for refusal/danger**, never for
a soft failure (a bad paste is a refusal, an unreadable backup is an error — worded
differently on purpose).

## 6. Honesty fixes folded into onboarding (must not survive)

The review step that previously ended the wizard carried two false claims (QA #14 lesson —
a pinned false claim is worse than a rename):

- Step 5 "Stage" row read **"no till yet — counters and price maths only"**.
- The closing sentence read **"slip cannot take a payment yet. The catalog, invoice and
  payment engine are the next phases"**.

Both are now false (the till ships; FEATURE-MAP and QA #1/#12 confirm it). The finishing
screen 5 (§3) replaces them — the stage row now reads **"Working till — sell, close the day,
prove it"** and the closing sentence becomes the compare-address instruction. The e2e
honesty fixture that forbids stale text should assert neither stale sentence can render.

## 7. Confirmation patterns (one consistent rule)

All destructive actions — **restore (overwrite)**, **wipe the books**, **delete a wallet** —
share one pattern:

1. The trigger is a plainly-worded button, red only where the action is dangerous.
2. First tap reveals an inline confirm line naming the *exact consequence* and changes the
   button label to the verb again: **"Delete this wallet — [Delete wallet again]".**
3. Second tap within the same control executes. Focus stays inside the confirm line; it is
   a two-tap gesture, so a stray tap can't fire.
4. `aria-live="polite"` announces the outcome ("Backup restored", "Book wiped").

This is the same two-step gesture everywhere, so a cashier who has seen it once recognises
it everywhere. No one-off modals, no hidden undo.

## 8. Accessibility, payment-status, and the timed metric

### Focus & aria
- On tab/section change (navigation per NAV-MAP §6): focus moves to the section's `<h2>`
  (`tabindex="-1"`), announced by `role="region"` named with the section label,
  `aria-live="polite"`.
- Payment status uses `role="status"` + `aria-live="polite"` (already the pattern): the
  watcher announces **"Payment seen in mempool"**, then **"Paid — seen on chain"** — the
  exact honest words (never "Paid" before an observation, never "paid" for "seen").
- Focus never trapped; skip-link to the till stays off-screen until focused; reduced-motion
  honoured (payment-status is a text swap, not an animation).

### The timed metric — Playwright, cold start to first sale in < 60 s

From a fresh context (no storage) loading `?demo=1` — the honest, self-contained first-sale
path — count **three user actions to a confirmed-chargeable moment**:

1. tap **Espresso** (adds to cart — the demo pre-fills a rate, visible on screen),
2. tap **charge** (opens the payment screen: "Pay the exact amount", Address #0, QR),
3. (optional) tap **check now** to confirm settlement, or read the auto-confirm.

And from a **live real-wallet loaded** state (already onboarded), cold start → **Sell** is
the default tab → **2 actions**: tap an item → tap **charge**. The e2e asserts the payment
screen appears (the existing "Pay the exact amount" / Address #0 assertions) within the 60 s
budget from `page.goto`. That screen is the *first real sale attempt* — money leaves only
when the customer scans the QR.

### What must keep its ids (recap from NAV-MAP §5)
Counters `#ct-label` `#ct-xpub`, "I opened my wallet", "Save counter", templates "Café" +
item names, Till `#tl-rate` "charge" "Pay the exact amount" "Address #0/#1" "check now"
"I have the money" "seen in mempool" "Paid — seen on chain" "Marked paid by you" "did not
observe" "Invoice inv_" "new sale", demo "DEMO — a pretend shop" "Demo Café" "exit demo",
and all 21 `data-panel` ids. The wizard internals may change because e2e drives setup through
the Counters panel, not the wizard — but the refusal detector and the honesty fixture are
new tests that land in the same suite.
