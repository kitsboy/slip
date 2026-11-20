import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';
import { readFile, mkdir } from 'node:fs/promises';
const base=process.argv[2] ?? 'http://[::1]:4181/';
const out=process.env.TMPDIR+'/slip-next8-after';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:chromePath(),args:['--no-sandbox']});
let checks=0;
function check(name,value,detail){assert.ok(value,`${name}: ${JSON.stringify(detail)}`);checks++;console.log('PASS',name,detail??'');}
try {
for(const theme of ['dark','light']) for(const width of [320,390,768,1440]){
 const c=await browser.newContext({viewport:{width,height:900},colorScheme:theme,reducedMotion:'reduce',acceptDownloads:true});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 const u=new URL(base);u.searchParams.set('demo','1');await p.goto(u.href);await p.locator('#tl-search').waitFor();
 // Saved reading setting is still exercised in the existing site-polish suites; 24px is the maximum text size.
 await p.evaluate(()=>document.documentElement.style.fontSize='24px');
 await p.getByRole('button',{name:'Busy counter mode',exact:true}).click();
 check(`${theme}/${width} larger targets`,await p.locator('.v2-tile').first().evaluate(e=>e.getBoundingClientRect().height>=112));
 check('secondary tools folded but retained',await p.locator('.v2-tools').evaluate(e=>!e.open&&!!e.querySelector('#tl-rate')));
 await p.reload();await p.locator('#tl-search').waitFor();
 check('mode remembered',await p.locator('[data-busy-counter="on"]').count()===1);
 await p.getByRole('button',{name:'Exit busy counter mode',exact:true}).focus();await p.keyboard.press('Enter');
 check('keyboard exit restores tools',await p.locator('.v2-tools').evaluate(e=>e.open));
 await p.evaluate(()=>document.documentElement.style.fontSize='24px');
 await p.screenshot({path:`${out}/${theme}-${width}-sell.png`});
 await showPanel(p,'wallets');const ready=p.locator('[data-readiness]');await ready.waitFor({state:'visible'});
 check('summary explicitly does not certify readiness',/does not certify funding/.test(await ready.innerText()));
 check('five real checks with navigable fixes',await ready.locator('li').count()===5&&await ready.locator('li a[href^="#"]').count()===5);
 await c.setOffline(true);await ready.getByText(/Browser reports offline/).waitFor();
 check('offline transition does not greenlight providers',/Unknown/.test(await ready.innerText()));
 check('readiness fits at largest text',await p.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
 await ready.screenshot({path:`${out}/${theme}-${width}-readiness.png`});
 await c.setOffline(false);await ready.getByText(/Browser reports online/).waitFor();
 await p.locator('[data-offline-capabilities] summary').click();
 check('offline capabilities distinguishes local and provider',/cart, saved books/.test(await p.locator('[data-offline-capabilities]').innerText())&&/only a hint/.test(await p.locator('[data-offline-capabilities]').innerText()));
 await showPanel(p,'history');await p.locator('[data-export-preview] summary').click();
 const preview=await p.locator('[data-csv-preview]').inputValue();const [download]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'download CSV',exact:true}).click()]);
 check('preview exactly matches download',await readFile(await download.path(),'utf8')===preview);
 check('all 14 exact columns explained',await p.locator('[data-export-preview] dt').count()===14);
 check('export fits at largest text',await p.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
 await p.locator('[data-export-preview]').screenshot({path:`${out}/${theme}-${width}-export.png`});
 await showPanel(p,'backup');check('missing file and passphrase limits',/No file\?/.test(await p.locator('[data-guided-recovery]').innerText())&&/cannot be reset/.test(await p.locator('[data-guided-recovery]').innerText()));
 await p.getByLabel('Choose a .slip backup file').setInputFiles({name:'bad.slip',mimeType:'application/json',buffer:Buffer.from('{}')});
 check('invalid file never offers restore',await p.getByRole('button',{name:'Confirm restore',exact:true}).count()===0);
 await p.locator('#bk-pass').fill('a long safe passphrase 123');
 const [backup]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Export encrypted backup',exact:true}).click()]);
 await p.getByLabel('Choose a .slip backup file').setInputFiles(await backup.path());
 await p.locator('#bk-pass').fill('wrong');
 check('restore blocked until successful preflight',await p.getByRole('button',{name:'Confirm restore',exact:true}).getAttribute('aria-disabled')==='true');
 const snapshot=await p.evaluate(()=>JSON.stringify({...localStorage}));
 await p.getByRole('button',{name:'Test my backup — no changes',exact:true}).click();await p.getByText(/passphrase is wrong|could not decrypt/i).waitFor();
 check('wrong password is nonmutating',await p.evaluate(()=>JSON.stringify({...localStorage}))===snapshot);
 // Hold real WebCrypto decryption in flight, edit the password, then release the OLD success.
 await p.locator('#bk-pass').fill('a long safe passphrase 123');
 await p.evaluate(()=>{
   const decrypt=crypto.subtle.decrypt.bind(crypto.subtle);
   window.__decryptStarted=false;
   crypto.subtle.decrypt=async(...args)=>{
     const result=await decrypt(...args);
     window.__decryptStarted=true;
     await new Promise(resolve=>{window.__releaseDecrypt=resolve;});
     return result;
   };
   window.__restoreDecrypt=()=>{crypto.subtle.decrypt=decrypt;};
 });
 await p.getByRole('button',{name:'Test my backup — no changes',exact:true}).click();
 await p.waitForFunction(()=>window.__decryptStarted);
 await p.locator('#bk-pass').fill('changed while validation pending');
 await p.evaluate(()=>{window.__restoreDecrypt();window.__releaseDecrypt();});
 await p.waitForFunction(()=>document.querySelector('[data-panel="backup"] button.btn-secondary')?.getAttribute('aria-disabled')==='false');
 check('stale successful validation cannot authorize changed password',await p.getByRole('button',{name:'Confirm restore',exact:true}).getAttribute('aria-disabled')==='true');
 check('stale validation remains nonmutating',await p.evaluate(()=>JSON.stringify({...localStorage}))===snapshot);
 await p.locator('#bk-pass').fill('a long safe passphrase 123');await p.getByRole('button',{name:'Test my backup — no changes',exact:true}).click();await p.getByText(/Validated encryption, checksum/).waitFor();
 check('valid preflight enables explicit confirmation',await p.getByRole('button',{name:'Confirm restore',exact:true}).getAttribute('aria-disabled')!=='true');
 check('preflight did not mutate books',await p.evaluate(()=>JSON.stringify({...localStorage}))===snapshot);
 await p.locator('#bk-pass').fill('changed');check('password change invalidates preflight',await p.getByRole('button',{name:'Confirm restore',exact:true}).getAttribute('aria-disabled')==='true');
 check('recovery fits at largest text',await p.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
 await p.screenshot({path:`${out}/${theme}-${width}-recovery.png`});
 await showPanel(p,'till');await p.locator('.v2-tile').first().click();await p.locator('#tl-rate').fill('60000');await p.locator('#tl-charge').click();await p.locator('.v2-receipt').waitFor({timeout:30000});
 const handoff=p.locator('[data-receipt-handoff]');
 await p.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});});
 await handoff.getByRole('button',{name:'Copy full receipt URL',exact:true}).click();await handoff.getByRole('status').getByText(/URL copied/).waitFor();
 check('full URL includes fragment',await p.evaluate(()=>window.__copied.includes('#')&&new URL(window.__copied).search==='?receipt=1'));
 await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));await handoff.getByRole('button',{name:'Copy full receipt URL',exact:true}).click();await handoff.getByText(/Copy failed/).waitFor();
 await handoff.locator('summary').click();check('failed copy has selectable exact fallback',await handoff.locator('textarea').inputValue()===await p.evaluate(()=>window.__copied));
 await p.screenshot({path:`${out}/${theme}-${width}-handoff.png`});
 const geometry=await p.evaluate(()=>({page:document.documentElement.scrollWidth-innerWidth,card:document.querySelector('.v2-receipt').scrollWidth-document.querySelector('.v2-receipt').clientWidth}));check('large text receipt fits',geometry.page===0&&geometry.card===0,geometry);
 check('no runtime errors',errors.length===0,errors);await c.close();
}
// Exception fixtures are synthetic provider observations; no external requests or funds.
for (const scenario of ['seen','expired','underpaid']) {
 const c=await browser.newContext({viewport:{width:390,height:900}}); const p=await c.newPage();
 let receive=0; let providerHits=0; const appOrigin=new URL(base).origin;
 await c.route('https://**/*', r=>{
   // The fixture is for external providers, never the app document/assets on HTTPS.
   if(new URL(r.request().url()).origin===appOrigin) return r.continue();
   providerHits++;
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({chain_stats:{funded_txo_sum:receive,tx_count:receive?1:0},mempool_stats:{funded_txo_sum:scenario==='seen'?1000000:0,tx_count:scenario==='seen'?1:0}})});
 });
 await p.goto(base); await showPanel(p,'wallets');await p.locator('#ct-label').fill('LTC exception fixture');
 await p.locator('#ct-xpub').fill('zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs');
 await p.locator('#ct-network').selectOption('ltc-mainnet');await p.waitForSelector('ol li code');await p.getByLabel(/I opened my wallet/).check();await p.getByRole('button',{name:'Save counter',exact:true}).click();
 await showPanel(p,'till');await p.locator('#tl-custom').fill('1');await p.locator('#tl-rate').fill('100');
 // Advance only the browser clock so the real invoice creation/expiry path remains intact.
 await p.clock.install();await p.locator('#tl-charge').click();await p.locator('#tl-pay').waitFor();
 if(scenario!=='seen'){await p.clock.fastForward(16*60*1000);if(scenario==='underpaid')receive=1;}
 await p.locator('#tl-check').click();
 const guidance=p.locator('[data-payment-next]');await guidance.getByText(scenario==='seen'?/Wait for confirmation/:scenario==='expired'?/request expired/:/Short payment/).waitFor();
 const text=await guidance.innerText();check('provider fixture exercised '+scenario,providerHits>0,{providerHits});check('actual invoice '+scenario,scenario!=='underpaid'||/LTC/.test(text),text);
 const last=await p.locator('#tl-pay').innerText();await c.setOffline(true);await p.clock.fastForward(30000);
 check('offline retains existing check age',/checked/.test(last)&&/checked/.test(await p.locator('#tl-pay').innerText()));
 await p.screenshot({path:`${out}/ltc-${scenario}.png`});await c.close();
}

// Native share outcomes are injected browser APIs, not claims of real OS delivery.
for(const outcome of ['ok','cancel','fail']){
 const c=await browser.newContext();const p=await c.newPage();await p.addInitScript(mode=>{Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{if(mode!=='ok')throw new DOMException('test',mode==='cancel'?'AbortError':'NotAllowedError');}});},outcome);
 const u=new URL(base);u.searchParams.set('demo','1');await p.goto(u.href);await p.locator('.v2-tile').first().click();await p.locator('#tl-charge').click();await p.locator('.v2-receipt').waitFor({timeout:30000});
 await p.getByRole('button',{name:'Share receipt',exact:true}).click();const status=await p.locator('[data-receipt-handoff] [role="status"]').innerText();check('native share '+outcome,outcome==='ok'?/Delivery is not verified/.test(status):outcome==='cancel'?/cancelled/.test(status):/failed/.test(status),status);await c.close();
}
console.log(`${checks} next8 checks passed; evidence ${out}`);
}finally{await browser.close();}
