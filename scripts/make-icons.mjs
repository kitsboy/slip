#!/usr/bin/env node
/**
 * The home-screen icon, drawn from the same receipt mark the app uses.
 *
 * Why this exists: the manifest shipped a 300x220 wordmark marked "any maskable". Android wants a
 * square 192 and a square 512, and iOS ignores manifest icons entirely and reads <link rel=
 * "apple-touch-icon">, which was missing — so both browsers fell back to their own default and the app
 * could not be installed at all. An icon is not a picture; it is a contract with the launcher.
 *
 * Artwork: the shop's own wordmark on black, as Cam asked — the "i" stays orange. A wordmark on a tab is
 * a compromise (16px flattens it), so it is set as wide as the tile allows rather than floating small.
 *
 * Run: node scripts/make-icons.mjs  (deterministic; overwrites public/icon-*.png)
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { chromePath } from '../tests/e2e/_chrome.mjs';

const BLACK = '#000000';
const INK = '#f7f2ea';
const ORANGE = '#f5820a';

// The wordmark from src/ui/Brand.tsx (variant="wordmark"), same geometry, in ink on black, with the
// "i" kept orange — the one detail that makes the mark ours rather than a word in a font.
const mark = (w) => {
  const h = Math.round((w * 38) / 64);
  return `
<svg viewBox="4 1 55 36" width="${w}" height="${h}" fill="none"
     stroke-linecap="round" stroke-linejoin="round" stroke-width="4"
     xmlns="http://www.w3.org/2000/svg">
  <g stroke="${INK}">
    <path d="M13.5 12H10a3.5 3.5 0 0 0 0 7a3.5 3.5 0 0 1 0 7H6.5" />
    <path d="M24 4V26" />
    <path d="M44 12V34" />
    <path d="M44 12H51a7 7 0 0 1 0 14H44" />
  </g>
  <g stroke="${ORANGE}">
    <path d="M34 12V26" />
    <circle cx="34" cy="5.5" r="2.4" fill="${ORANGE}" stroke="none" />
  </g>
</svg>`;
};

/**
 * @param {number} size  canvas in px
 * @param {number} inset fraction of the canvas the mark may occupy (1 = full bleed)
 */
const page = (size, inset) => `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: ${BLACK}; }
  .tile { width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; background: ${BLACK}; }
  .art { width: ${Math.round(size * inset)}px; }
  .art svg { display: block; }
</style>
<div class="tile"><div class="art">${mark(Math.round(size * inset))}</div></div>`;

const out = [
  // name, size, inset
  ['icon-192.png', 192, 0.94],
  ['icon-512.png', 512, 0.94],
  // Maskable art must survive a circular crop: keep everything inside the middle 80%.
  ['icon-maskable-512.png', 512, 0.82],
  // iOS: 180px, opaque, it is displayed as-is on the home screen.
  ['apple-touch-icon.png', 180, 0.94],
  ['favicon-32.png', 32, 0.96],
];

mkdirSync('public', { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const p = await browser.newPage({ deviceScaleFactor: 1 });

for (const [name, size, inset] of out) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(page(size, inset));
  await p.screenshot({ path: `public/${name}`, omitBackground: false });
  console.log(`wrote public/${name} (${size}x${size})`);
}

await browser.close();
