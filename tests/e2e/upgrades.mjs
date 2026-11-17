import assert from 'node:assert/strict';
import { showPanel } from './_nav.mjs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
const base = new URL(process.argv[2] ?? 'http://[::1]:4181/');
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
try {
  const c = await browser.newContext({ viewport: { width: 320, height: 900 } });
  const errors = [];
  c.on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
  const p = await c.newPage();
  const url = new URL(base);
  url.searchParams.set('demo', '1');
  await p.goto(url.href);
  await p.locator('#tl-charge').waitFor();
  await p.getByRole('button', { name: 'Espresso', exact: false }).first().click();
  await p.locator('#tl-charge').click();
  await p.locator('.v2-receipt').waitFor({ timeout: 30000 });
  const link = await p.getByRole('link', { name: 'Open customer receipt' }).getAttribute('href');
  const decoder = await readFile('node_modules/jsqr/dist/jsQR.js', 'utf8');
  const decoded = await p.evaluate(async (source) => {
    const module = { exports: {} };
    new Function('module', 'exports', source)(module, module.exports);
    const svg = document.querySelector('.v2-receipt-qr svg');
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(svg));
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 1000, 1000);
    ctx.drawImage(img, 30, 30, 940, 940);
    return module.exports(ctx.getImageData(0, 0, 1000, 1000).data, 1000, 1000)?.data;
  }, decoder);
  assert.equal(decoded, link, 'receipt QR must actually decode to customer link');
  assert.equal(new URL(link).search, '?receipt=1');
  const receipt = await c.newPage();
  await receipt.goto(link);
  await receipt.locator('[data-digital-receipt]').waitFor();
  assert.match(await receipt.locator('main').innerText(), /Unsigned customer-held record/);
  assert.match(await receipt.locator('main').innerText(), /Simulated/);
  assert.equal(await receipt.locator('[data-panel]').count(), 0);
  for (const width of [320, 390, 1440]) {
    await receipt.setViewportSize({ width, height: 900 });
    await receipt.evaluate(() => (document.documentElement.style.fontSize = '24px'));
    assert.equal(
      await receipt.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `receipt overflow ${width}`,
    );
  }
  const display=await c.newPage(); const du=new URL(base);du.search='display=1&demo=1';await display.goto(du.href);await display.locator('.v2-display-idle').waitFor();
  await p.evaluate(()=>{const ch=new BroadcastChannel('slip-display');ch.postMessage({kind:'pay',uri:'litecoin:ltc1qfixture?amount=1',sats:'100000000',shop:'Customer shop',label:'PRIVATE SHOP LABEL',status:'manual'});ch.close();});
  await display.getByText('Marked paid by merchant — not observed by slip').waitFor();
  assert.match(await display.locator('main').innerText(),/1 LTC/);assert.doesNotMatch(await display.locator('main').innerText(),/PRIVATE SHOP LABEL|sats/);
  for(const width of [320,390,1440]){await display.setViewportSize({width,height:900});await display.evaluate(()=>document.documentElement.style.fontSize='24px');assert.equal(await display.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`display overflow ${width}`);}
  await display.setViewportSize({width:320,height:900});await display.screenshot({path:process.env.TMPDIR+'/slip-customer-320.png',fullPage:true});
  await receipt.setViewportSize({width:320,height:900});await receipt.screenshot({path:process.env.TMPDIR+'/slip-receipt-320.png',fullPage:true});
  const fresh = await browser.newContext();
  const isolated = await fresh.newPage();
  await isolated.goto(link);
  await isolated.locator('[data-digital-receipt]').waitFor();
  assert.match(await isolated.locator('main').innerText(), /Receipt/);
  assert.equal(await isolated.evaluate(() => localStorage.length), 0);
  await fresh.close();
  await showPanel(p, 'history');
  const checklist = p.locator('[data-day-checklist]');
  await checklist.getByLabel(/I reviewed/).check();
  assert.equal(
    await checklist
      .getByRole('button', { name: 'Confirm day closed' })
      .getAttribute('aria-disabled'),
    'true',
  );
  const [csv] = await Promise.all([
    p.waitForEvent('download'),
    p.getByRole('button', { name: 'download CSV', exact: true }).click(),
  ]);
  const csvText = await readFile(await csv.path(), 'utf8');
  assert.match(csvText, /receipt_number/);
  await showPanel(p, 'backup');
  await p.locator('#bk-pass').fill('a long safe passphrase 123');
  const [download] = await Promise.all([
    p.waitForEvent('download'),
    p.getByRole('button', { name: 'Export encrypted backup', exact: true }).click(),
  ]);
  const path = await download.path();
  await p.getByLabel('Choose a .slip backup file').setInputFiles(path);
  await p.locator('#bk-pass').fill('a long safe passphrase 123');
  const before = await p.evaluate(() => JSON.stringify({ ...localStorage }));
  await p.getByRole('button', { name: 'Test my backup — no changes', exact: true }).click();
  await p
    .getByText(/Validated encryption, checksum/)
    .waitFor({ timeout: 5000 })
    .catch(async (e) => {
      console.log(await p.locator('[data-panel="backup"]').innerText());
      throw e;
    });
  assert.equal(await p.evaluate(() => JSON.stringify({ ...localStorage })), before);
  await p.locator('#bk-pass').fill('wrong');
  await p.getByRole('button', { name: 'Test my backup — no changes', exact: true }).click();
  await p.getByText(/passphrase is wrong|could not decrypt/i).waitFor();
  assert.equal(await p.evaluate(() => JSON.stringify({ ...localStorage })), before);
  await showPanel(p, 'history');
  await checklist.getByLabel(/I checked/).check();
  await checklist.getByRole('button', { name: 'Confirm day closed' }).click();
  await checklist.getByText('Day explicitly closed. New records or changes reopen it.').waitFor();
  await p.reload();
  await showPanel(p, 'history');
  await checklist.getByText('Day explicitly closed. New records or changes reopen it.').waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'PASS customer-held receipt opens in an empty context; fragment, unsigned/demo labels, no merchant panels/data writes, 320/390/1440 large text',
  );
  await c.close();
} finally {
  await browser.close();
}
