# slip

A non-custodial, serverless, watch-only point-of-sale terminal.

You paste **public** wallet material once — an xpub, a descriptor, a Silent Payments
address or your Lightning address — and every sale is paid straight into **your own
wallet**. There is no slip company, server, account, API key or payment processor.
slip cannot hold, move, recover or reverse your money, because it never has the
ability to sign anything.

## Status: P2 — key check works. **This cannot take a payment yet.**

What exists right now: the single-file build pipeline, strict TypeScript, React +
Tailwind, the coin/network tables, **BTC + LTC address derivation**, the SLIP-132
prefix parser, secret refusal, and a "Check your key" screen that shows the first
five derived addresses for you to compare against your own wallet. One
`index.html`, 283 KB raw / 96 KB gzip, build-time CSP, published hash.

Verified against the official BIP-84 / BIP-86 / SLIP-132 vectors **and** against
Bitcoin Core's own `deriveaddresses` output, plus a browser test that types an xpub
into the built file and compares the address it renders.

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
