# slip

A non-custodial, serverless, watch-only point-of-sale terminal.

You paste **public** wallet material once — an xpub, a descriptor, a Silent Payments
address or your Lightning address — and every sale is paid straight into **your own
wallet**. There is no slip company, server, account, API key or payment processor.
slip cannot hold, move, recover or reverse your money, because it never has the
ability to sign anything.

## Status: shipping — it takes payments and closes the day.

Live is **v0.31.59** on https://slip.giveabit.io. Read `docs/RESUME-2026-11-10.md` first, then
`docs/NEXT-TEN.md` — rewritten 2026-11-12 and honest about what is open: three items blocked on a human
thumb or a captcha, three on a shop's hardware, the rest code.

On-chain (BTC/LTC, mainnet and testnets), Lightning via LNURL-pay + LNURL-verify, receipts with
customer-kept proofs, rent requests, a day book you can stamp, wallet pairing by QR, a watchlist and
a customer screen. Every rail is labelled with what was actually observed — `seen` is never `paid`,
`submitted` is never `confirmed`, and a manual confirmation says it was manual.

Still planned: Fedimint (needs a federation to test against), translations, an APK shell.

What exists right now: a single `index.html` (**777 KB raw, 229 KB over the wire**) of strict
TypeScript and React — the ISO 4217 currency table, integer-only money maths, BTC + LTC address
derivation, SLIP-132 and BIP-380 descriptor parsing, counter accounts with a derivation gate, a
staff hand-off with a PBKDF2 PIN, a **till lock** that shuts the whole app behind a PIN, a
hash-chained shift log, an encrypted backup (books included), QR + BIP-21 URIs, the till with catalog
and receipts, **an overpayment note** that names money that arrived above the ask, standing requests,
Lightning, anchoring, pairing, the watchlist and a customer screen.

Verified against the official BIP-84 / BIP-86 / SLIP-132 vectors, against **Bitcoin Core's own
`deriveaddresses`** for every address shape, against an independent Python implementation for the
money maths, and against stubbed explorers/calendars/LNURL endpoints for every status transition.
**640 unit tests** and **18 browser suites** run against the built artifact.

Two things are genuinely unproven and are named as such in `docs/NEXT-TEN.md`: the camera has never
been pointed at a code on a real phone, and no sale has been paid from a real wallet — every sale so
far is a demo or a rehearsal. The trial for a shopkeeper is `docs/MERCHANT-TRIAL-LTC.md` and nobody
outside this repo has run it.

## Rails in scope (v1)

