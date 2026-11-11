#!/usr/bin/env node
/**
 * The home-screen icon, drawn from the same receipt mark the app uses.
 *
 * Why this exists: the manifest shipped a 300x220 wordmark marked "any maskable". Android wants a
 * square 192 and a square 512, and iOS ignores manifest icons entirely and reads <link rel=
 * "apple-touch-icon">, which was missing — so both browsers fell back to their own default and the app
 * could not be installed at all. An icon is not a picture; it is a contract with the launcher.
 *
 * Run: node scripts/make-icons.mjs  (deterministic; overwrites public/icon-*.png)
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { chromePath } from '../tests/e2e/_chrome.mjs';

const ORANGE = '#f5820a'; // the mark's own colour, carried onto the launcher
const INK = '#1a1612';

// The receipt mark from src/ui/Brand.tsx (variant="mark"), same geometry, in ink on the tile.
const mark = (scale) => `
<svg viewBox="0 0 32 32" width="${scale}" height="${scale}" fill="none"
     xmlns="http://www.w3.org/2000/svg">
  <path d="M6 3H26V25A2.5 2.5 0 0 0 21 25A2.5 2.5 0 0 0 16 25A2.5 2.5 0 0 0 11 25A2.5 2.5 0 0 0 6 25Z"
        stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M10 10H22M10 15H17" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

/**
 * @param {number} size  canvas in px
 * @param {number} inset fraction of the canvas the mark may occupy (1 = full bleed)
 */
const page = (size, inset) => `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: ${ORANGE}; }
  .tile { width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; }
  .art { width: ${Math.round(size * inset)}px; height: ${Math.round(size * inset)}px;
         /* the mark's torn bottom edge pulls its visual centre up; sit it back down a touch */ 
         transform: translateY(${(size * 0.03).toFixed(2)}px); }
</style>
<div class="tile"><div class="art">${mark(Math.round(size * inset))}</div></div>`;

const out = [
  // name, size, inset
  ['icon-192.png', 192, 0.78],
  ['icon-512.png', 512, 0.78],
  // Maskable art must survive a circular crop: keep everything inside the middle 80%.
  ['icon-maskable-512.png', 512, 0.62],
  // iOS: 180px, opaque, it is displayed as-is on the home screen.
  ['apple-touch-icon.png', 180, 0.78],
  ['favicon-32.png', 32, 0.92],
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
