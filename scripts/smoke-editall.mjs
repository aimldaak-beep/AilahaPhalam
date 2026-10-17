// EDIT-ALL + WEEKLY STATISTICS smoke (2026-10-17). Boots the built app against a MOCKED Supabase: every
// /rest/v1, /auth/v1 and storage request is answered from a read-only trades dump (DUMP env = dir with
// trades.json / weekly_marks.json), so the real project is never touched and NO row can be written
// (every write attempt is recorded and asserted to be zero). Loads Live, Journal, Closed → Edit (PIN gate,
// weekly rows, live recompute), Live → Edit, Weekly Statistics — in BOTH themes — with no console/page errors.
//   SITE=http://127.0.0.1:4173 DUMP=<dir> OUT=<dir> node scripts/smoke-editall.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import crypto from 'crypto';
const SITE = process.env.SITE || 'http://127.0.0.1:4173';
const REF = 'crhlsheofcneafhbdrld';
const DUMP = process.env.DUMP; const OUT = process.env.OUT;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const tradesRows = JSON.parse(fs.readFileSync(`${DUMP}/trades.json`, 'utf8'));
const marks = JSON.parse(fs.readFileSync(`${DUMP}/weekly_marks.json`, 'utf8'));
const UID = '00000000-0000-4000-8000-000000000001', EMAIL = 'aimlda.ak@gmail.com', PIN = '1234';
const pinHash = crypto.createHash('sha256').update(`${UID}:${PIN}`).digest('hex');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, email: EMAIL, role: 'authenticated', aud: 'authenticated', exp: 1800000000 })}.${b64('mock')}`;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: EMAIL, app_metadata: { provider: 'google' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const session = { access_token: jwt, refresh_token: 'mock-refresh', expires_in: 999999, expires_at: 1800000000, token_type: 'bearer', user };

const results = []; let n = 0; const writes = []; const errors = [];
const step = async (name, fn) => { try { await fn(); results.push([name, 'PASS']); console.log('• PASS', name); } catch (e) { results.push([name, 'FAIL ' + e.message.split('\n')[0]]); console.log('• FAIL', name, e.message.split('\n')[0]); } };
const browser = await chromium.launch();
async function open(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  await ctx.route('**/*', async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    if (url.startsWith(SITE)) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && !/\/auth\/v1\//.test(url)) { writes.push(`${m} ${url}`); return json([]); }
    if (/\/auth\/v1\/user/.test(url)) return json(user);
    if (/\/auth\/v1\/token/.test(url)) return json(session);
    if (/\/auth\/v1\//.test(url)) return json({});
    if (/\/rest\/v1\/trades/.test(url)) return json(tradesRows.map((r) => ({ data: r.data, created_at: r.created_at })));
    if (/\/rest\/v1\/weekly_marks/.test(url)) return json(marks.map((r) => ({ trade_id: r.trade_id, week_key: r.week_key, close_price: r.close_price })));
    if (/\/rest\/v1\/user_settings/.test(url)) return json({ pin_hash: pinHash });
    if (/allowlist\.json/.test(url)) return json({ emails: [EMAIL] });
    return json([]);
  });
  const page = await ctx.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[${theme}] console: ${msg.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => errors.push(`[${theme}] pageerror: ${String(e).slice(0, 200)}`));
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, v, th]) => { localStorage.setItem(k, v); localStorage.setItem('ap_theme', th); }, [`sb-${REF}-auth-token`, JSON.stringify(session), theme]);
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.getByText('Open MTM', { exact: false }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  return page;
}
const shot = async (p, nm) => { n++; await p.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${nm}.png`, fullPage: true }); };
const tab = (p, name) => p.getByRole('button', { name, exact: true }).click();
const body = (p) => p.locator('body').innerText();
const must = (txt, re, label) => { if (!re.test(txt)) throw new Error(`${label}: expected ${re} — got …${txt.replace(/\s+/g, ' ').slice(0, 300)}`); };
const bg = (p) => p.evaluate(() => getComputedStyle(document.querySelector('#root > div') || document.body).backgroundColor);

