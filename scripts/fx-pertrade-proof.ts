/**
 * PROOF — per-trade FX (Change 1) + weekly MTM journal with carry-forward reconciliation
 * (Change 2), 2026-09-12. Runs the REAL engine (types.ts) through the REAL journal model
 * (lib/weekly.ts); hard-asserts, non-zero exit on any failure.
 *   npx tsx scripts/fx-pertrade-proof.ts
 */
import { Trade, calculateTradeForWeek } from '../src/types';
import { realized, liveMtm, liveMtmRows, latestUsdRate, tradeRate } from '../src/lib/v2engine';
import { weekPieces, reconcile, journalWeeks } from '../src/lib/weekly';

let fails = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) fails++; };
const T = (o: Partial<Trade>): Trade => ({
  id: 't', symbol: 'X', instrument: 'DOW', direction: 'Long', dateInitiated: '2026-08-24', buyPrice: 40000, sellPrice: null,
  buyDate: '2026-08-24', sellDate: null, lotSize: 5, numberOfLots: 1, status: 'CarryForwardLong', currency: 'USD',
  usdToInrRate: 90, fridayUsdToInrRates: {}, realizationRate: 0.8, fridayClosingPrices: {}, entryBrokerage: null, exitBrokerage: null, ...o,
} as Trade);

console.log('1. Per-trade rate drives every week of a NEW trade; a LEGACY per-week stamp wins for its week');
{
  // W35 (24–30 Aug) stamp 40100, W36 stamp 40300, closed W37 (Wed 9 Sep) at 40250. Rate 90 on the trade, no legacy stamps.
  const t = T({ status: 'Closed', sellPrice: 40250, sellDate: '2026-09-09', fridayClosingPrices: { '2026-W35': 40100, '2026-W36': 40300 } });
  const w35 = calculateTradeForWeek(t, '2026-W35'), w36 = calculateTradeForWeek(t, '2026-W36'), w37 = calculateTradeForWeek(t, '2026-W37');
  // W35: (40100-40000)*5*1*90 = 45000 gross − entry leg $5*90=450 → 44550 × 0.8 = 35640
  check('W35 piece = (100×5×90 − 450)×0.8 = 35640', Math.round(w35.netProfit) === 35640, String(w35.netProfit));
  // W36: 200×5×90 = 90000 ×0.8 = 72000
  check('W36 piece = 200×5×90×0.8 = 72000', Math.round(w36.netProfit) === 72000, String(w36.netProfit));
  // W37 closing: (40250-40300)×5×90 = −22500 − exit leg 450 = −22950 ×0.8 = −18360
  check('W37 closing piece = (−50×5×90 − 450)×0.8 = −18360', Math.round(w37.netProfit) === -18360, String(w37.netProfit));
  check('realized = 35640+72000−18360 = 89280', realized(t) === 89280, String(realized(t)));
  const pcs = weekPieces(t);
  check('weekPieces: 3 pieces W35/W36/W37', pcs.map((p) => p.weekKey).join(',') === '2026-W35,2026-W36,2026-W37', pcs.map((p) => p.weekKey).join(','));
  check('pieces open→close: 40000→40100, 40100→40300, 40300→40250', pcs.map((p) => `${p.open}→${p.close}`).join(' ') === '40000→40100 40100→40300 40300→40250');
  check('every piece rate = the trade\'s own 90', pcs.every((p) => p.rate === 90));
  const rc = reconcile(t);
  check('RECONCILE: Σ pieces === realized', rc.ok && rc.sum === 89280, JSON.stringify(rc));
  const lifetime = (40250 - 40000) * 5 * 90 * 0.8 - (450 + 450) * 0.8;
  check('telescopes to lifetime (exit−entry)×mult×rate×real − both legs', rc.sum === Math.round(lifetime), `${rc.sum} vs ${lifetime}`);

  // LEGACY trade (pre-2026-09-12 history): W35 stamped 95, W36 96, closing 97 — those weeks keep converting
  // at their frozen stamps (byte-identical to the old weekly model); the per-trade rate fills only unstamped weeks.
  const legacy = T({ ...t, fridayUsdToInrRates: { '2026-W35': 95, '2026-W36': 96 }, closedUsdToInrRate: 97 });
  const l35 = calculateTradeForWeek(legacy, '2026-W35'), l36 = calculateTradeForWeek(legacy, '2026-W36'), l37 = calculateTradeForWeek(legacy, '2026-W37');
  check('legacy W35 @95 = (100×5×95 − 475)×0.8 = 37620', Math.round(l35.netProfit) === 37620, String(l35.netProfit));
  check('legacy W36 @96 = 200×5×96×0.8 = 76800', Math.round(l36.netProfit) === 76800, String(l36.netProfit));
  check('legacy W37 closing @97 = (−250×97 − 485)×0.8 = −19788', Math.round(l37.netProfit) === -19788, String(l37.netProfit));
  const lp = weekPieces(legacy);
  check('legacy pieces carry their own week rates 95/96/97', lp.map((p) => p.rate).join(',') === '95,96,97', lp.map((p) => p.rate).join(','));
  check('legacy RECONCILE: Σ pieces === realized (94632)', reconcile(legacy).ok && realized(legacy) === 94632, JSON.stringify(reconcile(legacy)));
  const partial = T({ ...t, fridayUsdToInrRates: { '2026-W35': 95 } }); // only W35 stamped; W36/W37 fall to the trade's 90
  check('partial legacy: W35 @95, W36/W37 @ trade rate 90', weekPieces(partial).map((p) => p.rate).join(',') === '95,90,90');
  // Explicit rate edit clears the legacy stamps (App.tsx buildEdited) → the trade's own rate rules its whole life.
  const edited = { ...legacy, usdToInrRate: 90, fridayUsdToInrRates: {}, closedUsdToInrRate: undefined };
  check('after a rate edit (stamps cleared) the trade prices like a new trade: 89280', realized(edited) === 89280, String(realized(edited)));
}

