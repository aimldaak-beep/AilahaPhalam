// PHASE 3 smoke — drive the LIVE app with a real (temporary) session and
// screenshot every step. Run with LD_LIBRARY_PATH pointing at the local libs.
import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://ailaha-phalam.vercel.app';
const REF = 'crhlsheofcneafhbdrld';
const DIR = '/tmp/claude-1000/-mnt-c-WINDOWS-system32/8b009f8e-8382-4f2b-96a9-9d6c44db17a1/scratchpad';
const SHOTS = DIR + '/shots';
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const session = fs.readFileSync(DIR + '/sb_session.json', 'utf8');

const log = (...a) => console.log('•', ...a);
let n = 0;
const shot = async (page, name) => { n++; await page.screenshot({ path: `${SHOTS}/${String(n).padStart(2, '0')}-${name}.png`, fullPage: true }); };
const results = [];
const step = async (name, fn) => { try { await fn(); results.push([name, 'PASS']); log('PASS', name); } catch (e) { results.push([name, 'FAIL: ' + e.message.split('\n')[0]]); log('FAIL', name, e.message.split('\n')[0]); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 1500 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });

// inject real session
await page.goto(SITE, { waitUntil: 'domcontentloaded' });
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, session]);
await page.goto(SITE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await shot(page, 'authed-live-empty');

await step('authenticated', async () => {
  await page.getByText('Open MTM', { exact: false }).waitFor({ timeout: 10000 });
});

await step('add trade (DOW LONG · USD · 2 lots)', async () => {
  await page.getByRole('button', { name: 'Add trade' }).click();
  await page.getByPlaceholder('e.g. NIFTY25S').fill('DJIA-SMOKE');
  await page.locator('select').selectOption('DOW');
  await page.getByRole('button', { name: /LONG/ }).click();
  await page.getByPlaceholder('0.00').fill('44000');
  await page.getByRole('button', { name: '$ USD' }).click();
  await page.getByRole('button', { name: '80% 0.8' }).click();
  await page.getByRole('button', { name: /Confirm/ }).click();
  await page.getByText('DJIA-SMOKE').first().waitFor({ timeout: 8000 });
});
await shot(page, 'after-add-live');

await step('saturday week-close (rate + closing value)', async () => {
  await page.getByRole('button', { name: 'Save week close' }).waitFor({ timeout: 8000 });
  await page.getByPlaceholder('closing value').first().fill('44320');
  await page.getByRole('button', { name: 'Save week close' }).click();
  await page.waitForTimeout(1500);
  await page.getByText(/close 44,?320/).first().waitFor({ timeout: 8000 });
});
await shot(page, 'after-saturday');

await step('close trade (exit 44500)', async () => {
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.getByPlaceholder('exit').fill('44500');
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.waitForTimeout(1500);
});
await shot(page, 'after-close');

await step('journal — week + held days', async () => {
  await page.getByRole('button', { name: 'Journal' }).click();
  await page.getByText('DJIA-SMOKE').first().waitFor({ timeout: 8000 });
  await page.getByText(/held \d+d/).first().waitFor({ timeout: 6000 });
});
await shot(page, 'journal');

await step('closed tab', async () => {
  await page.getByRole('button', { name: 'Closed trades' }).click();
  await page.getByText('DJIA-SMOKE').first().waitFor({ timeout: 8000 });
});
await shot(page, 'closed-tab');

// select the row (first checkbox cell in the table body) -> selected-sum bar
await step('select row + selected-sum bar', async () => {
  await page.locator('table tbody tr').first().locator('td').first().click();
  await page.getByText(/1 selected/).waitFor({ timeout: 5000 });
});
await shot(page, 'selected-bar');

// Excel — all three modes, downloading each
for (const mode of ['Complete history', 'Selected trades', 'Date range']) {
  await step('excel: ' + mode, async () => {
    await page.getByRole('button', { name: 'Download as Excel' }).first().click();
    await page.getByText(mode, { exact: false }).first().click();
    if (mode === 'Date range') {
      await page.getByPlaceholder('from').fill('2026-08-01');
      await page.getByPlaceholder('to').fill('2026-08-31');
    }
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.getByRole('button', { name: 'Download', exact: true }).click(),
    ]);
    const p = `${DIR}/dl-${mode.replace(/\s+/g, '_')}.csv`;
    await dl.saveAs(p);
    const body = fs.readFileSync(p, 'utf8');
    if (!body.includes('P&L (INR)')) throw new Error('CSV missing header');
    log('  csv data rows:', body.trim().split('\n').length - 1);
  });
}
await shot(page, 'after-excel');

await step('PIN set-flow on first edit', async () => {
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.getByText('Set a PIN', { exact: false }).waitFor({ timeout: 5000 });
  await shot(page, 'pin-set-modal');
  await page.locator('input[type="password"]').fill('2468');
  await page.getByRole('button', { name: 'Set PIN' }).click();
  await page.waitForTimeout(1000);
  const exitInput = page.locator('table tbody tr').first().locator('input');
  await exitInput.fill('44650');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await page.waitForTimeout(1200);
});
await shot(page, 'after-pin-edit');

await step('delete (PIN unlocked this session)', async () => {
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByText('No closed trades yet').waitFor({ timeout: 6000 });
});
await shot(page, 'after-delete');

await step('theme — white then forest', async () => {
  await page.locator('button[title="White"]').click();
  await page.waitForTimeout(500); await shot(page, 'theme-white');
  await page.locator('button[title="Forest"]').click();
  await page.waitForTimeout(500); await shot(page, 'theme-forest');
});

console.log('\n=== SMOKE RESULTS ===');
for (const [k, v] of results) console.log((v === 'PASS' ? 'PASS ' : 'FAIL '), k, v === 'PASS' ? '' : '— ' + v.slice(6));
const passed = results.filter(([, v]) => v === 'PASS').length;
console.log(`\n${passed}/${results.length} steps passed · ${n} screenshots`);
await browser.close();
process.exit(passed === results.length ? 0 : 2);
