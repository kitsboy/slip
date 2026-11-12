# What is actually open

Rewritten 2026-11-12, at v0.31.59. The old list was written at v0.31.25 and had drifted: five of its
ten items had shipped by the time anyone read it again, and one pointed at a file that does not exist.
A list that lies is worse than no list, because the next person trusts it.

Two rules for this document:

- an item stays only while it is true;
- every item says how we would know it is finished, and whether a robot can finish it.

---

## 1. Prove the camera on a real phone — **blocked on a human thumb**

`public/_headers` ships `Permissions-Policy: camera=(self)` and the Scan button asks for
`facingMode: 'environment'`. Everything up to the permission prompt is right; only a phone can confirm
the rest.

**Done when:** a shopkeeper taps "Scan the zpub", allows the camera, and the public code lands in the
field. **A robot cannot finish this.**

## 2. A funded sale on a real chain — **blocked on a captcha**

Every sale so far has been a demo or a rehearsal. The LTC testnet faucet (`cypherfaucet.com`) sits
behind Cloudflare Turnstile, which needs fingers.

**Done when:** real testnet coins move to a counter address, slip reports `seen`, then `confirmed`, and
the day close carries the sale. Then the same again on mainnet, with money that matters.

## 3. A stranger runs the trial — **blocked on a person**

`docs/MERCHANT-TRIAL-LTC.md` has never been run by anyone who did not write it. Every "it works" so far
is the author with a robot browser.

**Done when:** one shopkeeper, unaided, gets from a blank phone to a printed day close, and the notes
from that run are attached to this file.

## 4. Print on payment — **a code job, open**

A receipt prints through the browser's own print window at 80mm, which is fine. What is missing is
printing *by itself* when money lands, and a raw ESC/POS path for the printer many cafés already own
(no auto-cut, no second copy for the kitchen).

**Done when:** a setting exists and a real thermal printer produces a receipt without a tap.

## 5. The customer leaves with nothing — **a design job, open, honesty-sensitive**

There is a paper receipt, a proof code (`docs/PROOF.md`) and an `?explain=1` page, but no "here is your
record" a customer can keep on their own phone after walking out.

**Done when:** a customer can keep something, and that something says out loud what slip did **not**
observe. **Any version that implies a signature is refused** — slip holds no key.

## 6. Two counters, one set of books — **open, and it breaks a rule**

One browser is one till. Two phones are two sets of books and a backup file between them. This is a
consequence of no server and no accounts, not an oversight.

**Done when:** either a two-device story exists that keeps the no-custody rule, or the site says plainly
that a shop with two counters keeps two tills.

## 7. No real install on a phone since the icon fix — **blocked on a device**

Chromium's own installability verdict is green locally and live, and the wordmark icon is on the
manifest. No Android or iOS launcher has been asked since.

**Done when:** a phone offers "Install" and the home-screen icon is the slip wordmark.

## 8. The printed A4 has never touched paper — **blocked on hardware**

The A4 day close is measured in Chromium's PDF output (one page, columns right, footer intact). Nobody
has printed it on a shop's printer.

**Done when:** a page comes off a real printer with no column shifted and the totals right.

## 9. The tap targets — **known, not urgent**

`tap-audit` reports 0 controls under the 44px floor and ~164 between 44 and 48px. The 48px floor is the
money-path rule; the rest is comfort, not a defect.

**Done when:** the count between 44 and 48 is under 40, or the audit is re-scoped with a reason.

---

## Closed since the old list (kept so nobody re-opens them)

| Item | Outcome |
| --- | --- |
| Setup reads as a path, not a form | Named steps, remaining count in words, and every blocked Continue still focusable (D-83). |
| Retire the v1 skin | `?skin=v1` is gone; `pre-v2-2026-11-10` is the rollback story. |
| One honest failure screen | `Failure.tsx` — what happened / what is safe / what to do next. |
| Find a sale again | Search over the day's rows in Books. |
| The four real failure paths | `states.mjs` and `boot-fallback.mjs` cover no rate, no network, wrong chain, wallet offline. |
| A one-page "what slip cannot do" | The limits panel in More, behind one 48px row. |
| Ship the Fable brief | There is no `BRIEF-FOR-FABLE-V3.md`; the V2 brief is the shipped one. |
| Keep the public repo small | Generated screenshots are untracked and ignored. |
| Navigation speed | Measured: every tab switch is about one frame of work, no long tasks. Unproven on a real phone, which is item 7's kind of problem, not this list's. |
| Overpayment passes silently | `receivedAtoms` is recorded, Books marks the row, the printed day close names the extra, and the totals stay at the ask. |
| Anybody can open the till | Till lock: a 4–8 digit PIN, PBKDF2 hash, locks on open and after N quiet minutes. |
