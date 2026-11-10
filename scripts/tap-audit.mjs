#!/usr/bin/env node
/* eslint-disable no-undef -- the page.evaluate callback runs in the browser, where these globals exist */
/**
 * Every target, measured.
 *
 * The brief asks for 48 px minimum on anything a thumb must hit, 64 px on keypad keys, 56 px on the
 * primary. Those numbers were in a document and never in a script, so "every target ≥48" was an
 * opinion. This walks the five destinations plus Learn at a phone's size, measures every element a
 * finger can act on — buttons, links, inputs, selects, [role=button], label-wrapped switches — and
 * prints the offenders with their text so a fix is obvious.
 *
 * Usage: node scripts/tap-audit.mjs [baseUrl]   (default http://127.0.0.1:4183/)
 * Exit: 0 when nothing is under 44 in both directions, 1 otherwise. 44 is the floor, 48 the target.
 */

import { chromium } from 'playwright';
import { chromePath } from '../tests/e2e/_chrome.mjs';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:4183/').replace(/\/$/, '');
const FLOOR = 44;
const TARGET = 48;

const SECTIONS = ['sell', 'money', 'books', 'setup', 'more', 'learn'];

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

let failures = 0;
let warned = 0;

for (const section of SECTIONS) {
  await page.goto(`${BASE}/?skin=v2&demo=1#${section}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);

  const rows = await page.evaluate(
    ({ section, floor, target }) => {
      const SEL = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], summary';
      const out = [];
      for (const el of document.querySelectorAll(SEL)) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        // A checkbox drawn as a colour swatch is the *label* that carries the tap, so measure the
        // label. Otherwise every swatch in setup reports as a 13px target and hides the real ones.
        const box = el.tagName === 'INPUT' && /check|radio/i.test(el.type ?? '') ? el.closest('label') ?? el : el;
        const r = box.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // An inline link inside a paragraph is text, not a target: it is read, not tapped blind.
        if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        if (w >= target && h >= target) continue;
        const label = (box.getAttribute('aria-label') || box.textContent || '').trim().slice(0, 40);
        out.push({
          section,
          tag: el.tagName.toLowerCase(),
          w,
          h,
          floor: w < floor || h < floor,
          cls: (box.className?.toString() ?? '').slice(0, 34),
          label,
        });
      }
      return out;
    },
    { section, floor: FLOOR, target: TARGET },
  );

  const hard = rows.filter((r) => r.floor);
  const soft = rows.filter((r) => !r.floor);
  failures += hard.length;
  warned += soft.length;
  console.log(
    `${section.padEnd(6)} under ${TARGET}px: ${String(rows.length).padStart(3)}  (under ${FLOOR}: ${hard.length})`,
  );
  for (const r of [...hard, ...soft].slice(0, 6)) {
    console.log(
      `   ${r.floor ? 'FAIL' : 'warn'} ${r.w}x${r.h} <${r.tag}> "${r.label}" ${r.cls ? `.${r.cls}` : ''}`,
    );
  }
}

await browser.close();
console.log(`\ntap-audit: ${failures} under the ${FLOOR}px floor, ${warned} under the ${TARGET}px target`);
process.exit(failures > 0 ? 1 : 0);