console.log('1b. Rounding: realized() is round-once (unchanged); the closing piece absorbs the residual');
{
  // Pieces with .5 fractions: W35 open→ 24400→24433.3 etc. Use INR ×75 with odd prices to force fractions.
  const t = T({ instrument: 'Futures', currency: 'INR', usdToInrRate: 1, lotSize: 75, realizationRate: 0.8, buyPrice: 24400.7,
    status: 'Closed', sellPrice: 24450.1, sellDate: '2026-09-09', fridayClosingPrices: { '2026-W35': 24410.3, '2026-W36': 24420.9 } });
  const pcs = weekPieces(t); const r = realized(t);
  const rawSum = ['2026-W35', '2026-W36', '2026-W37'].reduce((s, k) => s + calculateTradeForWeek(t, k).netProfit, 0);
  check('realized = Math.round(Σ raw netProfit) (round-once, as before)', r === Math.round(rawSum), `${r} vs ${rawSum}`);
  check('Σ pieces === realized exactly', pcs.reduce((s, p) => s + p.val, 0) === r);
  check('non-closing pieces are plain rounded values', pcs[0].val === Math.round(calculateTradeForWeek(t, '2026-W35').netProfit) && pcs[1].val === Math.round(calculateTradeForWeek(t, '2026-W36').netProfit));
  check('closing piece within ₹1 of its own rounded value (residual only)', Math.abs(pcs[2].val - Math.round(calculateTradeForWeek(t, '2026-W37').netProfit)) <= 1);
}

console.log('2. Rate lives on the trade: live MTM, rows, What-if prefill');
{
  const t = T({ usdToInrRate: 88.5, fridayClosingPrices: { '2026-W35': 40100 } });
  const rows = liveMtmRows(t);
  check('live row rate = trade rate 88.5', rows.length === 1 && rows[0].rate === 88.5);
  check('live MTM = (100×5×88.5 − 5×88.5)×0.8 = 35046', liveMtm(t) === 35046, String(liveMtm(t)));
  check('latestUsdRate(t) === 88.5 (What-if prefill)', latestUsdRate(t) === 88.5);
  check('tradeRate INR trade = 1', tradeRate(T({ currency: 'INR', usdToInrRate: 1 })) === 1);
  const edited = { ...t, usdToInrRate: 91 };
  check('editing the rate re-prices the whole trade (91 → 36036)', liveMtm(edited) === 36036, String(liveMtm(edited)));
  const none = T({ usdToInrRate: null, fridayClosingPrices: { '2026-W35': 40100 } });
  check('USD trade with no rate → NaN (loud), never a default', isNaN(liveMtm(none)));
}

console.log('3. INR trades untouched: no FX field read, rate 1');
{
  const t = T({ instrument: 'Futures', currency: 'INR', usdToInrRate: 1, lotSize: 75, buyPrice: 24400, realizationRate: 1,
    status: 'Closed', sellPrice: 24500, sellDate: '2026-08-26' });
  // (100×75) = 7500 − brokerage 0.0003×(24400×75 + 24500×75) = 0.0003×3667500 = 1100.25 → 6399.75 → 6400
  check('INR same-week realized = 6400', realized(t) === 6400, String(realized(t)));
  const t2 = { ...t, usdToInrRate: null as unknown as number };
  check('INR trade ignores usdToInrRate entirely', realized(t2) === 6400);
}

