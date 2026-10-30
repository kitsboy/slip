# Architecture

One page, because the shape is small on purpose.

```
src/
  core/            pure logic, no React, all unit-tested
    money.ts       integer-only fiat/atoms arithmetic (BigInt, rounds up)
    currencies.ts  GENERATED from ISO 4217 — never hand-edited
    network.ts     coin/network parameters; networks are chosen, never inferred
    keys.ts        SLIP-132 prefixes, extended-key parsing, secret refusal
    derive.ts      address derivation per script type (BIP-84/86/49/44, sortedmulti)
    descriptors.ts BIP-380 output descriptors + checksum, verified against Bitcoin Core
    addresses.ts   validate an address against the network it will be spent into
    accounts.ts    counter accounts (BIP-85 child xpubs), ACK gate, persistence
    pin.ts         PBKDF2 till PIN + hand-off rules
    shifts.ts      hash-chained, tamper-EVIDENT shift log
    qr.ts          BIP-21 URIs + inline SVG QR (decode-verified in tests)
    backup.ts      encrypted .slip file (AES-GCM + PBKDF2)
    buildinfo.ts   version / commit / build time, injected at build
  ui/              one panel per capability; no business logic
  App.tsx          the shell
```

## Rules that shaped it

- **The core knows nothing about React.** Every money-critical function is a pure function
  with a test, so it can be audited without reading JSX.
- **The domain never branches on coin in UI code.** A new chain (LTC↔BTC) is a parameter,
  not an `if`.
- **Two independent implementations for arithmetic.** `tests/vectors/money-golden.json` is
  produced by a Python/decimal script; the TypeScript must agree with it. It has already
  caught two real bugs.
- **Bitcoin Core is the address oracle.** `tests/vectors/core-derived.json` and
  `descriptors.json` come from `bitcoin-cli deriveaddresses`, so "our addresses are right"
  means "they match the implementation every wallet interoperates with", not "our library
  agrees with itself".
- **Anything that can be typed by a human is refused at the edge.** Secrets are rejected in
  one function (`assertNotSecret`) called by every entry point.
- **A partial build says so on screen**, and a test asserts the sentence survives.

## Data flow of one sale (when the engine lands)

```
catalog item → computeTotals (money.ts)          → fiat total + tax + tip
             → rate snapshot (explicit, aged)     → sats
             → counter account + NEXT INDEX        → fresh address (or LN invoice)
             → paymentUri + renderQrSvg            → QR the payer scans
             → watcher observes tx                 → status → Level-3 "paid"
```

Indexes are reserved **at invoice creation**, never on page load, and released if the sale is
cancelled — that is what makes "no address reuse" true rather than intended.

## Testing

| Layer | Tool | Where |
|---|---|---|
| Unit (money, keys, derivation, descriptors, shifts, backup, qr) | vitest | `tests/*.test.ts` |
| Official vectors | vitest | BIP-32/39/44/49/84/86, BIP-380, BIP-21, SLIP-132 |
| Reference oracles | `bitcoin-cli` + Python `decimal` | `tests/vectors/` |
| Built artifact, real browser | Playwright | `tests/e2e/` |
| Live deploy identity | `scripts/deploy.sh` | version meta on the live page |

Run everything:

```bash
npx tsc --noEmit && npx vitest run && npm run build && node tests/e2e/keycheck.mjs
```
