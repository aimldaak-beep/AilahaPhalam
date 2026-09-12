/**
 * Proof harness for weekly MTM + leg-week brokerage. Runs the REAL types.ts math (no
 * mocks) and HARD-ASSERTS (non-zero exit on any failure):
 *   (a) same-week legacy trade: byte-identical to the pre-change engine (golden JSON);
 *   (b) 3-week carry-forward LONG with actual leg brokerage: weekly pieces sum to the
 *       lifetime net to the paisa, entry leg charged in entry week, exit leg in close week;
 *   (c) the same for a SHORT — attribution flips (entry = sell leg);
 *   (d) editing a middle week's mark re-derives only that week and later ones;
 *   (e) legacy carry-forward trades (no split fields): byte-identical old behavior,
 *       and hasLegBrokerage() drives the "legacy" tag correctly.
 *
 *   npm run test:weekly            (also part of npm run test:proofs)
 */
import {
  Trade,
  calculateTradeForWeek,
  calculateWeeklyStanding,
  getWeeksBetween,
  hasLegBrokerage,
} from '../src/types';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
function paisa(n: number): string {
  return n.toFixed(2);
}
function sumWeekly(t: Trade, endDate: string): number {
  return getWeeksBetween(t.dateInitiated, endDate).reduce((s, w) => {
    const c = calculateTradeForWeek(t, w.weekKey);
    return c.isActive ? s + c.netProfit : s;
  }, 0);
}

// ---------------------------------------------------------------------------
// (a) SAME-WEEK legacy trade — byte-identical to the pre-change engine.
// Golden JSON captured from the engine BEFORE this change (commit e021ff2).
// ---------------------------------------------------------------------------
console.log('\n(a) same-week legacy trade — byte-identical golden');
const sameWeek: Trade = {
  id: 'golden_same', symbol: 'DOW-G', instrument: 'DOW', direction: 'Long',
  dateInitiated: '2026-03-09', buyPrice: 100, sellPrice: 150,
  buyDate: '2026-03-09', sellDate: '2026-03-09',
  lotSize: 1, numberOfLots: 10, status: 'Closed', currency: 'USD', usdToInrRate: 80,
  fridayUsdToInrRates: {}, closedUsdToInrRate: 80, realizationRate: 1.0, fridayClosingPrices: {},
};
const GOLDEN_SAME =
  '{"isActive":true,"role":"same-week-closed","openingPrice":100,"closingPrice":150,"points":50,"grossProfit":40000,"brokerageDeducted":8000,"netProfit":32000,"buyTurnover":1000,"sellTurnover":1500,"buyBrokerage":4000,"sellBrokerage":4000}';
check('2026-W11 output byte-identical', JSON.stringify(calculateTradeForWeek(sameWeek, '2026-W11')) === GOLDEN_SAME);

// ---------------------------------------------------------------------------
// (b) 3-week carry-forward LONG with actual leg brokerage (INR + constant-FX USD).
// INVARIANT: sum of a trade's weekly pieces across its life == lifetime net, to the paisa.
// ---------------------------------------------------------------------------
console.log('\n(b) 3-week CF LONG with split brokerage — weekly pieces sum == lifetime net');
const cfLong: Trade = {
  id: 'cf_long', symbol: 'NIF-SPLIT', instrument: 'NSE Futures', direction: 'Long',
  dateInitiated: '2026-01-05', buyPrice: 100, sellPrice: 130,
  buyDate: '2026-01-05', sellDate: '2026-01-19',
  lotSize: 250, numberOfLots: 1, status: 'CarryForwardClosed', currency: 'INR', usdToInrRate: 1,
  fridayUsdToInrRates: {}, realizationRate: 1.0,
  fridayClosingPrices: { '2026-W02': 110, '2026-W03': 120 },
  entryBrokerage: 100, exitBrokerage: 150,
};
{
  const w1 = calculateTradeForWeek(cfLong, '2026-W02');
  const w2 = calculateTradeForWeek(cfLong, '2026-W03');
  const w3 = calculateTradeForWeek(cfLong, '2026-W04');
  // Lifetime net computed INDEPENDENTLY of the weekly engine:
  const lifetime = (130 - 100) * 250 * 1 - (100 + 150); // 7250
  check('entry-leg ₹100 charged in entry week', w1.brokerageDeducted === 100);
  check('no brokerage in intermediate week', w2.brokerageDeducted === 0);
  check('exit-leg ₹150 charged in close week', w3.brokerageDeducted === 150);
  check('weekly pieces: 2400 / 2500 / 2350', paisa(w1.netProfit) === '2400.00' && paisa(w2.netProfit) === '2500.00' && paisa(w3.netProfit) === '2350.00');
  check('INVARIANT Σ weekly == lifetime net (paisa)', paisa(w1.netProfit + w2.netProfit + w3.netProfit) === paisa(lifetime), `${paisa(w1.netProfit + w2.netProfit + w3.netProfit)} vs ${paisa(lifetime)}`);
}
// USD constant-FX variant — brokerage entered in USD, converted through the engine's
// existing weekly conversion.
const cfLongUsd: Trade = {
  ...cfLong, id: 'cf_long_usd', currency: 'USD', usdToInrRate: 80,
  fridayUsdToInrRates: { '2026-W02': 80, '2026-W03': 80 }, closedUsdToInrRate: 80,
};
{
  const total = sumWeekly(cfLongUsd, '2026-01-19');
  const lifetime = ((130 - 100) * 250 - (100 + 150)) * 80; // 580000
  check('USD const-FX: Σ weekly == lifetime net (paisa)', paisa(total) === paisa(lifetime), `${paisa(total)} vs ${paisa(lifetime)}`);
  check('USD entry leg converted at week FX (100*80)', calculateTradeForWeek(cfLongUsd, '2026-W02').brokerageDeducted === 8000);
}

