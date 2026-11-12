# slip — Navigation Map (Nova)

Product verdict on use and flow: information architecture, tab taxonomy, breakpoint
behaviour, hash routing, and exactly what stays reachable from where. This is the *flow*
decision layer. Colours and type are Mimi's; the only constraints carried in here are the
ones that are flow constraints: ≥ 44 px touch targets, red reserved for danger, and the
honesty labels stay fixed (each status keeps its exact word).

## 0. The one-line IA principle

A till has one job the merchant does every minute (take money), a few jobs they do every
day (close the books, check money in), and a handful they do rarely (set up, prove, learn).
So the taxonomy is **one primary tab + four secondary tabs** and everything else is hidden
behind one tap. Sell is the product; the other four are its instruments.

Today there are seven anchor groups. We collapse to **five primary destinations** — not to
fifteen, and not to zero. Five is the minimum a shopkeeper can (a) scan without reading and
(b) reach with a thumb on a phone.

## 1. Final tab taxonomy

### The five primary destinations (top-level, in order)

| # | Tab | Section id | What lives here (all shipped, per FEATURE-MAP) |
|---|-----|-----------|-----------------------------------------------|
| 1 | **Sell** (default) | `#sell` | The till: cart, charge, invoice, QR, receipt, refunds, split sale, rehearsal, custom amount, tip jar, payment detection, Lightning (LNURL-pay), customer-screen handle |
| 2 | **Money in** | `#money` | Standing requests (rent/subscriptions): request QR, amount, cadence, due date, mark paid; the budget clock (30-day in vs out, runway) |
| 3 | **Books** | `#books` | Sales history, day close (Z-report + CSV), offline reconciliation, day anchoring (OTS), weekly letter (assist-gated) |
| 4 | **Setup** | `#setup` | Wallets/counters + derivation gate + PIN + shift log + handover; settings (rate feed, esplora endpoint, assistance toggles, counter card); encrypted backup + restore dry-run; key/price/address check |
| 5 | **More** | `#more` | Proof instruments (Verify a receipt, SelfTest), Silent Payments, pairing, watchlist, live 100-sat test (assist-gated) |

### Secondary destinations — reached from the header, not from the tab bar

- **Learn** (Manual + Services + About): reached from a small `?` (help) button in the
  header on every breakpoint, plus the in-panel "why" links that QA already wired up
  (`docs:audit` guarantees every panel has a Manual card). The Manual is the last thing a
  working till should interrupt a counter with — it belongs under the `?`, one tap from
  anywhere, never in the flow.
- **Demo shop / pretend café**: reached from the `?` Manual's `data-panel="demo-link"`
  card, from the welcome screen of onboarding, and a persistent chip in the header when not
  onboarded. It is a door into a sandbox, not a tab — a merchant mid-shift should never
  mistake it for a real counter.
- **Install**, **status/footer** (book seal, network counts, request counter): stay in the
  footer where they are now. Install is an OS-provided prompt, not a destination.

### The collapse, named

`Proof` → folded into `More` (Verify + SelfTest are the proof instruments; the folder label
"More" with its `why` line "watching, pairing, proving, a real test" names them). `Learn` →
out of the bar into the header `?`. Result: **seven anchors → five tabs**, still a single
scrollable page, so no panel is removed, just re-titled/parented.

### Order and default

Order is by frequency of use: **Sell · Money in · Books · Setup · More**. Default after
onboarding (and for every cold start) is **Sell**. The first thing on screen when the app
loads is the till. Reason: a first sale should be the metric — see ONBOARDING-SPEC §8.

## 2. ASCII wireframes for three breakpoints

### Phone ≤ 430 px — bottom bar, within thumb reach

```
┌────────────────────────────────────────────────────┐
│ [s] slip  pending-chip       ◐  [?] [Setup▾]      │  header: wordmark, 0-request/version,
│                                                    │         theme, help, setup
│ ┌────────────────────────────────────────────────┐ │
│ │  WALLET TAKING THIS SALE   Front counter ▾     │ │  SELL (active) — one column,
│ │  RATE PER 1 BTC (USD)      [ 60000.00 ]        │ │  nothing left/right of reach
│ │  [All] [Drinks]  [ search items … ]            │ │
│ │  ┌──────────────────────────────────────────┐  │ │
│ │  │ Espresso            3.50 USD        +TAP │  │ │  1 item tap adds to cart
│ │  │ (freshly, 2 more in cart × n)            │  │ │
│ │  └──────────────────────────────────────────┘  │ │
│ │  sub-total ·  tax ·  tip                        │ │
│ │  [ CUSTOMER SCREEN ]   [ CHARGE ]  ◀ 44px tall │ │  during-a-sale pair
│ └────────────────────────────────────────────────┘ │
│                                                    │
└──┬─────────────┬─────────────┬─────────────┬───────┘  bottom tab bar, always in reach
   │  ① SELL ▸   │ ② MONEY IN   │ ③ BOOKS     │ ④ SETUP │ flex, 5 equal ≥44px targets
   └─────────────┴─────────────┴─────────────┴───────┴ ⑤ MORE
```

