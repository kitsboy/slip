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
    lock.ts        the till lock: salt + PBKDF2-SHA256 hash, never the PIN; idle policy
    shifts.ts      hash-chained, tamper-EVIDENT shift log
    qr.ts          BIP-21 URIs + inline SVG QR (decode-verified in tests)
    backup.ts      encrypted .slip file (AES-GCM + PBKDF2)
    buildinfo.ts   version / commit / build time, injected at build
  ui/              one panel per capability; no business logic
  App.tsx          the shell; also the one whole-app gate — a locked till returns Lock, not a drawer

```

## Two things that look like features but are arithmetic

- **Overpayment is a note, not a status.** Nothing in `orders.ts` gains a state for it. `overpaidBy()`
  names the difference above a 1% tolerance (the same edge as the short-payment rule), the row carries
  it, and every total still counts the sale **at the amount asked for**. A status would have meant a
  sale that is complete being shown as incomplete.
- **The till lock is a gate, not an encryption story.** `lock.ts` holds a salt and a PBKDF2-SHA256 hash
  (120,000 iterations, 256 bits); the PIN is never stored and cannot be recovered. What it buys is the
  ordinary thing — a passer-by at the counter cannot open the till, and the page says so rather than
  implying the books are encrypted.

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

Run everything — the same eleven gates CI and the deploy use:

```bash
npx tsc -p tsconfig.json --noEmit
npx eslint .
npm run build
npx vitest run
node scripts/lint-tokens.mjs
node scripts/contrast-audit.mjs --strict
node scripts/docs-audit.mjs --strict
node scripts/check-budget.mjs
node scripts/tap-audit.mjs
npx vite preview --port 4183 --strictPort --host 127.0.0.1   # separate shell
node tests/e2e/run-all.mjs "http://127.0.0.1:4183/"           # 18 browser suites
node scripts/demo-check.mjs "http://127.0.0.1:4183/?demo=1"   # the demo never touches the network
```

`npm run build` kills a running `vite preview`; start the preview **after** the build, and kill it by
PID (`pgrep -f "^node .*slip/node_modules/.bin/vite preview"`), never with `pkill -f "vite preview"`,
which also matches the shell that issued it.
