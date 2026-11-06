# Feature map

Every capability, its honest status, and where it lives. "Live" means it works in this build and
is covered by tests. Nothing on this page is aspirational.

| Area | What it does | Status | Code |
|---|---|---|---|
| Wallets | xpub, BIP-380 descriptor (multisig included), single public key, plain address. Colour, purpose and note for identification. | live | `core/accounts.ts`, `ui/Counters.tsx` |
| Derivation gate | A wallet stays disabled until address 0/0 is confirmed against the owner's wallet | live | `core/accounts.ts` |
| Staff hand-off | Named holder, PBKDF2 PIN, counter switching requires the PIN | live | `core/pin.ts` |
| Shift log | Hash-chained record of add/check/hand-off/return/PIN; printable day sheet | live | `core/shifts.ts` |
| Encrypted backup | `.slip` file (AES-GCM + PBKDF2) carrying accounts, PIN, staff log **and the books**; restore says whether the file had them | live | `core/backup.ts`, `ui/Backup.tsx` |
| Restore dry-run | Header preview + explicit confirm before replacing anything | live | `ui/Backup.tsx` |
| Price maths | Integer-only, 165 ISO currencies, tax in/out, tips, cash rounding, round-up to sats | live | `core/money.ts` |
| Catalog | Items, categories, search, three starter templates | live | `core/catalog.ts` |
| Till | Cart, charge, invoice, QR, receipt; tip jar; custom amount | live | `core/orders.ts`, `ui/Till.tsx` |
| Index discipline | Reserve at invoice creation, burn when the address reaches a payer, release on abandon | live | `core/indexes.ts` |
| Payment detection | Esplora poll while a payment screen is open; `seen` (mempool) is never `paid` (mined) | live | `providers/esplora.ts` |
| Manual confirmation | "I have the money" — recorded as manual, never dressed as an observation | live | `core/orders.ts` |
| Receipts | On-screen receipt with proof QR + print/PDF (white, ink-light) | live | `ui/Till.tsx` |
| Receipt proofs | A `SLIP1\|…` record the customer keeps; the Check-a-receipt panel verifies it against the local books | live | `core/proof.ts`, `ui/Verify.tsx` |
| Standing requests | Rent/subscriptions: wallet, amount, cadence, due date, request QR, mark paid | live | `core/requests.ts`, `ui/Requests.tsx` |
| Budget clock | 30-day in vs committed out, runway days (labelled a sanity check) | live | `core/requests.ts` |
| **Lightning** | LNURL-pay against the merchant's own Lightning address; settlement only when the wallet's `verify` URL says so; no verify URL = labelled unverifiable | live | `providers/lnurl.ts`, `ui/Lightning.tsx` |
| **Day anchoring** | SHA-256 day digest computed locally; optional submission of the digest to a public OpenTimestamps calendar. Never claims a Bitcoin confirmation | live | `core/anchor.ts`, `ui/AnchorPanel.tsx` |
| **Pairing** | Wallet material moved between devices as a QR/text code; imports arrive **unchecked** | live | `core/pair.ts`, `ui/Pair.tsx` |
| **Watchlist** | Any address, labelled, checked on demand with the read time shown | live | `ui/Watchlist.tsx` |
| **Customer screen** | `?display=1` window showing only the QR, amount and status, over BroadcastChannel | live | `ui/CustomerDisplay.tsx` |
| **Rate feed** | Optional fetch from a configurable endpoint, stamped with its minute, refused after 10 minutes | live | `providers/rates.ts` |
| Explorer choice | Public defaults per network; own Esplora endpoint in Settings | live | `providers/esplora.ts` |
| Offline behaviour | Invoices can be created offline; detection pauses and says so | live | `ui/Till.tsx` |
| Agent surface | `window.slip` read-only: wallets, invoices, requests, today's takings, events | live | `main.tsx` |
| Themes | Dark / light / high-contrast, follows the OS first | live | `core/theme.ts` |
| Version stamping | Every deploy carries a version; `deploy.sh` proves it live | live | `scripts/deploy.sh` |
| Sales history | Every completed sale for a day, split by rail, refunds subtracted | live | `core/history.ts`, `ui/History.tsx` |
| Day close & CSV | Printable Z-report (plain text) and an RFC-4180 CSV with integer sats and a BTC column | live | `core/history.ts` |
| Refunds | Recorded against a sale, capped at what was received, with method and reference. slip moves nothing | live | `core/refunds.ts` |
| Split payment | One sale billed across two wallets, each with its own address; the receipt waits for both legs | live | `ui/Till.tsx` |
| Offline reconciliation | Open sales re-checked on load and whenever the network returns, with what changed | live | `core/reconcile.ts` |
| Camera & wedge scanning | BarcodeDetector where the browser has it, keyboard-wedge buffer for USB scanners, paste everywhere else | live | `core/scanner.ts`, `ui/Scan.tsx` |
| Printable receipts | A white, black-text receipt sheet in its own window (ink economy), not the dark UI | live | `ui/print.ts` |
| Demo shop | `?demo=1` — a seeded café in its own storage drawer, simulated explorer, auto-confirming sales; reachable from the Manual and mentioned in onboarding | live | `demo/scenario.ts`, `demo/fakeExplorer.ts`, `ui/DemoBanner.tsx` |
| Live 100 sat test | A real invoice for 100 sats on Lightning (your own address) or signet (faucet coins), watched to settlement | live (opt-in) | `ui/LiveTest.tsx` |
| Quiet clock | A big clock with today's takings and the last sale, for the hours between customers | live (opt-in) | `ui/WallClock.tsx` |
| Find a sale | Search by amount, address ending, time, wallet or invoice id | live | `core/findsale.ts` |
| Customer page | `?explain=1` — one plain page for a customer; QR printed from the Manual | live | `ui/Explainer.tsx` |
| Weekly letter | A week's takings written as sentences, printable; never emailed | live (opt-in) | `core/letter.ts`, `ui/WeeklyLetter.tsx` |
| Credit line | A signature (default `giveabit.io`) riding on the BIP-21 payment label, plus a quiet footer mark | live | `core/brand.ts` |
| Assistance switches | Seven toggles (explanations, rehearsal, hints, rings, footer seal, handover note, counter card) so a busy counter can be silent | live | `core/settings.ts`, `ui/Settings.tsx` |
| Explain a number | Tap a figure for one plain sentence plus its caveat, sourced from `core/explain.ts` | live | `core/explain.ts`, `ui/Explain.tsx` |
| Rehearsal | A whole sale practised with a real QR, no index reserved, no books written, receipt stamped REHEARSAL | live | `ui/Till.tsx` |
| Self test | Five fixed vectors (derivation, amount, sats, QR, proof) run in the browser, no network | live | `core/selftest.ts`, `ui/SelfTest.tsx` |
| Handover note | Three generated lines for whoever takes the till: parked sales, open payments, refunds, stale rate | live | `core/handover.ts`, `ui/Counters.tsx` |
| Counter card | A4 white/black sheet of the three rules and the never-list, for the wall | live | `ui/counterCard.ts` |
| In-app manual | Every panel declares its own card (why, steps, limit); the page is generated from those declarations | live | `src/manual/entries.ts`, `ui/Manual.tsx` |
| Docs gate | `npm run docs:audit` fails on a panel with no card, a card pointing at a missing file, or a FEATURE-MAP path that no longer exists | live | `scripts/docs-audit.mjs` |
| Manual screenshots | `npm run manual` photographs every documented panel at 2× from the built app | live | `scripts/manual-shot.mjs` |
| Freshness ring | Every fetched number carries an age ring driven by the same rule that refuses a stale rate | live | `core/freshness.ts`, `ui/FreshnessRing.tsx` |
| Sound on payment | Three synthesised cues (seen, paid, needs-you), no audio files, switchable, deduped so one sale chimes once | live | `core/sound.ts`, `ui/Till.tsx`, `ui/Watcher.tsx` |
| Next sale | A finished sale ends on one primary action that clears the cart and keeps the shift | live | `ui/Till.tsx` |
| Open and close the till | One line to start the day (who is on, float counted) and one to end it, both hashed into the shift log | live | `ui/OpenTill.tsx`, `core/shifts.ts` |
| Waiting strip | Open sales above the counter, oldest first, with age; tap to pick one back up | live | `core/awaiting.ts`, `ui/AwaitingStrip.tsx` |
| Scan into the cart | Wedge scanner, camera QR or a typed code resolved against the catalog — exact match only | live | `ui/ScanToCart.tsx` |
| Counter shortcuts | `/` search, `c` charge, `n` next sale, `p` print — never while a field has focus | live | `ui/Till.tsx` |
| Explainer clips | Six short videos behind an (i) on the hero and on five cards; nothing downloads until tapped, credited where they play | live | `ui/InfoVideo.tsx`, `public/videos/` |
| Tamper-evident footer | Today's completed-sales digest in the footer, changing as sales land | live | `ui/BookSeal.tsx` |
| Parked tabs | Up to five half-built sales parked and resumed; no address is reserved until charged | live | `core/tabs.ts` |
| Repeat last sale | One tap to reload the previous order | live | `core/tabs.ts` |
| Install prompt | "Add to device" only when the browser offers a real prompt; says so when already installed | live | `ui/Install.tsx` |
| **Silent Payments** | `sp1…`/`tsp1…` validated and shown with a BIP-21 QR; every sale recorded as a manual confirmation, because detection needs a scan key slip will never hold | live (display + manual) | `core/silentpay.ts`, `ui/SilentPay.tsx` |
| **Fedimint** | request mode against a federation | planned — needs a federation + gateway to test against | — |

