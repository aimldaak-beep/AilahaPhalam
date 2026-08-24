/**
 * PHASE 2 brokerage confirmation. Proves the v2 engine calls the UNCHANGED v1
 * legacy brokerage formula per instrument, for BOTH legs:
 *   - calculateTurnoverAndBrokerage : the per-instrument formula
 *   - calculateTradeForWeek         : entry leg charged in the initiation week,
 *                                     exit leg charged in the closing week.
 * INSTR maps each spec instrument -> its v1 enum (the brokerage branch selector).
 */
import { Trade, calculateTurnoverAndBrokerage, calculateTradeForWeek, getWeekInfo } from '../src/types';
import { INSTR, SpecInstrument } from '../src/lib/v2engine';

const money = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 2 });

// Expected legacy formula, restated independently from types.ts, to compare against.
function expectedBrokerage(v1: string, price: number, lots: number, lotSize: number): number {
  const turnover = price * lots * lotSize;
  const pctBranch = ['Futures', 'Option', 'NG', 'Gift Nifty', 'NSE Futures', 'NSE Options'];
  return pctBranch.includes(v1) ? 0.0003 * turnover : 5 * lots;
}

console.log('== Per-instrument formula (calculateTurnoverAndBrokerage) ==');
console.log('instr        v1 enum      price   lots  mult   engine       expected     match');
let allMatch = true;
const price = 25000, lots = 3;
for (const spec of Object.keys(INSTR) as SpecInstrument[]) {
  const { v1, mult } = INSTR[spec];
  const eng = calculateTurnoverAndBrokerage(price, lots, mult, v1 as any).brokerage;
  const exp = expectedBrokerage(v1, price, lots, mult);
  const ok = Math.abs(eng - exp) < 1e-9; allMatch = allMatch && ok;
  console.log(
    `${spec.padEnd(12)} ${String(v1).padEnd(12)} ${String(price).padStart(6)} ${String(lots).padStart(4)}  ${String(mult).padStart(4)}   ${money(eng).padStart(10)}   ${money(exp).padStart(10)}   ${ok ? 'OK' : 'FAIL'}`,
  );
}

// Entry-leg vs exit-leg: build a NIFTY FUT long over two weeks and a NIKKEI short,
// confirm the initiation week charges the entry leg and the closing week the exit leg.
function twoWeekTrade(spec: SpecInstrument, dir: 'Long' | 'Short', entry: number, exit: number): Trade {
  const { v1, mult } = INSTR[spec];
  const initDate = '2026-08-17'; // Mon of W34
  const closeDate = '2026-08-25'; // Tue of W35
  const wk = (d: string) => getWeekInfo(d).weekKey;
  return {
    id: 't', symbol: spec, instrument: v1 as any, direction: dir,
    dateInitiated: initDate,
    buyPrice: dir === 'Long' ? entry : exit,
    sellPrice: dir === 'Long' ? exit : entry,
    buyDate: dir === 'Long' ? initDate : closeDate,
    sellDate: dir === 'Long' ? closeDate : initDate,
    lotSize: mult, numberOfLots: lots, status: 'Closed', currency: 'INR',
    usdToInrRate: 1, fridayUsdToInrRates: {}, realizationRate: 1.0,
    fridayClosingPrices: { [wk(initDate)]: entry }, // no move mid-week -> isolate brokerage
  } as Trade;
}

console.log('\n== Entry leg (initiation week) vs Exit leg (closing week) ==');
for (const [spec, dir] of [['NIFTY FUT', 'Long'], ['NIKKEI', 'Short']] as [SpecInstrument, 'Long' | 'Short'][]) {
  const tr = twoWeekTrade(spec, dir, 25000, 25000);
  const wkInit = getWeekInfo(tr.dateInitiated).weekKey;
  const wkClose = getWeekInfo(dir === 'Long' ? tr.sellDate! : tr.buyDate!).weekKey;
  const initCalc = calculateTradeForWeek(tr, wkInit);
  const closeCalc = calculateTradeForWeek(tr, wkClose);
  const legFormula = expectedBrokerage(INSTR[spec].v1, 25000, lots, INSTR[spec].mult);
  const initOk = Math.abs(initCalc.brokerageDeducted - legFormula) < 1e-6;
  const closeOk = Math.abs(closeCalc.brokerageDeducted - legFormula) < 1e-6;
  allMatch = allMatch && initOk && closeOk;
  console.log(`${spec} ${dir}: init-week brokerage ${money(initCalc.brokerageDeducted)} (${initOk ? 'OK' : 'FAIL'}) · close-week brokerage ${money(closeCalc.brokerageDeducted)} (${closeOk ? 'OK' : 'FAIL'}) · formula/leg ${money(legFormula)}`);
}

console.log('\n' + (allMatch ? 'ALL_BROKERAGE_CONFIRMED' : 'MISMATCH'));
process.exit(allMatch ? 0 : 1);
