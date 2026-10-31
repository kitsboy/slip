# Content log — what we have for the video

The film is deliberately **not built yet**; this file is the inventory it will be cut from. Every
release adds to it: screenshots are captured by `npm run manual` from the shipping build, and the
captions come from the manual cards, so the film can never describe a feature we do not have.

## Assets captured (regenerate with `npm run manual`)

| Panel | Image | Caption (from the card) |
|---|---|---|
| First-run / wallets | `screenshots/manual/wallets.png` | Every wallet here is a public address slip watches for you. |
| The till | `screenshots/manual/till.png` | Ring up a sale, get a QR that pays your wallet directly. |
| Lightning | `screenshots/manual/lightning.png` | Coffee-sized payments, straight to your own Lightning address. |
| Requests | `screenshots/manual/requests.png` | Money that arrives on a schedule still needs a due date. |
| History / day close | `screenshots/manual/history.png` | The sheet your accountant asks for. |
| Receipt check | `screenshots/manual/verify.png` | A customer can prove a sale happened without asking you. |
| Day book | `screenshots/manual/anchor.png` | Stamping a day proves the books existed then. |
| Manual | `screenshots/manual/manual.png` | Every panel explains itself, in the words the build checks. |
| Self test | `screenshots/manual/selftest.png` | Prove the copy on this device still does its arithmetic. |
| Assistance | `screenshots/manual/assist.png` | Turn anything that reads as noise off. |
| Watchlist | `screenshots/manual/watchlist.png` | A supplier or landlord, watched but never touched. |
| Pairing | `screenshots/manual/pair.png` | Move a wallet to a second till with a QR. |
| Silent Payments | `screenshots/manual/silentpay.png` | A private receive address, recorded honestly as manual. |
| Backup | `screenshots/manual/backup.png` | One encrypted file: wallets, PIN, staff log, books. |
| Settings | `screenshots/manual/settings.png` | Name, currency, tax, explorer, rate — in one place. |

## Beats already shot (suggested order for a 90-second cut)

1. **Hook (0–6s)** — hero, version chip, "no account, no server".
2. **Trust (6–14s)** — footer counters + the three rules.
3. **First wallet (14–24s)** — paste, preview five addresses, confirm 0/0.
4. **A sale (24–44s)** — cart, charge, QR, warnings, *seen* then *paid*.
5. **Receipt (44–56s)** — proof QR + print sheet.
6. **Handover (56–64s)** — name + PIN → the handover note.
7. **Day close (64–78s)** — split by rail, observed vs human, CSV.
8. **Quiet mode (78–86s)** — Assistance switches: turning the noise off.
9. **End card (86–90s)** — version + URL.

## New since the last cut

| Asset | Image | Caption |
|---|---|---|
| Demo shop | `screenshots/manual/demo-link.png` | A pretend café you can sell in before you own a wallet. |
| Live 100 sat test | `screenshots/manual/livetest.png` | A real hundred sats, on a rail you choose. |
| Quiet clock | `screenshots/manual/wallclock.png` | Between customers, a shop — not a spreadsheet. |
| Customer page | `screenshots/manual/explainer.png` | One plain page for someone who has never used bitcoin. |
| Weekly letter | `screenshots/manual/letter.png` | A week, written as sentences. |

## Still to record (needs a human at the counter)

- A real customer scanning a QR (hands, phone, café background).
- A cash sale with **I have the money (manual)** pressed.
- A refund typed in with a real reason.
- The counter card printed and taped to a wall.
- The printed day-close sheet next to a coffee.

## Rules for every cut

- Never show a figure that was not produced by the build being filmed.
- Never say "confirmed" for something the app calls *seen* or *submitted*.
- If a feature is switched off on screen, say so — a quiet screen is a choice, not a missing feature.
- Each cut must be regenerable: manual → screenshots → captions.
