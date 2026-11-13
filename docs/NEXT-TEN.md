# What is actually open

Rewritten 2026-11-12 at v0.31.59, and extended the same day with the review's proposals. The old list
was written at v0.31.25 and had drifted: five of its ten items had shipped by the time anyone read it
again, and one pointed at a file that does not exist. A list that lies is worse than no list, because
the next person trusts it.

Two rules for this document:

- an item stays only while it is true;
- every item says how we would know it is finished, and whether a robot can finish it.

**Part 1** is what the build cannot yet do. **Part 2** is the proposal queue from the 2026-11-12 review,
in the order I would take it. Nothing in Part 2 is promised; it is a queue with reasons.

---

# Part 1 — open in the product

## 1.1 Prove the camera on a real phone — **blocked on a human thumb**

`public/_headers` ships `Permissions-Policy: camera=(self)` and the Scan button asks for
`facingMode: 'environment'`. Everything up to the permission prompt is right; only a phone can confirm
the rest.

**Done when:** a shopkeeper taps "Scan the zpub", allows the camera, and the public code lands in the
field. **A robot cannot finish this.**

## 1.2 A funded sale on a real chain — **blocked on a captcha**

Every sale so far has been a demo or a rehearsal. The LTC testnet faucet (`cypherfaucet.com`) sits
behind Cloudflare Turnstile, which needs fingers.

**Done when:** real testnet coins move to a counter address, slip reports `seen`, then `confirmed`, and
the day close carries the sale. Then the same again on mainnet, with money that matters.

## 1.3 A stranger runs the trial — **blocked on a person**

`docs/MERCHANT-TRIAL-LTC.md` has never been run by anyone who did not write it. Every "it works" so far
is the author with a robot browser.

**Done when:** one shopkeeper, unaided, gets from a blank phone to a printed day close, and the notes
from that run are attached to this file.

## 1.4 Print on payment — **a code job, open** (see 2.7)

A receipt prints through the browser's own print window at 80mm, which is fine. What is missing is
printing *by itself* when money lands, and a raw ESC/POS path for the printer many cafés already own
(no auto-cut, no second copy for the kitchen).

**Done when:** a setting exists and a real thermal printer produces a receipt without a tap.

## 1.5 The customer leaves with nothing — **a design job, open, honesty-sensitive** (see 2.6)

There is a paper receipt, a proof code (`docs/PROOF.md`) and an `?explain=1` page, but no "here is your
record" a customer can keep on their own phone after walking out.

**Done when:** a customer can keep something, and that something says out loud what slip did **not**
observe. **Any version that implies a signature is refused** — slip holds no key.

## 1.6 Two counters, one set of books — **open, and it breaks a rule** (see 2.8)

One browser is one till. Two phones are two sets of books and a backup file between them. This is a
consequence of no server and no accounts, not an oversight.

**Done when:** either a two-device story exists that keeps the no-custody rule, or the site says plainly
that a shop with two counters keeps two tills.

## 1.7 No real install on a phone since the icon fix — **blocked on a device**

Chromium's own installability verdict is green locally and live, and the wordmark icon is on the
manifest. No Android or iOS launcher has been asked since.

**Done when:** a phone offers "Install" and the home-screen icon is the slip wordmark.

## 1.8 The printed A4 has never touched paper — **blocked on hardware**

The A4 day close is measured in Chromium's PDF output (one page, columns right, footer intact). Nobody
has printed it on a shop's printer.

**Done when:** a page comes off a real printer with no column shifted and the totals right.

## 1.9 The tap targets — **known, not urgent** (see 2.10)

`tap-audit` reports 0 controls under the 44px floor and ~164 between 44 and 48px. The 48px floor is the
money-path rule; the rest is comfort, not a defect.

**Done when:** the count between 44 and 48 is under 40, or the audit is re-scoped with a reason.

---

# Part 2 — the queue (proposals from the review, 2026-11-12)

Ordered by what costs the merchant most if we skip it. The first three are one small ship, and none of
them is a visible feature — they are about the shop's data surviving the week.

## 2.1 Ask the browser to keep the data — **do first, small**

`navigator.storage.persist()` is never called. Everything a shop owns lives in localStorage, and a
browser evicts site data under disk pressure — iOS is the worst offender, and a till that sits closed
for a week is exactly when it happens.

