# slip

A non-custodial, serverless, watch-only point-of-sale terminal.

You paste **public** wallet material once — an xpub, a descriptor, a Silent Payments
address or your Lightning address — and every sale is paid straight into **your own
wallet**. There is no slip company, server, account, API key or payment processor.
slip cannot hold, move, recover or reverse your money, because it never has the
ability to sign anything.

## Status: P7 — guided setup, counters, descriptors, backup, shift log. **This cannot take a payment yet.**

What exists right now: a single `index.html` (~330 KB raw / ~110 KB gzip) with strict
TypeScript and React, the ISO 4217 currency table, integer-only money maths, BTC + LTC
address derivation, SLIP-132 and BIP-380 descriptor parsing, counter accounts with a
derivation gate, a staff hand-off with a PBKDF2 PIN, a hash-chained shift log, an
encrypted backup format, QR + BIP-21 URIs, and version stamping on every deploy.

Verified against the official BIP-84 / BIP-86 / SLIP-132 vectors, against **Bitcoin Core's
own `deriveaddresses`** for every address shape, and against an independent Python
implementation for the money maths. 271 unit tests and 25 browser checks, run against the
built artifact.

There is deliberately no selling screen yet. A till that shows a receive address
before the derivation-preview gate exists is the one bug that costs a merchant
money, so the screens land in a fixed order — see `SLIP-PLAN.md` §7:

```
P0 pipeline ✅   P2 derivation ✅   P1 money math   P2b descriptors
P3 storage/backup   P4 providers/rates   P5 payment engine
P6 selling UI   P7 safeguards   P7b Silent Payments   P7c BIP-85 + Fedimint
P7d Lightning   P8 reports   P9 PWA/APK/embed   P10 rehearsal + release
```

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

## Live

- **https://slip.giveabit.io** — Cloudflare Pages project `slip` (direct-upload, free tier).
- Also reachable at https://slip-6d6.pages.dev, which serves byte-identical output to
  `dist/index.html`. The custom domain is proxied by Cloudflare, which injects a
  bot-detection script that slip's own CSP refuses (see `DECISIONS.md` D-15) — so a
  hash check must be done against the pages.dev copy or a repo build.

Redeploy (from THOR, with `CF_FAMILY_OPS_TOKEN` in the environment):

```bash
npm run build && npx wrangler pages deploy dist --project-name slip --branch main
```

Cost: $0. Pages free tier, existing giveabit.io zone, no new zone, no paid feature.

## Documentation

| Doc | For |
|---|---|
| [`docs/MERCHANT_GUIDE.md`](docs/MERCHANT_GUIDE.md) | a shop owner: get your xpub, add a counter, hand it to staff, back up |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | a developer: module map, the rules that shaped it, how it is tested |
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
npm test           # vitest
npm run build      # → dist/index.html (single file) + dist/SHA256SUMS
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
