// COMEX smoke — create/edit/close a COPPER-HG trade on the LIVE url, verify $ math,
// confirm the existing NIFTY trade renders in ₹ unchanged. Both themes.
import { chromium } from 'playwright';
import fs from 'fs';
const SITE = 'https://ailaha-phalam.vercel.app';
const REF = 'crhlsheofcneafhbdrld';
const DIR = '/tmp/claude-1000/-mnt-c-WINDOWS-system32/8b009f8e-8382-4f2b-96a9-9d6c44db17a1/scratchpad';
const OUT = DIR + '/comex-shots';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const sess = fs.readFileSync(DIR + '/sessC.json', 'utf8');
const log = (...a) => console.log('•', ...a);
const results = []; const step = async (name, fn) => { try { await fn(); results.push([name,'PASS']); log('PASS', name); } catch (e) { results.push([name,'FAIL '+e.message.split('\n')[0]]); log('FAIL', name, e.message.split('\n')[0]); } };
let n = 0; const shot = async (p, nm) => { n++; await p.screenshot({ path: `${OUT}/${String(n).padStart(2,'0')}-${nm}.png` }); };
const has = async (page, txt) => (await page.getByText(txt).count()) > 0;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1500 }, acceptDownloads: true })).newPage();
await page.goto(SITE, { waitUntil: 'domcontentloaded' });
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, sess]);
await page.goto(SITE, { waitUntil: 'networkidle' });
await page.getByText('Open MTM', { exact: false }).waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
const card = (sym) => page.getByText(sym, { exact: true }).first().locator('xpath=ancestor::div[2]');

await step('existing NIFTY renders in ₹ (byte-identical)', async () => {
  await page.getByRole('button', { name: 'Closed trades' }).click();
  await page.getByText('NIFTY-CHK').first().waitFor({ timeout: 6000 });
  if (!(await has(page, '+₹72,818'))) throw new Error('NIFTY +₹72,818 not shown in ₹');
  await shot(page, 'nifty-inr');
});

await step('Add COPPER-HG: COMEX group, autofill ×25000, 4-decimal price', async () => {
  await page.getByRole('button', { name: 'Add trade' }).click();
  await page.getByPlaceholder('e.g. NIFTY25S').fill('HG-SEP');
  await page.locator('select').first().selectOption('COPPER-HG');
  const multV = await page.getByText('Multiplier · lot size').locator('..').locator('input').inputValue();
  if (multV !== '25000') throw new Error('multiplier did not autofill 25000: ' + multV);
  await page.getByPlaceholder('0.00').fill('4.5000');
  const lots = page.getByText('Lots', { exact: true }).locator('..').locator('input');
  await lots.fill('3');
  await shot(page, 'add-copper-form');
  await page.getByRole('button', { name: /Confirm/ }).click();
  await page.getByText('HG-SEP').first().waitFor({ timeout: 6000 });
  if (!(await page.getByText(/COPPER-HG ×25000 . LONG . 3 lots . USD/).count())) throw new Error('COPPER-HG meta wrong');
  await shot(page, 'copper-live');
});

await step('edit COPPER-HG lots 3→4 (PIN set)', async () => {
  await card('HG-SEP').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByText('Set a PIN', { exact: false }).waitFor({ timeout: 5000 });
  await page.locator('input[type="password"]').fill('2468');
  await page.getByRole('button', { name: 'Set PIN' }).click();
  await page.getByText('Multiplier', { exact: true }).waitFor({ timeout: 6000 });
  await page.getByText('Lots', { exact: true }).locator('..').locator('input').fill('4');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(1200);
  if (!(await page.getByText(/COPPER-HG ×25000 . LONG . 4 lots/).count())) throw new Error('lots not updated to 4');
});

await step('close COPPER-HG @4.5210 → realized (exit−entry)×25000×4 = $2,100', async () => {
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  const ex = page.getByPlaceholder('exit').first();
  await ex.waitFor({ timeout: 5000 });
  await ex.fill('4.5210');
  await ex.press('Enter');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Journal' }).click();
  await page.getByText('HG-SEP').first().waitFor({ timeout: 6000 });
  if (!(await has(page, '+$2,100'))) throw new Error('COMEX realized +$2,100 not shown in $');
  if (!(await has(page, '+₹72,818'))) throw new Error('NIFTY ₹ line missing (aggregate separation)');
  await shot(page, 'journal-comex-dollar');
});

await step('both themes', async () => {
  await page.locator('button[title="White"]').click(); await page.waitForTimeout(500); await shot(page, 'theme-white');
  await page.locator('button[title="Forest"]').click(); await page.waitForTimeout(500); await shot(page, 'theme-forest');
});

await step('delete the test COPPER-HG', async () => {
  await page.getByRole('button', { name: 'Closed trades' }).click();
  await page.getByText('HG-SEP').first().waitFor({ timeout: 6000 });
  // delete via the closed row Delete (PIN unlocked)
  const row = page.getByText('HG-SEP').locator('xpath=ancestor::tr[1]');
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForTimeout(1200);
  if (await page.getByText('HG-SEP').count()) throw new Error('HG-SEP still present after delete');
});

console.log('\n=== COMEX SMOKE ===');
for (const [k, v] of results) console.log(v === 'PASS' ? 'PASS' : 'FAIL', k, v === 'PASS' ? '' : '— ' + v.slice(5));
const passed = results.filter(([, v]) => v === 'PASS').length;
console.log(`${passed}/${results.length} passed · ${n} shots`);
await browser.close();
process.exit(passed === results.length ? 0 : 2);
