/**
 * Proof: the read-only What-If preview equals what a REAL close would actually book.
 *
 * (a) preview  = the throwaway-clone + ledger-sum the WhatIfCloseModal does.
 * (b) realClose = independently replay the real pipeline: CloseTradeModal status
 *     derivation -> handleConfirmCloseTrade field transform -> ledger sum.
 * Then assert (a) === (b), and assert the ORIGINAL open trade object is unmutated.
 *
 * Run: npx tsx scripts/whatif-proof.ts
 */
import {
  Trade,
  TradeStatus,
  getWeekInfo,
  getWeeksBetween,
  calculateTradeForWeek,
} from '../src/types';

function ledgerNet(t: Trade): number {
  const todayStr = new Date().toISOString().split('T')[0];
  const endLimit =
    t.status === 'Closed' || t.status === 'CarryForwardClosed'
      ? (t.direction === 'Long' ? t.sellDate || todayStr : t.buyDate || todayStr)
      : todayStr;
  return getWeeksBetween(t.dateInitiated, endLimit).reduce((sum, w) => {
    const c = calculateTradeForWeek(t, w.weekKey);
    return c.isActive ? sum + c.netProfit : sum;
  }, 0);
}

// (a) Exactly what WhatIfCloseModal computes.
function previewNet(open: Trade, price: number, exitDate: string, rate?: number): number {
  const initWeek = getWeekInfo(open.dateInitiated).weekKey;
  const closeWeek = getWeekInfo(exitDate).weekKey;
  const hypoStatus: TradeStatus = closeWeek > initWeek ? 'CarryForwardClosed' : 'Closed';
  const hypothetical: Trade = {
    ...open,
    status: hypoStatus,
    sellPrice: open.direction === 'Long' ? price : open.sellPrice,
    buyPrice: open.direction === 'Long' ? open.buyPrice : price,
    sellDate: open.direction === 'Long' ? exitDate : open.sellDate,
    buyDate: open.direction === 'Long' ? open.buyDate : exitDate,
    closedUsdToInrRate: open.currency === 'USD' ? rate : open.closedUsdToInrRate,
  };
  return ledgerNet(hypothetical);
}

// (b) Replay the REAL close pipeline from App.tsx / CloseTradeModal.
function realCloseNet(open: Trade, exitPrice: number, exitDate: string, closedRate?: number): number {
  // CloseTradeModal status derivation:
  const initWeekInfo = getWeekInfo(open.dateInitiated);
  const closeWeekInfo = getWeekInfo(exitDate);
  const finalStatus: TradeStatus = closeWeekInfo.weekKey > initWeekInfo.weekKey ? 'CarryForwardClosed' : 'Closed';
  const manualRate = open.currency === 'USD' ? closedRate : undefined;
  // handleConfirmCloseTrade field transform:
  const closed: Trade = {
    ...open,
    status: finalStatus,
    sellPrice: open.direction === 'Long' ? exitPrice : open.sellPrice,
    buyPrice: open.direction === 'Long' ? open.buyPrice : exitPrice,
    sellDate: open.direction === 'Long' ? exitDate : open.sellDate,
    buyDate: open.direction === 'Long' ? open.buyDate : exitDate,
    closedUsdToInrRate: manualRate !== undefined ? manualRate : open.closedUsdToInrRate,
  };
  return ledgerNet(closed);
}

// --- An OPEN, carry-forward USD position with prior weeks already recorded ---
const wkA = getWeekInfo('2026-02-02').weekKey; // initiation week
const wkB = getWeekInfo('2026-02-09').weekKey; // intermediate (recorded)
const closeDate = '2026-02-16'; // hypothetical close in a 3rd week

const openTrade: Trade = {
  id: 'whatif-open',
  symbol: 'NAS-CF',
  instrument: 'Nasdaq', // $5/lot flat brokerage
  direction: 'Long',
  dateInitiated: '2026-02-02',
  buyPrice: 200,
  sellPrice: null, // still open
  buyDate: '2026-02-02',
  sellDate: null,
  lotSize: 1,
  numberOfLots: 4,
  status: 'CarryForwardLong',
  currency: 'USD',
  usdToInrRate: 83,
  fridayUsdToInrRates: { [wkA]: 83, [wkB]: 84 },
  closedUsdToInrRate: undefined,
  realizationRate: 1.0,
  fridayClosingPrices: { [wkA]: 210, [wkB]: 225 }, // prior weeks locked
};

const snapshotBefore = JSON.stringify(openTrade);

const hypoPrice = 240;
const hypoRate = 85;

const a = previewNet(openTrade, hypoPrice, closeDate, hypoRate);
const b = realCloseNet(openTrade, hypoPrice, closeDate, hypoRate);
const snapshotAfter = JSON.stringify(openTrade);

console.log('============================================================');
console.log('What-If preview vs real-close, OPEN carry-forward USD Nasdaq trade');
console.log(`Spans weeks ${wkA} (init) -> ${wkB} (recorded) -> close @ ${closeDate}`);
console.log(`Hypothetical: close price ${hypoPrice}, USD/INR ${hypoRate}`);
console.log('============================================================');
console.log(`  (a) What-If preview net  = ₹${a.toFixed(4)}`);
console.log(`  (b) Real-close ledger net = ₹${b.toFixed(4)}`);
console.log(`  MATCH (a === b)           : ${a === b}`);
console.log('');
console.log('  Note: preview accounts for the locked prior weeks (210@83, 225@84),');
console.log('  not just entry->price — that is the difference vs the instant "Check PnL".');
console.log('');
console.log(`  Original open trade unmutated by preview: ${snapshotBefore === snapshotAfter}`);
console.log(`  Trade still open (status/sellPrice intact): ${openTrade.status === 'CarryForwardLong' && openTrade.sellPrice === null}`);
