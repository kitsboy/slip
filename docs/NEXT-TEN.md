# Next ten: what to repair next, in order

Written 2026-11-10, after v0.31.25. This is a repair list, not a feature list — the owner's
words were *"Do not just add more things, let's fix and repair and improve what we can here now."*
Each item says what is wrong now, and how we would know it is fixed.

---

## 1. Prove the camera on a real phone — **blocked on a human thumb**
`public/_headers` ships `Permissions-Policy: camera=(self)` as of v0.31.24 (verified with
`curl -sI`), and the Scan button calls `getUserMedia` with `facingMode: 'environment'`.
Everything up to the permission prompt is now correct; only a phone can confirm the rest.
**Done when:** a shopkeeper taps "Scan the zpub", allows the camera, and the public code lands in
the field. If it fails, the on-screen text now names the fix instead of showing `Permission denied`.

## 2. Navigation is measured, and it is not slow in the built app
Measured 2026-11-10 on the preview build at 390×844, headless Chromium:

| tab switch | ms (two animation frames) |
|---|---|
| Money in | 37 |
| Books | 37 |
| Setup | 26 |
| More | 18 |
| Sell | 29 |

Zero long tasks over 50 ms during four consecutive switches. Two frames is ~32 ms at 60 Hz, so
each switch costs about one frame of work. **This does not prove it feels fast on a phone.**
The felt slowness was probably the removed `v2-breathe`/`v2-head-drift` animations and the blurred
fixed tab bar (both gone in `1e51aad`), plus first paint of a 700 KB single file.
**Next:** measure the same probe on the real device with Chrome remote debugging, and time
cold first-paint separately from switching.

## 3. Make setup read as a path, not a form
The wizard is five steps of fields with a stepper. A shopkeeper cannot tell how far along they are
or what is left. Name the steps as questions ("Which wallet?", "Where does the money go?") and show
the remaining count in words.
**Done when:** someone who has never used Bitcoin can describe the next step without reading a label.

## 4. Retire the v1 skin, or freeze it
`?skin=v1` doubles the cost of every UI fix — two footers, two headers, two colour systems.
**Done when:** `pre-v2` is the rollback story and the v1 branch is deleted.

## 5. One honest failure screen
When something breaks, a merchant currently sees nothing, or an English exception. A single card
saying *what happened / what is safe / what to do next* covers most of them.
**Done when:** unplugging the network mid-sale produces that card, not a blank panel.

## 6. Test the four real failure paths
No rate set, no network, wrong chain, wallet offline. These are what actually goes wrong in a shop,
and none of them is in the browser suites today.

## 7. Find a sale again
Books shows today. Add a search by amount or the last four digits of the address.
**Done when:** a merchant can answer "did the 20 franc coffee go through?" in under five seconds.

## 8. Keep the public repo small — **done 2026-11-10**
`docs/matrix-shots/` was 39 MB of generated PNGs committed to a public MIT repo. It is now untracked
and ignored, alongside `docs/shots/`. The files stay on disk; `scripts/shots-matrix.mjs` regenerates
them. History still carries the old blobs — rewriting it would be a force-push, so it was not done.

## 9. Ship the Fable brief
`docs/BRIEF-FOR-FABLE-V3.md` still has ~20 `SYMBOL UNVERIFIED` rows. A brief with unverified symbols
teaches the next model to guess.
**Done when:** every symbol in it was read from the tree, or the row is deleted.

## 10. A one-page "what slip cannot do"
It cannot hold, move, refund or recover money. That is the strongest trust asset on the site and it
is currently scattered across four screens.
**Done when:** it is one screen, linked from the footer, written for a shopkeeper.
