# P-1 FOR GROK — foundations only (tokens, type, marks, the hidden flag)

**Read this whole file first. Then do exactly this and stop.** You are not redesigning slip; you are laying
the foundation one pass at a time, behind a hidden switch, so the live till never changes.

Repo: `/root/slip` · branch `master` · work on a **new branch `v2-foundations`** · never deploy, never push to
`master`, never edit a test to make it pass, never touch `src/core/money.ts`, `keys.ts`, `derive.ts`.

---

## 0. What exists, and what you may change

`slip` is a non-custodial, serverless Bitcoin point of sale: one file, React + Tailwind + TypeScript, Vite +
`vite-plugin-singlefile`, inline bootstrap pinned by a CSP hash. v0.31.0 · 562 unit tests · 12/12 browser
suites · contrast 18/18 AA. The design pack (Claude's v1.1, sections D2) is the source of the values below.
Where this file and the pack disagree, **this file wins**.

**P-1 changes tokens and type only.** No layout, no components, no screens. Everything new must be inert
until `?skin=v2` is present.

---

## 1. Do this, in this order

### 1.1 The hidden skin switch
`src/main.tsx` — next to the existing `?explain=1` read, add:

```ts
document.documentElement.dataset.skin =
  new URLSearchParams(location.search).get('skin') === 'v2' ? 'v2' : 'v1';
```

No storage key, no cookie, no CSP change. `?skin=v2` must turn the new tokens on; without it the interface
must be **pixel-identical** to today.

### 1.2 The v2 token block
`src/index.css` — add **one new block** `html[data-skin="v2"] { … }` (light), plus
`html[data-skin="v2"][data-theme="dark"]` (dark) matching how the current themes are selected in that file.
Do not edit or delete the existing v1 blocks. Values:

| Token | Light | Dark |
|---|---|---|
| `--v2-bg` | `#f6f3ed` | `#17130f` |
| `--v2-card` | `#fdfcf9` | `#211c17` |
| `--v2-sunk` | `#ebe7e0` | `#100d09` |
| `--v2-raised` | `#fdfcf9` | `#2b2520` |
| `--v2-ink` | `#171b22` | `#f1eee9` |
| `--v2-ink-2` | `#484d55` | `#b4b1aa` |
| `--v2-edge` | `#6c727b` | `#89867f` |
| `--v2-line` | `#d4d1ca` | `#3b3732` |
| `--v2-acc` | `#a84808` | `#f0a32a` |
| `--v2-on-acc` | `#ffffff` | `#100d09` |
| `--v2-good` | `#0b5d2a` | `#76cf8a` |
| `--v2-warn` | `#615a00` | `#e8d34f` |
| `--v2-bad` | `#a9000d` | `#fb8276` |
| `--v2-qr-fg` | `#000000` | `#000000` |
| `--v2-qr-bg` | `#ffffff` | `#ffffff` |

Measured (do not "improve"): ink/bg 15.59 · ink-2/bg 7.68 · acc/bg 5.27 · white-on-acc 5.84 · edge/card 4.73
· warn/card 6.89 · dark acc/bg 8.78 · dark on-acc 9.21. `--v2-line` is **1.49:1 and decoration only**.

**Rules that are part of the token work:**
- `--v2-line` may never border or colour anything interactive. It is dotted leaders and hairlines.
- `--v2-ink` on `--v2-acc` is forbidden (2.96 light / 1.82 dark); only `--v2-on-acc` sits on `--v2-acc`.
- `@media (prefers-contrast: more)`: `--v2-ink-2 := --v2-ink`, `--v2-edge := --v2-ink-2`, `--v2-line := --v2-edge`.
- `@media (forced-colors: active)`: every border `1px solid CanvasText`; any mask falls back to a plain border.
- `color-scheme` follows the theme; `<meta name="theme-color">` light `#f6f3ed`, dark `#17130f`.

### 1.3 Type and the scales
Same block. System stack only — **zero font bytes, no @import, no woff2, no CDN**:

```css
--v2-font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable Text", "Segoe UI",
              Roboto, "Helvetica Neue", Arial, sans-serif;
--v2-font-mono: ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, Consolas, monospace;
```
Sizes: hero `clamp(36px, 11vw, 80px)` / 1 / 600 / −0.02em / `tabular-nums` · money 20/24 600 · title 18/24 600
· body 16/24 400 · body-s 14/20 400 · label 14/20 600 · caption 12/16 500 · stamp 12/16 700 uppercase
+0.08em · mono 14/20. **Non-money text is 18 px or below.** Tabular numerals on every changeable digit;
prose keeps proportional digits. Prose `max-width: 66ch`.

Space 4/8/12/16/24/32/48 · radius **only** 6 / 12 / 20 / 999 · borders **only** 1px and 2px · elevation E0
(none) / E1 (`card` + `1px line`) / E2 (light: `0 -1px 0 var(--line), 0 12px 32px -8px rgb(23 27 34 / .18)`;
dark: `raised` + `1px edge`).
Motion: press 90ms `cubic-bezier(.2,0,0,1)` · state 160ms same · feed 240ms `cubic-bezier(.05,.7,.1,1)`
(translateY 12px→0 + opacity) · exit 160ms `cubic-bezier(.3,0,.8,.15)` · ink 400ms. Under
`prefers-reduced-motion: reduce`: opacity-only 80 ms, no translate, no draw.
Focus: `outline: 2px solid var(--v2-acc); outline-offset: 2px;` — and on an accent fill, outline `--v2-ink`.

### 1.4 The marks (inline SVG, no image files)
`NEW: src/ui/Brand.tsx` — `{ variant: 'wordmark' | 'mark'; height: number; title?: string }`, colour
`currentColor`, no animation, no shadow, never on an accent fill.

```html
<!-- wordmark: 64×38 grid, stroke 4, round caps -->
<svg viewBox="0 0 64 38" fill="none" stroke="currentColor" stroke-width="4"
     stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="slip">
  <path d="M13.5 12H10a3.5 3.5 0 0 0 0 7a3.5 3.5 0 0 1 0 7H6.5"/>
  <path d="M24 4V26"/><path d="M34 12V26"/>
  <circle cx="34" cy="5.5" r="2.4" fill="currentColor" stroke="none"/>
  <path d="M44 12V34"/><path d="M44 12H51a7 7 0 0 1 0 14H44"/>
</svg>
```
Use it in the header **only under `?skin=v2`**; the favicon stays as it is this pass.

### 1.5 The lint that makes the rules real
`NEW: scripts/lint-tokens.mjs` (no dependencies), exit 1 on any violation, printed as
`file:line  selector  rule`:
1. fail if a selector matching `button|a|input|select|textarea|summary|.btn|.chip|.tile|.key|.toggle|.tab` has a
   `border*` or `outline*` declaration using `var(--v2-line)`;
2. fail if `var(--v2-acc)` appears in a rule whose selector is not `.btn-primary`, a prose link, or
   `:focus-visible`;
3. fail on any rule pairing `color: var(--v2-ink)` with `background: var(--v2-acc)`.
Scope it to the v2 block; it must pass vacuously on v1.

---

## 2. Gates — all of them, and they must be green before you stop

```
npx tsc -p tsconfig.json --noEmit          # no output, exit 0
npx eslint .                               # no output, exit 0
npx vitest run                             # Tests 562 passed (never fewer)
npm run build                              # dist/index.html, CSP hash regenerated
node scripts/scan-bundle.sh                # clean, no off-origin URL, no font file
node scripts/contrast-audit.mjs --strict   # every pair ≥ AA
node scripts/docs-audit.mjs --strict       # exit 0
npx vite preview --port 4181 --strictPort
node tests/e2e/run-all.mjs "http://[::1]:4181/"   # All 12 browser suites passed.
node scripts/lint-tokens.mjs               # no output, exit 0 (NEW)
```

If a gate fails and you cannot fix it without changing something in §3, **stop and say so**. A red gate is
not a delivery.

## 3. Never touch

Money maths, storage keys, ledger shape, the CSP shape, honesty strings (`submitted ≠ confirmed`,
`seen ≠ paid`, manual says manual, demo says simulated), the one rule (never accept/store/echo a seed phrase,
`xprv`/`yprv`/`zprv`/`vprv`, WIF or hex key), `showTechnical: false` default, or any test assertion.

## 4. Deliver

1. Branch `v2-foundations`, one commit per sub-step (switch · tokens · type/scales · marks · lint).
2. The gate output, copied verbatim.
3. `node scripts/shots-matrix.mjs` — and the same 30 frames again with `?skin=v2` added to the URL.
4. A three-line note: what you changed, what you deliberately did not, what you were unsure of.

Then **stop**. P-2 (components) is a separate pass and a separate instruction.
