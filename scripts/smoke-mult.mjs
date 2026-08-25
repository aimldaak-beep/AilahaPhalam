// EDITABLE MULTIPLIER + NSE FUT smoke — live URL, both themes.
import { chromium } from 'playwright';
import fs from 'fs';
const SITE = 'https://ailaha-phalam.vercel.app';
const REF = 'crhlsheofcneafhbdrld';
const DIR = '/tmp/claude-1000/-mnt-c-WINDOWS-system32/8b009f8e-8382-4f2b-96a9-9d6c44db17a1/scratchpad';
const OUT = DIR + '/mult-shots';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const sess = fs.readFileSync(DIR + '/sessM.json', 'utf8');
const log = (...a) => console.log('•', ...a);
const results = []; const step = async (name, fn) => { try { await fn(); results.push([name,'PASS']); log('PASS', name); } catch (e) { results.push([name,'FAIL '+e.message.split('\n')[0]]); log('FAIL', name, e.message.split('\n')[0]); } };
let n = 0; const shot = async (p, nm) => { n++; await p.screenshot({ path: `${OUT}/${String(n).padStart(2,'0')}-${nm}.png` }); };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1500 } })).newPage();
await page.goto(SITE, { waitUntil: 'domcontentloaded' });
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, sess]);
await page.goto(SITE, { waitUntil: 'networkidle' });
await page.getByText('Open MTM', { exact: false }).waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
const card = (sym) => page.getByText(sym, { exact: true }).locator('xpath=ancestor::div[2]');
const has = async (txt) => (await page.getByText(txt).count()) > 0;

await step('seeded NSE FUT MTM uses ×250 (hand-verified +₹12,395)', async () => {
  if (!(await page.getByText(/NSE FUT ×250/).count())) throw new Error('NSE FUT ×250 meta missing');
  if (!(await has('+₹12,395'))) throw new Error('RELIANCE MTM +₹12,395 not shown');
  await shot(page, 'seeded-nsefut');
});

await step('Add NSE FUT: multiplier blank on select, editable, stored ×175', async () => {
  await page.getByRole('button', { name: 'Add trade' }).click();
  await page.getByPlaceholder('e.g. NIFTY25S').fill('TCS-NEW');
  await page.locator('select').first().selectOption('NSE FUT');
  const multInput = page.getByText('Multiplier · lot size').locator('..').locator('input');
  const blank = await multInput.inputValue();
  if (blank !== '') throw new Error('multiplier not blank on NSE FUT select: "' + blank + '"');
  await multInput.fill('175');
  await page.getByPlaceholder('0.00').fill('3500');
  await shot(page, 'add-nsefut-form');
  await page.getByRole('button', { name: /Confirm/ }).click();
  await page.getByText('TCS-NEW').first().waitFor({ timeout: 6000 });
  if (!(await page.getByText(/NSE FUT ×175/).count())) throw new Error('TCS-NEW not stored with ×175');
});

await step('What-if respects stored multiplier ×250 (hand-verified +₹24,783)', async () => {
  await card('RELIANCE-SEED').getByRole('button', { name: 'What-if', exact: true }).click();
  await card('RELIANCE-SEED').getByPlaceholder('exit').fill('1500');
  await page.waitForTimeout(400);
  if (!(await has('+₹24,783'))) throw new Error('what-if did not use ×250 (expected +₹24,783)');
  await shot(page, 'whatif-mult');
  await page.keyboard.press('Escape');
});

await step('Edit multiplier 75→150 → MTM chain recomputes (PIN)', async () => {
  await card('NIFTY-EDIT').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByText('Set a PIN', { exact: false }).waitFor({ timeout: 5000 });
  await page.locator('input[type="password"]').fill('2468');
  await page.getByRole('button', { name: 'Set PIN' }).click();
  await page.getByText('Multiplier', { exact: true }).waitFor({ timeout: 6000 });
  const mult = page.getByText('Multiplier', { exact: true }).locator('..').locator('input');
  await mult.fill('150');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(1500);
  if (!(await has('+₹1,47,840'))) throw new Error('MTM did not recompute to +₹1,47,840');
  if (await has('+₹73,920')) throw new Error('old ×75 MTM still present');
  await shot(page, 'after-mult-edit');
});

await step('both themes', async () => {
  await page.locator('button[title="White"]').click(); await page.waitForTimeout(500); await shot(page, 'theme-white');
  await page.locator('button[title="Forest"]').click(); await page.waitForTimeout(500); await shot(page, 'theme-forest');
});

console.log('\n=== MULTIPLIER SMOKE ===');
for (const [k, v] of results) console.log(v === 'PASS' ? 'PASS' : 'FAIL', k, v === 'PASS' ? '' : '— ' + v.slice(5));
const passed = results.filter(([, v]) => v === 'PASS').length;
console.log(`${passed}/${results.length} passed · ${n} shots`);
await browser.close();
process.exit(passed === results.length ? 0 : 2);
