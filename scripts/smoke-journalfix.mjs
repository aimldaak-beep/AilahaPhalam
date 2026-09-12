// Journal-logic fix + weekly close-stamp rows + Stamp-all + Saturday alert smoke. SITE env (default local preview);
// user from scripts/seed_journalfix.py. Three injected IST clocks: Sat 15:00 · Sat 17:30 · Sun 12:00.
import { chromium } from 'playwright';
import fs from 'fs';
const SITE = process.env.SITE || 'http://127.0.0.1:4173';
const REF = 'crhlsheofcneafhbdrld';
const DIR = process.env.PT_DIR;
const OUT = DIR + '/journalfix-shots' + (process.env.TAG ? '-' + process.env.TAG : '');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const sessObj = JSON.parse(fs.readFileSync(`${DIR}/sessPT.json`, 'utf8')); sessObj.expires_at = 1800000000; sessObj.expires_in = 999999;
const sess = JSON.stringify(sessObj);
const DATE_OVERRIDE = (fakeMs) => { const RD = Date; window.Date = class extends RD { constructor(...a) { if (a.length === 0) super(fakeMs); else super(...a); } static now() { return fakeMs; } }; };
const results = []; let n = 0;
const step = async (name, fn) => { try { await fn(); results.push([name, 'PASS']); console.log('• PASS', name); } catch (e) { results.push([name, 'FAIL ' + e.message.split('\n')[0]]); console.log('• FAIL', name, e.message.split('\n')[0]); } };
const browser = await chromium.launch();
async function open(fakeIso) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1700 } });
  await ctx.addInitScript(DATE_OVERRIDE, Date.parse(fakeIso));
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, sess]);
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.getByText('Open MTM', { exact: false }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  return page;
}
const shot = async (p, nm) => { n++; await p.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${nm}.png`, fullPage: true }); };
const tab = (p, name) => p.getByRole('button', { name, exact: true }).click();
const body = (p) => p.locator('body').innerText();
const must = (txt, re, label) => { if (!re.test(txt)) throw new Error(`${label}: expected ${re} — got …${txt.replace(/\s+/g, ' ').slice(0, 320)}`); };
const week = (p, key) => p.locator(`[data-week="${key}"]`);
const alert = (p) => p.locator('[data-alert="pending-stamps"]');

// ---------- A: Saturday 15:00 IST (before 17:00) — the exact time of AKS's bug report ----------
let p = await open('2026-09-12T09:30:00Z');
await step('A1 LIVE: no auto-popup settlement panel; no alert before Sat 17:00; headline +₹74,045 (4 live)', async () => {
  if (await p.getByRole('region', { name: 'Weekly settlement' }).count()) throw new Error('old Saturday panel still renders');
  if (await alert(p).count()) throw new Error('alert before 17:00');
  const b = await body(p); must(b, /Open MTM · 4 live/, 'live count'); must(b, /\+₹74,045/, 'headline');
});
await step('A2 LIVE: weekly close-stamp row on BOTH unstamped trades the moment they are live (W37 input + "Stamp W37" + UNSTAMPED)', async () => {
  for (const sym of ['TATA-PT', 'GIFT-PT']) {
    const inp = p.getByLabel(`${sym} W37 weekly close`); if (!(await inp.count())) throw new Error(`${sym} stamp input missing`);
  }
  if ((await p.locator('[data-stamp-row="2026-W37"]').count()) !== 2) throw new Error('stamp rows != 2');
  must(await body(p), /Stamp W37/, 'button');
  await shot(p, 'sat1500-live');
});
await step('A3 JOURNAL W37 (Sat before 17:00, the bug): 1 closed · 4 open · 2 unstamped — TATA-PT and GIFT-PT PRESENT as "unstamped"; NIF −₹3,750, NAS +₹70,844; unrealized +₹67,094 (unstamped uncounted)', async () => {
  await tab(p, 'Journal'); await p.waitForTimeout(600);
  const w = await week(p, '2026-W37').innerText();
  must(w, /1 closed · 4 open · 2 unstamped · in progress/, 'header counts');
  must(w, /TATA-PT[\s\S]*opened 09 Sept[\s\S]*unstamped[\s\S]*entry\s+8,000/i, 'TATA row');
  must(w, /GIFT-PT[\s\S]*opened 07 Sept[\s\S]*unstamped/i, 'GIFT row');
  must(w, /NIF-PT[\s\S]*−₹3,750/, 'NIF'); must(w, /NAS-PT[\s\S]*\+₹70,844/, 'NAS');
  must(w, /Unrealized\s+\+₹67,094/i, 'unrealized total'); must(w, /Stamp all · 2/, 'stamp-all button');
  if ((await week(p, '2026-W37').locator('[data-open-row]').count()) !== 4) throw new Error('open rows != 4');
  await shot(p, 'sat1500-journal');
});
await p.context().close();

// ---------- B: Saturday 17:30 IST ----------
p = await open('2026-09-12T12:00:00Z');
await step('B1 ALERT from Sat 17:00: "W37 closing values pending — 2 trades unstamped (…)", ink (not urgent); ✕ dismisses; navigating brings it back', async () => {
  await alert(p).waitFor({ timeout: 5000 });
  const a = await alert(p).innerText(); must(a, /W37 closing values pending — 2 trades unstamped \((GIFT-PT, TATA-PT|TATA-PT, GIFT-PT)\)/, 'text');
  if (/URGENT/.test(a)) throw new Error('urgent on Saturday');
  const bg = await alert(p).evaluate((e) => getComputedStyle(e).backgroundColor); if (bg === 'rgb(194, 64, 46)') throw new Error('red on Saturday');
  await shot(p, 'sat1730-alert');
  await alert(p).getByRole('button', { name: '✕' }).click(); await p.waitForTimeout(200);
  if (await alert(p).count()) throw new Error('did not dismiss');
  await tab(p, 'Closed trades'); await p.waitForTimeout(300);
  if (!(await alert(p).count())) throw new Error('did not return on navigation');
});
await p.context().close();

// ---------- C: Sunday 12:00 IST ----------
p = await open('2026-09-13T06:30:00Z');
await step('C1 ALERT urgent (red) from Sunday', async () => {
  await alert(p).waitFor({ timeout: 5000 });
  must(await alert(p).innerText(), /URGENT · W37 closing values pending — 2 trades unstamped/, 'text');
  const bg = await alert(p).evaluate((e) => getComputedStyle(e).backgroundColor); if (bg !== 'rgb(194, 64, 46)') throw new Error('not red: ' + bg);
  await shot(p, 'sun-urgent');
});
await step('C2 STAMP from the live card: TATA-PT W37 = 8100 → row "close 8,100 +₹24,400", headline +₹98,445, alert now 1 trade (GIFT-PT)', async () => {
  await p.getByLabel('TATA-PT W37 weekly close').fill('8100');
  await p.locator('[data-stamp-row="2026-W37"]').filter({ has: p.getByLabel('TATA-PT W37 weekly close') }).getByRole('button', { name: 'Stamp W37' }).click();
  await p.waitForTimeout(1500);
  const b = await body(p); must(b, /TATA-PT[\s\S]*W37 · 7–13 Sep\s+close 8,100\s+\+₹24,400/, 'TATA row'); must(b, /\+₹98,445/, 'headline');
  must(await alert(p).innerText(), /1 trade unstamped \(GIFT-PT\)/, 'alert count');
  await shot(p, 'sun-tata-stamped');
});
await step('C3 alert "Stamp all →" → Journal W37 Stamp-all form lists only GIFT-PT; stamp 24500 → form closes, alert gone, W37 unrealized +₹98,445, 0 unstamped', async () => {
  await alert(p).getByRole('button', { name: 'Stamp all →' }).click(); await p.waitForTimeout(600);
  const region = p.getByRole('region', { name: 'Stamp all W37' }); await region.waitFor({ timeout: 5000 });
  const r = await region.innerText(); must(r, /GIFT-PT · NIFTY FUT — W37 close/, 'GIFT row'); if (/TATA-PT|NIF-PT|NAS-PT/.test(r)) throw new Error('stamped trades listed');
  await shot(p, 'stamp-all-form');
  await region.getByLabel('GIFT-PT W37 close').fill('24500'); await region.getByRole('button', { name: 'Stamp W37' }).click(); await p.waitForTimeout(1500);
  if (await region.count()) throw new Error('form still open');
  if (await alert(p).count()) throw new Error('alert still shown');
  const w = await week(p, '2026-W37').innerText();
  must(w, /1 closed · 4 open(?! · \d+ unstamped)/, 'no unstamped'); must(w, /GIFT-PT[\s\S]*mark 24,500[\s\S]*\+₹6,951/, 'GIFT counted');
  must(w, /TATA-PT[\s\S]*mark 8,100[\s\S]*\+₹24,400/, 'TATA counted'); must(w, /Unrealized\s+\+₹98,445/i, 'unrealized total');
  if (/unstamped/i.test(w)) throw new Error('"unstamped" still in W37');
  await shot(p, 'journal-all-stamped');
});
await step('C4 RELOAD: stamps persisted (headline +₹1,05,396), no alert, header advanced to W38', async () => {
  await p.reload({ waitUntil: 'networkidle' }); await p.getByText('Open MTM', { exact: false }).waitFor({ timeout: 60000 }); await p.waitForTimeout(1500);
  const b = await body(p); must(b, /\+₹1,05,396/, 'headline'); if (await alert(p).count()) throw new Error('alert after stamping');
  must(b, /W38 · 14–20 Sep/, 'header week');
});
await browser.close();
const fails = results.filter((r) => r[1] !== 'PASS');
console.log(`\n${results.length - fails.length}/${results.length} PASS`); fails.forEach((f) => console.log('  FAIL', f[0], '—', f[1]));
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(fails.length ? 1 : 0);
