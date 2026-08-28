/**
 * Baseline/regression capture for the weekly-FX-settlement change.
 * Computes realized()/liveMtm() for the REAL current ledger rows (embedded from the
 * live DB, 2026-08-28) with whatever engine is on disk, and prints JSON.
 * Run before the change (baseline) and after (must match for INR trades).
 */
import { Trade } from '../src/types';
import { realized, liveMtm, isOpen } from '../src/lib/v2engine';

const rows: any[] = [
  {"id": "trade_1787761883026_44420570", "symbol": "GIFT NIFTY", "instrument": "Gift Nifty", "currency": "INR", "status": "Closed", "dateInitiated": "2026-08-26", "buyPrice": 24310.5, "sellPrice": 24331.4, "buyDate": "2026-08-26", "sellDate": "2026-08-26", "usdToInrRate": 1, "fridayUsdToInrRates": {}, "fridayClosingPrices": {}, "closedUsdToInrRate": null, "realizationRate": 1, "lotSize": 50, "numberOfLots": 60, "direction": "Short", "entryBrokerage": null, "exitBrokerage": null},
  {"id": "trade_1787569050123_62417", "symbol": "GIFT NIFTY", "instrument": "Gift Nifty", "currency": "INR", "status": "Closed", "dateInitiated": "2026-08-24", "buyPrice": 24231.5, "sellPrice": 24345, "buyDate": "2026-08-25", "sellDate": "2026-08-24", "usdToInrRate": 1, "fridayUsdToInrRates": {}, "fridayClosingPrices": {}, "closedUsdToInrRate": null, "realizationRate": 1, "lotSize": 50, "numberOfLots": 35, "direction": "Short", "entryBrokerage": null, "exitBrokerage": null},
  {"id": "trade_1787569093713_106007", "symbol": "GIFT NIFTY", "instrument": "Gift Nifty", "currency": "INR", "status": "Closed", "dateInitiated": "2026-08-24", "buyPrice": 24187, "sellPrice": 24345, "buyDate": "2026-08-25", "sellDate": "2026-08-24", "usdToInrRate": 1, "fridayUsdToInrRates": {}, "fridayClosingPrices": {}, "closedUsdToInrRate": null, "realizationRate": 1, "lotSize": 50, "numberOfLots": 25, "direction": "Short", "entryBrokerage": null, "exitBrokerage": null},
  {"id": "trade_1787892202997_307392", "symbol": "GLENMARK", "instrument": "Futures", "currency": "INR", "status": "Closed", "dateInitiated": "2026-08-28", "buyPrice": 2456, "sellPrice": 2469, "buyDate": "2026-08-28", "sellDate": "2026-08-28", "usdToInrRate": 1, "fridayUsdToInrRates": {}, "fridayClosingPrices": {}, "closedUsdToInrRate": null, "realizationRate": 1, "lotSize": 375, "numberOfLots": 10, "direction": "Short", "entryBrokerage": null, "exitBrokerage": null},
  {"id": "trade_1787637561374_61835", "symbol": "RBLBANK", "instrument": "NSE Futures", "currency": "INR", "status": "Closed", "dateInitiated": "2026-08-24", "buyPrice": 386, "sellPrice": 390.85, "buyDate": "2026-08-27", "sellDate": "2026-08-24", "usdToInrRate": 1, "fridayUsdToInrRates": {}, "fridayClosingPrices": {}, "closedUsdToInrRate": null, "realizationRate": 1, "lotSize": 3175, "numberOfLots": 10, "direction": "Short", "entryBrokerage": null, "exitBrokerage": null},
];

// NOTE: buyDate/sellDate for the closed INR trades reconstructed: close date = the leg
// opposite the initiating side. For a Short, close = buyDate. Values here only need to be
// STABLE between the two runs — both runs use this same embedded data.
const out: Record<string, number> = {};
for (const r of rows) {
  const t = r as Trade;
  out[t.symbol + ':' + t.id] = isOpen(t) ? liveMtm(t) : realized(t);
}
console.log(JSON.stringify(out, null, 2));
