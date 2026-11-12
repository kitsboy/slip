# Education pack — slip

_Generated from `src/manual/entries.ts` and `src/core/explain.ts`. Regenerate with `npm run docs:education`; `npm run docs:audit` fails if a card is missing here._

## The four lessons (14 minutes total)

| # | Lesson | Minutes | Cards used |
|---|---|---|---|
| 1 | What slip is (and is not) | 3 | wallets, demo-link, explainer, glossary |
| 2 | Take a sale, honestly | 4 | till, lightning, livetest |
| 3 | Close the day and keep proof | 4 | history, anchor, verify, letter |
| 4 | Hand it over and keep it safe | 3 | pair, backup, assist, selftest |

## Lesson 1 — What slip is (and is not) (3 min)

**Say:**
- slip is a till with no company behind it: no account, no server, no way to spend your money.
- A wallet here is only a public address slip watches. The money goes to your wallet, not to slip.
- If anything ever asks for a seed phrase, it is not slip.

**Show:**
- `wallets` — Your wallets: slip never holds money, so a wallet here is only a public address slip watches for you.
- `demo-link` — The demo shop: A pretend café so a stranger can take a sale before owning a wallet.
- `explainer` — The customer page: One plain page for a customer who has never used bitcoin.
- `glossary` — The words, in English: Every term on the till has a plain meaning, and the exact name for whoever wants it.

**Check before moving on:**
- [ ] They can say where the money lands.
- [ ] They know slip cannot refund or move funds.

## Lesson 2 — Take a sale, honestly (4 min)

**Say:**
- Seen means the payment is still in the queue. Paid means it is inside a block.
- Only a mined payment produces a receipt — the app will not call a queued payment paid.
- Cash? Press “I have the money”. The receipt will say a human confirmed it.

**Show:**
- `till` — Take a payment: Ring up a sale in four taps and show a QR that pays your wallet directly.
- `lightning` — Lightning payments: Coffee-sized sales belong on Lightning, and they can still land in your own wallet.
- `livetest` — Live 100 sat test: Prove a rail works with real money before a real price depends on it.

**Check before moving on:**
- [ ] They can explain seen vs paid without notes.
- [ ] They know the exact-amount warning matters.

## Lesson 3 — Close the day and keep proof (4 min)

**Say:**
- The day close counts completed sales only, split by how the money arrived.
- Stamping a day gives you a digest: proof the books existed then, not proof of who wrote them.
- A receipt proof is a record the customer keeps; you can check one in seconds.

**Show:**
- `history` — History and the day close: The sheet your accountant asks for, produced from the sales you actually took.
- `anchor` — Day book and proof: Stamping a day proves the books existed then, without trusting anyone.
- `verify` — Check a receipt: A customer can prove a sale happened without asking you for anything.
- `letter` — Weekly letter: A week of takings written as sentences you can print and keep.

**Check before moving on:**
- [ ] They can read a day close aloud.
- [ ] They know stamped is not the same as confirmed.

## Lesson 4 — Hand it over and keep it safe (3 min)

**Say:**
- A handover note tells the next person what is in flight.
- One encrypted file holds wallets, PIN, staff log and books.
- Anything on screen that reads as noise can be switched off in Settings → Assistance.

**Show:**
- `pair` — Pair another device: Move a wallet to a second till with a QR, because public material needs no secrecy.
- `backup` — Backups: One encrypted file holds your wallets, your PIN, your staff log and your books.
- `assist` — Assistance switches: Every helper on screen can be turned off, so a busy counter can stay quiet.
- `selftest` — Prove it works: Check that the copy of slip on this device still does its arithmetic correctly.

**Check before moving on:**
- [ ] They can hand over and read the note.
- [ ] They know where backups live and what is inside.

## Every card, in its own words

### The words, in English  `glossary`

Every term on the till has a plain meaning, and the exact name for whoever wants it.

1. Open Learn and read the term that stopped you.
1. Plain meaning first; the exact name and definition sit underneath it.
1. Nothing here is required reading — it is a reference, not a step.

**Limit:** A glossary can explain a word; it cannot make slip hold money. The no-custody limits are unchanged.

### Your wallets  `wallets`

slip never holds money, so a wallet here is only a public address slip watches for you.

1. Not sure where the code is? Pick your wallet app at the top of Setup — slip names the exact taps for it.
1. Paste the public code your wallet app gives you — one code, not a seed phrase.
1. Compare address 0/0 with the same address in your own wallet.
1. Tick the box only when they match, then save.

