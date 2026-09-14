// STAMP LAW + STAMP WINDOW smoke (2026-09-14). SITE env (default local preview); user from scripts/seed_stampwin.py.
// Injected IST clocks: Wed 16 Sep 12:00 · Sat 19 Sep 10:00 · Sun 20 Sep 12:00 · Wed 23 Sep 12:00.
import { chromium } from 'playwright';
import fs from 'fs';
const SITE = process.env.SITE || 'http://127.0.0.1:4173';
const REF = 'crhlsheofcneafhbdrld';
const DIR = process.env.PT_DIR;
const OUT = DIR + '/stampwin-shots' + (process.env.TAG ? '-' + process.env.TAG : '');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const sessObj = JSON.parse(fs.readFileSync(`${DIR}/sessPT.json`, 'utf8')); sessObj.expires_at = 1800000000; sessObj.expires_in = 999999;
const sess = JSON.stringify(sessObj);
const DATE_OVERRIDE = (fakeMs) => { const RD = Date; window.Date = class extends RD { constructor(...a) { if (a.length === 0) super(fakeMs); else super(...a); } static now() { return fakeMs; } }; };
const results = []; let n = 0;
const step = async (name, fn) => { try { await fn(); results.push([name, 'PASS']); console.log('• PASS', name); } catch (e) { results.push([name, 'FAIL ' + e.message.split('\n')[0]]); console.log('• FAIL', name, e.message.split('\n')[0]); } };
const browser = await chromium.launch();
async function open(fakeIso) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1900 } });
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
const mustNot = (txt, re, label) => { if (re.test(txt)) throw new Error(`${label}: must not match ${re}`); };
const week = (p, key) => p.locator(`[data-week="${key}"]`);
const alert = (p) => p.locator('[data-alert="pending-stamps"]');
const stampRows = (p, key) => p.locator(key ? `[data-stamp-row="${key}"]` : '[data-stamp-row]');
const closeEdits = (p) => p.getByTitle("Edit this week's closing value");

