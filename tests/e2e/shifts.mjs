/** Concurrent real UI opens in two tabs, with Web Crypto deliberately held mid-append.
 * Run against a built preview for release proof; a Vite dev URL also exercises source code.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const base = new URL(process.argv[2] ?? 'http://[::1]:4181/');
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  await context.addInitScript(() => {
    const request = navigator.locks.request.bind(navigator.locks);
    window.shiftLockRequested = false;
    window.shiftTrace = [];
    const trace = (event, value) => {
      if (window.shiftTrace.length < 200) window.shiftTrace.push({ at: performance.timeOrigin + performance.now(), event, value });
    };
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      const value = get.call(this, key);
      if (key === 'slip.shifts.v1') trace('read', value);
      return value;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'slip.shifts.v1') trace('write', value);
      return set.call(this, key, value);
    };
    navigator.locks.request = (...args) => {
      if (String(args[0]).includes('slip.shifts.v1')) {
        window.shiftLockRequested = true;
        trace('request', args[0]);
        const callback = args[2];
        args[2] = async (...inner) => {
          trace('grant', args[0]);
          try { return await callback(...inner); }
          finally { trace('release', args[0]); }
        };
      }
      return request(...args);
    };
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    window.shiftHashStarted = false;
    window.shiftHashReleased = false;
    window.releaseShiftHash = () => { window.shiftHashReleased = true; };
    crypto.subtle.digest = async (...args) => {
      window.shiftHashStarted = true;
      while (!window.shiftHashReleased) await new Promise((resolve) => setTimeout(resolve, 10));
      return digest(...args);
    };
  });
  const first = await context.newPage();
  await first.goto(base.href);
  await first.evaluate(() => {
    const at = new Date().toISOString();
    localStorage.setItem('slip.accounts.v1', JSON.stringify({
      version: 1, activeAccountId: 'counter', currentStaff: null, pinHash: null,
      accounts: [{
        id: 'counter', label: 'Counter', source: 'address',
        xpub: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
        firstAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
        coin: 'btc', networkId: 'btc-mainnet', scriptType: 'p2wpkh',
        colour: 'orange', purpose: 'till', note: '', fingerprintHex: '--------',
        prefix: 'address', acknowledgedAt: at, createdAt: at, staffName: null, nextIndex: 0,
      }],
    }));
    localStorage.removeItem('slip.shifts.v1');
    localStorage.setItem('slip.demo.slip.shifts.v1', 'demo untouched');
  });
  await first.reload();
  const second = await context.newPage();
  await second.goto(base.href);
  const pages = [first, second];
  for (const [i, page] of pages.entries()) {
    page.on('pageerror', (error) => errors.push(String(error)));
    assert.equal(await page.evaluate(() => Boolean(navigator.locks?.request)), true);
    await page.locator('[data-shift="closed"] button').click();
    await page.locator('#tl-staff-open').fill(`Staff ${i}`);
  }
  await Promise.all(pages.map((page) =>
    page.locator('[data-shift="closed"]').getByRole('button', { name: 'Open the till', exact: true }).click(),
  ));
  await Promise.all(pages.map((page) => page.waitForFunction(() => window.shiftLockRequested)));
  await Promise.any(pages.map((page) => page.waitForFunction(() => window.shiftHashStarted)));
  // Both UI actions are now pending; one tab holds the real origin-wide Web Lock.
  await Promise.all(pages.map((page) => page.evaluate(() => window.releaseShiftHash())));
  await first.waitForFunction(() => {
    const log = JSON.parse(localStorage.getItem('slip.shifts.v1') ?? 'null');
    return log?.events.length === 2;
  }).catch(async (error) => {
    console.error(JSON.stringify(await Promise.all(pages.map((page) => page.evaluate(() => ({
      trace: window.shiftTrace.filter((entry) => entry.event !== 'read').slice(-16),
      log: localStorage.getItem('slip.shifts.v1'),
      requested: window.shiftLockRequested,
      started: window.shiftHashStarted,
      released: window.shiftHashReleased,
      shift: document.querySelector('[data-shift]')?.innerText,
    })))), null, 2));
    throw error;
  });
  const proof = await first.evaluate(async () => {
    const log = JSON.parse(localStorage.getItem('slip.shifts.v1'));
    const canonical = (v) => {
      if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
      if (v !== null && typeof v === 'object') return `{${Object.keys(v).sort()
        .filter((key) => v[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${canonical(v[key])}`).join(',')}}`;
      return JSON.stringify(v);
    };
    let previous = '0'.repeat(64);
    for (const [i, event] of log.events.entries()) {
      if (event.seq !== i || event.prevHash !== previous) throw new Error('broken chain');
      const { hash, ...body } = event;
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${previous}\n${canonical(body)}`));
      const actual = Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
      if (hash !== actual) throw new Error('wrong event hash');
      previous = hash;
    }
    return { staff: log.events.map((event) => event.staff).sort(),
      kinds: log.events.map((event) => event.kind),
      demo: localStorage.getItem('slip.demo.slip.shifts.v1') };
  });
  assert.deepEqual(proof.staff, ['Staff 0', 'Staff 1']);
  assert.deepEqual(proof.kinds, ['open', 'open']);
  assert.equal(proof.demo, 'demo untouched');
  assert.deepEqual(errors, []);
  // A successful writer is gone. The surviving renderer deliberately keeps a stale
  // localStorage read cache; durable coordination must supply the base, not a live marker.
  await first.close();
  await second.evaluate(() => {
    window.shiftReadBeforeStale = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      return key === 'slip.shifts.v1' ? null : window.shiftReadBeforeStale.call(this, key);
    };
  });
  await second.getByRole('button', { name: 'Close the till', exact: true }).click();
  await second.waitForFunction(() => {
    const raw = window.shiftReadBeforeStale.call(localStorage, 'slip.shifts.v1');
    return JSON.parse(raw)?.events.length === 3;
  });
  await second.evaluate(() => { Storage.prototype.getItem = window.shiftReadBeforeStale; });
  await second.reload();
  await second.locator('[data-shift="closed"] button').click();
  await second.locator('#tl-staff-open').fill('Recovered staff');
  await second.evaluate(() => {
    window.shiftWorkingSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'slip.shifts.v1') throw new DOMException('full', 'QuotaExceededError');
      return window.shiftWorkingSet.call(this, key, value);
    };
  });
  // Init-script hashing gate resets on reload.
  await second.evaluate(() => window.releaseShiftHash());
  await second.locator('[data-shift="closed"]').getByRole('button', { name: 'Open the till', exact: true }).click();
  await second.locator('[data-save-warning]').waitFor();
  await second.evaluate(() => { Storage.prototype.setItem = window.shiftWorkingSet; });
  await second.getByRole('button', { name: 'Retry unsaved changes', exact: true }).click();
  await second.waitForFunction(() => JSON.parse(localStorage.getItem('slip.shifts.v1'))?.events.length === 4);
  await second.locator('[data-save-warning]').waitFor({ state: 'detached' });
  const successor = await context.newPage();
  await successor.goto(base.href);
  await successor.getByRole('button', { name: 'Close the till', exact: true }).waitFor();
  await second.close();
  await successor.evaluate(() => {
    window.shiftReadBeforeStale = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      return key === 'slip.shifts.v1' ? null : window.shiftReadBeforeStale.call(this, key);
    };
    window.releaseShiftHash();
  });
  await successor.getByRole('button', { name: 'Close the till', exact: true }).click();
  await successor.waitForFunction(() => JSON.parse(window.shiftReadBeforeStale.call(localStorage, 'slip.shifts.v1'))?.events.length === 5);
  const finalProof = await successor.evaluate(async () => {
    const log = JSON.parse(window.shiftReadBeforeStale.call(localStorage, 'slip.shifts.v1'));
    const canonical = (value) => value !== null && typeof value === 'object'
      ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
      : JSON.stringify(value);
    let previous = '0'.repeat(64);
    for (const [seq, event] of log.events.entries()) {
      if (event.seq !== seq || event.prevHash !== previous) throw new Error('broken final chain');
      const { hash, ...body } = event;
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${previous}\n${canonical(body)}`));
      if (hash !== Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('')) throw new Error('wrong final hash');
      previous = hash;
    }
    return log.events.map((event) => event.kind);
  });
  assert.deepEqual(finalProof, ['open', 'open', 'return', 'open', 'return']);
  await successor.evaluate(async () => {
    Storage.prototype.getItem = window.shiftReadBeforeStale;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('slip-shift-coordination-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('drawers', 'readwrite');
      const log = localStorage.getItem('slip.shifts.v1');
      tx.objectStore('drawers').put({ phase: 'prepared', base: log, value: log }, 'slip.shifts.v1');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await successor.goto(new URL('#settings', base).href);
  await successor.getByRole('textbox', { name: 'Type WIPE to confirm erasing local data' }).fill('WIPE');
  await successor.getByRole('button', { name: 'Wipe this device', exact: true }).click();
  await successor.waitForFunction(() => localStorage.getItem('slip.accounts.v1') === null && localStorage.getItem('slip.shifts.v1') === null);
  console.log('PASS  confirmed Settings wipe replaces an interrupted witness and clears accounts and shifts');
  console.log('PASS  simultaneous UI opens; closed writer + stale successor; recovered append + closed writer + stale successor retained all 5 events; every hash verified');
  await context.close();
} finally {
  await browser.close();
}