**Limit:** A wallet is unusable until you confirm address 0/0 yourself — slip will not do it for you.

### Take a payment  `till`

Ring up a sale in four taps and show a QR that pays your wallet directly.

1. Pick the wallet taking this sale and enter the rate you were quoted.
1. Tap items, or type a custom amount, or use tip jar mode.
1. Charge. The QR names the exact amount and the reserved address.
1. Watch the status: seen means it is on its way. Paid means it landed.

**Limit:** slip can only check a payment while the payment screen is open, or at the next launch.

### Lightning payments  `lightning`

Coffee-sized sales belong on Lightning, and they can still land in your own wallet.

1. Enter your Lightning address (name@wallet.example).
1. Type the amount and rate, then request an invoice.
1. Show the QR. slip asks your wallet every five seconds whether it settled.

**Limit:** If your wallet gives no verify link, the sale can only be confirmed by eye — and slip says so.

### Rent and standing requests  `requests`

Money that arrives on a schedule still needs a due date and an address.

1. Name it, choose the wallet, the amount and how often.
1. Show the request QR when it is due.
1. Mark paid to roll it forward.

**Limit:** A request is an ask, not a payment: only a completed invoice proves money arrived.

### History and the day close  `history`

The sheet your accountant asks for, produced from the sales you actually took.

1. Pick a day.
1. Read the split by rail, with refunds subtracted.
1. Download the CSV or print the close sheet.

**Limit:** Only completed sales count as takings; a manual line is stated separately from an observed one.

### Check a receipt  `verify`

A customer can prove a sale happened without asking you for anything.

1. Scan or paste the proof text under the receipt QR.
1. slip compares the invoice, address and amount against its own books.

**Limit:** A proof is a record, not a signature: it cannot prove who wrote it, only what was recorded.

### Day book and proof  `anchor`

Stamping a day proves the books existed then, without trusting anyone.

1. Choose the day and read the digest.
1. Press stamp to submit it to a public calendar.
1. Keep the file; re-hash later to prove nothing changed.

**Limit:** Stamped is not confirmed: the Bitcoin attestation arrives in the calendar’s own time.

### Watchlist  `watchlist`

A supplier or a landlord, watched without being touched.

1. Add a name, an address and its network.
1. Press check to see the balance and the moment it was read.

**Limit:** A watched address can never be spent from: there is no key here.

### Pair another device  `pair`

Move a wallet to a second till with a QR, because public material needs no secrecy.

1. Choose a wallet and show its code.
1. On the other device, scan or paste the code and import.

**Limit:** An imported wallet arrives UNCHECKED: that device must confirm address 0/0 before taking money.

### Silent Payments  `silentpay`

A private receive address your customer’s wallet can pay to a fresh one-time address.

1. Paste your sp1 or tsp1 address.
1. Enter the amount and rate, then show the QR.
1. Record the sale as a manual confirmation.

**Limit:** slip cannot watch an sp1 address: detection needs your scan key, which slip will never hold.

### The demo shop  `demo-link`

A pretend café so a stranger can take a sale before owning a wallet.

1. Open the Manual and press “open the demo shop”.
1. Take a sale: it becomes paid on its own after a few seconds, because the explorer is simulated.
1. Try the Lightning card too: the address is pre-filled and settles in about four seconds.
1. Press exit demo when you are done. Your real books are untouched — the demo has its own drawer.

**Limit:** Demo money is pretend and the explorer is simulated. Nothing leaves the device.

### Find a sale  `findsale`

A customer comes back with a receipt and no invoice number.

1. Type the amount, the end of the address, the time, or the invoice id.
1. The day’s list narrows to matches; the day’s totals stay beside it.

**Limit:** It searches this device’s books only — another till’s sales are not here.

### Quiet clock mode  `wallclock`

Between customers, the till should look like a shop, not a spreadsheet.

1. Switch it on in Settings → Assistance.
1. The till shows the time, today’s takings and the last sale.

**Limit:** It is display only: nothing is taken while it is showing.

### Live 100 sat test  `livetest`

Prove a rail works with real money before a real price depends on it.

1. Switch it on in Settings → Assistance.
1. Choose Lightning and paste your own Lightning address, or signet and paste a signet address.
1. Scan and pay 100 sats; slip watches it settle.

