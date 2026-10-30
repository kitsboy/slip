# Self-hosting slip

slip is one file. That is the whole deployment story, and it is deliberate: a merchant
should be able to run their till without an account, a container registry or a CI pipeline.

## Option 1 — Cloudflare Pages (what the public instance uses)

```bash
npm ci
bash scripts/deploy.sh          # bumps the version, builds, deploys, and PROVES the live
                                # page reports that version before recording it in CHANGELOG
```

Project `slip`, free tier: 500 builds a month, unlimited requests and bandwidth for static
assets. A custom domain is a free CNAME to `<project>.pages.dev`.

The deploy script refuses to publish on a red test suite and exits non-zero when the live
origin does not report the new version, so a "successful" upload that never went live is
reported as a failure rather than as shipped.

## Option 2 — any static host

`dist/index.html` is self-contained: HTML, CSS, JS and icons inlined, no external requests.
Upload it to any web server, S3 bucket, GitHub Pages, Netlify, or an onion service. Nothing
else is required.

Copy `dist/_headers` too if your host understands it (Cloudflare Pages and Netlify do); it
carries the response headers that a `<meta>` tag cannot express (frame-ancestors,
referrer-policy, permissions-policy).

## Option 3 — from a USB stick

Open `dist/index.html` by double-clicking it. That path is tested: the app runs from
`file://`, the service worker is skipped (it cannot register there), and per-device storage
falls back to memory — the app tells you so instead of throwing.

## Verifying a build before you trust it

1. Download `index.html` **and** `SHA256SUMS`.
2. `sha256sum -c SHA256SUMS` (on macOS: `shasum -a 256 -c SHA256SUMS`).
3. Open the file and check the **About** panel reports the same version as `CHANGELOG.md`.

slip cannot display the hash of itself — no file can — so the check is deliberately two
halves: the version inside, the hash outside.

## Updating

Replace the file. Old tabs keep running the build they loaded; a till must never reload
itself mid-sale, so there is no silent auto-update. Hard-reload (Ctrl/Cmd + Shift + R) to pick
up a new version.

## What you need alongside it

Nothing. No database, no queue, no API keys, no `.env`. If a future phase adds a chain-data
provider, it is a URL you paste in Settings and can leave empty (minimal-leak mode).
