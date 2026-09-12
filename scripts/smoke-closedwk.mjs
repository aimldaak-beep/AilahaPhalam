// Closed-trades-grouped-by-closing-week smoke (SITE env, default local preview), user from scripts/seed_closedwk.py.
import { chromium } from 'playwright';
import fs from 'fs';
const SITE = process.env.SITE || 'http://127.0.0.1:4173';
const REF = 'crhlsheofcneafhbdrld';
const DIR = process.env.PT_DIR;
const OUT = DIR + '/closedwk-shots' + (process.env.TAG ? '-' + process.env.TAG : '');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const sessObj = JSON.parse(fs.readFileSync(`${DIR}/sessPT.json`, 'utf8')); sessObj.expires_at = 1800000000; sessObj.expires_in = 999999;
const sess = JSON.stringify(sessObj);
const results = []; let n = 0;
const step = async (name, fn) => { try { await fn(); results.push([name, 'PASS']); console.log('• PASS', name); } catch (e) { results.push([name, 'FAIL ' + e.message.split('\n')[0]]); console.log('• FAIL', name, e.message.split('\n')[0]); } };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
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
const wk = (key) => page.locator(`[data-closed-week="${key}"]`);
const count = (txt, s) => txt.split(s).length - 1;

await tab('Closed trades'); await page.waitForTimeout(700);
await step('CLOSED: headline +₹2,28,790 · 4 trades · groups W37, W36, W34 newest first (open NIF-PT excluded)', async () => {
  const b = await body(); must(b, /\+₹2,28,790/, 'headline'); must(b, /4 trades · by closing week/, 'meta');
  const keys = await page.locator('[data-closed-week]').evaluateAll((els) => els.map((e) => e.getAttribute('data-closed-week')));
  if (keys.join(',') !== '2026-W37,2026-W36,2026-W34') throw new Error('groups: ' + keys.join(','));
  if (/NIF-PT/.test(b)) throw new Error('open trade listed under Closed');
  await shot('closed-grouped');
});
await step('WEEK HEADERS: W37 2 trades Realized +₹2,30,968 · W36 +₹6,400 · W34 −₹8,578; each = Σ its rows', async () => {
  must(await wk('2026-W37').innerText(), /W37 · 7–13 Sep\s+2 trades[\s\S]*REALIZED\s+\+₹2,30,968/i, 'W37');
  must(await wk('2026-W36').innerText(), /W36 · 31 Aug–6 Sep\s+1 trade[\s\S]*REALIZED\s+\+₹6,400/i, 'W36');
  must(await wk('2026-W34').innerText(), /W34 · 17–23 Aug\s+1 trade[\s\S]*REALIZED\s+−₹8,578/i, 'W34');
});
await step('W37 rows in close-date order (DOW-PT 9 Sep, then NAS-W37 11 Sep); DOW-PT history inline = realized; NAS-W37 no history; Brok + USD/INR kept', async () => {
  const w = await wk('2026-W37').innerText();
  if (w.indexOf('DOW-PT') > w.indexOf('NAS-W37')) throw new Error('order wrong');
  must(w, /09 Sept\s+DOW-PT\s+LONG\s+1\s+×5\s+40,000\s+40,250\s+\$10\s+80%\s+90\s+\+₹89,280/, 'DOW row');
  must(w, /W35 \+₹35,640\s+W36 \+₹72,000\s+W37 −₹18,360\s+= realized \+₹89,280/, 'history');
  must(w, /11 Sept\s+NAS-W37\s+LONG\s+1\s+×20\s+20,000\s+20,100\s+\$10\s+80%\s+89\s+\+₹1,41,688/, 'NAS row');
  if ((await wk('2026-W37').locator('[data-history]').count()) !== 1) throw new Error('history rows != 1');
  if (/does not reconcile/.test(w)) throw new Error('reconcile flag');
});
await step('EVERY closed trade exactly once, under its closing week', async () => {
  const b = await body();
  for (const [sym, key] of [['DOW-PT', '2026-W37'], ['NAS-W37', '2026-W37'], ['NIF-W36', '2026-W36']]) {
    if (count(b, sym) !== 1) throw new Error(`${sym} appears ${count(b, sym)}×`);
    if (!(await wk(key).innerText()).includes(sym)) throw new Error(`${sym} not under ${key}`);
  }
  if ((await page.locator('[data-trade]').count()) !== 3) throw new Error('visible rows != 3 (W34 collapsed)');
});
await step('COLLAPSE: W34 collapsed by default (older than latest 2); click header → expands with OLD-W34 (−₹8,578, ₹1,078 brok); click again → collapses', async () => {
  if (/OLD-W34/.test(await body())) throw new Error('W34 rows visible while collapsed');
  must(await wk('2026-W34').innerText(), /collapsed/, 'collapsed marker');
  await wk('2026-W34').getByRole('button', { name: /closed trades$/ }).click(); await page.waitForTimeout(300);
  must(await wk('2026-W34').innerText(), /20 Aug\s+OLD-W34\s+LONG\s+1\s+×75\s+24,000\s+23,900\s+₹1,078\s+100%\s+—\s+−₹8,578/, 'OLD row');
  await shot('w34-expanded');
  await wk('2026-W34').getByRole('button', { name: /closed trades$/ }).click(); await page.waitForTimeout(300);
  if (/OLD-W34/.test(await body())) throw new Error('did not collapse');
  await wk('2026-W37').getByRole('button', { name: /closed trades$/ }).click(); await page.waitForTimeout(300);
  if (/DOW-PT/.test(await body())) throw new Error('W37 did not collapse');
  await wk('2026-W37').getByRole('button', { name: /closed trades$/ }).click(); await page.waitForTimeout(300);
});
await step('EDIT from the grouped view (PIN set-on-first-use): NAS-W37 rate 89→90 → row +₹1,43,280, W37 header +₹2,32,560, headline +₹2,30,382', async () => {
  await wk('2026-W37').locator('[data-trade="t_nas_w37"]').getByRole('button', { name: 'Edit', exact: true }).click();
  const pin = page.locator('input[type="password"]'); await pin.waitFor({ timeout: 5000 });
  await pin.fill('1234'); await page.getByRole('button', { name: /Set PIN|Unlock/ }).click(); await page.waitForTimeout(800);
  const rate = page.locator('text=USD/INR rate · this trade').locator('..').locator('input');
  if ((await rate.inputValue()) !== '89') throw new Error('rate field: ' + await rate.inputValue());
  await shot('edit-in-group');
  await rate.fill('90'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForTimeout(1500);
  const w = await wk('2026-W37').innerText();
  must(w, /NAS-W37[\s\S]*\s90\s+\+₹1,43,280/, 'row recomputed'); must(w, /REALIZED\s+\+₹2,32,560/i, 'week header');
  must(await body(), /\+₹2,30,382/, 'headline');
});
await step('SELECTION: checkbox in a group sums (DOW-PT + NAS-W37 = +₹2,32,560)', async () => {
  await wk('2026-W37').locator('[data-trade="t_dow_pt"] td').first().click();
  await wk('2026-W37').locator('[data-trade="t_nas_w37"] td').first().click(); await page.waitForTimeout(300);
  must(await body(), /2 selected\s+\+₹2,32,560/, 'selected sum');
  await page.getByRole('button', { name: 'clear' }).click();
});
await step('RELOAD: grouping + edit persist; Journal headline unchanged in structure', async () => {
  await page.reload({ waitUntil: 'networkidle' }); await page.getByText('Open MTM', { exact: false }).waitFor({ timeout: 60000 }); await page.waitForTimeout(1500);
  await tab('Closed trades'); await page.waitForTimeout(600);
  const b = await body(); must(b, /\+₹2,30,382/, 'headline'); must(b, /NAS-W37[\s\S]*\s90\s+\+₹1,43,280/, 'row');
  const keys = await page.locator('[data-closed-week]').evaluateAll((els) => els.map((e) => e.getAttribute('data-closed-week')));
  if (keys.join(',') !== '2026-W37,2026-W36,2026-W34') throw new Error('groups after reload: ' + keys.join(','));
});
await browser.close();
const fails = results.filter((r) => r[1] !== 'PASS');
console.log(`\n${results.length - fails.length}/${results.length} PASS`); fails.forEach((f) => console.log('  FAIL', f[0], '—', f[1]));
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(fails.length ? 1 : 0);
