// Saturday-voice settlement smoke — drives a build (SITE env, default local preview) with
// injected IST clocks and the two seeded users from scripts/seed_satvoice.py.
import { chromium } from 'playwright';
import fs from 'fs';
const SITE = process.env.SITE || 'http://127.0.0.1:4173';
const REF = 'crhlsheofcneafhbdrld';
const DIR = process.env.SV_DIR;
const OUT = DIR + '/satvoice-shots';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const EXP = JSON.parse(fs.readFileSync(DIR + '/satvoice-expected.json', 'utf8'));
// Stored expires_at is pushed far out so a FUTURE fake clock doesn't make supabase-js
// think the (really valid) token expired; the server validates the JWT in real time.
const sessOf = (n) => { const s = JSON.parse(fs.readFileSync(`${DIR}/sessSV${n}.json`, 'utf8')); s.expires_at = 1800000000; s.expires_in = 999999; return JSON.stringify(s); };
const log = (...a) => console.log('•', ...a);
const results = []; let n = 0;
const step = async (name, fn) => { try { await fn(); results.push([name, 'PASS']); log('PASS', name); } catch (e) { results.push([name, 'FAIL ' + e.message.split('\n')[0]]); log('FAIL', name, e.message.split('\n')[0]); } };
const DATE_OVERRIDE = (fakeMs) => {
  const RD = Date;
  window.Date = class extends RD { constructor(...a) { if (a.length === 0) super(fakeMs); else super(...a); } static now() { return fakeMs; } };
};
const browser = await chromium.launch();
async function open(user, fakeIso) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1500 } });
  await ctx.addInitScript(DATE_OVERRIDE, Date.parse(fakeIso));
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, sessOf(user)]);
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.getByText('Open MTM', { exact: false }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  return page;
}
const shot = async (p, nm) => { n++; await p.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${nm}.png`, fullPage: true }); };
const panel = (p) => p.getByRole('region', { name: 'Weekly settlement' });
const banner = (p) => p.getByRole('alert');
const settleBtn = (p) => p.getByRole('button', { name: /^Settle W35/ });
const rateInput = (p) => p.getByPlaceholder('closing rate');
const closeInput = (p, sym) => p.getByLabel(`${sym} Saturday close price`);
const ist = (iso) => iso; // clocks are given in UTC below; IST = UTC+5:30

// ---------- U1 (DOW-SV USD + NIF-SV INR, W35 provisional 95.55) ----------
await step('Sat 16:00 IST → no panel, no banner', async () => {
  const p = await open(1, '2026-08-29T10:30:00Z');
  if (await panel(p).count()) throw new Error('panel before 17:00');
  if (await banner(p).count()) throw new Error('banner before 17:00');
  await shot(p, 'sat-1600-quiet'); await p.context().close();
});
let p = await open(1, '2026-08-29T11:35:00Z'); // Sat 17:05 IST
await step('Sat 17:05 IST → settlement panel for W35, rate NOT pre-filled, provisional shown as reference, both live rows', async () => {
  await panel(p).waitFor({ timeout: 8000 });
  if (!/Settlement — W35/.test(await panel(p).innerText())) throw new Error('title not W35');
  if ((await rateInput(p).inputValue()) !== '') throw new Error('rate pre-filled: ' + await rateInput(p).inputValue());
  if (!(await panel(p).getByText('provisional 95.55 · reference').count())) throw new Error('reference provisional missing');
  if (!(await closeInput(p, 'DOW-SV').count()) || !(await closeInput(p, 'NIF-SV').count())) throw new Error('live rows missing');
  if (!(await panel(p).getByText('DOW — Saturday close price').count())) throw new Error('row label missing');
  await shot(p, 'sat-1705-panel');
});
await step('Settle with nothing → refuses (FX rate not set)', async () => {
  await settleBtn(p).click(); await p.waitForTimeout(300);
  if (!(await panel(p).getByText(/FX rate not set/).count())) throw new Error('no rate error');
});
await step('Settle with rate + one stamp → refuses naming the missing trade', async () => {
  await rateInput(p).fill('90'); await closeInput(p, 'DOW-SV').fill('40100');
  await settleBtn(p).click(); await p.waitForTimeout(300);
  const txt = await panel(p).innerText();
  if (!/Saturday close missing for NIF-SV/.test(txt)) throw new Error('missing-stamp error absent: ' + txt.slice(-160));
  await shot(p, 'partial-refused');
});
await step('Save progress → reload → typed rate + stamp come back, week still unsettled', async () => {
  await p.getByRole('button', { name: 'Save progress' }).click(); await p.waitForTimeout(2500);
  if (!(await panel(p).getByText(/Progress saved/).count())) throw new Error('no progress message');
  await p.reload({ waitUntil: 'networkidle' }); await p.getByText('Open MTM', { exact: false }).waitFor(); await p.waitForTimeout(2000);
  await panel(p).waitFor({ timeout: 8000 });
  if ((await rateInput(p).inputValue()) !== '90') throw new Error('entered rate not restored: ' + await rateInput(p).inputValue());
  if ((await closeInput(p, 'DOW-SV').inputValue()) !== '40100') throw new Error('stamp not restored');
  if ((await closeInput(p, 'NIF-SV').inputValue()) !== '') throw new Error('NIF wrongly filled');
  if (!(await p.getByText('provisional · settles Saturday').count())) throw new Error('week wrongly frozen');
  await shot(p, 'progress-restored');
});
await step('Later → loud (non-red) banner; click → panel returns', async () => {
  await p.getByRole('button', { name: 'Later' }).click(); await p.waitForTimeout(300);
  await banner(p).waitFor({ timeout: 4000 });
  const txt = await banner(p).innerText();
  if (!/W35/.test(txt) || /OVERDUE/.test(txt)) throw new Error('banner text wrong: ' + txt);
  const bg = await banner(p).evaluate((el) => getComputedStyle(el).backgroundColor);
  if (bg === 'rgb(194, 64, 46)') throw new Error('banner red before Monday');
  await shot(p, 'banner-after-later');
  await banner(p).click(); await panel(p).waitFor({ timeout: 4000 });
});
await step('Banner persists on other views', async () => {
  await p.getByRole('button', { name: 'Journal' }).click(); await p.waitForTimeout(300);
  if (!(await banner(p).count())) throw new Error('no banner on Journal');
  await shot(p, 'banner-on-journal');
  await banner(p).click(); await panel(p).waitFor({ timeout: 4000 });
});
await step('Settle W35 at 90 → MTM correct at entered rate, header advances to W36, rate rolls', async () => {
  await closeInput(p, 'NIF-SV').fill('24500');
  await settleBtn(p).click(); await p.waitForTimeout(3000);
  if (await panel(p).count()) throw new Error('panel still showing');
  if (await banner(p).count()) throw new Error('banner still showing');
  const body = await p.innerText('body');
  const want = EXP.u1Total.toLocaleString('en-IN');
  if (!body.includes(want)) throw new Error(`headline ${want} not found`);
  if (!body.includes(EXP.dow.toLocaleString('en-IN')) || !body.includes(EXP.nif.toLocaleString('en-IN'))) throw new Error('per-trade MTM mismatch');
  if (!/@90/.test(body)) throw new Error('DOW row not stamped @90');
  if (!/USD\/INR · W36/i.test(body)) throw new Error('FX header did not advance to W36');
  if (!/W36 · 31 Aug–6 Sep/.test(body)) throw new Error('page W-header did not advance');
  await shot(p, 'settled');
});
await step('Reload → stays settled, no re-ask', async () => {
  await p.reload({ waitUntil: 'networkidle' }); await p.getByText('Open MTM', { exact: false }).waitFor(); await p.waitForTimeout(2500);
  if (await panel(p).count() || await banner(p).count()) throw new Error('re-asked after reload');
  const body = await p.innerText('body');
  if (!body.includes(EXP.u1Total.toLocaleString('en-IN'))) throw new Error('MTM lost on reload');
  await shot(p, 'reload-settled'); await p.context().close();
});
await step('Sunday + Monday → still no ask for the settled week', async () => {
  for (const iso of ['2026-08-30T06:30:00Z', '2026-08-31T04:30:00Z']) {
    const q = await open(1, iso);
    if (await panel(q).count() || await banner(q).count()) throw new Error('re-asked at ' + iso);
    await q.context().close();
  }
});

// ---------- U2 (INR-only NIF-ONLY, no FX store), Monday 31 Aug 10:00 IST ----------
p = await open(2, '2026-08-31T04:30:00Z');
await step('INR-only, unsettled after Sunday → RED overdue panel asks rate + stamp', async () => {
  await panel(p).waitFor({ timeout: 8000 });
  if (!/Overdue settlement — W35/.test(await panel(p).innerText())) throw new Error('not overdue W35');
  if (!(await rateInput(p).count()) || !(await closeInput(p, 'NIF-ONLY').count())) throw new Error('rate/stamp fields missing');
  if (!(await panel(p).getByText('no provisional this week').count())) throw new Error('reference text wrong');
  await shot(p, 'inr-only-overdue-panel');
});
await step('Later → RED urgent banner', async () => {
  await p.getByRole('button', { name: 'Later' }).click(); await banner(p).waitFor({ timeout: 4000 });
  if (!/OVERDUE/.test(await banner(p).innerText())) throw new Error('banner not marked OVERDUE');
  const bg = await banner(p).evaluate((el) => getComputedStyle(el).backgroundColor);
  if (bg !== 'rgb(194, 64, 46)') throw new Error('banner not red: ' + bg);
  await shot(p, 'inr-only-red-banner');
  await banner(p).click(); await panel(p).waitFor({ timeout: 4000 });
});
await step('INR-only settle at 91 → MTM correct, settled, no banner', async () => {
  await rateInput(p).fill('91'); await closeInput(p, 'NIF-ONLY').fill('24350');
  await settleBtn(p).click(); await p.waitForTimeout(3000);
  if (await panel(p).count() || await banner(p).count()) throw new Error('still asking');
  const body = await p.innerText('body');
  if (!body.includes(Math.abs(EXP.u2Total).toLocaleString('en-IN'))) throw new Error('INR-only MTM wrong');
  await shot(p, 'inr-only-settled');
  await p.reload({ waitUntil: 'networkidle' }); await p.getByText('Open MTM', { exact: false }).waitFor(); await p.waitForTimeout(2500);
  if (await panel(p).count() || await banner(p).count()) throw new Error('re-asked after reload');
  await p.context().close();
});

console.log('\n=== SATURDAY VOICE SMOKE ===');
for (const [k, v] of results) console.log(v === 'PASS' ? 'PASS' : 'FAIL', k, v === 'PASS' ? '' : '— ' + v.slice(5));
const passed = results.filter(([, v]) => v === 'PASS').length;
console.log(`${passed}/${results.length} passed · ${n} shots`);
await browser.close();
process.exit(passed === results.length ? 0 : 2);
