# Fedi — prepared, not switched on

slip treats Fedi as a **template**, not a rail. The merchant's money stays in the merchant's Fedi
wallet; slip only ever sees a public Lightning address.

## What exists today

| Piece | Where | State |
|---|---|---|
| Rail honesty table (`lightning`, `onchain` work; `ecash` is invisible) | `src/core/fedi.ts` | written, tested |
| Address check — syntax only, never claims to know the host | `src/core/fedi.ts` | written, tested |
| Sweep **nudge** (a sentence, no action) | `src/core/fedi.ts` | written, tested |
| Card copy, in one reviewable place | `src/core/fedi.ts` | written |
| Switch | `FEDI_CARD_ENABLED = false` | off, pinned by test |
| Live LNURL validation | `src/core/providers/lnurl.ts` | exists, used by the Lightning card |
| The setup card itself | — | **not built** |

## What is left before it can ship

1. **The card** — one panel in Setup: paste a Fedi Lightning address, press *check*, see the LNURL
   reply in plain words, save it as a wallet of kind `lightning`.
2. **The nudge UI** — a threshold field and the sentence, only where a Lightning wallet is selected.
3. **A demo path** — the picker's Fedi entry already routes to the Lightning field; the demo's own
   internet must answer the lookup (it already answers `/.well-known/lnurlp/*`).
4. **Cam's go.**

## The rules it must keep

- No federation client, no login, no membership, no gateway, no custody, ever.
- Never say *paid* for money slip did not see; a Fedi-to-Fedi ecash transfer happens where slip
  cannot look, and the interface must say so rather than guess.
- A sweep is never a button. It is a sentence the merchant acts on inside Fedi.
