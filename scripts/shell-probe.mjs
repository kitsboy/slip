#!/usr/bin/env node
// Focused probe: is the settings section genuinely visible, or hidden by its parent?
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

/* global document, getComputedStyle */
const BASE = process.argv[2] ?? 'http://[::1]:4181/';
const CHROME = execSync('find /root/.cache/ms-playwright -name chrome -type f | head -1', { encoding: 'utf8' }).trim();

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');
await page.waitForTimeout(500);

const info = await page.evaluate(() => {
  const out = [];
  for (const id of ['sell', 'money', 'books', 'setup', 'more', 'learn', 'settings', 'till', 'wallclock', 'explainer', 'demo-link', 'findsale']) {
    const el = document.getElementById(id) || document.querySelector(`[data-panel="${id}"]`);
    if (!el) { out.push({ id, present: false }); continue; }
    let parentDisplay = null;
    if (el.parentElement) parentDisplay = getComputedStyle(el.parentElement).display;
    out.push({
      id, present: true,
      tag: el.tagName,
      hiddenAttr: el.hasAttribute('hidden'),
      ownDisplay: getComputedStyle(el).display,
      parentDisplay,
      offsetHeight: el.offsetHeight,
    });
  }
  // All data-panel ids present
  const panels = [...document.querySelectorAll('[data-panel]')].map((e) => e.getAttribute('data-panel'));
  out.push({ id: '__ALL_PANELS__', present: true, list: panels });
  return out;
});

for (const row of info) {
  if (row.list) { console.log('panels(' + row.list.length + '):', row.list.join(', ')); continue; }
  console.log(
    `${row.id.padEnd(12)} present=${row.present} tag=${row.tag ?? '-'} hiddenAttr=${row.hiddenAttr} ownDisplay=${row.ownDisplay ?? '-'} parentDisplay=${row.parentDisplay ?? '-'} h=${row.offsetHeight}`,
  );
}
await browser.close();