// ---------------------------------------------------------------------------
// (c) Same for a SHORT — attribution flips: entry leg = SELL, exit leg = BUY.
// ---------------------------------------------------------------------------
console.log('\n(c) 3-week CF SHORT with split brokerage — attribution flips');
const cfShort: Trade = {
  id: 'cf_short', symbol: 'NIF-SHORT', instrument: 'NSE Futures', direction: 'Short',
  dateInitiated: '2026-01-05', sellPrice: 130, buyPrice: 100,
  sellDate: '2026-01-05', buyDate: '2026-01-19',
  lotSize: 250, numberOfLots: 1, status: 'CarryForwardClosed', currency: 'INR', usdToInrRate: 1,
  fridayUsdToInrRates: {}, realizationRate: 1.0,
  fridayClosingPrices: { '2026-W02': 120, '2026-W03': 110 },
  entryBrokerage: 100, exitBrokerage: 150,
};
{
  const w1 = calculateTradeForWeek(cfShort, '2026-W02');
  const w2 = calculateTradeForWeek(cfShort, '2026-W03');
  const w3 = calculateTradeForWeek(cfShort, '2026-W04');
  const lifetime = (130 - 100) * 250 * 1 - (100 + 150); // short profit falling market
  check('entry-leg ₹100 charged in entry week (SELL leg)', w1.brokerageDeducted === 100);
  check('exit-leg ₹150 charged in close week (BUY leg)', w3.brokerageDeducted === 150);
  check('weekly pieces: 2400 / 2500 / 2350', paisa(w1.netProfit) === '2400.00' && paisa(w2.netProfit) === '2500.00' && paisa(w3.netProfit) === '2350.00');
  check('INVARIANT Σ weekly == lifetime net (paisa)', paisa(w1.netProfit + w2.netProfit + w3.netProfit) === paisa(lifetime));
}

// ---------------------------------------------------------------------------
// (d) Edit a middle week's mark — only that week and later re-derive.
// ---------------------------------------------------------------------------
console.log("\n(d) edit middle week's mark — only that week and later re-derive");
{
  const before = ['2026-W02', '2026-W03', '2026-W04'].map((wk) => calculateTradeForWeek(cfLong, wk));
  const edited: Trade = {
    ...cfLong, id: 'cf_long_edit',
    fridayClosingPrices: { ...cfLong.fridayClosingPrices, '2026-W03': 125 },
  };
  const after = ['2026-W02', '2026-W03', '2026-W04'].map((wk) => calculateTradeForWeek(edited, wk));
  check('entry week piece unchanged (byte-identical)', JSON.stringify(before[0]) === JSON.stringify(after[0]));
  check('edited week re-derives (2500 -> 3750)', paisa(after[1].netProfit) === '3750.00');
  check('later week re-derives from new mark (2350 -> 1100)', paisa(after[2].netProfit) === '1100.00' && after[2].openingPrice === 125);
  const total = after.reduce((s, c) => s + c.netProfit, 0);
  check('INVARIANT survives the edit (Σ still == lifetime 7250)', paisa(total) === '7250.00');
}

