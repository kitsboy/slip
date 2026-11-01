#!/usr/bin/env node
// Runtime DOM proof for the shell pass: unique data-panel ids, hidden sections,
// and horizontal overflow. Usage: node scripts/shell-measure.mjs [baseUrl]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

/* global document, getComputedStyle */
const BASE = process.argv[2] ?? 'http://[::1]:4181/';
const CHROME = execSync('find /root/.cache/ms-playwright -name chrome -type f | head -1', { encoding: 'utf8' }).trim();

const results = {};
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  results[n] = ok;
};

for (const width of [430, 1280]) {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1');
  await page.waitForTimeout(500);

  const ids = await page.locator('[data-panel]').evaluateAll((els) => els.map((e) => e.getAttribute('data-panel')));
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  check(`[${width}px] every data-panel id is unique (${ids.length} panels)`, dupes.length === 0, `dupes: ${[...new Set(dupes)].join(',')}`);

  const sections = await page.locator('section[id]').evaluateAll((els) =>
    els.map((e) => ({ id: e.id, hidden: e.hidden, display: getComputedStyle(e).display, h: e.offsetHeight })),
  );
  const visiblyHidden = sections.filter((s) => s.hidden).every((s) => s.display === 'none');
  check(`[${width}px] hidden sections are display:none`, visiblyHidden, JSON.stringify(sections.filter((s) => s.hidden && s.display !== 'none')));
  // Effective visibility: a nested panel inside a hidden group has no `hidden` attribute of its
  // own but is still invisible (parent display:none → offsetHeight 0). Count only the six group
  // sections by their visible height.
  const groupIds = ['sell', 'money', 'books', 'setup', 'more', 'learn'];
  const groups = sections.filter((s) => groupIds.includes(s.id));
  const visibleGroups = groups.filter((s) => s.h > 0);
  check(`[${width}px] exactly one group section is visible (${visibleGroups.map((s) => s.id).join(',')})`, visibleGroups.length === 1);

  const dims = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(`[${width}px] no horizontal overflow`, dims.sw === dims.cw, JSON.stringify(dims));

  const wallclock = await page.locator('[data-panel="wallclock"]').count();
  check(`[${width}px] wallclock mounted at most once`, wallclock <= 1, String(wallclock));

  await browser.close();
}

const failed = Object.values(results).filter((v) => !v).length;
console.log(failed === 0 ? '\nAll shell measurements passed.' : `\n${failed} measurement(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
