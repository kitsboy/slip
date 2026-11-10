# The Litecoin trial — a stranger's hands

Everything slip knows about itself was measured by the person who built it. This is the script for the
first trial where the hands are somebody else's, and the answer we want is not "it worked" but the list
of moments a shopkeeper hesitated.

Scope: **Litecoin and Litecoin testnet only.** Nothing here touches Bitcoin, Silent Payments, Fedimint
or Lightning — Litecoin has no Lightning in slip, and the trial must not blur that.

## Before the trial (5 minutes, no shopkeeper needed)

1. Open <https://slip.giveabit.io> on the phone that will be used, not on a desktop.
2. Load the demo (`See it with pretend sales`) and tap through every tab once. This only warms the
   cache and confirms the page opens on the shop's wifi.
3. Have a real Litecoin wallet on a second device, able to show an address for a pasted **public** key
   (`Ltub`/`Mtub`/`zpub`) at path 0/0.
4. Have a Litecoin testnet wallet too, and a faucet tab open. **No mainnet money on the first run.**

## The script (say as little as possible)

| # | Ask | What we are watching for |
|---|---|---|
| 1 | "Set up a shop that takes Litecoin testnet." | Where does the person look first? Does the network note under the picker get read? |
| 2 | "Paste this key. It is public." | Does the key go in without a fight? Is the address preview trusted or checked? |
| 3 | "Compare address 0/0 with your wallet." | Do they actually compare, or tick "They match" to get past the screen? |
| 4 | "Sell me a coffee for 0.0005 LTC." | The rate line, the amount pad, the Charge button. |
| 5 | "Now say I paid, but I have not." | Does the till refuse to say Paid? Does "check now" explain itself? |
| 6 | "Print the receipt." | Torn edge, QR scan with a second phone camera. |
| 7 | "Close the day." | The books: does the totals line mean anything to them? |

Do not explain. Write down every question asked, verbatim, and every pause longer than three seconds.

## What the rehearsal already found (2026-11-10, before a human was involved)

Run on a real browser against the shipped build, with a **Litecoin testnet** key and a price source
pointed at a dead address:

- The wizard derived `my6RhGaMEf8v9yyQKqiuUYniJLfyU4gzqe` — a correct Litecoin testnet address, `m…`,
  version byte 0x6f — from a testnet key, first try.
- The **failure block appeared on a real Litecoin shop** and read as designed: what happened, what is
  safe ("Nothing was taken. A rate is only a number for the receipt"), what to do.
- **Bug found and fixed:** it said *"slip does not know what a Bitcoin is worth"* on a Litecoin till.
  The block now takes the chain from the wallet; a test pins it (`tests/failure.test.tsx`).
- **Bug found and fixed:** the last setup button used `disabled`, so a blocked shopkeeper could not
  focus it and never learned why it was blocked. It now keeps focus and says which tick is missing
  (D-83).
- **Not yet proven:** a real phone, a real camera scan, and a real Litecoin payment seen by the
  till's own engine. Those need the trial itself.

## After the trial

Write the hesitation list into `docs/RESUME-*.md` under the date, ranked by how much it cost the
person. Fix the top three before the next trial; do not fix the bottom ten by guessing.

## Three clicks only a human can do (one sitting, about ten minutes)

Everything else in this list is done or done by a script. These three need fingers because they meet a
captcha, a camera, or a stranger.

1. **Claim test coins into a real slip address.** Open <https://cypherfaucet.com/ltc-testnet>, paste
   `my6RhGaMEf8v9yyQKqiuUYniJLfyU4gzqe` (a Litecoin testnet address derived by slip from a throwaway
   test key — no money, no secret), tick the captcha, claim 0.01 tLTC. Then open the till that owns
   that key and press **check now**: the receipt should move from *awaiting* to *seen*, and to
   *confirmed* after a block. If it does not, that is the finding of the year.
2. **Scan a receipt with a real camera.** Charge any demo sale, print or show the receipt, and point a
   second phone's camera at the QR. It must read the address the receipt prints.
3. **Run the seven-step script above** with one person who has never seen slip, and write down every
   pause. No explaining.

What the desk has already proved, so the trial is not starting from zero: the engine was fed a **real
mined Litecoin testnet transaction** (tip block, real address, real amounts) through the same status
function the till uses — a covered amount read *confirmed*, an impossible amount read *not confirmed*
(`tests/ltc-chain-live.test.ts`, run with `SLIP_LIVE_CHAIN=1`).