for (const theme of ['forest', 'white']) {
  const T = theme.toUpperCase();
  let p = await open(theme);
  await step(`${T} LIVE loads: 2 live trades, theme background ${theme === 'forest' ? '#121712' : '#FFFFFF'}`, async () => {
    const b = await body(p); must(b, /Open MTM · 2 live/, 'live count'); must(b, /KOTAKBANK/, 'KOTAKBANK'); must(b, /LAURUSLABS/, 'LAURUSLABS');
    const c = await bg(p); const want = theme === 'forest' ? 'rgb(18, 23, 18)' : 'rgb(255, 255, 255)'; if (c !== want) throw new Error(`bg ${c} ≠ ${want}`);
    await shot(p, `${theme}-live`);
  });
  await step(`${T} JOURNAL loads: 8 weeks, W42 first, totals present`, async () => {
    await tab(p, 'Journal'); await p.waitForTimeout(500);
    const weeks = p.locator('[data-week]'); const c = await weeks.count(); if (c !== 8) throw new Error(`weeks ${c}`);
    if ((await weeks.first().getAttribute('data-week')) !== '2026-W42') throw new Error('W42 not first');
    const b = await body(p); must(b, /Week total/i, 'totals'); must(b, /W42 · 12–18 Oct/, 'label');
    await shot(p, `${theme}-journal`);
  });
  await step(`${T} JOURNAL EDIT: PIN-gated Edit on EVERY row (realized + unrealized, every week block); closed W40 NIKKEI row opens the full edit grid (3 weekly rows) under that row; PIN fires first`, async () => {
    const rows = await p.locator('[data-journal-row]').count(); const btns = await p.locator('[data-journal-edit]').count();
    if (!(rows > 0 && rows === btns)) throw new Error(`rows ${rows} vs edit buttons ${btns}`);
    for (const key of ['2026-W42', '2026-W40', '2026-W38', '2026-W35']) { const wb = p.locator(`[data-week="${key}"]`);
      if ((await wb.locator('[data-journal-row]').count()) !== (await wb.locator('[data-journal-edit]').count())) throw new Error(`${key}: a row without Edit`); }
    const w40 = p.locator('[data-week="2026-W40"]');
    await w40.locator('[data-journal-edit="trade_1789711636057_9049909"]').click();
    const pinInput = p.locator('input[type=password]'); await pinInput.waitFor({ timeout: 5000 });   // PIN gate fires
    await pinInput.fill(PIN); await pinInput.press('Enter'); await p.waitForTimeout(600);
    const form = w40.locator('[data-journal-edit-form="trade_1789711636057_9049909"]'); await form.waitFor({ timeout: 5000 });
    if ((await p.locator('[data-journal-edit-form]').count()) !== 1) throw new Error('form must open under exactly one row');
    if ((await form.locator('[data-edit-week]').count()) !== 3) throw new Error('weekly rows ≠ 3');
    must(await form.innerText(), /W38[\s\S]*W39[\s\S]*W40[\s\S]*−₹1,39,590/, 'whole trade in the form');
    if ((await form.locator('input').first().inputValue()) !== 'NIKKEI' || (await p.getByLabel('NIKKEI W39 close stamp').inputValue()) !== '66490') throw new Error('form fields not the NIKKEI trade');
    if ((await w40.locator('[data-journal-edit="trade_1789711636057_9049909"]').innerText()) !== 'Close') throw new Error('button should read Close while editing');
    await p.getByLabel('NIKKEI W39 USD/INR').fill('96.5'); await p.waitForTimeout(300);
    must(await form.locator('[data-edit-total]').innerText(), /−₹1,58,340/, 'live recompute inside the journal form');
    await shot(p, `${theme}-journal-edit-closed`);
    await p.getByLabel('NIKKEI W39 USD/INR').press('Escape'); await p.waitForTimeout(300);
    if (await p.locator('[data-journal-edit-form]').count()) throw new Error('form still open after Esc');
  });
  await step(`${T} JOURNAL EDIT on a CARRY-FORWARD appearance: the same NIKKEI in W38 (unrealized · closed later) opens the WHOLE trade under the W38 row; live KOTAKBANK in W42 opens too`, async () => {
    const w38 = p.locator('[data-week="2026-W38"]');
    await w38.locator('[data-journal-edit="trade_1789711636057_9049909"]').click(); await p.waitForTimeout(400);
    if (await p.locator('input[type=password]').count()) throw new Error('PIN must already be unlocked this session');
    const form = w38.locator('[data-journal-edit-form="trade_1789711636057_9049909"]'); await form.waitFor({ timeout: 5000 });
    if ((await p.locator('[data-journal-edit-form]').count()) !== 1) throw new Error('form must open under the W38 row only');
    if ((await form.locator('[data-edit-week]').count()) !== 3) throw new Error('whole trade: 3 weekly rows expected');
    must(await form.innerText(), /W38[\s\S]*W39[\s\S]*W40[\s\S]*exit 65,235/, 'whole trade incl. closing week');
    await shot(p, `${theme}-journal-edit-carry`);
    await p.getByLabel('NIKKEI W38 close stamp').press('Escape'); await p.waitForTimeout(300);
    const w42 = p.locator('[data-week="2026-W42"]');
    await w42.locator('[data-journal-edit="trade_1791450008722_13845972"]').click(); await p.waitForTimeout(400);
    const lf = w42.locator('[data-journal-edit-form="trade_1791450008722_13845972"]'); await lf.waitFor({ timeout: 5000 });
    if ((await lf.locator('[data-edit-week]').count()) !== 2) throw new Error('KOTAKBANK: 2 weekly rows expected');
    must(await lf.locator('[data-edit-total]').innerText(), /−₹69,307/, 'live MTM');
    await p.getByLabel('KOTAKBANK W41 close stamp').press('Escape'); await p.waitForTimeout(300);
    // journal plumbing unchanged: checkbox → selected-sum bar; Download panel opens; row grid intact (no wrap: every row is one line tall)
    await w42.locator('[data-journal-row="trade_1789711636057_9049909"], [data-journal-row]').first().locator('span').first().click(); await p.waitForTimeout(200);
    must(await body(p), /1 selected/, 'selected-sum bar');
    await p.getByRole('button', { name: 'clear' }).click(); await p.waitForTimeout(200);
    await p.getByRole('button', { name: 'Download as Excel' }).click(); await p.waitForTimeout(200);
    must(await body(p), /Complete history \(44 trades\)/, 'download panel'); await p.getByRole('button', { name: 'Download as Excel' }).click();
    const heights = await p.locator('[data-journal-row]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    const oneLine = Math.min(...heights); const tall = heights.filter((h) => h > oneLine + 2);
    if (tall.length) throw new Error(`${tall.length} of ${heights.length} journal rows taller than one line (${oneLine}px) — wrap: ${tall.slice(0, 5).join(',')}`);
    const cols = await p.locator('[data-journal-row]').first().evaluate((e) => getComputedStyle(e).gridTemplateColumns);
    if (!/^30px 200px 130px 130px 90px \d+(\.\d+)?px 48px 150px$/.test(cols)) throw new Error('row grid tracks changed: ' + cols);
    // money column keeps its exact place: its right edge is the content column's right edge (1140 wide, centred)
    const edge = await p.locator('[data-journal-row]').first().evaluate((e) => { const r = e.getBoundingClientRect(); const m = e.children[7].getBoundingClientRect(); return [Math.round(r.right - m.right), Math.round(r.width)]; });
    if (edge[0] !== 0 || edge[1] !== 1140) throw new Error(`money column not flush right / row width: ${edge}`);
    const clipped = await p.locator('[data-journal-row]').evaluateAll((els) => els.filter((e) => { const m = e.children[5]; return m.scrollWidth > m.clientWidth && !m.getAttribute('title'); }).length);
    if (clipped) throw new Error(`${clipped} ellipsised meta cells without a full-text tooltip`);
  });
  await step(`${T} CLOSED → Edit (PIN gate) → full edit grid with weekly rows; weekly rate edit recomputes live; Esc cancels (0 writes)`, async () => {
    await tab(p, 'Closed trades'); await p.waitForTimeout(500);
    // the carried USD NIKKEI (W38/W39 stamps, closed W40): expand W40 if collapsed, then Edit it
    const wk = p.locator('[data-closed-week="2026-W40"]');
    if ((await wk.locator('[role=button]').getAttribute('aria-expanded')) === 'false') await wk.locator('[role=button]').click();
    const row = wk.locator('[data-trade="trade_1789711636057_9049909"]'); await row.waitFor({ timeout: 5000 });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const pinInput = p.locator('input[type=password]');
    if (await pinInput.count()) { await pinInput.fill(PIN); await pinInput.press('Enter'); }   // PIN already unlocked by the journal step
    await p.waitForTimeout(600);
    const weeksBlock = p.locator('[data-edit-weeks]'); await weeksBlock.waitFor({ timeout: 5000 });
    const rows = p.locator('[data-edit-week]'); const rc = await rows.count(); if (rc !== 3) throw new Error(`weekly rows ${rc} ≠ 3`);
    const before = await p.locator('[data-edit-total]').innerText(); must(before, /−₹1,39,590/, 'realized before');
    const w39 = p.locator('[data-edit-week="2026-W39"]'); must(await w39.innerText(), /W39[\s\S]*−₹7,05,000/, 'W39 row');
    const stampInp = p.getByLabel('NIKKEI W39 close stamp'); if ((await stampInp.inputValue()) !== '66490') throw new Error('W39 stamp prefill');
    const rateInp = p.getByLabel('NIKKEI W39 USD/INR'); if ((await rateInp.inputValue()) !== '') throw new Error('W39 rate should be blank (base)');
    if (!/base 94/.test(await rateInp.getAttribute('placeholder'))) throw new Error('rate placeholder');
    await shot(p, `${theme}-edit-closed`);
    await rateInp.fill('96.5'); await p.waitForTimeout(300);
    must(await w39.innerText(), /−₹7,23,750/, 'W39 recomputed at 96.5');
    must(await p.locator('[data-edit-total]').innerText(), /−₹1,58,340/, 'realized recomputed live');
    await stampInp.fill('66540'); await p.waitForTimeout(300);
    const w40 = p.locator('[data-edit-week="2026-W40"]'); must(await w40.innerText(), /exit 65,235/, 'closing week shows exit');
    await shot(p, `${theme}-edit-closed-recomputed`);
    await rateInp.press('Escape'); await p.waitForTimeout(300);
    if (await weeksBlock.count()) throw new Error('edit grid still open after Esc');
  });
  await step(`${T} LIVE → Edit on KOTAKBANK (PIN already unlocked): weekly rows W41 stamp 442.45 + W42 unstamped; MTM live; Esc`, async () => {
    await tab(p, 'Live trades'); await p.waitForTimeout(400);
    const card = p.locator('div', { has: p.locator('span[title="KOTAKBANK"]') }).first();
    await p.getByRole('button', { name: 'Edit', exact: true }).first().click(); await p.waitForTimeout(500);
    await p.locator('[data-edit-weeks]').waitFor({ timeout: 5000 });
    const rows = p.locator('[data-edit-week]'); if ((await rows.count()) !== 2) throw new Error(`rows ${await rows.count()}`);
    const w41 = p.getByLabel('KOTAKBANK W41 close stamp'); if ((await w41.inputValue()) !== '442.45') throw new Error('W41 prefill ' + await w41.inputValue());
    must(await p.locator('[data-edit-week="2026-W42"]').innerText(), /unstamped/i, 'W42 unstamped');
    must(await p.locator('[data-edit-total]').innerText(), /−₹69,307/, 'MTM');
    if (await p.getByLabel('KOTAKBANK W41 USD/INR').count()) throw new Error('INR trade must have no rate field');
    await p.getByLabel('KOTAKBANK W42 close stamp').fill('440'); await p.waitForTimeout(300);
    must(await p.locator('[data-edit-week="2026-W42"]').innerText(), /\+₹24,500/, 'W42 recomputed from typed stamp');
    await shot(p, `${theme}-edit-live`);
    await w41.press('Escape'); await p.waitForTimeout(300);
    void card;
  });
  await step(`${T} WEEKLY STATISTICS: nav item, 8 weeks newest-first, instrument lines match the proof (W42 NASDAQ +₹6,92,045 · NSE FUT +₹78,885 (2 unstamped); W39 NSE FUT 2 unstamped)`, async () => {
    await tab(p, 'Weekly Statistics'); await p.waitForTimeout(500);
    const weeks = p.locator('[data-stats-week]'); if ((await weeks.count()) !== 8) throw new Error(`weeks ${await weeks.count()}`);
    if ((await weeks.first().getAttribute('data-stats-week')) !== '2026-W42') throw new Error('W42 not first');
    const w42 = await weeks.first().innerText();
    must(w42, /NASDAQ[\s\S]*\+₹6,92,045/, 'NASDAQ'); must(w42, /NIKKEI[\s\S]*\+₹8,03,712/, 'NIKKEI'); must(w42, /GIFTNIFTY[\s\S]*−₹29,550/, 'GIFTNIFTY'); must(w42, /NSE FUT[\s\S]*\+₹78,885[\s\S]*\(2 unstamped\)/, 'NSE FUT unstamped note');
    const w39 = await p.locator('[data-stats-week="2026-W39"]').innerText(); must(w39, /NSE FUT[\s\S]*\(2 unstamped\)/, 'W39 NSE FUT');
    const w36 = await p.locator('[data-stats-week="2026-W36"]').innerText(); must(w36, /DOW[\s\S]*\+₹2,00,297/, 'W36 DOW');
    const b = await body(p); if (/Week total/i.test(b)) throw new Error('cross-instrument total must not appear');
    await shot(p, `${theme}-stats`);
  });
  await p.context().close();
}
await browser.close();
console.log(`\nwrites attempted: ${writes.length}${writes.length ? '\n  ' + writes.join('\n  ') : ''}`);
console.log(`console/page errors: ${errors.length}${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);
const fails = results.filter((r) => r[1] !== 'PASS').length;
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, writes, errors }, null, 1));
console.log(fails || writes.length || errors.length ? `\n${fails} FAIL · ${writes.length} writes · ${errors.length} errors` : `\nALL ${results.length} PASS · 0 writes · 0 errors`);
process.exit(fails || writes.length || errors.length ? 1 : 0);