// ---------- A: WEDNESDAY 16 Sep 12:00 IST — weekday: nothing about stamps on the card ----------
let p = await open('2026-09-16T06:30:00Z');
await step('A1 LIVE Wed: 5 live, +₹74,045; NO stamp rows, no "Stamp W" button, no "weekly close" input, ledger closes plain (no edit affordance)', async () => {
  const b = await body(p); must(b, /Open MTM · 5 live/, 'live count'); must(b, /\+₹74,045/, 'headline');
  if (await stampRows(p).count()) throw new Error('stamp rows on a weekday: ' + await stampRows(p).count());
  mustNot(b, /Stamp W\d\d/, 'stamp button'); mustNot(b, /UNSTAMPED/, 'unstamped tag');
  if (await p.getByPlaceholder('weekly close').count()) throw new Error('weekly close input on a weekday');
  must(b, /NIF-PT[\s\S]*close 24,500[\s\S]*close 24,450/, 'ledger rows still shown');
  if (await closeEdits(p).count()) throw new Error('close edit affordance on a weekday');
  await shot(p, 'wed-live');
});
await step('A2 ALERT Wed (overdue W37): stays — "URGENT · W37 closing values pending — 2 trades unstamped (GIFT-PT, TATA-PT)"; SUN-PT (opened Sun 13 Sep) NOT named', async () => {
  await alert(p).waitFor({ timeout: 5000 });
  const a = await alert(p).innerText(); must(a, /URGENT · W37 closing values pending — 2 trades unstamped \((GIFT-PT, TATA-PT|TATA-PT, GIFT-PT)\)/, 'text'); mustNot(a, /SUN-PT/, 'SUN-PT owes nothing for W37');
});
await step('A3 JOURNAL W37: "1 closed · 4 open · 2 unstamped" — SUN-PT absent (never a week before it was alive at the close); W38 in progress lists all 5 incl. SUN-PT unstamped', async () => {
  await tab(p, 'Journal'); await p.waitForTimeout(600);
  const w37 = await week(p, '2026-W37').innerText();
  must(w37, /1 closed · 4 open · 2 unstamped/, 'W37 header'); mustNot(w37, /SUN-PT/, 'SUN-PT in W37');
  must(w37, /TATA-PT[\s\S]*unstamped/i, 'TATA'); must(w37, /GIFT-PT[\s\S]*unstamped/i, 'GIFT');
  const w38 = await week(p, '2026-W38').innerText();
  must(w38, /0 closed · 5 open · 5 unstamped · in progress/, 'W38 header'); must(w38, /SUN-PT[\s\S]*opened 13 Sept[\s\S]*unstamped/i, 'SUN-PT in W38');
  await shot(p, 'wed-journal');
});
await step('A4 Stamp-all W37 form lists TATA-PT + GIFT-PT only — not SUN-PT', async () => {
  await week(p, '2026-W37').getByRole('button', { name: 'Stamp all · 2' }).click(); await p.waitForTimeout(400);
  const region = p.getByRole('region', { name: 'Stamp all W37' }); await region.waitFor({ timeout: 5000 });
  const r = await region.innerText(); must(r, /TATA-PT/, 'TATA'); must(r, /GIFT-PT/, 'GIFT'); mustNot(r, /SUN-PT|NIF-PT|NAS-PT/, 'non-owed listed');
  await region.getByRole('button', { name: 'Cancel' }).click(); await p.waitForTimeout(200);
});
await step('A5 existing stamp EDITABLE via the journal week on a weekday: NIF-PT W37 mark 24,450 → 24,460 → piece −₹3,000, headline +₹74,795', async () => {
  const row = week(p, '2026-W37').locator('[data-open-row="t_nif_pt"]');
  await row.getByRole('button', { name: 'mark 24,450' }).click();
  const inp = p.getByLabel('NIF-PT W37 mark'); await inp.fill('24460'); await inp.press('Enter'); await p.waitForTimeout(1500);
  const w37 = await week(p, '2026-W37').innerText(); must(w37, /NIF-PT[\s\S]*mark 24,460[\s\S]*−₹3,000/, 'NIF row after edit');
  await tab(p, 'Live trades'); await p.waitForTimeout(500);
  const b = await body(p); must(b, /\+₹74,795/, 'headline'); must(b, /close 24,460/, 'ledger shows the edit'); if (await closeEdits(p).count()) throw new Error('edit affordance appeared');
  await shot(p, 'wed-after-journal-edit');
});
await p.context().close();

// ---------- B: SATURDAY 19 Sep 10:00 IST — window open from 00:00; that week = W38 ----------
p = await open('2026-09-19T04:30:00Z');
await step('B1 LIVE Sat 10:00: exactly one W38 stamp row on each of the 5 live cards (SUN-PT included — alive at Fri 18 Sep close); NO W37 rows on the card; ledger closes editable', async () => {
  if ((await stampRows(p, '2026-W38').count()) !== 5) throw new Error('W38 rows != 5: ' + await stampRows(p, '2026-W38').count());
  if ((await stampRows(p).count()) !== 5) throw new Error('rows for other weeks present: ' + await stampRows(p).count());
  for (const sym of ['SUN-PT', 'TATA-PT', 'GIFT-PT', 'NIF-PT', 'NAS-PT']) if (!(await p.getByLabel(`${sym} W38 weekly close`).count())) throw new Error(`${sym} W38 input missing`);
  must(await body(p), /Stamp W38/, 'button'); if ((await closeEdits(p).count()) !== 3) throw new Error('close edits != 3: ' + await closeEdits(p).count());
  await shot(p, 'sat-live');
});
await step('B2 ALERT Sat before 17:00 still asks the overdue W37 (2 trades), not urgent; SUN-PT not named', async () => {
  await alert(p).waitFor({ timeout: 5000 }); const a = await alert(p).innerText();
  must(a, /^W37 closing values pending — 2 trades unstamped/, 'text'); mustNot(a, /SUN-PT/, 'SUN');
});
await step('B3 STAMP from the card: SUN-PT W38 = 24600 → row "W38 · 14–20 Sep close 24,600 +₹6,949", headline +₹81,744, SUN-PT stamp row gone (4 remain)', async () => {
  await p.getByLabel('SUN-PT W38 weekly close').fill('24600');
  await stampRows(p, '2026-W38').filter({ has: p.getByLabel('SUN-PT W38 weekly close') }).getByRole('button', { name: 'Stamp W38' }).click();
  await p.waitForTimeout(1500);
  const b = await body(p); must(b, /SUN-PT[\s\S]*W38 · 14–20 Sep\s+close 24,600\s+\+₹6,949/, 'SUN row'); must(b, /\+₹81,744/, 'headline');
  if ((await stampRows(p, '2026-W38').count()) !== 4) throw new Error('rows != 4');
  await shot(p, 'sat-sun-stamped');
});
await p.context().close();

