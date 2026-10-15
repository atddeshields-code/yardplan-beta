// Headless check: demo.html + admin.html against tools/dev-server.mjs (needs playwright-core + Chrome).
import { chromium } from 'playwright-core';
const base = 'http://localhost:8788', errs = [];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 420, height: 860 } });
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push(m.text()));
await p.goto(base + '/marketplace/demo.html'); await p.waitForFunction(() => window.__mpReady, null, { timeout: 15000 });
const cards = await p.$$eval('#dirList .pro-card h3', e => e.map(x => x.textContent));
// directory is public: only admin-verified + licensed pros (Washoe = pending, No-License = B-2 unverified; both hidden)
if (cards.join() !== 'Truckee Hardscapes,Sierra Gardens Co.') throw new Error('directory expected only verified+licensed pros, got ' + cards);
await p.click('#home-tab, [data-tab="home"]'); await p.click('#getQuotes'); await p.waitForSelector('dialog.sheet[open]');
await p.screenshot({ path: '/tmp/mp-sheet1.png' });
await p.click('[data-find]'); await p.waitForSelector('#gq-c'); const named = await p.textContent('.consent span');
const disabled = await p.$eval('[data-send]', e => e.disabled); await p.check('#gq-c'); await p.screenshot({ path: '/tmp/mp-sheet2.png' });
await p.click('[data-send]'); await p.waitForSelector('text=Sent!'); const sentTo = await p.textContent('.share-list'); await p.click('[data-x]');
await p.waitForSelector('#leadStatus li');
// pro inbox: pick the pro that got it
const proName = sentTo.split('·')[0].trim();
await p.click('[data-tab="inbox"]'); const opt = await p.$$eval('#who option', (os, n) => os.find(o => o.textContent.startsWith(n))?.value, proName); await p.selectOption('#who', opt);
await p.waitForSelector('[data-lead]'); await p.click('[data-lead]'); await p.waitForSelector('[data-a="accept"]'); await p.click('[data-a="accept"]');
await p.waitForSelector('form[data-f="quote"]'); await p.fill('input[name="amount"]', '8750'); await p.fill('textarea[name="message"]', 'Spring install, 3 days.'); await p.click('form[data-f="quote"] button');
await p.waitForSelector('text=Quote sent.'); await p.screenshot({ path: '/tmp/mp-inbox.png', fullPage: true });
await p.click('[data-tab="home"]'); await p.reload(); await p.waitForFunction(() => window.__mpReady); await p.waitForSelector('#leadStatus li');
const status = await p.textContent('#leadStatus');
// public profile 404s for hidden pros (fetched from the page: plain public GET)
const pub = await p.evaluate(async () => { const s = await (await fetch('/dev/seed')).json(); const out = {};
  for (const x of s.pros || s) out[x.businessName] = (await fetch('/api/pros/' + x.id)).status; return out; });
// empty state
await p.click('[data-tab="dir"], [data-tab="directory"]'); await p.fill('#dirZip', '10001'); await p.press('#dirZip', 'Tab');
await p.waitForSelector('text=No verified pros here yet.'); const scrollX = await p.evaluate(() => scrollX); await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: '/tmp/mp-empty.png' }); console.log('scrollX before reset', scrollX);
// admin
await p.goto(base + '/marketplace/admin.html'); await p.fill('#tok', 'wrong'); await p.click('#go'); await p.waitForSelector('text=Wrong admin token.');
await p.fill('#tok', 'dev-admin'); await p.click('#go'); await p.waitForSelector('text=Loaded.'); const rows = await p.$$eval('#pros tr', r => r.length - 1);
await p.click('[data-ver="verified"]'); await p.waitForSelector('text=Loaded.');
await p.setViewportSize({ width: 1100, height: 900 }); await p.screenshot({ path: '/tmp/mp-admin.png', fullPage: true });
console.log(JSON.stringify({ cards, named: named.slice(0, 160), sendDisabledBeforeConsent: disabled, sentTo: sentTo.trim(), status: status.trim().slice(0, 200), adminPros: rows, pub, errs }, null, 1)); await b.close();
