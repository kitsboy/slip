#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromePath } from './_chrome.mjs';
const base = process.argv[2] ?? 'http://[::1]:4181/';
const out = process.argv[3];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
}
for (const theme of ['dark', 'light']) {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width < 400 ? 844 : 960 }, colorScheme: theme, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    for (const section of ['sell', 'money', 'books', 'setup', 'more', 'learn']) {
      const url = new URL(base); url.searchParams.set('demo', '1'); url.hash = section;
      await page.goto(String(url));
      await page.locator(`#${section}`).waitFor({ state: 'visible' });
      await page.waitForTimeout(100);
      const metrics = await page.evaluate(section => {
        const panel = document.getElementById(section);
        const heading = document.getElementById(`${section}-title`);
        const resume = document.querySelector('[data-open-sale]');
        return { overflow: document.documentElement.scrollWidth - innerWidth, label: panel.getAttribute('aria-labelledby'), title: heading.textContent, resumePosition: resume && getComputedStyle(resume).position, titleSize: parseFloat(getComputedStyle(heading).fontSize), headingTop: heading.getBoundingClientRect().top, headerBottom: document.querySelector('header').getBoundingClientRect().bottom };
      }, section);
      check(`${theme}/${width}/${section}: fits and has named section`, metrics.overflow === 0 && metrics.label === `${section}-title`, metrics);
      if (section !== 'sell') check(`${theme}/${width}/${section}: reading hierarchy and non-floating resume`, metrics.titleSize >= 24 && metrics.resumePosition !== 'fixed' && metrics.headingTop >= metrics.headerBottom, metrics);
      if (out) await page.screenshot({ animations: 'disabled', timeout: 60000, path: join(out, `${width}-${section}-${theme}.png`) });
    }
    const walletsUrl = new URL(base); walletsUrl.searchParams.set('demo', '1'); walletsUrl.hash = 'wallets';
    await page.goto(String(walletsUrl));
    await page.getByRole('button', { name: 'address 0/0 QR', exact: true }).first().click();
    const codeMetrics = await page.locator('.v2-public-code').evaluateAll(rows => rows.map(row => {
      const qr = row.querySelector('div'); const text = row.querySelector('p');
      return { overflow: row.scrollWidth - row.clientWidth, textOverflow: text.scrollWidth - text.clientWidth, textWidth: text.getBoundingClientRect().width, stacked: text.getBoundingClientRect().top >= qr.getBoundingClientRect().bottom };
    }));
    check(`${theme}/${width}: both public-code rows fit internally`, codeMetrics.length >= 2 && codeMetrics.every(r => r.overflow <= 1 && r.textOverflow <= 1 && r.textWidth >= 160 && (width >= 640 || r.stacked)), codeMetrics);
    if (out) await page.screenshot({ animations: 'disabled', path: join(out, `${width}-wallet-codes-${theme}.png`) });
    const primaryUrl = new URL(base); primaryUrl.searchParams.set('demo', '1'); primaryUrl.hash = 'money';
    await page.goto(String(primaryUrl));
    const primary = page.getByRole('button', { name: 'add request', exact: true });
    const brass = await primary.evaluate(el => {
      const bg = getComputedStyle(el).backgroundColor;
      return { bg, expected: getComputedStyle(document.documentElement).getPropertyValue('--v2-acc').trim(), primaries: [...document.querySelectorAll('#money button')].filter(b => b.getClientRects().length && getComputedStyle(b).backgroundColor === bg).length };
    });
    check(`${theme}/${width}: request has one brass primary`, brass.bg === 'rgb(240, 163, 42)' && brass.primaries === 1, brass);
    // Largest built-in text setting applied through the real Settings control.
    const text = page.locator('#st-size');
    const setupUrl = new URL(base); setupUrl.searchParams.set('demo', '1'); setupUrl.hash = 'settings';
    await page.goto(String(setupUrl));
    // Select by label; the id is discovered from the live form when it differs.
    const size = await text.count() ? text : page.getByLabel('Text size', { exact: true });
    await size.selectOption('large');
    await page.getByRole('button', { name: /save settings/i }).click();
    await page.waitForTimeout(100);
    check(`${theme}/${width}: large reading type grows`, await page.locator('.v2-section-heading p').filter({ visible: true }).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 17);
    check(`${theme}/${width}: large text fits`, await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
    if (out) await page.screenshot({ animations: 'disabled', timeout: 60000, path: join(out, `${width}-large-${theme}.png`) });
    const moneyUrl = new URL(base); moneyUrl.searchParams.set('demo', '1'); moneyUrl.hash = 'money';
    await page.goto(String(moneyUrl));
    const opener = page.getByRole('button', { name: 'Refunds', exact: true });
    await opener.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Refunds', exact: true });
    await dialog.waitFor();
    check(`${theme}/${width}: modal locks page scroll`, await page.evaluate(() => document.body.style.overflow === 'hidden'));
    await dialog.getByRole('link', { name: 'Open Books', exact: true }).focus();
    await page.keyboard.press('Tab');
    check(`${theme}/${width}: sheet traps Tab`, await dialog.getByRole('button', { name: 'Close', exact: true }).evaluate(el => el === document.activeElement));
    await page.keyboard.press('Shift+Tab');
    check(`${theme}/${width}: sheet traps reverse Tab`, await dialog.getByRole('link', { name: 'Open Books', exact: true }).evaluate(el => el === document.activeElement));
    await page.keyboard.press('Escape');
    check(`${theme}/${width}: Escape restores opener and scrolling`, await opener.evaluate(el => el === document.activeElement && document.body.style.overflow !== 'hidden'));
    const explainUrl = new URL(base); explainUrl.searchParams.set('demo', '1'); explainUrl.searchParams.set('explain', '1');
    await page.goto(String(explainUrl));
    const guide = page.locator('[data-panel="explainer"]');
    const guideText = await guide.innerText();
    check(`${theme}/${width}: customer guidance reflects rails and payment states`, ['Bitcoin', 'Litecoin', 'Lightning', 'short payment', 'overpayment', 'marked paid', 'simulated', 'providers receive requests'].every(s => guideText.includes(s)) && !guideText.includes('Nothing about you leaves it'));
    check(`${theme}/${width}: customer instructions follow large text`, await guide.locator('ol').evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 17);
    if (out) await page.screenshot({ animations: 'disabled', path: join(out, `${width}-explainer-${theme}.png`) });
    const fresh = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: theme, reducedMotion: 'reduce' });
    const welcome = await fresh.newPage();
    await welcome.goto(base);
    await welcome.getByRole('button', { name: /set up my shop/i }).click();
    const next = welcome.getByRole('button', { name: 'Continue', exact: true });
    const welcomeMetrics = await next.evaluate(el => ({ bottom: el.getBoundingClientRect().bottom, top: el.getBoundingClientRect().top }));
    check(`${theme}/${width}: welcome action before long optional guides`, welcomeMetrics.top >= 0 && welcomeMetrics.bottom <= 844, welcomeMetrics);
    check(`${theme}/${width}: welcome safety remains visible`, await welcome.getByText('It will never ask for your seed phrase.', { exact: false }).isVisible());
    if (out) await welcome.screenshot({ animations: 'disabled', path: join(out, `${width}-welcome-${theme}.png`) });
    await fresh.close();
    check(`${theme}/${width}: no runtime errors`, errors.length === 0, errors);
    await context.close();
  }
}
await browser.close();
if (out) writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2));
const failures = results.filter(r => !r.ok);
console.log(`${results.length} checks, ${failures.length} failures`);
process.exit(failures.length ? 1 : 0);
