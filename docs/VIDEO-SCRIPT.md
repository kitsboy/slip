# Intro video — shot list (target: 90 seconds)

Rules for this video: show the real app, say the true thing, and never demo a feature that is
not live. Every shot below maps to something in `docs/FEATURE-MAP.md` marked **live**.

| # | Seconds | Shot | On-screen caption | Script (voice) |
|---|---|---|---|---|
| 1 | 0–6 | Hero, dark theme | **slip** — a till that pays you directly | "This is a till with no company behind it. No account, no server." |
| 2 | 6–14 | Trust chips + footer counter reading 0 | *network requests: 0* | "Nothing leaves this page. You can watch it stay at zero." |
| 3 | 14–24 | Add wallet: paste zpub → five addresses → tick "address 0/0 matches my wallet" | *Confirm one address, then you're safe* | "Paste your public key, then check one address against your own wallet. That's the whole trust story." |
| 4 | 24–32 | Three wallets, three colours | *Work · Family · Your own* | "Hold as many wallets as you need — your boss's, your parents', your own — each labelled and coloured." |
| 5 | 32–44 | Café template → tap Espresso ×2 + Croissant → charge | *Ring it up in four taps* | "Pick a template, tap the items, and slip does the tax, the tip and the sats." |
| 6 | 44–56 | Payment screen: QR + "pay exactly" warnings | *Pay exactly — slip is watching this address* | "The customer scans. The address was reserved for this sale alone, so nothing can be confused." |
| 7 | 56–64 | Status flips to *seen in mempool*, then *paid — seen on chain* | *Seen ≠ paid. slip says which.* | "When the money is still in the mempool it says seen. Only a mined payment says paid." |
| 8 | 64–72 | Receipt with proof QR + print | *A receipt your customer can keep* | "Every sale ends with a receipt and a proof QR." |
| 9 | 72–82 | Staff hand-off: name + PIN → "Held by Ana" | *Hand the till over, keep the record* | "Give the till to a staff member. The PIN keeps the record straight, and every move is hash-chained." |
| 10 | 82–90 | Backup panel → export → restore | *Encrypted backup. Yours.* | "One encrypted file backs it all up. No keys in it, because slip never has any." |
| 11 | 90–96 | End card: version chip + `slip.giveabit.io` | **slip** · watch-only · open source | "slip. Your keys, your till, nobody's server." |

## Assets to capture when we record

1. `hero.png` — top of page, dark theme, version chip visible.
2. `wallet-gate.png` — derivation preview with the confirmation tick.
3. `wallets-three.png` — three wallets with different colours + purpose labels.
4. `till-cart.png` — cart with two espressos and a croissant, charge figure showing sats.
5. `pay-screen.png` — QR + the three warnings.
6. `status-seen.png` and `status-paid.png` — the two status chips (the pair is the point).
7. `receipt.png` — receipt with proof QR.
8. `handoff.png` — "Held by Ana · Front counter" banner.
9. `backup.png` — export button + passphrase field.
10. `footer-zero.png` — the network-request counter at zero.

Capture with the same 430 px viewport and 2× scale as the other screenshots so the film looks
consistent. Record against a **stubbed explorer** so the demo never depends on a third party
being up on the day.