**Limit:** It spends your money, not slip’s — slip has none. Test coins on signet come from a faucet.

### Weekly letter  `letter`

A week of takings written as sentences you can print and keep.

1. Switch it on in Settings → Assistance.
1. Read the week, then print it if you want it on paper.

**Limit:** Nothing is emailed: there is no server to email from.

### The customer page  `explainer`

One plain page for a customer who has never used bitcoin.

1. Print the QR from this card and stand it by the till.
1. A customer scans it and reads what happens when they pay.

**Limit:** It explains; it does not take a payment. The payment QR is on the till.

### Assistance switches  `assist`

Every helper on screen can be turned off, so a busy counter can stay quiet.

1. Open Settings and scroll to Assistance.
1. Switch off anything that reads as noise — explanations, rings, the footer digest, rehearsal.
1. Press Save settings. Nothing about how money is handled changes.

**Limit:** Rehearsal is a practice mode: a rehearsed sale is never written to the books and never watched.

### Prove it works  `selftest`

Check that the copy of slip on this device still does its arithmetic correctly.

1. Press run the check.
1. Read the five ticks: address, amount, sats, QR, proof.

**Limit:** It proves the maths has not been altered — not that the whole app is safe. slip still holds no keys.

### This manual  `manual`

Every panel explains itself here, in the same words the build checks.

1. Search for the plain word you would use — cash, rent, proof.
1. Read the limit line before relying on a feature.

**Limit:** If a panel is missing from this page, it is missing from the app — the build fails otherwise.

### Backups  `backup`

One encrypted file holds your wallets, your PIN, your staff log and your books.

1. Choose a passphrase you will remember.
1. Export the file and keep it somewhere you would keep a bank statement.
1. To restore, preview the file first, then confirm.

**Limit:** The file holds public wallet material only. If you lose it, your money is still safe — only the records are lost.

### Till lock  `lock`

A PIN that keeps a passer-by out of the day’s takings when the phone is left on the counter.

1. Settings → Till lock → type a PIN twice → Set the PIN.
1. Choose how long it may sit untouched before it locks, or Lock now.
1. It asks for the PIN every time the page is opened.

**Limit:** 

### A payment above the ask  `overpaid`

What slip says when more money arrives than the sale asked for — and what it does not do.

1. The receipt says how much arrived and by how much it exceeded the ask.
1. Books marks the row "over by …", and the printed day close names it in one line.
1. Check with the customer; refund from your own wallet if it was a mistake.

**Limit:** 

### Settings  `settings`

The shop’s name, currency, tax, explorer and rate source in one place.

1. Change a value.
1. Press save — nothing is applied until you do.

**Limit:** The rate endpoint is optional: leaving it empty means you type the rate, which is the safest default.

## Figures worth explaining on camera

| Figure | One sentence |
|---|---|
| The rate you entered | How many of your currency one whole bitcoin is worth right now. Every price on the till is worked out from this one number. |
| The amount to ask for | The price in satoshis, rounded up so you are never short by a fraction of a coin. |
| Satoshis | The smallest unit of bitcoin: one hundred million of them make one bitcoin. |
| Payment status | Seen means the money is in the queue. Paid means it is inside a block and cannot be taken back easily. |
| The day digest | A fingerprint of every completed sale today. If one number in the books changed, the fingerprint would not match. |
| How the money arrived | On-chain is a normal bitcoin payment. Lightning is the instant one. Manual means a human confirmed it. |
| Address number | Each sale gets its own numbered address, so two customers can never pay the same place by accident. |
| The address | Where the money goes. It belongs to your wallet, not to slip — slip only watches it. |
| The receipt proof | A short line of text naming the sale, the address, the amount and the time. Anyone can keep it and check it later. |
| Refund | A note that you gave money back, with the method and a reference. |
| Net | What you took after refunds are subtracted. |

## Claims we can safely make

- “No server, no account, no keys.”
- “Seen is not paid; only a mined payment becomes a receipt.”
- “The money goes to your wallet, not to slip.”
- “Stamped means the digest was submitted — the Bitcoin attestation arrives later.”
- “A manual line is a human's word, and the day close says how much of it was manual.”

## Claims we must never make

- That slip holds, moves, refunds or recovers money.
- That a mempool payment is confirmed.
- That a Silent Payment can be watched without the wallet's scan key.
- That a demo or a rehearsal involved real money.