// ---------- C: SUNDAY 20 Sep 12:00 IST ----------
p = await open('2026-09-20T06:30:00Z');
await step('C1 LIVE Sun: 4 W38 stamp rows remain (SUN-PT stamped); alert now asks W38 — URGENT, 4 trades (SUN-PT not named)', async () => {
  if ((await stampRows(p, '2026-W38').count()) !== 4) throw new Error('rows != 4: ' + await stampRows(p, '2026-W38').count());
  await alert(p).waitFor({ timeout: 5000 }); const a = await alert(p).innerText();
  must(a, /URGENT · W38 closing values pending — 4 trades unstamped/, 'text'); mustNot(a, /SUN-PT/, 'SUN');
  await shot(p, 'sun-live');
});
// TATA-PT's W37 (owed, still unstamped) keeps its entry brokerage uncounted until stamped (unchanged law) — so W38 = (8100−8000)×250 = +25,000.
await step('C2 STAMP from the card: TATA-PT W38 = 8100 → "close 8,100 +₹25,000", headline +₹1,06,744, alert 3 trades', async () => {
  await p.getByLabel('TATA-PT W38 weekly close').fill('8100');
  await stampRows(p, '2026-W38').filter({ has: p.getByLabel('TATA-PT W38 weekly close') }).getByRole('button', { name: 'Stamp W38' }).click();
  await p.waitForTimeout(1500);
  const b = await body(p); must(b, /TATA-PT[\s\S]*W38 · 14–20 Sep\s+close 8,100\s+\+₹25,000/, 'TATA row'); must(b, /\+₹1,06,744/, 'headline');
  must(await alert(p).innerText(), /3 trades unstamped/, 'alert count');
});
await step('C3 RELOAD Sun: stamps persisted (+₹1,06,744), SUN-PT W38 close 24,600 in its ledger, 3 stamp rows', async () => {
  await p.reload({ waitUntil: 'networkidle' }); await p.getByText('Open MTM', { exact: false }).waitFor({ timeout: 60000 }); await p.waitForTimeout(1500);
  const b = await body(p); must(b, /\+₹1,06,744/, 'headline'); must(b, /SUN-PT[\s\S]*close 24,600/, 'SUN ledger');
  if ((await stampRows(p).count()) !== 3) throw new Error('rows != 3');
  await shot(p, 'sun-reload');
});
await p.context().close();

// ---------- D: WEDNESDAY 23 Sep 12:00 IST — window closed again ----------
p = await open('2026-09-23T06:30:00Z');
await step('D1 LIVE next Wed: no stamp rows, no inputs, ledger plain; headline +₹1,06,744; journal W38 "0 closed · 5 open · 3 unstamped"', async () => {
  if (await stampRows(p).count()) throw new Error('stamp rows on a weekday');
  if (await p.getByPlaceholder('weekly close').count()) throw new Error('weekly close input on a weekday');
  if (await closeEdits(p).count()) throw new Error('edit affordance on a weekday');
  must(await body(p), /\+₹1,06,744/, 'headline');
  await tab(p, 'Journal'); await p.waitForTimeout(600);
  must(await week(p, '2026-W38').innerText(), /0 closed · 5 open · 3 unstamped/, 'W38 header');
  await shot(p, 'wed2-journal');
});
await browser.close();
const fails = results.filter((r) => r[1] !== 'PASS');
console.log(`\n${results.length - fails.length}/${results.length} PASS`); fails.forEach((f) => console.log('  FAIL', f[0], '—', f[1]));
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(fails.length ? 1 : 0);