| **Multi-language** | translation as data | planned | — |

## The three rules that make every row above safe

1. **No spend path.** There is no key material in the app that could move a coin. A total bug can
   at worst misdisplay an address.
2. **No invented status.** `seen`, `submitted`, `manual` and `unknown` are distinct words on
   screen, and each one is a tested state rather than a label someone typed.
3. **No silent network.** Every request is to an endpoint the merchant chose or the public default
   named in Settings — and the footer counts requests from the app itself.
| Plain-language layer | every panel | a plain sentence on screen, the exact term behind a switch (`<Tech>`), developer panels grouped under `<Advanced>` | D-79 |
| Three-step first screen | hero, Sell | "Add your wallet · Ring up the sale · They pay you", one orange action | D-79 |
| Next-step strip | Sell | reads the device (no wallet / ready / trading) and names the one useful action | D-79 |
| "Show technical names" | Settings → Plain language | brings back xpub, LNURL, mempool, descriptor, BIP-85; nothing is ever deleted | D-79 || Glossary in plain words | Learn | ten everyday terms, each meaning one sentence; exact names behind the technical switch | D-80 |
| Try before you paste | hero | "See it with pretend sales" opens the demo in a new tab | D-80 || Demo covers every pipe | ?demo=1 | prices, Lightning invoice + settlement, day stamp, explorer — all answered locally; nothing leaves the device | D-81 || The demo tells the truth | ?demo=1 | no invented balances, split legs registered, simulated stamp labelled, pretend invoice labelled | D-82 || Which wallet do you use? | Setup → Wallets, wizard | eight guides, Lightning-only wallets routed to the Lightning card | D-84 |
| Text size and spacing | Setup → Settings | `normal/large`, `comfortable/compact`, applied to `<html>` | D-84 |
