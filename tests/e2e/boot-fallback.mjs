import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
const CHROME = chromePath();
const b = await chromium.launch({executablePath:CHROME,args:['--no-sandbox']});
let fail = 0;
const check = (n,ok,d='') => { console.log(`${ok?'PASS':'FAIL'}  ${n}${!ok&&d?' — '+d:''}`); if(!ok) fail++; };

// normal load: fallback must be replaced by the app
const p1 = await b.newPage();
await p1.goto('file:///root/slip/dist/index.html',{waitUntil:'load'});
await p1.waitForSelector('h1');
check('app boots and replaces the fallback', (await p1.locator('text=slip did not start').count()) === 0);

// script blocked (JS off): fallback must explain, not show blank
const ctx = await b.newContext({ javaScriptEnabled:false });
const p2 = await ctx.newPage();
await p2.goto('file:///root/slip/dist/index.html',{waitUntil:'load'});
const txt = (await p2.locator('body').innerText()).replace(/\s+/g,' ');
check('blocked script shows an explanation, not a blank page', /slip did not start/.test(txt), txt.slice(0,120));
check('explanation names the hard-reload fix', /Shift \+ R/.test(txt));
check('bridge to pages.dev offered', /slip-6d6\.pages\.dev/.test(txt));
await p2.screenshot({path:'/root/slip/screenshots/boot-fallback.png'});
await b.close();
console.log(fail===0 ? '\nboot-fallback checks passed.' : `\n${fail} failed.`);
process.exit(fail===0?0:1);
