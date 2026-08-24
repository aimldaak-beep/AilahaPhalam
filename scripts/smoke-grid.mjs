// LAYOUT SYSTEM smoke — fixed grid alignment across cards, live URL, 1280 & 1600, both themes.
import { chromium } from 'playwright';
import fs from 'fs';
const SITE = 'https://ailaha-phalam.vercel.app';
const REF = 'crhlsheofcneafhbdrld';
const DIR = '/tmp/claude-1000/-mnt-c-WINDOWS-system32/8b009f8e-8382-4f2b-96a9-9d6c44db17a1/scratchpad';
const OUT = DIR + '/grid-shots';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const sess = fs.readFileSync(DIR + '/sessG.json', 'utf8');
const results = []; const step = (name, ok, note='') => { results.push([name, ok]); console.log(ok ? 'PASS' : 'FAIL', name, note); };
const browser = await chromium.launch();

async function run(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 1400 } });
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, sess]);
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.getByText('Open MTM', { exact: false }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const xs = async (sel) => Promise.all((await page.getByText(sel, { exact: true }).all()).map(async e => (await e.boundingBox()).x));
  const xsRole = async (name) => Promise.all((await page.getByRole('button', { name, exact: true }).all()).map(async e => (await e.boundingBox()).x));
  const spread = (a) => a.length ? Math.max(...a) - Math.min(...a) : 999;

  for (const [theme, title] of [['forest', 'Forest'], ['white', 'White']]) {
    await page.locator(`button[title="${title}"]`).click(); await page.waitForTimeout(400);
    const entry = await xs('Entry');            // 3 zone-2 ENTRY labels
    const pnl = await xs('Current P&L');         // 3 CURRENT P&L labels
    const wif = await xsRole('What-if');         // 3 action buttons
    const del = await xsRole('Delete');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    console.log(`  [${width}px ${theme}] ENTRY x=${entry.map(v=>v.toFixed(0))} spread=${spread(entry).toFixed(1)} · P&L spread=${spread(pnl).toFixed(1)} · What-if spread=${spread(wif).toFixed(1)} · Delete spread=${spread(del).toFixed(1)}`);
    step(`${width}/${theme}: ENTRY aligned across cards`, entry.length === 3 && spread(entry) < 2);
    step(`${width}/${theme}: CURRENT P&L aligned`, pnl.length === 3 && spread(pnl) < 2);
    step(`${width}/${theme}: What-if buttons pinned`, wif.length === 3 && spread(wif) < 2);
    step(`${width}/${theme}: Delete buttons pinned`, del.length === 3 && spread(del) < 2);
    step(`${width}/${theme}: no horizontal overflow`, !overflow);
    await page.screenshot({ path: `${OUT}/grid-${width}-${theme}.png` });
  }
  await ctx.close();
}
await run(1280);
await run(1600);

console.log('\n=== GRID SMOKE ===');
const passed = results.filter(([, v]) => v).length;
console.log(`${passed}/${results.length} passed`);
await browser.close();
process.exit(passed === results.length ? 0 : 2);
