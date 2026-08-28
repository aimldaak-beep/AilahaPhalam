/**
 * Weekly-FX-settlement proof (engine level, real live-ledger trades of 2026-08-28).
 *  1. No rate anywhere -> USD MTM is NaN (loud "FX rate not set"), never a default.
 *  2. Provisional 95.55 -> the three USD trades (COPPER-HG, NASDAQ, DOW) produce ONE
 *     combined ₹ MTM equal to the hand formula at 95.55.
 *  3. Settlement at a closing rate re-prices + FREEZES the week (per-trade stamps win
 *     over any later store change), incl. a mid-week USD close's re-stamp.
 *  4. The settled rate carries forward as next week's provisional base.
 * Run: npx tsx scripts/fx-weekly-proof.ts
 */
import { Trade } from '../src/types';
import { setFxContext, liveMtm, liveMtmRows, realized } from '../src/lib/v2engine';
import { FxWeeks, rateForWeek } from '../src/lib/fxmodel';

const W = '2026-W35';           // Mon 24 Aug 2026 — the current week
const NEXT = '2026-W36';

// The three live USD trades, post-migration shape (COPPER currency:'USD').
const mk = (o: Partial<Trade>): Trade => ({
  id: 'x', symbol: 'X', instrument: 'DOW', direction: 'Short', dateInitiated: '2026-08-24',
  buyPrice: null, sellPrice: 0, buyDate: null, sellDate: null, lotSize: 1, numberOfLots: 1,
  status: 'CarryForwardShort', currency: 'USD', usdToInrRate: null, fridayUsdToInrRates: {},
  realizationRate: 0.8, fridayClosingPrices: {}, entryBrokerage: null, exitBrokerage: null, ...o,
} as Trade);

const nasdaq = mk({ id: 'nq', symbol: 'NASDAQ', instrument: 'Nasdaq', dateInitiated: '2026-08-27', sellPrice: 29549, lotSize: 20, fridayClosingPrices: { [W]: 29400 } });
const copper = mk({ id: 'cu', symbol: 'COPPER', instrument: 'COPPER-HG', dateInitiated: '2026-08-27', sellPrice: 6.649, lotSize: 25000, entryBrokerage: 5, fridayClosingPrices: { [W]: 6.6 } });
const dow    = mk({ id: 'dj', symbol: 'DOW', instrument: 'DOW', dateInitiated: '2026-08-24', sellPrice: 53213, lotSize: 5, fridayClosingPrices: { [W]: 53000 } });

let fails = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : ''));
  if (!cond) fails++;
};
// Hand formula: short one week (init week): net = ((entry-close)*mult*lots*rate - brokerage*rate) * real
const hand = (entry: number, close: number, mult: number, lots: number, brokUsd: number, rate: number, real: number) =>
  Math.round(((entry - close) * mult * lots - brokUsd) * rate * real);

// 1 — no rate anywhere: loud NaN
setFxContext({});
ok('no rate -> NaN (FX rate not set), no silent default', isNaN(liveMtm(nasdaq)) && isNaN(liveMtm(copper)) && isNaN(liveMtm(dow)));

// 2 — provisional 95.55 drives ONE combined ₹ MTM
const prov: FxWeeks = { [W]: { rate: 95.55, settled: false } };
setFxContext(prov);
const eNq = hand(29549, 29400, 20, 1, 5, 95.55, 0.8);        // $5/lot flat brokerage
const eCu = hand(6.649, 6.6, 25000, 1, 5, 95.55, 0.8);       // manual $5 entry brokerage
const eDj = hand(53213, 53000, 5, 1, 5, 95.55, 0.8);
ok('NASDAQ ₹ @95.55', liveMtm(nasdaq) === eNq, `${liveMtm(nasdaq)} == ${eNq}`);
ok('COPPER ₹ @95.55 (COMEX now inside ₹ MTM)', liveMtm(copper) === eCu, `${liveMtm(copper)} == ${eCu}`);
ok('DOW ₹ @95.55', liveMtm(dow) === eDj, `${liveMtm(dow)} == ${eDj}`);
const combined = liveMtm(nasdaq) + liveMtm(copper) + liveMtm(dow);
ok('ONE combined ₹ Open-MTM', combined === eNq + eCu + eDj, '₹' + combined);
ok('row rate reads 95.55', liveMtmRows(dow)[0].rate === 95.55);

// 3 — settlement at 95.9 re-prices + freezes (simulates saveSaturday's stamping)
const SETTLE = 95.9;
const stamp = (t: Trade): Trade => ({ ...t, fridayUsdToInrRates: { ...t.fridayUsdToInrRates, [W]: SETTLE } });
const nqS = stamp(nasdaq), cuS = stamp(copper), djS = stamp(dow);
setFxContext({ [W]: { rate: SETTLE, settled: true } });
ok('settled week re-priced at 95.9', liveMtm(djS) === hand(53213, 53000, 5, 1, 5, SETTLE, 0.8), String(liveMtm(djS)));
// later store mutations must NOT move a settled (stamped) week
setFxContext({ [W]: { rate: 90, settled: true }, [NEXT]: { rate: 97, settled: false } });
ok('FROZEN: later store changes never re-price a settled week', liveMtm(djS) === hand(53213, 53000, 5, 1, 5, SETTLE, 0.8));
// mid-week USD close: provisional stamp at close, re-stamped at settlement
const closedMid: Trade = { ...mk({ id: 'cl', symbol: 'NASDAQ', instrument: 'Nasdaq', dateInitiated: '2026-08-27', sellPrice: 29549, lotSize: 20 }), status: 'Closed', buyPrice: 29400, buyDate: '2026-08-28', closedUsdToInrRate: 95.55 };
setFxContext({});
const atProv = realized(closedMid);
const atSettle = realized({ ...closedMid, closedUsdToInrRate: SETTLE });
ok('mid-week close prices at provisional', atProv === hand(29549, 29400, 20, 1, 10, 95.55, 0.8), String(atProv)); // both legs, same week
ok('settlement re-stamps + freezes the closed trade', atSettle === hand(29549, 29400, 20, 1, 10, SETTLE, 0.8), String(atSettle));

// 4 — carry-forward: the settled rate is next week's provisional base
const after: FxWeeks = { [W]: { rate: SETTLE, settled: true } };
ok('settled 95.9 becomes next week provisional base', rateForWeek(after, NEXT) === SETTLE);
ok('week with no store at all stays null (never 83.x)', rateForWeek({}, NEXT) === null);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
