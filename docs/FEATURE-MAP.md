# Feature map

Every capability, its honest status, and where it lives. "Live" means it works in this
build and is covered by tests. Nothing on this page is aspirational.

| Area | What it does | Status | Code |
|---|---|---|---|
| Wallets | Any of: xpub, BIP-380 descriptor (multisig included), single public key, plain address. Colour + purpose + note for identification. | live | `core/accounts.ts`, `ui/Counters.tsx` |
| Derivation gate | A wallet stays disabled until its address 0/0 is confirmed against the owner's wallet | live | `core/accounts.ts` (`acknowledgedAt`) |
| Staff hand-off | Named holder, PBKDF2 PIN, counter switching requires the PIN | live | `core/pin.ts` |
| Shift log | Hash-chained record of add/check/hand-off/return/PIN; printable day sheet | live | `core/shifts.ts` |
| Encrypted backup | `.slip` file (AES-GCM + PBKDF2), restore on a new device, PIN included | live | `core/backup.ts` |
| Restore dry-run | Header preview + explicit confirm before replacing anything | live | `ui/Backup.tsx` |
| Price maths | Integer-only, 165 ISO currencies, tax in/out, tips, cash rounding, round-up to sats | live | `core/money.ts` |
| Catalog | Items, categories, search, three starter templates | live | `core/catalog.ts` |
| Till | Cart → charge → invoice → QR → receipt; tip jar mode; custom amount | live | `core/orders.ts`, `ui/Till.tsx` |
| Index discipline | Reserve at invoice creation, burn when the address is shown, release on abandon | live | `core/indexes.ts` |
| Payment detection | Esplora poll while a payment screen is open; `seen` (mempool) vs `confirmed` (mined) | live | `providers/esplora.ts` |
| Manual confirmation | "I have the money" — recorded as manual, never dressed as an observation | live | `core/orders.ts` |
| Receipts | On-screen receipt with proof QR + print/PDF (white, ink-light) | live | `ui/Till.tsx` |
| Standing requests | Rent/subscriptions: wallet, amount, cadence, due date, request QR, mark paid | live | `core/requests.ts`, `ui/Requests.tsx` |
| Budget clock | 30-day in vs committed out, runway days (labelled a sanity check) | live | `core/requests.ts` |
| Explorer choice | Public defaults per network; own Esplora endpoint in Settings | live | `core/providers/esplora.ts` |
| Offline behaviour | Invoices can be created offline; detection pauses and says so | live | `ui/Till.tsx` |
| Agent surface | `window.slip` read-only: wallets, invoices, requests, today's takings, events | live | `main.tsx` |
| Themes | Dark / light / high-contrast, follows the OS first | live | `core/theme.ts` |
| Version stamping | Every deploy carries a version; `deploy.sh` proves it live | live | `scripts/deploy.sh` |
| **Lightning** | LNURL-pay + LNURL-verify | planned | — |
| **Silent Payments** | display-level `sp1…` | planned | — |
| **Fedimint** | request mode | planned | — |
| **Split payment** | one sale across two wallets | planned | — |
| **Multi-language** | translation as data | planned | — |

## What slip will never do

Hold, sign for, move, recover or reverse funds. It has no key material that could spend, and a
test asserts that pasted secrets are refused at every entry point.