**Do:** call it once at boot, remember the answer, and say it plainly in Settings ("the browser has
agreed to keep this shop on this device" / "it has not — take a backup today"). When the answer is no,
that sentence is the prompt.

**Done when:** Settings shows a real answer read from `navigator.storage.persisted()`, and a supporting
phone reports persistent storage after first open.

## 2.2 A backup nudge with a date — **do first, small**

The encrypted `.slip` file is now the **only** recovery for a lost phone, a wiped browser, or a forgotten
till-lock PIN. Nothing on screen ever says when it was last taken.

**Do:** record the date of the last successful export; put *"Last backup: 12 days ago"* on the day close
with the button beside it; say "never" plainly when it is never.

**Done when:** the day close states the age of the last backup, and it changes after an export.

## 2.3 Say something when a save fails — **do first, small**

`save()` is a bare `setItem`. A full disk throws inside a click handler, and the sale looks taken but
was never stored. There is no `try/catch` and no quota handling anywhere in the codebase.

**Do:** wrap the store, keep one visible "not saved" state that cannot be missed (a banner, not a
toast), and stop the till looking settled while the last write failed.

**Done when:** a forced quota error produces a visible warning and the sale is not shown as recorded.

## 2.4 A receipt number the customer and the accountant can both use — **next visible thing**

Invoice ids are `inv_<time>_<random>`, so a receipt today cannot be matched to a drawer count, and a
missing one looks like a deletion rather than a gap.

**Do:** a per-day sequence ("sale 14 of the day") printed on the roll, the A4 close and the CSV, with
cancelled sales numbered and marked rather than skipped.

**Done when:** every completed sale in a day carries a number, the numbers are unbroken across the day,
and the printed close and the CSV agree with each other and with the screen.

## 2.5 "Yesterday was never closed" — small, and it protects the books

Nothing tells a merchant they skipped a close, so two days quietly blend into one money-in figure.

**Do:** on the first open of a new day, one line above the till — *"Yesterday was not closed; its
takings are still open"* — with the button to close it.

**Done when:** a shop that skips a close is told on the next open, and the line goes when it is closed.

## 2.6 Something the customer keeps — the shape for 1.5

**Do:** a QR on the receipt that opens that customer's own copy (the sale, its proof code, and what slip
did not observe), built like `?explain=1`: one self-contained page, no account, no email.

**Done when:** a customer can keep their record on their own phone, and the page refuses to imply a
signature.

## 2.7 Print by itself, and a raw ESC/POS path — 1.4, restated

**Do:** a Setting ("print when money lands"), then an ESC/POS driver for the common 58/80mm printers,
documented per model, with the caveat that a printer is the one thing slip cannot verify.

**Done when:** a real thermal printer produces a receipt without a tap, and the model is named in the doc.

## 2.8 Two counters, one shop — decide, do not drift

**Do:** either the two-device story (a pairing code that merges two tills' books at close, no server;
design note first) or a plain sentence on the site and in the guide — two counters, two tills.

**Done when:** the answer is written, and the guide and the site say the same thing.

## 2.9 The bundle diet — before any feature that adds weight

Wire size is **229 KB against a 230 KB target**. The lock and the overpayment note spent the headroom.

**Do:** find what ships that nobody uses (the gallery path, dead panels, duplicated strings), measure
before and after, and adopt a rule that a feature ship carries its own diet.

**Done when:** there is ≥8 KB of headroom again, measured by `check-budget.mjs`.

## 2.10 Tap targets between 44 and 48 — comfort, not correctness

**Do:** raise the money-path controls to 48 and leave the rest, or re-scope the audit with a written
reason (a number nobody acts on is decoration).

**Done when:** the audit either reports < 40 or states its scope.

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
| Navigation speed | Measured: every tab switch is about one frame of work, no long tasks. Unproven on a real phone, which is 1.7's kind of problem, not this list's. |
| Overpayment passes silently | `receivedAtoms` is recorded, Books marks the row, the printed day close names the extra, and the totals stay at the ask. |
| Anybody can open the till | Till lock: a 4–8 digit PIN, PBKDF2 hash, locks on open and after N quiet minutes. |
| A wizard suite that went red on a slower runner | It waited for `h1`, which the setup screens also have; it now waits for `#tl-charge`. Green on CI. |
