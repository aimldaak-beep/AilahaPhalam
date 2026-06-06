/**
 * Proof harness: runs the REAL types.ts PnL math (no mocks) to show that editing a
 * trade's input values recomputes PnL correctly. Mirrors exactly what EditTradeModal
 * writes back (same id, edited fields), then sums per-week net via calculateTradeForWeek.
 *
 * Regression test for the PnL math. Re-run anytime to confirm it still holds:
 *   npm run test:pnl              (preferred)
 *   npx tsx scripts/edit-pnl-proof.ts
 */
import {
  Trade,
  getWeekInfo,
  getWeeksBetween,
  calculateTradeForWeek,
} from '../src/types';

function tradeEndLimit(t: Trade): string {
  const todayStr = new Date().toISOString().split('T')[0];
  return t.status === 'Closed' || t.status === 'CarryForwardClosed'
    ? (t.direction === 'Long' ? t.sellDate || todayStr : t.buyDate || todayStr)
    : todayStr;
}

function perWeekNet(t: Trade) {
  const weeks = getWeeksBetween(t.dateInitiated, tradeEndLimit(t));
  const rows = weeks.map((w) => {
    const c = calculateTradeForWeek(t, w.weekKey);
    return {
      week: w.weekKey,
      role: c.role,
      open: c.openingPrice,
      close: c.closingPrice,
      points: c.points,
      gross: c.grossProfit,
      brokerage: c.brokerageDeducted,
      net: c.isActive ? c.netProfit : 0,
    };
  });
  const total = rows.reduce((s, r) => s + r.net, 0);
  return { rows, total };
}

function show(label: string, t: Trade) {
  const { rows, total } = perWeekNet(t);
  console.log(`\n${label}`);
  console.table(
    rows.map((r) => ({
      week: r.week,
      role: r.role,
      open: r.open,
      close: r.close,
      points: +r.points.toFixed(3),
      gross: +r.gross.toFixed(3),
      brokerage: +r.brokerage.toFixed(3),
      net: +r.net.toFixed(3),
    })),
  );
  console.log(`  TOTAL NET = ${total.toFixed(3)}`);
  return total;
}

// ----------------------------------------------------------------------------
// DEMO A — closed SAME-WEEK USD trade. Edit closedUsdToInrRate 80 -> 85.
// DOW brokerage is $5/lot flat. Long, 10 lots, 50 points move.
// ----------------------------------------------------------------------------
const aDay = '2026-03-09'; // a Monday
const aWeek = getWeekInfo(aDay).weekKey;

const tradeA_before: Trade = {
  id: 'demoA',
  symbol: 'DOW-DEMO',
  instrument: 'DOW',
  direction: 'Long',
  dateInitiated: aDay,
  buyPrice: 100,
  sellPrice: 150,
  buyDate: aDay,
  sellDate: aDay,
  lotSize: 1,
  numberOfLots: 10,
  status: 'Closed',
  currency: 'USD',
  usdToInrRate: 80,
  fridayUsdToInrRates: {},
  closedUsdToInrRate: 80,
  realizationRate: 1.0,
  fridayClosingPrices: {},
};
const tradeA_after: Trade = { ...tradeA_before, closedUsdToInrRate: 85 };

console.log('============================================================');
console.log(`DEMO A: closed same-week USD DOW trade (week ${aWeek})`);
console.log('Edit: closedUsdToInrRate 80 -> 85');
console.log('Hand calc @80: gross=50pts*10lots*80=40000; brokerage=$5*10*2sides*80=8000; net=32000');
console.log('Hand calc @85: gross=50*10*85=42500; brokerage=5*10*2*85=8500; net=34000');
console.log('============================================================');
const aBefore = show('BEFORE (fx=80)', tradeA_before);
const aAfter = show('AFTER  (fx=85)', tradeA_after);
console.log(`\n  Δ net = ${(aAfter - aBefore).toFixed(3)} (expected +2000.000)`);
console.log(`  match @80: ${aBefore.toFixed(3) === '32000.000'} | match @85: ${aAfter.toFixed(3) === '34000.000'}`);

// ----------------------------------------------------------------------------
// DEMO B — CARRY-FORWARD USD trade spanning 3 ISO weeks. Futures (0.0003*turnover).
// Edit a per-week Friday close AND a per-week FX rate on the MIDDLE week, and show
// it ripples into the next week's opening price (week segmentation).
// ----------------------------------------------------------------------------
const bInit = '2026-01-05'; // Monday wk1
const bMid = '2026-01-12'; // Monday wk2
const bClose = '2026-01-19'; // Monday wk3
const w1 = getWeekInfo(bInit).weekKey;
const w2 = getWeekInfo(bMid).weekKey;
const w3 = getWeekInfo(bClose).weekKey;

const tradeB_before: Trade = {
  id: 'demoB',
  symbol: 'NIFTY-CF',
  instrument: 'Futures',
  direction: 'Long',
  dateInitiated: bInit,
  buyPrice: 100,
  sellPrice: 130, // exit price, used in closing week w3
  buyDate: bInit,
  sellDate: bClose,
  lotSize: 1,
  numberOfLots: 1,
  status: 'CarryForwardClosed',
  currency: 'USD',
  usdToInrRate: 80,
  fridayUsdToInrRates: { [w1]: 80, [w2]: 82 },
  closedUsdToInrRate: 85, // closing week w3 FX
  realizationRate: 1.0,
  fridayClosingPrices: { [w1]: 110, [w2]: 120 }, // w3 uses exit price
};

// Edit exactly what the modal would write: middle week Friday close 120 -> 125, FX 82 -> 84.
const tradeB_after: Trade = {
  ...tradeB_before,
  fridayClosingPrices: { ...tradeB_before.fridayClosingPrices, [w2]: 125 },
  fridayUsdToInrRates: { ...tradeB_before.fridayUsdToInrRates, [w2]: 84 },
};

console.log('\n\n============================================================');
console.log(`DEMO B: carry-forward USD Futures trade across ${w1}, ${w2}, ${w3}`);
console.log(`Edit: ${w2} Friday close 120 -> 125, and ${w2} FX 82 -> 84`);
console.log('Hand calc BEFORE:');
console.log('  w1 init : pts(110-100)=10 *fx80 = 800 ; brok=0.0003*100*80=2.4 ; net=797.6');
console.log('  w2 mid  : pts(120-110)=10 *fx82 = 820 ; brok=0 ; net=820');
console.log('  w3 close: pts(130-120)=10 *fx85 = 850 ; brok=0.0003*130*85=3.315 ; net=846.685');
console.log('  TOTAL = 2464.285');
console.log('Hand calc AFTER (note w3 opening becomes 125 — the cross-week ripple):');
console.log('  w1 init : 10 *fx80 = 800 ; brok=2.4 ; net=797.6');
console.log('  w2 mid  : pts(125-110)=15 *fx84 = 1260 ; brok=0 ; net=1260');
console.log('  w3 close: pts(130-125)=5 *fx85 = 425 ; brok=3.315 ; net=421.685');
console.log('  TOTAL = 2479.285');
console.log('============================================================');
const bBefore = show('BEFORE', tradeB_before);
const bAfter = show('AFTER', tradeB_after);
console.log(`\n  Δ net = ${(bAfter - bBefore).toFixed(3)} (expected +15.000)`);
console.log(`  match BEFORE: ${bBefore.toFixed(3) === '2464.285'} | match AFTER: ${bAfter.toFixed(3) === '2479.285'}`);