- The bottom bar carries **all five tabs**; the section you're on is filled/first (per
  theme). Tapping a tab is an anchor jump (`#sell` etc.), not a route change (see §3).
- "One tap away during a sale": from the Sell screen, **CHARGE** opens the payment/QR
  screen; **CUSTOMER SCREEN** opens the `?display=1` window; both are 44 px+ and side by
  side at the bottom of the column, inside thumb arc. Within the payment screen, **check
  now** re-polls and **I have the money** is the manual confirmation.
- **Set-once** things (Setup) and **read-often** things (Books, Money in) never live on the
  Sell screen — they each keep one tab, so the counter is never cluttered mid-sale.
- No horizontal overflow: every row is the content width; the tab bar does not scroll its
  contents off-screen (QA #15 lesson — the bar must stretch, not scroll).

### Tablet ~ 601–1024 px — slim top bar, same five tabs

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [s] slip ▸ ① SELL ② MONEY IN ③ BOOKS ④ SETUP ⑤ MORE        ◐ [?] [Setup]│  slim rail,
│──────────────────────────────────────────────────────────────────────────│  5 pills,
│  ┌────────────────────────────────────────────┐  ┌─────────────────────┐ │
│  │  (SELL — the till, full width)             │  │ (inline helper/the  │ │
│  │  wallet · rate · items · cart · charge     │  │  panel's own card)  │ │
│  └────────────────────────────────────────────┘  └─────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

- Tablets and desktop share the **slim top rail** (5 equal-height pills under the header).
  Rationale: on anything ≥600 px the bottom bar consumes vertical counter space and the
  device has the reach to a fixed top row; on phones the bottom bar wins for one-hand
  reach. Two models, not three — phones bottom, bigger top.
- The active tab is the pill with the section header border (per theme); focus ring on the
  pills, arrow-key navigation along the row (§6).

### Desktop — thin top rail, wide column

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ [s] slip  ① SELL ② MONEY IN ③ BOOKS ④ SETUP ⑤ MORE          ◐  [?]  [Setup▾] │
│────────────────────────────────────────────────────────────────────────────────│
│  SELL — "Ring up a customer"                       (max-w-3xl content column)   │
│  Wallet ▾ · rate · [search] [All][Drinks]                                          │
│  items · cart · [CUSTOMER SCREEN] [CHARGE]         books/proof instruments below │
│  justified to the content column, not edge-to-edge — a till in a wide room      │
│  needn't be spread across the window                                             │
└────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Hash-route scheme (deep links keep working)

The app stays one scrollable page whose sections are anchor ids, so nothing adds a router.
Tabs are `<a href="#…">` and active-state reflects the fragment.

- Primary routes, as they are today and MUST stay: `#sell` `#money` `#books` `#setup`
  `#more` (five tabs).
- **Aliases to preserve** so old links and bookmarks don't break:
  - `#proof` → a zero-height anchor placed at the top of the More section (Proof's old
    instruments Verify/SelfTest now render there). `#proof` must land on Proof's panels.
  - `#learn` → a zero-height anchor at the Manual's `?` panel; also serves the Manual's
    "back to panel" links from QA.
- Query params ride alongside, unchanged: `?demo=1`, `?display=1`, `?explain=1`. Examples
  that keep working: `#sell`, `?demo=1#sell`, `#books`, `?display=1` (customer window).
- A tab click that matches the current fragment does not scroll — the till stays put.
- Each section keeps `scroll-mt-16` so the sticky header/rail never covers its heading when
  deep-linked.

## 4. What stays reachable from where

| Item | Reachable from | Notes |
|------|----------------|-------|
| Demo shop (`?demo=1`) | Header chip (when not onboarded) · `?` Manual `data-panel="demo-link"` card · onboarding welcome (pretend-shop-first door) | Always labelled "pretend"; exits wipe its own drawer |
| Manual (Learn) | Header `?` on every breakpoint; in-panel "why" links | `data-panel="manual"` keeps its id; generated per panel |
| Assistance toggles (7) | Setup → Settings (`data-panel="assist"`), grouped Teaching / Quiet / Records | Keep id — settings tests pin it |
| Pairing | More → `data-panel="pair"` | Imports arrive unchecked (honesty label) |
| Backup / restore | Setup → `data-panel="backup"` (encrypted `.slip`, restore dry-run) | Destructive confirm pattern: see ONBOARDING §7 |
| Install | Footer (`Install`) — OS prompt only, says so when installed | Hidden from tab bar |
| Proof / Verify a receipt | More → `data-panel="verify"` (was `#proof`); alias `#proof` lands here | `SLIP1\|…` record; never claims what it didn't see |
| Day close (Z-report + CSV) | Books → `data-panel="history"` | Print/CSV both |
| Refunds | Sell → receipt → refund action (capped at received, method+reference) | slip moves nothing — label stays |
| Reconciliation (offline re-check) | Books → `data-panel="history"` (and on-load + on network-return, always reports what changed) | Only shown when there is something to report |
| Silent Payments | More → `data-panel="silentpay"` | Display + manual confirm ever (no scan key — honest limit) |
| Lightning | Sell → `data-panel="lightning"` (LNURL-pay, settle only on wallet verify URL; no URL = "unverifiable") | Stays under Sell: it is a way to take a sale |
| Watchlist | More → `data-panel="watchlist"` | Any address, checked on demand, read-time shown |
| SelfTest (5 vectors) | More → `data-panel="selftest"` | Local, no network |
| Till lock | Setup → Settings (`[data-till-lock]`, inside `data-panel="settings"`) | A whole-app gate, not a drawer: no new panel id, and no way round it except the PIN |
| Overpayment note | Sell → receipt · Books → `data-panel="history"` rows · printed day close · CSV | A note, not a status — the sale is complete and the totals do not move |
| Customer sheet (A4) | Manual → the counter QR (`[data-manual-qr]`) opens its own window | Paper size, not screen size: the code is 95mm |
| Live 100-sat test / WallClock / WeeklyLetter | Omitted unless assist toggle on (`data-panel="livetest"/"wallclock"/"letter"`) | Opt-in, never clutter |

## 5. Pinned surface audit (what the e2e/maps must keep their ids for)

The e2e suites hero the exact selectors/strings below — do not rename, retitle, or rehook
these. Everything else in the flow may move as long as these land in the same logical
sections.

- **Section ids (anchors):** `sell` `money` `books` `setup` `more` — and the two aliases
  `proof` `learn` (§3).
- **`data-panel` hooks (all 21, keep each exact):** `till` `lightning` `requests` `history`
  `findsale` `anchor` `letter` `verify` `selftest` `wallets` `assist` `settings` `backup`
  `silentpay` `pair` `watchlist` `livetest` `wallclock` `manual` `demo-link` `explainer`.
  (Current inventory in the source, unchanged.)
- **E2e strings (till/demo suites) that must stay exact:** `#ct-label` `#ct-xpub` "I opened
  my wallet" "Save counter" "Café" (template) "Espresso" "Croissant" "Flat white" `#tl-rate`
  "charge" "Pay the exact amount" "Address #0"/"Address #1" "check now" "I have the money"
  "seen in mempool" "Paid — seen on chain" "Marked paid by you" "did not observe" "Invoice
  inv_" "new sale" "DEMO — a pretend shop" "Demo Café" "exit demo".
- **Honesty labels, fixed text:** `watching for payment` vs `offline — not watching`,
  `submitted` ≠ `confirmed`, `seen` ≠ `paid`, `manual`, and every simulated figure unlabelled
  never. These are flow invariants — new nav must not reword them.

## 6. Focus, keyboard and motion notes (carried from QA, kept honest)

- Tab bar: `aria-current="location"` on the active tab; arrow-key left/right and Home/End
  move focus between the five pills; Enter follows the link. The active section's `<h2>`
  gets `tabindex="-1"` and receives focus on tab change so a keyboard user is told where
  they are (announce via `role="region"` name = the section label; `aria-live="polite"`).
- Focus is moved, not stuck: skip-link to the till stays off-screen until focused.
- Greater-than 44 px on every tab and primary action; reduced-motion honoured (no slide on
  tab change, the fragment is an instant jump — it already is).
- Red appears on no tab; the section labels and tab pills use the neutral/ink palette.

## 7. Rules I did not bend

- **Usability over beauty:** the bottom bar on phones wins even if the top rail is prettier —
  a merchant completes a sale one-handed.
- **Honesty inviolable:** nothing in the new IA rewords a status or hides a "manual" /
  "pretend" / "unverifiable" label. Navigation is allowed to regroup; words are not.
