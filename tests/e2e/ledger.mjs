import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';
const base = process.argv[2] ?? 'http://[::1]:4181/';
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
try {
  const c = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const a = await c.newPage();
  const errors = [];
  c.on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
  a.on('pageerror', (e) => errors.push(String(e)));
  await a.goto(base);
  await showPanel(a, 'wallets');
  await a.locator('#ct-label').fill('Coordination fixture');
  await a
    .locator('#ct-xpub')
    .fill(
      'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
    );
  await a.waitForSelector('ol li code');
  await a.getByLabel(/I opened my wallet/).check();
  await a.getByRole('button', { name: 'Save counter', exact: true }).click();
  await showPanel(a, 'till');
  const b = await c.newPage();
  await b.goto(base);
  const ready = async (p) => {
    await showPanel(p, 'till');
    await p.locator('#tl-custom').fill('1.00');
    await p.locator('#tl-rate').fill('60000');
  };
  await Promise.all([ready(a), ready(b)]);
  await Promise.all([a.locator('#tl-charge').click(), b.locator('#tl-charge').click()]);
  await Promise.all([a.locator('#tl-pay').waitFor(), b.locator('#tl-pay').waitFor()]);
  let rows = await a.evaluate(() => window.slip.invoices());
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((i) => i.index)).size, 2);
  assert.equal(new Set(rows.map((i) => i.receiptNumber)).size, 2);
  await a.close();
  const next = await c.newPage();
  await next.goto(base);
  await ready(next);
  await next.evaluate(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) {
      return k === 'slip.ledger.v1' ? null : get.call(this, k);
    };
  });
  await next.locator('#tl-charge').click();
  await next.locator('#tl-pay').waitFor();
  const witness = await next.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('slip-shift-coordination-v1', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return new Promise((res, rej) => {
      const t = db.transaction('drawers');
      const r = t.objectStore('drawers').get('slip.ledger.v1');
      r.onsuccess = () => {
        db.close();
        res(JSON.parse(r.result.value));
      };
      r.onerror = () => rej(r.error);
    });
  });
  assert.equal(witness.invoices.length, 3);
  assert.equal(new Set(witness.invoices.map((i) => i.index)).size, 3);
  await next.close();
  const retry = await c.newPage();
  await retry.goto(base);
  await ready(retry);
  await retry.evaluate(() => {
    window.originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'slip.ledger.v1') throw new DOMException('full', 'QuotaExceededError');
      return window.originalSet.call(this, k, v);
    };
  });
  await retry.locator('#tl-charge').click();
  await retry.locator('[data-save-warning]').waitFor();
  assert.equal(await retry.locator('#tl-pay').count(), 0);
  await retry.evaluate(() => {
    Storage.prototype.setItem = window.originalSet;
  });
  await retry.getByRole('button', { name: 'Retry unsaved changes', exact: true }).click();
  await retry.locator('[data-save-warning]').waitFor({ state: 'detached' });
  await retry.close();
  const successor = await c.newPage();
  await successor.goto(base);
  await ready(successor);
  await successor.evaluate(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) {
      return k === 'slip.ledger.v1' ? null : get.call(this, k);
    };
  });
  await successor.locator('#tl-charge').click();
  await successor.locator('#tl-pay').waitFor();
  rows = await b.evaluate(() => window.slip.invoices());
  assert.equal(rows.length, 5);
  assert.equal(new Set(rows.map((i) => i.index)).size, 5);
  assert.equal(new Set(rows.map((i) => i.receiptNumber)).size, 5);
  assert.deepEqual(errors, []);
  console.log(
    'PASS simultaneous charges; closed writer + forced stale-null successor; failed write retry + closed writer + stale successor: 5 invoices, unique indexes and receipt numbers, no page errors',
  );
  await c.close();
} finally {
  await browser.close();
}
