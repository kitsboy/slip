# Privacy

Short version: **nothing leaves the device unless you configure it to.**

## What is stored, and where

Everything lives in your browser's local storage on the device you are using:

| Stored | Why | Sensitive because |
|---|---|---|
| Counter accounts (labels, xpubs or descriptors, first address, index) | so the till knows which wallet each counter pays into | an xpub reveals **every past and future address** of that wallet |
| Till PIN **hash** (PBKDF2-SHA256, 200k iterations, per-PIN salt) | to name who is holding the device | not sensitive on its own; it gates people, not money |
| Shift log (hash-chained hand-off records) | so a shop can tell who held which counter and when | reveals staffing times |
| Settings, catalog, prices | to run the till | commercial information |

There is **no** account, no email, no phone number, no device identifier, and no
cross-device sync. Nothing is uploaded anywhere by slip. Backups are files **you** create and
**you** store, encrypted with a passphrase that never leaves your device.

## What leaves the device

Nothing, by default. This build makes **one** network request: the page fetching itself.

The page tells you this itself — the footer reads `network requests to other servers: 0`,
counted from the browser's own performance log rather than from a promise in a README.

When the payment engine lands, detection needs a chain data provider (an explorer), and you
will choose it. At that point note the trade-off plainly: **a public explorer learns which
addresses you ask about, and your IP address.** Options being built for that:

- point slip at your own Esplora / Electrs / mempool instance;
- a **minimal leak mode** that derives and displays addresses but queries nobody;
- an onion endpoint for use over Tor.

Fiat rates, when added, will be the same shape: provider lists you can disable, cached values
with a visible age, and no silent "latest price" call.

## Third parties in the delivery path

slip is a static file served by Cloudflare Pages. That means Cloudflare's edge sees the
request (as any web host would) and records standard access data. Two details worth knowing:

1. The zone currently injects Cloudflare's bot-detection script into the page. **slip's own
   Content-Security-Policy refuses to execute it**, so it never runs — but the bytes arrive.
   The same file served from `slip-6d6.pages.dev` carries no injection.
2. A merchant who wants none of that can host the single `index.html` anywhere, including
   from a USB stick. It works from `file://`.

## Data you should treat carefully

- **An xpub is not public.** Anyone holding it can see every address and every payment of
  that wallet, forever. That is why the backup file is encrypted even though it holds no keys.
- **The shift log** reveals when your shop is staffed. Encrypt the backup.
- **Your PIN** is only stored as a hash. If you forget it, no one can recover it — and no one
  needs to: it protects nothing but the hand-off, and a device reset re-enrols counters from
  your xpubs.

## Deleting your data

Clear the site's storage in your browser (Settings → Privacy → Site data), or use a private
window. Nothing is retained anywhere else, so there is nothing else to delete.
