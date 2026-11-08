# Fedi — ready, switched off

slip treats Fedi as a **template**, not a coin and not a rail. The coins slip sells in are
Bitcoin and Litecoin, on mainnet, signet and testnet. Fedi ecash never sits beside them.
The merchant's money stays in the merchant's Fedi wallet. slip only ever sees a public
Lightning address, and only after the switch is turned on.

## What exists today

| Piece | Where | State |
|---|---|---|
| Rail honesty table (`lightning`, `onchain` work; `ecash` is invisible) | `src/core/fedi.ts` | written, tested |
| Address check — syntax only, never claims to know the host | `src/core/fedi.ts` | written, tested |
| Sweep **nudge** (a sentence, no action) | `src/core/fedi.ts` | written, tested |
| Card copy, in one reviewable place | `src/core/fedi.ts` | written |
| The card itself | `src/ui/FediCard.tsx` | written, not mounted |
| Switch | `FEDI_CARD_ENABLED = false` | off, pinned by test |
| Live LNURL check | `fetchPayParams` in the card | wired, runs only if the card is mounted |
| Hand-off | fills `#ln-addr` | the Lightning card already takes the payment |

## What one flip does

Set `FEDI_CARD_ENABLED` to `true`. The card appears under Setup. It can check a Lightning
address, refuse a secret, and show the sweep sentence. It still cannot join a federation,
hold ecash, or move money.

## The rules it must keep

- No federation client, no login, no membership, no gateway, no custody, ever.
- Never say *paid* for money slip did not see. A Fedi-to-Fedi ecash transfer happens where
  slip cannot look, and the card says so.
- A sweep is never a button. It is a sentence the merchant acts on inside Fedi.
- The live coins stay Bitcoin and Litecoin, plus signet and testnet. Fedi is not added to
  that list by turning the card on.
