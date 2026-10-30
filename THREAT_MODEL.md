# Threat model

Written down so the claims in the README can be checked against the threats they answer,
and so the limits are visible rather than discovered. Ordered by "who is attacking, and what
do they get".

## 1. The merchant (self-inflicted error) — the most likely loss

| Threat | Mitigation | Residual risk |
|---|---|---|
| Pasting a master/root key instead of an account key, so addresses never match the wallet | depth warning in `resolveScript`, plus the derivation-preview gate | merchant ticks the box without checking — the app cannot prevent carelessness, only make it obvious |
| Pasting a key for the wrong coin (zpub is shared by BTC and LTC) | coin must be chosen explicitly; a warning names the shared prefix | a merchant who ignores the warning gets valid-looking addresses on the wrong chain |
| Typing a price and never checking the sats figure | price check shows both fiat and sats from the same integers | — |
| Losing the phone with no backup | encrypted `.slip` export | only counters/settings are lost; no money is ever at risk |

## 2. A staff member

| Threat | Mitigation | Residual risk |
|---|---|---|
| Reassigning the day's takings to another counter | switching counters requires the till PIN | a shared PIN collapses this to nothing — give each person their own moment at the counter |
| Claiming a shift never happened | hash-chained shift log, printable day sheet | the device owner can rewrite the whole chain (no server, no signature) |
| Reading the merchant's other counters | all counters are visible to whoever holds the device | out of scope: use one device per counter, or a backup + wipe |

## 3. Malware / a compromised device

| Threat | Mitigation | Residual risk |
|---|---|---|
| Address-swapping malware changes the address shown | addresses shown in chunks, with a QR the payer can verify on their own screen | a device-level compromise defeats anything a web app does — but the funds still belong to the merchant's own wallet |
| Clipboard hijack swaps the copied address | copy button copies the address we rendered; the merchant should compare against their wallet's Receive tab | undetectable from inside the page |
| Reading local storage for xpubs | nothing to encrypt that with; local storage is not a safe | an xpub is privacy, not funds |

## 4. Supply chain

| Threat | Mitigation | Residual risk |
|---|---|---|
| A dependency turns malicious and exfiltrates addresses | all dependencies pinned exactly, lockfile committed, no runtime CDN, CSP `connect-src` limited by scheme, and the page is one auditable file | a compromised build-time dependency could still emit a beacon — the fix is reproducible-ish builds and the published SHA-256, not trust |
| A tampered copy of the site is served | reproducible artifact + `SHA256SUMS` + version visible in the About panel | a merchant who never compares the hash gets whatever the host served |
| A browser extension injects a script | the CSP pins the app's own script by hash; injected scripts do not run | an extension can still read what is on screen |

## 5. Network observers

| Threat | Mitigation | Residual risk |
|---|---|---|
| An explorer learns which addresses a merchant watches, and their IP | own-node endpoint, minimal-leak mode, Tor/onion (all planned with the payment engine) | today slip queries nothing at all, so this is currently a non-threat |
| A hostile Wi-Fi rewrites the page in transit | HTTPS with a valid certificate | plain `http://` is redirected, not served |

## 6. The operator of slip (us)

There is no us. No server, no account, no telemetry, no way for this project to reach a
merchant's device or data. The only leverage anyone has is the code they download — which is
why the artifact is a single file with a published hash.

## Explicit non-goals

- **Tamper-proof records.** The shift log is tamper-*evident*. Without a server or a signature
  scheme, a determined device owner can rewrite history.
- **Hiding the merchant from their own payment provider.** A federation or Lightning provider
  sees what they see.
- **Custody in any form**, including "just for a moment", including refunds. Refunds are the
  merchant's own send, from their own wallet.
