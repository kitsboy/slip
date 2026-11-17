import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';
const base = process.argv[2] ?? 'http://[::1]:4181/';
const decoder = await readFile('node_modules/jsqr/dist/jsQR.js', 'utf8');
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const failures = [];
const zpub = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const xpub = 'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj';
async function decode(locator) {
  await locator.waitFor({ state: 'visible' });
  return locator.evaluate(async (svg, source) => {
    const module = { exports: {} };
    new Function('module', 'exports', source)(module, module.exports);
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(svg));
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1000, 1000);
    ctx.drawImage(img, 30, 30, 940, 940);
    return module.exports(ctx.getImageData(0, 0, 1000, 1000).data, 1000, 1000)?.data;
  }, decoder);
}
async function check(locator, scheme, address, atoms, label, name) {
  const amount = atoms === null ? '' : `amount=${(BigInt(atoms) / 100000000n).toString()}.${(BigInt(atoms) % 100000000n).toString().padStart(8, '0')}`.replace(/0+$/, '').replace(/\.$/, '');
  const params = [amount, `label=${encodeURIComponent(label)}`].filter(Boolean).join('&');
  const expected = `${scheme}:${address}?${params}`;
  const actual = await decode(locator);
  try { assert.equal(actual, expected, name); console.log('PASS', name); }
  catch (e) { failures.push(e.message); console.error('FAIL', name, {actual, expected}); }
}
async function add(p, label, key, network) {
  await showPanel(p, 'wallets');
  await p.locator('#ct-label').fill(label); await p.locator('#ct-xpub').fill(key);
  await p.locator('#ct-network').selectOption(network);
  await p.waitForSelector('ol li code'); await p.getByLabel(/I opened my wallet/).check();
  await p.getByRole('button', {name:'Save counter', exact:true}).click();
}
try {
  for (const coin of ['ltc', 'btc']) {
    const c = await browser.newContext({viewport:{width:1440,height:1100}});
    // Hold sales unpaid so assertions inspect merchant QR pixels, not settlement fixtures or messages.
    await c.route(/https:\/\/(mempool\.space|litecoinspace\.org)\//, r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({chain_stats:{funded_txo_sum:0,tx_count:0},mempool_stats:{}})}));
    const p = await c.newPage(); await p.goto(base);
    const label = `${coin} primary`; const scheme = coin === 'ltc' ? 'litecoin' : 'bitcoin';
    await add(p,label,zpub,`${coin}-mainnet`);
    const account = await p.evaluate(()=>JSON.parse(localStorage.getItem('slip.accounts.v1')).accounts[0]);
    await p.getByRole('button',{name:'address 0/0 QR',exact:true}).click();
    await check(p.locator('[data-panel="wallets"] svg').last(),scheme,account.firstAddress,null,label,`${coin} counter`);
    await showPanel(p,'till');await p.locator('#tl-custom').fill('1');await p.locator('#tl-rate').fill('100');await p.locator('#tl-charge').click();await p.locator('#tl-pay').waitFor();
    let invoices = await p.evaluate(()=>JSON.parse(localStorage.getItem('slip.ledger.v1')).invoices);
    const first=invoices.at(-1);
    await check(p.locator('#tl-pay .v2-qr-box svg'),scheme,first.address,first.amountAtoms,label+' · giveabit.io',`${coin} single merchant`);
    // Reload preserves real invoice, then navigate to the independent standing-request producer.
    await p.reload(); await showPanel(p,'requests'); await p.locator('#rq-label').fill('Rent');await p.locator('#rq-amount').fill('2');await p.locator('#rq-rate').fill('100');await p.getByRole('button',{name:'add request',exact:true}).click();await p.getByText('saved',{exact:true}).waitFor();await p.reload();await showPanel(p,'requests');await p.locator('#rq-rate').fill('100');await p.getByRole('button',{name:'show request QR',exact:true}).click();
    await p.locator('[data-panel="requests"] .v2-qr-box svg').waitFor();
    invoices=await p.evaluate(()=>JSON.parse(localStorage.getItem('slip.ledger.v1')).invoices);const request=invoices.find(i=>i.note.startsWith('request:'));
    await check(p.locator('[data-panel="requests"] .v2-qr-box svg'),scheme,request.address,request.amountAtoms,'Rent',`${coin} standing request`);
    await c.close();
  }
  // Mixed split: primary BTC and second LTC, both compact and enlarged codes.
  const c=await browser.newContext({viewport:{width:1440,height:1100}});
  await c.route(/https:\/\/(mempool\.space|litecoinspace\.org)\//,r=>r.fulfill({status:200,contentType:'application/json',body:'{"chain_stats":{},"mempool_stats":{}}'}));
  const p=await c.newPage();await p.goto(base);await add(p,'BTC split',zpub,'btc-mainnet');await add(p,'LTC split',xpub,'ltc-mainnet');
  await showPanel(p,'till');await p.locator('#tl-custom').fill('10');await p.locator('#tl-rate').fill('100');await p.locator('#tl-split').check();
  // Select BTC as second if the most recently added LTC became primary: test both actual coin identities.
  const option=p.locator('#tl-split-wallet option[value]:not([value=""])').first();await p.locator('#tl-split-wallet').selectOption(await option.getAttribute('value'));await p.locator('#tl-split-pct').fill('40');await p.locator('#tl-charge').click();await p.locator('.v2-split-codes').waitFor();
  const state=await p.evaluate(()=>({invoices:JSON.parse(localStorage.getItem('slip.ledger.v1')).invoices,accounts:JSON.parse(localStorage.getItem('slip.accounts.v1')).accounts}));
  const legs=['BTC split','LTC split'].map(label=>state.invoices.find(i=>i.walletLabel===label));
  for(let i=0;i<2;i++) {
    const invoice=legs[i];const a=state.accounts.find(a=>a.id===invoice.walletId);const scheme=a.networkId.startsWith('ltc')?'litecoin':'bitcoin';
    await check(p.locator('.v2-split-codes article .v2-qr-box svg').nth(i),scheme,invoice.address,invoice.amountAtoms,invoice.walletLabel+(i===0?' · giveabit.io':''),`split ${i+1} compact ${a.networkId}`);
    await p.locator('.v2-split-codes .v2-code-btn').nth(i).click();
    await check(p.locator('.v2-split-big .v2-qr-box svg'),scheme,invoice.address,invoice.amountAtoms,invoice.walletLabel,`split ${i+1} enlarged ${a.networkId}`);
    await p.getByRole('button',{name:'Show both codes',exact:true}).click();
  }
  await c.close(); assert.deepEqual(failures, [], 'All rendered payment SVGs must decode to the exact coin-specific URI');
} finally { await browser.close(); }
