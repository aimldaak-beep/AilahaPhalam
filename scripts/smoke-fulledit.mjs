// FULL EDIT LAW smoke — live URL, both themes.
import { chromium } from 'playwright';
import fs from 'fs';
const SITE = 'https://ailaha-phalam.vercel.app';
const REF = 'crhlsheofcneafhbdrld';
const DIR = '/tmp/claude-1000/-mnt-c-WINDOWS-system32/8b009f8e-8382-4f2b-96a9-9d6c44db17a1/scratchpad';
const OUT = DIR + '/edit-shots';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const sess = fs.readFileSync(DIR + '/sessE.json', 'utf8');
const log = (...a) => console.log('•', ...a);
const results = []; const step = async (name, fn) => { try { await fn(); results.push([name,'PASS']); log('PASS', name); } catch (e) { results.push([name,'FAIL '+e.message.split('\n')[0]]); log('FAIL', name, e.message.split('\n')[0]); } };
let n = 0; const shot = async (p, nm) => { n++; await p.screenshot({ path: `${OUT}/${String(n).padStart(2,'0')}-${nm}.png` }); };
const EXPECTED = '+₹16,92,604';

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1500 } })).newPage();
await page.goto(SITE, { waitUntil: 'domcontentloaded' });
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, sess]);
await page.goto(SITE, { waitUntil: 'networkidle' });
await page.getByText('Open MTM', { exact: false }).waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
const cellInput = (label) => page.getByText(label, { exact: true }).locator('..').locator('input');
const pnlValue = () => page.getByText('Current P&L', { exact: true }).locator('xpath=following-sibling::div[1]');

await step('Edit opens EVERY field (PIN set-flow)', async () => {
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.getByText('Set a PIN', { exact: false }).waitFor({ timeout: 5000 });
  await page.locator('input[type="password"]').fill('2468');
  await page.getByRole('button', { name: 'Set PIN' }).click();
  await page.getByText('Instrument', { exact: true }).waitFor({ timeout: 6000 });
  for (const f of ['Symbol', 'Instrument', 'Side', 'Lots', 'Entry price', 'Init date', 'Currency', 'Realization'])
    if (!(await page.getByText(f, { exact: true }).count())) throw new Error('missing field ' + f);
  await shot(page, 'live-edit-allfields');
});

await step('edit instrument + lots + entry → confirm → recompute', async () => {
  await page.getByText('Instrument', { exact: true }).locator('..').locator('select').selectOption('NASDAQ');
  await cellInput('Lots').fill('5');
  await cellInput('Entry price').fill('25000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText(/Recomputes all P&L/).waitFor({ timeout: 5000 });  // instrument change confirm
  await shot(page, 'edit-confirm');
  await page.getByRole('button', { name: 'Proceed' }).click();
  await page.waitForTimeout(1500);
  const got = (await pnlValue().innerText()).trim();
  log('  Current P&L =', got, '(expected', EXPECTED + ')');
  if (got !== EXPECTED) throw new Error(`MTM recompute mismatch: ${got} != ${EXPECTED}`);
  await shot(page, 'after-live-edit');
});

await step('meta reflects NASDAQ ×20 · 5 lots', async () => {
  if (!(await page.getByText(/NASDAQ ×20 . LONG . 5 lots/).count())) throw new Error('meta not updated');
});

await step('closed Edit: move closed date across week boundary', async () => {
  await page.getByRole('button', { name: 'Closed trades' }).click();
  await page.getByText('NQ-EDIT').first().waitFor({ timeout: 6000 });
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();  // PIN already unlocked
  await page.getByText('Closed date', { exact: true }).waitFor({ timeout: 5000 });
  await shot(page, 'closed-edit-allfields');
  await cellInput('Closed date').fill('25-08-2026');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(1500);
});

await step('journal re-files to W35 + held-days updates', async () => {
  await page.getByRole('button', { name: 'Journal' }).click();
  await page.getByText('NQ-EDIT').first().waitFor({ timeout: 6000 });
  // NQ-EDIT row must show closed 25 Aug and held 14d, under a W35 chapter
  const row = page.getByText('NQ-EDIT').locator('..');
  const txt = await row.innerText();
  log('  journal row:', txt.replace(/\s+/g, ' '));
  if (!/closed 25 Aug/.test(txt)) throw new Error('closed date not 25 Aug');
  if (!/held 14d/.test(txt)) throw new Error('held-days not 14');
  if (!(await page.getByText(/W35 . 24–30 Aug/).count())) throw new Error('no W35 chapter');
  await shot(page, 'journal-W35');
});

await step('both themes', async () => {
  await page.locator('button[title="White"]').click(); await page.waitForTimeout(500); await shot(page, 'theme-white');
  await page.locator('button[title="Forest"]').click(); await page.waitForTimeout(500); await shot(page, 'theme-forest');
});

console.log('\n=== FULL EDIT SMOKE ===');
for (const [k, v] of results) console.log(v === 'PASS' ? 'PASS' : 'FAIL', k, v === 'PASS' ? '' : '— ' + v.slice(5));
const passed = results.filter(([, v]) => v === 'PASS').length;
console.log(`${passed}/${results.length} passed · ${n} shots`);
await browser.close();
process.exit(passed === results.length ? 0 : 2);