console.log('4. Journal: carry-forward — trade appears every week alive, pieces = week changes, totals');
{
  const usd = T({ id: 'usd', symbol: 'DOW', status: 'Closed', sellPrice: 40250, sellDate: '2026-09-09',
    fridayClosingPrices: { '2026-W35': 40100, '2026-W36': 40300 } });
  const inr = T({ id: 'inr', symbol: 'NIFTY', instrument: 'Futures', currency: 'INR', usdToInrRate: 1, lotSize: 75, buyPrice: 24400,
    realizationRate: 1, dateInitiated: '2026-08-31', buyDate: '2026-08-31', fridayClosingPrices: { '2026-W36': 24500, '2026-W37': 24450 } });
  const same = T({ id: 'same', symbol: 'NAS', instrument: 'Nasdaq', lotSize: 20, buyPrice: 20000, sellPrice: 20100, status: 'Closed',
    dateInitiated: '2026-09-01', buyDate: '2026-09-01', sellDate: '2026-09-03', usdToInrRate: 89 });
  const jw = journalWeeks([usd, inr, same], '2026-W37'); // W37 has ended (Sat 12 Sep passed)
  const keys = jw.map((w) => w.weekKey).join(',');
  check('weeks newest-first: W37, W36, W35', keys === '2026-W37,2026-W36,2026-W35', keys);
  const [w37, w36, w35] = jw;
  check('W35: DOW open row (init piece +35640), nothing realized', w35.openRows.length === 1 && w35.openRows[0].piece.val === 35640 && w35.realizedRows.length === 0);
  check('W36: DOW open (+72000) + NIFTY open (init piece), NAS realized same-week', w36.openRows.map((r) => r.trade.id).join() === 'usd,inr' && w36.realizedRows.length === 1 && w36.realizedRows[0].trade.id === 'same');
  // NAS same-week: (100×20×89)=178000 − ($5+$5)×89=890 → 177110 ×0.8 = 141688
  check('NAS same-week realized piece = 141688, not carried', w36.realizedRows[0].piece.val === 141688 && !w36.realizedRows[0].carried, String(w36.realizedRows[0].piece.val));
  const nifW36 = w36.openRows[1].piece; // (24500−24400)×75 = 7500 − entry 0.0003×24400×75=549 → 6951
  check('NIFTY W36 init piece = 7500 − 549 = 6951', nifW36.val === 6951, String(nifW36.val));
  check('W36 unrealized = 72000 + 6951, realized = 141688, total', w36.unrealized === 78951 && w36.realized === 141688 && w36.total === 220639, `${w36.unrealized}/${w36.realized}/${w36.total}`);
  check('W37: DOW realized row carries closing piece −18360, carried=true, history 3 pieces, reconciled', (() => {
    const r = w37.realizedRows.find((x) => x.trade.id === 'usd')!;
    return r.piece.val === -18360 && r.carried && r.pieces.length === 3 && r.total === 89280 && r.reconciled;
  })());
  const nifW37 = w37.openRows.find((r) => r.trade.id === 'inr')!.piece; // (24450−24500)×75 = −3750, no brokerage
  check('NIFTY W37 change = −3750 (this week minus last week, NOT cumulative)', nifW37.val === -3750 && nifW37.open === 24500 && nifW37.close === 24450, JSON.stringify(nifW37));
  check('W37 total = −18360 + −3750', w37.total === -22110, String(w37.total));
  const grand = jw.reduce((s, w) => s + w.total, 0);
  check('Σ week totals = every piece once = realized(DOW)+realized(NAS)+NIFTY open MTM', grand === 89280 + 141688 + 6951 - 3750, String(grand));
  check('Σ DOW pieces across W35/W36/W37 journals = its realized', 35640 + 72000 - 18360 === realized(usd));
}

console.log('5. Journal: in-progress week + unstamped open week');
{
  const open = T({ id: 'o', dateInitiated: '2026-09-07', buyDate: '2026-09-07', fridayClosingPrices: {} });
  const closedNow = T({ id: 'c', status: 'Closed', sellPrice: 40100, sellDate: '2026-09-14', dateInitiated: '2026-09-14', buyDate: '2026-09-14' });
  const jw = journalWeeks([open, closedNow], '2026-W37');
  const w38 = jw.find((w) => w.weekKey === '2026-W38')!, w37 = jw.find((w) => w.weekKey === '2026-W37')!;
  check('W38 (in progress) listed for the realized trade only, no open rows', !!w38 && !w38.ended && w38.realizedRows.length === 1 && w38.openRows.length === 0);
  check('W37 open row unstamped → stamped=false, change = −entry brokerage only (−360)', w37.openRows[0].piece.stamped === false && w37.openRows[0].piece.val === -360, JSON.stringify(w37.openRows[0].piece));
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
