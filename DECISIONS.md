# Decisions

Every deviation from the build spec, and every assumption made where the spec was
silent, lands here in the same commit that makes it. Spec: `MASTER-BRAIN/03-Projects/slip/SLIP-PLAN.md`.

---

### D-01 — React 18 + Tailwind 3 instead of Alpine/Preact (spec §2)
Cam's explicit call. Cost: ~45 KB gzip of the bundle. Benefit: familiar, hireable,
and the state complexity of a cart + payment engine + admin drawer justifies it.
Measured at P0: whole app is 152 KB raw / 49 KB gzip single file.

### D-02 — Tailwind 3.4, not the CDN, not v4
The CDN script is banned outright (needs network, needs `unsafe-eval`). Tailwind 4
was skipped for v1 because its PostCSS plugin story churns; 3.4 is pinned and
stable. Revisit only if a real need appears.

### D-03 — No byte-identical rebuild claim (spec §17.16)
Dropped. Modern bundlers embed content hashes and timestamps; promising
reproducibility would be a lie. What we DO ship: exact pinned dependency versions,
a committed lockfile, and a published `SHA256SUMS` for every release so two builds
can be compared by a human.

### D-04 — No in-file self-integrity hash (spec §7.9)
Dropped as impossible: a file cannot contain the SHA-256 of itself. Replaced with
the honest equivalent — the build prints the hash, `dist/SHA256SUMS` carries it, and
the About screen shows the same value for the merchant to compare against whatever
they downloaded.

### D-05 — CSP is injected at build time only
The Vite dev server injects inline scripts, so a strict `script-src 'self'` in the
source HTML would break `npm run dev`. The policy is added by a build-only plugin
(`slip-csp` in `vite.config.ts`). Production HTML always carries it; dev never does.

### D-06 — `style-src 'unsafe-inline'` is present, and why that is acceptable
Tailwind is a compiled stylesheet, not inline styles — but React (and any future
inline style attribute) needs `unsafe-inline` for `style`. The XSS risk that matters
is script execution, which stays locked to `'self'`. No `unsafe-eval` anywhere.

### D-07 — `connect-src` is scheme-limited, not host-limited
A merchant can point slip at their own explorer or rate source, which cannot be
enumerated in a static policy. So CSP allows `https: http: ws: wss:` and the
provider layer separately enforces the merchant's configured allow-list, logging any
refusal. Tightening CSP per-install requires a code change, which is what we want:
the shipped artifact is uniform.

### D-08 — Networks are chosen, never inferred
Signet, Testnet3 and Testnet4 share byte-identical address encodings (`tb1…`). No
prefix can identify them. The merchant picks the network; validation always takes a
`NetworkId`. Encoded in `src/core/network.ts` with a test that asserts the collision.

### D-09 — SLIP-132 extended-key prefixes are deliberately absent at P0
`xpub/ypub/zpub/Ltub/Mtub/ttub/…` parsing arrives in P2 with a vector test per
prefix against the SLIP-132 registry. Guessing version bytes now would be the exact
class of bug that sends a merchant's money to an address their wallet never watches.
