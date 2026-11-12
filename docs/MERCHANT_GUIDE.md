# Merchant guide

Everything here happens in your own wallet and your own browser. slip has no account,
no password to reset and nobody to call — so this guide is written to be the only thing
you need.

---

## 0. The guided path

On the first screen press **set up your shop**. Five screens, about a minute:

1. **Welcome** — what slip is, and the one thing it will never ask for.
2. **Your shop** — name, currency, tax. (These are the numbers every sale will use.)
3. **Your wallet** — paste an xpub or descriptor, then confirm address 0/0 against your wallet. *You cannot skip this: the Continue button stays disabled until you tick the box.*
4. **Who holds the till** — a 4–8 digit PIN (skippable; the hand-off will ask for one).
5. **Ready** — a summary you can read before taking money.

You can leave the wizard at any point with **Leave setup**, and re-run it later
with **run setup again** in the header. The tabs also leave setup. Nothing in it can take a payment.

## 1. What you need before you start

- A phone, tablet or laptop with a modern browser (Chrome, Safari, Edge, Firefox, Brave).
- A Bitcoin or Litecoin wallet **you control** — one that can export an `xpub` or a
  default descriptor. Good choices: Sparrow, BlueWallet, Coldcard, Krux, Jade, Electrum.
- For Lightning later: your own Lightning address (Alby Hub, LNbits, Phoenix).

> **The one rule.** Never paste a seed phrase, an `xprv`, or a private key into slip. It
> will refuse them, wipe the field, and tell you why — but the safest habit is to never
> copy them anywhere except your own signer.

## 2. Get your wallet's public key

**Sparrow (desktop):** open your wallet → **Settings → Keystore** (or the wallet's
**Receive** tab → *Export*) → copy the **account xpub** or the **default descriptor**.
Sparrow shows descriptors like `wpkh([a1b2c3d4/84'/0'/0']xpub…/0/*)#checksum`.

**BlueWallet (phone):** open the wallet → **⋯ → Wallet Info → XPUB** → copy.

**Coldcard:** *Advanced → Address Explorer* shows addresses; for the key itself use
**MicroSD → Export Wallet → Generic JSON** or *Paper Wallet* → the **account xpub** in the
exported file. For a BIP-85 child account see §6.

