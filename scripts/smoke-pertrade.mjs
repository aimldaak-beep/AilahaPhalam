// Per-trade FX + weekly MTM journal smoke — drives a build (SITE env, default local preview)
// as the user seeded by scripts/seed_pertrade.py. Clock injected to SUNDAY 13 Sep 2026 12:00 IST
// (W37 has ended, so W37's open positions are marked in the journal); the stored expires_at is
// pushed out so the future fake clock doesn't make supabase-js think the (valid) token expired.
import { chromium } from 'playwright';
import fs from 'fs';
const SITE = process.env.SITE || 'http://127.0.0.1:4173';
const REF = 'crhlsheofcneafhbdrld';
const DIR = process.env.PT_DIR;
const OUT = DIR + '/pertrade-shots' + (process.env.TAG ? '-' + process.env.TAG : '');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const sessObj = JSON.parse(fs.readFileSync(`${DIR}/sessPT.json`, 'utf8')); sessObj.expires_at = 1800000000; sessObj.expires_in = 999999;
const sess = JSON.stringify(sessObj);
const FAKE_NOW = Date.parse(process.env.FAKE_NOW || '2026-09-13T06:30:00Z'); // Sun 12:00 IST
const DATE_OVERRIDE = (fakeMs) => {
  const RD = Date;
  window.Date = class extends RD { constructor(...a) { if (a.length === 0) super(fakeMs); else super(...a); } static now() { return fakeMs; } };
};
const results = []; let n = 0;
const step = async (name, fn) => { try { await fn(); results.push([name, 'PASS']); console.log('• PASS', name); } catch (e) { results.push([name, 'FAIL ' + e.message.split('\n')[0]]); console.log('• FAIL', name, e.message.split('\n')[0]); } };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
await ctx.addInitScript(DATE_OVERRIDE, FAKE_NOW);
const page = await ctx.newPage();
await page.goto(SITE, { waitUntil: 'domcontentloaded' });
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, sess]);
await page.goto(SITE, { waitUntil: 'networkidle' });
await page.getByText('Open MTM', { exact: false }).waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
const shot = async (nm) => { n++; await page.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${nm}.png`, fullPage: true }); };
const tab = (name) => page.getByRole('button', { name, exact: true }).click();
const body = () => page.locator('body').innerText();
const must = (txt, re, label) => { if (!re.test(txt)) throw new Error(`${label}: expected ${re} — got …${txt.replace(/\s+/g, ' ').slice(0, 300)}`); };
const week = (key) => page.locator(`[data-week="${key}"]`);

await step('LIVE: one ₹ headline = NIF-PT 3,201 + NAS-PT 70,844 = +₹74,045; no weekly USD/INR control; no "FX rate not set"', async () => {
  const b = await body();
  must(b, /\+₹74,045/, 'hero');
  if (/USD\/INR · W\d+/.test(b)) throw new Error('weekly USD/INR header control still present');
  if (/FX rate not set/.test(b)) throw new Error('"FX rate not set" state still rendered');
  await shot('live');
});
await step('LIVE: NAS-PT carries its own rate in meta (@89) and on its weekly row; NIF-PT (INR) has no rate', async () => {
  const b = await body();
  must(b, /NASDAQ ×20 · LONG · 1 lot · USD @89 · share 80%/, 'NAS meta');
  must(b, /W37 · 7–13 Sep\s+close 20,050\s+@89\s+\+₹70,844/, 'NAS weekly row');
  must(b, /NIFTY FUT ×75 · LONG · 1 lot · INR · share 100%/, 'NIF meta');
});
await step('JOURNAL: W37 / W36 / W35 all present, newest first; headline = 89,280 + 3,201 + 70,844 = +₹1,63,325', async () => {
  await tab('Journal'); await page.waitForTimeout(600);
  const b = await body();
  must(b, /\+₹1,63,325/, 'journal headline');
  const idx = ['2026-W37', '2026-W36', '2026-W35'].map((k) => b.indexOf(k === '2026-W37' ? 'W37 · 7–13 Sep' : k === '2026-W36' ? 'W36 · 31 Aug–6 Sep' : 'W35 · 24–30 Aug'));
  if (!(idx[0] > -1 && idx[0] < idx[1] && idx[1] < idx[2])) throw new Error('week order/presence: ' + idx.join(','));
  await shot('journal');
});
await step('JOURNAL W35: DOW-PT UNREALIZED (open at week end), initiation piece +₹35,640; week total +₹35,640', async () => {
  const w = await week('2026-W35').innerText();
  must(w, /Unrealized/i, 'section'); must(w, /DOW-PT/, 'row'); must(w, /mark 40,100/, 'mark'); must(w, /entry\s+40,000/, 'from entry');
  must(w, /\+₹35,640/, 'piece'); must(w, /0 closed · 1 open/, 'counts');
});
await step('JOURNAL W36: DOW-PT +₹72,000 (change this week, NOT cumulative) + NIF-PT +₹6,951; unrealized +₹78,951', async () => {
  const w = await week('2026-W36').innerText();
  must(w, /DOW-PT[\s\S]*mark 40,300[\s\S]*from\s+40,100[\s\S]*\+₹72,000/, 'DOW change from last week\'s stamp');
  must(w, /NIF-PT[\s\S]*mark 24,500[\s\S]*\+₹6,951/, 'NIF init piece');
  must(w, /\+₹78,951/, 'unrealized total');
});
await step('JOURNAL W37: DOW-PT REALIZED with closing piece −₹18,360 and full history W35/W36/W37 = realized +₹89,280 (reconciled); NIF −₹3,750; NAS +₹70,844; totals', async () => {
  const w = await week('2026-W37').innerText();
  must(w, /Realized · closed this week/i, 'realized section');
  must(w, /DOW-PT[\s\S]*W37 piece[\s\S]*−₹18,360/, 'closing piece');
  must(w, /W35 \+₹35,640\s+W36 \+₹72,000\s+W37 −₹18,360\s+= realized \+₹89,280/, 'history line');
  if (/does not reconcile/.test(w)) throw new Error('reconciliation flag raised');
  must(w, /NIF-PT[\s\S]*mark 24,450[\s\S]*from\s+24,500[\s\S]*−₹3,750/, 'NIF change');
  must(w, /NAS-PT[\s\S]*mark 20,050[\s\S]*\+₹70,844/, 'NAS init piece');
  must(w, /Realized\s+−₹18,360/i, 'realized line'); must(w, /Unrealized\s+\+₹67,094/i, 'unrealized line'); must(w, /Week total\s+\+₹48,734/i, 'week total');
  must(w, /1 closed · 2 open/, 'counts');
});
await step('CLOSED: DOW-PT shows its USD/INR 90 and +₹89,280', async () => {
  await tab('Closed trades'); await page.waitForTimeout(500);
  const b = await body();
  must(b, /USD\/INR/, 'column'); must(b, /DOW-PT[\s\S]*90[\s\S]*\+₹89,280/, 'row');
  await shot('closed');
});
await step('EDIT (closed, PIN set-on-first-use): rate field shows 90; change to 95 → realized +₹94,240; journal pieces re-reconcile', async () => {
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.getByPlaceholder('', { exact: true }).first().waitFor({ timeout: 3000 }).catch(() => {});
  const pin = page.locator('input[type="password"]'); await pin.waitFor({ timeout: 5000 });
  await pin.fill('1234'); await page.getByRole('button', { name: /Set PIN|Unlock/ }).click(); await page.waitForTimeout(800);
  const rate = page.locator('text=USD/INR rate · this trade').locator('..').locator('input');
  if ((await rate.inputValue()) !== '90') throw new Error('rate field not 90: ' + await rate.inputValue());
  await shot('edit-closed');
  await rate.fill('95'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForTimeout(1500);
  const b = await body(); must(b, /DOW-PT[\s\S]*95[\s\S]*\+₹94,240/, 'recomputed at 95');
  await tab('Journal'); await page.waitForTimeout(600);
  const w = await week('2026-W37').innerText();
  must(w, /W35 \+₹37,620\s+W36 \+₹76,000\s+W37 −₹19,380\s+= realized \+₹94,240/, 'history at 95');
  if (/does not reconcile/.test(w)) throw new Error('reconciliation flag raised after edit');
  await shot('journal-after-edit');
});
await step('EDIT (live NAS-PT): rate field present with 89; Esc cancels', async () => {
  await tab('Live trades'); await page.waitForTimeout(500);
  const card = page.locator('div', { hasText: /^NAS-PT/ }).filter({ has: page.getByRole('button', { name: 'Edit', exact: true }) }).last();
  await card.getByRole('button', { name: 'Edit', exact: true }).click(); await page.waitForTimeout(600);
  const rate = page.locator('text=USD/INR rate · this trade').locator('..').locator('input');
  if ((await rate.inputValue()) !== '89') throw new Error('live rate field not 89: ' + await rate.inputValue());
  await shot('edit-live'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
});
await step('ADD TRADE (USD): refuses without a rate; with rate 88 → live row shows @88; INR form has no rate field', async () => {
  await tab('Add trade'); await page.waitForTimeout(400);
  await page.getByPlaceholder('e.g. NIFTY25S').fill('ADD-PT'); await page.getByPlaceholder('0.00').fill('41000');
  await page.getByRole('button', { name: 'Confirm & deploy' }).click(); await page.waitForTimeout(400);
  must(await body(), /USD\/INR rate required/, 'refusal');
  await page.getByPlaceholder('e.g. 89.90').fill('88');
  await shot('add-usd');
  await page.getByRole('button', { name: 'Confirm & deploy' }).click(); await page.waitForTimeout(1500);
  must(await body(), /ADD-PT[\s\S]*DOW ×5 · LONG · 1 lot · USD @88 · share 80%/, 'live row @88');
  await tab('Add trade'); await page.getByRole('button', { name: '₹ INR' }).click(); await page.waitForTimeout(200);
  if (await page.getByPlaceholder('e.g. 89.90').count()) throw new Error('rate field shown for INR');
  await page.getByRole('button', { name: '$ USD' }).click();
});
await step('SATURDAY VOICE: no rate field in the panel/banner (stamps only) — asks nothing when every stamp is in', async () => {
  await tab('Live trades'); await page.waitForTimeout(400);
  if (await page.getByPlaceholder('closing rate').count()) throw new Error('rate input present');
  const b = await body(); if (/USDINR closing rate/.test(b)) throw new Error('rate row present');
});
await step('RELOAD: everything server-side (rates + journal survive)', async () => {
  await page.reload({ waitUntil: 'networkidle' }); await page.getByText('Open MTM', { exact: false }).waitFor(); await page.waitForTimeout(1500);
  must(await body(), /ADD-PT[\s\S]*USD @88/, 'ADD-PT persisted');
  await tab('Closed trades'); await page.waitForTimeout(500); must(await body(), /DOW-PT[\s\S]*95[\s\S]*\+₹94,240/, 'edited rate persisted');
});
await browser.close();
const fails = results.filter((r) => r[1] !== 'PASS');
console.log(`\n${results.length - fails.length}/${results.length} PASS`); fails.forEach((f) => console.log('  FAIL', f[0], '—', f[1]));
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(fails.length ? 1 : 0);