| Rail | Networks |
|---|---|
| Bitcoin on-chain (BIP-84/86/49/44, multisig, static) | mainnet · signet · testnet4 |
| Litecoin on-chain | mainnet · testnet |
| Lightning (merchant's own LNURL-pay / Lightning address) | via LNURL-verify |
| Silent Payments (BIP-352) — **display only**, Level-1 | BTC mainnet + testnets |
| Fedimint ecash — request mode | regtest federation we host |
| BIP-85 isolated counter wallets (imported child xpubs) | any |

Deferred, not cancelled: Liquid, BCH, DOGE, Cashu, EVM/stablecoins, own-node REST,
NWC, 19 further languages, iOS App Store build, thermal printing, kiosk, peer sync.

### What works today

| Capability | Notes |
|---|---|
| Counter accounts (BIP-85 child xpubs) | paste an xpub **or** a `wpkh()/tr()/sh(wpkh())/wsh(sortedmulti())` descriptor |
| Derivation gate | a counter stays disabled until address 0/0 is confirmed against your wallet |
| Staff hand-off | named holder, PBKDF2 till PIN, switching counters needs the PIN |
| Shift log | hash-chained, verifiable, printable day sheet — tamper-*evident* |
| Encrypted backup | `.slip` file, AES-GCM + PBKDF2, restore on a new device |
| Price maths | integer-only, 165 ISO currencies, tax inclusive/exclusive, tips, round-up to sats |
| Address check | refuses a wrong-chain address before it can reach a QR |
| QR | BIP-21, inline SVG, decode-verified in tests |
| Version stamping | every deploy carries a version, proven live by `scripts/deploy.sh` |
| Index discipline | reserve at invoice creation, release on cancel, burn on display, gap-limit scan (`src/core/indexes.ts`) |
| Print | white-background, black-text print/PDF variant for day sheets (`@media print`) |
| Guided setup | five-screen wizard; the wallet step cannot be left until address 0/0 is confirmed (`src/core/settings.ts` gates) |
| Till | catalog + cart + charge + QR + receipt; tip jar; index reserved per sale and burned when shown |
| Payment detection | Esplora poll while a payment screen is open: `seen` (mempool) is never `paid` (mined) |
| Standing requests | rent/subscriptions with a due date, request QR and a blunt 30-day budget clock |
| Agent surface | `window.slip` — read-only wallets/invoices/requests/takings + events |
| Lightning | LNURL-pay to your own Lightning address; settled only if the wallet's verify URL says so |
| Day anchoring | Local SHA-256 day digest; optional OpenTimestamps calendar submission, honestly labelled |
| Pairing | Wallet material as a QR/text code; imports arrive **unchecked** by design |
| Watchlist | Any address, labelled, checked on demand with a read timestamp |
| Customer screen | `?display=1` shows the QR and amount, never the takings |
| Receipt proofs | `SLIP1\|…` record the customer keeps; verifiable against your own books |
| Sales history | Day close by rail, observed vs human-confirmed, printable sheet, CSV export |
| Refunds | Recorded with method and reference; slip never moves money |
| Split payment | One sale across two wallets, two addresses, one receipt |
| Offline reconcile | Open sales re-checked on load and on reconnect |
| Silent Payments | `sp1…` display + BIP-21 QR, recorded as a manual confirmation by design |
| Scanning | Camera (BarcodeDetector) where supported, USB wedge anywhere, paste always |
| Install | Manifest + wordmark icons on black; Chromium reports zero installability errors through CDP |
| Manual | Generated from panel declarations; `npm run docs:audit` fails the build when docs drift |
| Freshness | Age rings on fetched numbers, from the same rule that refuses a stale rate |
| Book seal | Today's digest in the footer, changing as sales land |
| Parked tabs | Up to five held sales, resumed in one tap; repeat-last for the usual order |
| Assistance | Ten switches so the screen can be quiet; flip them in Settings |
| Demo shop | `?demo=1`: a pretend café in its own drawer, zero network, auto-confirming sales |
| Live 100 sat test | A real invoice on Lightning or signet, to prove a rail before you trust it |
| Find a sale | Amount, address ending, time or invoice id |
| Quiet clock | Time, today's takings, last sale — for the gaps |
| Customer page | `?explain=1`: what they are paying, who holds it |
| Weekly letter | A week in sentences, printable, never emailed |
| Explain a number | Tap a figure for one plain sentence and its caveat |
| Rehearsal | Practise a sale: real QR, no books, no index |
| Self test | Five fixed vectors in the browser — proves the file's arithmetic |
| Handover note | Three generated lines for the next shift |
| Counter card | A4 rules sheet for the wall behind the till |
| **Till lock** | A 4–8 digit PIN (PBKDF2-SHA256, 120k iterations, salted) locks the whole app on open and after N quiet minutes; never stored, never recoverable |
| **Overpayment** | Money that arrived above the ask is named on the receipt, in Books, on the printed day close and in the CSV — and still counted at the ask |
| Day close on A4 | One A4 sheet with fixed columns and a footer; one page proved by a PDF page count |
| Customer sheet | A one-page A4 sheet at paper size (code at 95mm, wordmark, what they pay / who holds it) |
| The limits lesson | A panel behind More that says what slip cannot do, beside the short guide |
| Keyboard & reader | Every money path by keyboard, blocked actions stay focusable, each sale announced once |

## Live

- **https://slip.giveabit.io** — Cloudflare Pages project `slip` (direct-upload, free tier).
- Also reachable at https://slip-6d6.pages.dev, which serves byte-identical output to
  `dist/index.html`. The custom domain is proxied by Cloudflare, which injects a
  bot-detection script that slip's own CSP refuses (see `DECISIONS.md` D-15) — so a
  hash check must be done against the pages.dev copy or a repo build.

Ship a new version from `master` (from THOR; the credentials live in
`/root/.hermes/cf-credentials.env`):

```bash
SLIP_NOTE="<one line for the changelog>" bash scripts/deploy.sh patch
```

It bumps the patch version, builds, deploys, then **verifies both the Pages origin and
slip.giveabit.io report the new version** — a deploy that cannot say its own version has failed.
Commit the version files afterwards: `git add CHANGELOG.md package.json package-lock.json`.
Do not export `CLOUDFLARE_API_TOKEN` before running it: the script only reads the credentials file
when that variable is unset, and otherwise fails on a missing account id.

Cost: $0. Pages free tier, existing giveabit.io zone, no new zone, no paid feature.

## Documentation

| Doc | For |
|---|---|
| [`docs/MERCHANT_GUIDE.md`](docs/MERCHANT_GUIDE.md) | a shop owner: get your xpub, add a counter, hand it to staff, lock the till, back up |
| [`docs/MERCHANT-TRIAL-LTC.md`](docs/MERCHANT-TRIAL-LTC.md) | the trial to run before taking real money, printer or no printer |
| [`docs/FEATURE-MAP.md`](docs/FEATURE-MAP.md) | every capability with its honest status and the file it lives in |
| [`docs/NAV-MAP.md`](docs/NAV-MAP.md) | what is reachable from where, and why the tabs are these tabs |
| [`docs/NEXT-TEN.md`](docs/NEXT-TEN.md) | what is actually open, each with a "done when" line |
| [`docs/RESUME-2026-11-10.md`](docs/RESUME-2026-11-10.md) | the session log, newest first — start here |
| [`docs/KIMI-HANDOFF.md`](docs/KIMI-HANDOFF.md) | the handoff to whoever works the next session |
| [`docs/EDUCATION.md`](docs/EDUCATION.md) | the generated card pack behind the in-app manual |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | a developer: module map, the rules that shaped it, how it is tested |
| [`docs/DESIGN-DECISIONS.md`](docs/DESIGN-DECISIONS.md) | why it works the way it does — every decision from D-33 onward |
| [`docs/DESIGN-UPGRADE-BRIEF.md`](docs/DESIGN-UPGRADE-BRIEF.md) | the design pass: direction, checklist, plan, and the master prompt |
| [`docs/PROMPT-FOR-CLAUDE.md`](docs/PROMPT-FOR-CLAUDE.md) | the review brief handed to a design model: seven deliverables, strict IDs, evidence required |
| [`docs/BRIEF-FOR-FABLE.md`](docs/BRIEF-FOR-FABLE.md) | the build contract: what an implementing model is given after the review is audited |
| [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md) | running it anywhere, including from a USB stick, and verifying a build |
| [`SECURITY.md`](SECURITY.md) | the invariant, what is in scope, how to report |
| [`PRIVACY.md`](PRIVACY.md) | exactly what is stored and what leaves the device |
| [`THREAT_MODEL.md`](THREAT_MODEL.md) | who can take what, and what is left unprotected |
| [`DECISIONS.md`](DECISIONS.md) | every deviation and judgement call, with the reason |
| [`CHANGELOG.md`](CHANGELOG.md) | every published version, its hash prefix and time |
| [`MASTER-BRAIN/03-Projects/slip/SLIP-PLAN.md`](../MASTER-BRAIN/03-Projects/slip/SLIP-PLAN.md) | the phase plan and what is deliberately deferred |

## Develop

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # vitest — 640 passing
npm run build      # → dist/index.html (single file) + dist/SHA256SUMS
npm run manual     # rebuild, then photograph every documented panel (2×) for the in-app manual
npm run docs:education   # rewrite docs/EDUCATION.md from the manual entries
```

Browser suites need the built file served, not the dev server:

```bash
npx vite preview --port 4183 --strictPort --host 127.0.0.1 &
node tests/e2e/run-all.mjs "http://127.0.0.1:4183/"   # 18 suites
```

`npm run build` prints the size and SHA-256 of `dist/index.html`. Verify a downloaded
release against the published `SHA256SUMS` before you trust it with your till.

## Guarantees, in plain language

- No seed phrase, private key or WIF is ever accepted — pasting one is rejected and wiped.
- Works offline after first load: catalog, cart, tax, addresses, QR, history, reports.
- "Paid" is only ever shown when slip actually observed the payment.
- Every payment method carries a verification badge (auto-verified / third-party / manual).
- No analytics, no telemetry, no cookies, no third-party scripts at runtime.

## Licence

MIT. See `LICENSE`.

slip is open source so a merchant can read exactly what it does with their keys — the answer is
"nothing". Contributions are welcome: open an issue before anything larger than a fix. Please
report anything security-shaped privately rather than in a public issue (see `docs/SECURITY.md`).