**Electrum:** **Wallet → Information → Master Public Key** (this is the account xpub in
Electrum's format).

You want an **account-level** key — one that sits at `m/84'/0'/0'` (or `m/44'`, `m/49'`,
`m/86'`). If slip warns *"this key sits at depth N, not 3"*, you have grabbed a master or
root key by mistake; go back and copy the account key.

## 3. Add your first counter

A **counter** is one till. A shop with one counter has one; a shop with a front counter and
a food truck has two, each paid into its own account.

1. Open slip and find **Counters & staff hand-off**.
2. Give it a name — *Front counter*.
3. Pick the coin and network. **Start on a test network** (Signet for Bitcoin, LTC testnet
   for Litecoin) until you have seen a full cycle work.
4. Paste your xpub **or** descriptor into *Child account xpub*.
5. slip derives the first five addresses. Compare **0/0** with the Receive tab of your
   wallet. If they are identical, tick the confirmation box and **Save counter**.

If they differ, **stop**. Do not take a payment. That mismatch is the only bug in this app
that can cost you money, and it is why the box exists.

## 3b. Take a payment

1. Pick the **wallet taking this sale**.
2. Enter the **rate** you were quoted (slip never fetches one for you yet, so nothing can
   silently reprice your goods).
3. Load a **template** (Café, Market, Services) or use **custom amount**, or **tip jar mode**.
4. Tap the items. The charge figure is in sats, computed by round-up so you are never short.
5. **Charge** → a QR appears with the amount, the address and the network.
6. The customer pays. slip checks the address while the screen is open:
   - **waiting for payment** — nothing seen yet
   - **seen in mempool — not mined yet** — a 0-conf promise, not a payment
   - **paid — seen on chain** — mined, and a receipt is issued
7. If the customer pays cash, press **I have the money (manual)** — the receipt will say a
   human confirmed it, because slip did not observe that payment.

Warnings on the payment screen are deliberate: pay the **exact** amount, on the **right
network**, and never pay an address twice.

## 3c. Take a Lightning payment

1. Put your Lightning address (`shop@yourwallet.example`) in the Lightning panel.
2. Type the amount and the rate, then **request invoice**.
3. Show the QR. If your wallet returns a `verify` link, slip asks it every five seconds and only
   its answer turns the sale into *settled*.
4. If your wallet returns no verify link, slip says so: confirm by eye, and treat it as manual.

Nothing here needs a node, a channel or a credential — and nothing here can spend.

## 3d. Let slip fetch the rate

Settings → **Rate endpoint** (leave the field empty to keep typing the rate yourself) → tick
**Fetch the rate for me**. The quote is stamped with the minute it was read and **refused after ten
minutes**; if the endpoint is down you will be asked to type the rate, never sold a stale one.

## 3e. A second screen for the customer

Press **customer screen** in the till. A window opens showing only the QR, the amount and the
status — no takings, no wallet names, no staff. It talks to the till over the device itself, so
nothing is sent anywhere. If your browser blocks the window, allow pop-ups for slip.

## 3f. Prove the day

Day book panel → pick the date → slip shows how many sales completed and the **day digest** it
computed (on this device, with no network). Press **stamp with a calendar** to submit that digest to
a public OpenTimestamps calendar. The screen then says *submitted* — which is not the same as
*confirmed on Bitcoin*: the calendar upgrades it in its own time, and slip refuses to pretend
otherwise. **re-hash my books** re-computes the digest and tells you if the books no longer match.

## 3g. Check a receipt

Receipts panel → paste the text under a customer's receipt QR → **check receipt**. slip compares the
invoice id, address and amount against the books on this device and says *matches* or *do not treat
it as checked*. Nothing leaves the device.

## 3h. Move a wallet to another device

Pairing panel → choose the wallet → a QR (and a text code) appear. On the other device paste the
code and press **import (unchecked)**. The wallet arrives **UNCHECKED** on purpose: that device has
not compared address 0/0 against your wallet. Open your wallet, confirm, then take money.

## 3i. Watch addresses you do not own

Watchlist panel → name + address + network → **add**. **check** asks your explorer and shows the
balance with the exact minute it was read. A watch entry can never spend: it is a label and an
address, nothing else.

## 3j. Close the day

History & day close panel → pick the day. You get every completed sale, the split by rail
(on-chain / Lightning / manual / other), refunds subtracted, and — stated separately — how much
slip **observed** versus how much a **human** confirmed. **download CSV** gives your accountant
integers plus a BTC column; **print day close** gives a plain-text sheet on white paper.

### When more money arrives than you asked for

It happens: a customer types an extra zero, or pays for two coffees by mistake. slip records what the
source reported arriving, so the receipt says *"a little more arrived than asked"* with both numbers,
the sale is marked **· over by N sats** in History, the printed receipt carries a `Received …` line,
the printed day close names it in one sentence, and the CSV has an `overpaid_atoms` column.

The sale still counts **at the amount you asked for** — the extra is named, never added to the day's
totals — and slip cannot send anything back. A refund is something you do from your own wallet, then
record here (see below).

## 3k. Refund something

History → **refund** on the sale → sats, how it went back (on-chain, Lightning, cash, goodwill),
a reference and a reason → **record refund**. slip cannot send money: this is a record of something
you did, and the screen says so. A refund larger than what was received is refused.

## 3l. Split one sale across two wallets

Tick **split this sale** in the till, choose the second wallet and the percentage. Each leg gets its
own address and its own QR; the receipt appears only when both legs are paid.

## 3m. Silent Payments

Silent Payments panel → your `sp1…` (or `tsp1…`) address → amount and rate → **show payment QR**.
Then **record as paid (manual)**, because detecting a Silent Payment needs your wallet's scan key,
which slip will never hold. Your wallet is the authority; slip is the record.

## 3n. Scanning

Any field with a **camera** button can scan a QR where the browser supports it; anywhere else, a USB
keyboard-wedge scanner just types into the field. If a browser has no barcode reader, the button is
absent rather than dead.

## 3o. Turn the noise down

Settings → **Assistance**. Seven switches, all off-able:

| Switch | What it adds |
|---|---|
| Explain a number when I tap it | One plain sentence about a figure, plus its catch |
| Rehearsal mode | Practise a sale; nothing is written and nothing is watched |
| Show hints | Short helper lines under fields |
| Show age rings | A ring that drains as a rate or balance gets older |
| Show the day digest in the footer | Today's book hash |
| Note when the till changes hands | Three lines for the next person |
| Offer the printable counter card | The A4 rules sheet |

Press **Save settings** — the till updates immediately, no reload.

## 3p. Rehearse before a customer is waiting

Switch rehearsal on, then press **rehearse** instead of charge. You get the real QR and the real
flow, and the receipt says **REHEARSAL — nothing was charged**. No address is reserved and nothing
is written to the books.

## 3q. Prove the copy works

Self test panel → **run the check**. Five ticks: address derivation, amount parsing, sats pricing,
QR encoding, receipt proof. It proves the maths has not been altered — not that the whole app is
safe. There is still nowhere to paste a key.

## 3r. The counter card

Settings → Assistance → **print the counter card**. One A4 sheet, black on white: the three rules,
what to do on shift, and the never-list. Tape it behind the till.

## 3s. Lock the till when you step away

Settings → **Till lock**. Type a PIN twice (4–8 digits) → **set the PIN**. Choose how long the till
may sit untouched before it locks itself — 1, 5, 10 or 30 minutes, or never — and use **lock now** at
any time.

A till with a PIN is locked **every time the page is opened**, not only when you ask. When locked there
is no header, no tabs and no books: the lock screen replaces the whole app. Entering the PIN opens it;
a wrong one slows successive tries.

What this is, plainly: **a curtain, not a safe.** The PIN is never stored — only a random salt and a
hash of it — and nothing in your books is encrypted. Anyone with the phone and the browser's own tools
can still read the data. What the lock buys is the ordinary thing: the next person at the counter
cannot open your till.

**Forgotten PIN:** it cannot be reset or recovered. Restore your backup `.slip` file on a fresh device,
or wipe the browser's data for this site and start again. That is why the backup in §5 matters.

## 4. Hand the till to a member of staff

1. Set a **till PIN** (4–8 digits) once. Only a hash of it is stored on the device — the PIN
   itself is never kept, and it can never move money.
2. Choose the counter, type the person's name, enter the PIN, **Hand over**.
3. The till now shows **Held by <name> · <counter>**. Switching to another counter mid-shift
   needs the PIN again, so one person cannot quietly reassign the day's takings.
4. When the shift ends, **Return till**.

Every one of those actions is written into the **shift log** with the hash of the event
before it, so an edited or reordered line is detectable. It is tamper-*evident*, not
tamper-proof: whoever holds the device can rewrite the whole chain. There is no server to
prevent that, and slip will not pretend otherwise.

## 5. Back up, and actually keep the file

1. Enter a passphrase (12+ characters, or a 20+ character phrase).
2. **Export encrypted backup** → you get a `.slip` file.
3. Keep it where you would keep a bank statement. It contains no spending keys, but it does
   contain your xpubs — so it is encrypted even so.

To move to a new phone: install slip, open **Backups**, enter the same passphrase,
**Restore from a .slip file**. Your counters, PIN hash and shift log come back exactly.

## 6. Separate accounts for separate tills (BIP-85)

BIP-85 lets one seed produce independent child wallets — *Front counter*, *Food truck*,
*Market stall* — with no visible link between them. **slip cannot do this for you**, and
that is deliberate: BIP-85 needs your master private key, which this app must never see.

What you do instead, on your own signer:

1. **Coldcard**: *Advanced → Derive BIP-85 Child Seed* → choose an index (e.g. 0 for the
   front counter, 1 for the truck) → it prints a fresh 12/24-word seed.
2. Import that child seed into a wallet (Sparrow, BlueWallet, or a second Coldcard account).
3. Export **that** wallet's account xpub.
4. Paste it into slip as a new counter.

Each counter then has its own addresses, its own index and its own report — and the device
an employee holds never sees anything that links them together.

## 7. Test before real money

The order that costs nothing to get wrong:

1. **Signet** (Bitcoin) or **LTC testnet**: add a counter with a test key, take a test
   payment, watch it confirm.
2. **Mainnet, small amount**: one real sale you can afford to learn from.
3. Then normal business.

Testnet coins are worthless by design — that is the point of them.

## 8. What slip will never do

- It will not ask for a seed phrase, an `xprv`, a WIF or a private key, and it refuses them.
- It will not hold, move, sign for, recover or reverse your money.
- It will not call a server of ours, because we do not have one.
- It will not show "Paid" unless it actually observed the payment.
- It will not claim a method is auto-verified when it cannot see that method.

## 9. If something looks wrong

| What you see | What it means |
|---|---|
| *"slip did not start"* | The page loaded but its script was blocked — usually a stale cached copy. Hard-reload with Ctrl/Cmd + Shift + R. |
| *"Several test networks share this encoding"* | Signet and the Bitcoin testnets use identical addresses. Pick the network you actually mean. |
| *"this address belongs to Bitcoin, not Litecoin"* | You are about to pay into the wrong chain. Nothing was sent. |
| *"needs your check"* on a counter | You have not confirmed address 0/0 against your wallet, so hand-off is blocked. |
| The counter will not hand over | The PIN is wrong, or the account was never checked. |

Nothing in slip can be "reset" by us. If you lose the device and have no backup, you lose
the counter list — never any money, because slip never had any.