// ---------------------------------------------------------------------------
// (e) Legacy carry-forward trades (no split fields) — byte-identical old behavior + tag.
// Goldens captured from the engine BEFORE this change (varying FX, formula brokerage,
// entry leg in entry week / exit leg in close week — the engine's existing treatment).
// ---------------------------------------------------------------------------
console.log('\n(e) legacy CF trades — old behavior byte-identical, "legacy" tag condition');
const legacyCF: Trade = {
  id: 'golden_cf', symbol: 'NIF-G', instrument: 'Futures', direction: 'Long',
  dateInitiated: '2026-01-05', buyPrice: 100, sellPrice: 130,
  buyDate: '2026-01-05', sellDate: '2026-01-19',
  lotSize: 1, numberOfLots: 1, status: 'CarryForwardClosed', currency: 'USD', usdToInrRate: 80,
  fridayUsdToInrRates: { '2026-W02': 80, '2026-W03': 82 }, closedUsdToInrRate: 85, realizationRate: 1.0,
  fridayClosingPrices: { '2026-W02': 110, '2026-W03': 120 },
};
const GOLDEN_CF: Record<string, string> = {
  '2026-W02': '{"isActive":true,"role":"initiation","openingPrice":100,"closingPrice":110,"points":10,"grossProfit":800,"brokerageDeducted":2.4,"netProfit":797.6,"buyTurnover":100,"sellTurnover":130,"buyBrokerage":2.4,"sellBrokerage":3.12}',
  '2026-W03': '{"isActive":true,"role":"intermediate","openingPrice":110,"closingPrice":120,"points":10,"grossProfit":820,"brokerageDeducted":0,"netProfit":820,"buyTurnover":100,"sellTurnover":130,"buyBrokerage":2.46,"sellBrokerage":3.198}',
  '2026-W04': '{"isActive":true,"role":"closing","openingPrice":120,"closingPrice":130,"points":10,"grossProfit":850,"brokerageDeducted":3.315,"netProfit":846.685,"buyTurnover":100,"sellTurnover":130,"buyBrokerage":2.55,"sellBrokerage":3.315}',
};
Object.entries(GOLDEN_CF).forEach(([wk, golden]) => {
  check(`legacy LONG ${wk} byte-identical`, JSON.stringify(calculateTradeForWeek(legacyCF, wk)) === golden);
});
const legacyShort: Trade = {
  ...legacyCF, id: 'golden_short', direction: 'Short',
  sellPrice: 100, buyPrice: 130, sellDate: '2026-01-05', buyDate: '2026-01-19',
};
const GOLDEN_SHORT: Record<string, string> = {
  '2026-W02': '{"isActive":true,"role":"initiation","openingPrice":100,"closingPrice":110,"points":-10,"grossProfit":-800,"brokerageDeducted":2.4,"netProfit":-802.4,"buyTurnover":130,"sellTurnover":100,"buyBrokerage":3.12,"sellBrokerage":2.4}',
  '2026-W03': '{"isActive":true,"role":"intermediate","openingPrice":110,"closingPrice":120,"points":-10,"grossProfit":-820,"brokerageDeducted":0,"netProfit":-820,"buyTurnover":130,"sellTurnover":100,"buyBrokerage":3.198,"sellBrokerage":2.46}',
  '2026-W04': '{"isActive":true,"role":"closing","openingPrice":120,"closingPrice":130,"points":-10,"grossProfit":-850,"brokerageDeducted":3.315,"netProfit":-853.315,"buyTurnover":130,"sellTurnover":100,"buyBrokerage":3.315,"sellBrokerage":2.55}',
};
Object.entries(GOLDEN_SHORT).forEach(([wk, golden]) => {
  check(`legacy SHORT ${wk} byte-identical`, JSON.stringify(calculateTradeForWeek(legacyShort, wk)) === golden);
});
check('legacy trade -> hasLegBrokerage false (tag shows)', !hasLegBrokerage(legacyCF) && !hasLegBrokerage(legacyShort));
check('split trade -> hasLegBrokerage true (no tag)', hasLegBrokerage(cfLong) && hasLegBrokerage(cfShort));

// ---------------------------------------------------------------------------
// Weekly Standing buckets — realized vs MTM, net identical to the plain weekly sum.
// ---------------------------------------------------------------------------
console.log('\nWeekly Standing — realized/MTM buckets, net == existing weekly sum');
{
  const book = [cfLong, cfShort, sameWeek];
  const s2 = calculateWeeklyStanding(book, '2026-W02'); // both CF trades open (initiation)
  const s4 = calculateWeeklyStanding(book, '2026-W04'); // both CF trades close
  check('W02: all MTM, nothing realized', paisa(s2.realized) === '0.00' && paisa(s2.mtm) === '4800.00');
  check('W04: all realized, nothing MTM', paisa(s4.realized) === '4700.00' && paisa(s4.mtm) === '0.00');
  const plainSum = book.reduce((s, t) => {
    const c = calculateTradeForWeek(t, '2026-W04');
    return c.isActive ? s + c.netProfit : s;
  }, 0);
  check('net == Σ netProfit (offset math untouched)', paisa(s4.net) === paisa(plainSum));
  const s11 = calculateWeeklyStanding(book, '2026-W11'); // same-week-closed trade
  check('W11: same-week trade lands in realized', paisa(s11.realized) === '32000.00' && paisa(s11.mtm) === '0.00');
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
if (failures > 0) process.exit(1);
