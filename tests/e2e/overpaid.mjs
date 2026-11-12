/**
 * A payment that arrives above the ask.
 *
 * The sale still counts — the merchant has the money — so the day's totals must not move. What must
 * move is the merchant's attention: a till that says only "paid" is hiding the one fact worth knowing.
 * These checks pin both halves of that: the note appears, and the money is counted once, at the ask.
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:4183/').replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

await page.goto(`${BASE}/?cb=${Date.now()}&demo=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await showPanel(page, 'history');
await page.waitForTimeout(700);

const rows = await page.locator('[data-sale-row]').allInnerTexts();
const over = rows.filter((r) => /over by/.test(r));
check('Books names a sale that arrived over the ask', over.length >= 1, `${over.length} of ${rows.length} rows`);
check('the note says how much extra arrived', /over by [\d.,]+/.test(over[0] ?? ''), over[0]?.replace(/\n/g, ' | '));

// The amount charged is still the amount charged: the row above shows the ask, not the excess.
const amounts = await page.locator('[data-sale-row] .figure').allInnerTexts();
check('the sale is still counted at the amount asked for', amounts.length > 0 && !/over/i.test(amounts.join(' ')));

// And the day close, printed, says it in one line — the sheet a merchant files.
const closeBtn = page.getByRole('button', { name: /^Close the day$/ }).first();
if (await closeBtn.count()) {
  await closeBtn.click();
  await page.waitForTimeout(400);
}
const [sheet] = await Promise.all([
  page.waitForEvent('popup', { timeout: 8000 }).catch(() => null),
  page.getByRole('button', { name: 'Print on A4' }).first().click(),
]);
if (sheet) {
  await sheet.waitForLoadState('domcontentloaded');
  await sheet.waitForTimeout(300);
  const text = await sheet.evaluate(() => document.body.innerText);
  check('the printed day close names the extra', /ABOVE the ask/.test(text), text.slice(0, 120));
  // Counted once, at the ask: the excess is named in the sentence, not added to the totals.
  const row = text.match(/inv_demo_00[^\n]*/)?.[0] ?? 'row missing';
  check(
    'the printed day close counts the sale at the ask, not the excess',
    /Sales\s+5/.test(text) && /inv_demo_00\s+35,000 sats/.test(text) && !/37,800/.test(text),
    row,
  );
  await sheet.close();
} else {
  check('the printed day close opens', false, 'no print window');
}

check('no runtime errors from slip', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(failures === 0 ? '\nOverpayment checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
