# Security policy

## The invariant

**slip cannot spend.** There is no wallet, no key, no signature and no send function in this
codebase. Every address it displays is derived from material that is only capable of
*watching*. A bug here can at worst show a merchant a wrong address for their own funds — it
cannot move them.

That is enforced in code and asserted in tests, not promised in prose:

| Guarantee | Where it is enforced | Test |
|---|---|---|
| No seed phrase accepted | `src/core/keys.ts` → `assertNotSecret` | `tests/keys.test.ts` (refusal + no echo) |
| No `xprv/yprv/zprv/Ltpv/Mtpv/ttpv/uprv/vprv` accepted | same, plus a version-byte check on the payload | `tests/keys.test.ts` |
| No WIF or bare 32-byte hex accepted | `assertNotSecret` | `tests/keys.test.ts` |
| Refusals never repeat the secret | `SecretRefused` carries a *kind* only | `tests/keys.test.ts`, `tests/accounts.test.ts` |
| Only the injected bundle can run | CSP pins the inline script by SHA-256 at build time | `vite.config.ts`; verified on the live host |
| Nothing is fetched from a third party | no runtime CDN, no fonts, no analytics | `tests/e2e/*` assert zero external requests |

## Scope

In scope, and worth reporting:

- Any path that accepts or transmits private key material.
- An address derived differently from what the merchant's wallet shows.
- A payment marked paid that slip did not observe.
- Bypassing the derivation-preview gate (`acknowledgedAt`) or the hand-off PIN.
- XSS through merchant-supplied text (labels, item names, receipt footers).
- Anything that causes a network request the merchant did not configure.

Out of scope:

- Losses caused by paying a wrong address that the merchant typed elsewhere.
- A device that is already compromised (keyboard, clipboard, screenshots).
- The Lightning provider or federation a merchant chooses falling over.
- The tamper-*evident* (not tamper-proof) nature of the local shift log — documented, not a
  defect.

## Reporting

Email `security@giveabit.io` with the version (`About` panel) and steps to reproduce. Please
do not open a public issue first. This is a one-person project: expect an acknowledgement
within a few days rather than an hour, and no bug bounty — only thanks and credit.

## What this app can never do

- Move, sign for, recover, reverse or hold funds.
- Prove a third party's service is honest or online.
- Prevent the owner of the device from editing local records.
- Recover your counters if you lose the device with no backup.
