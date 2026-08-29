/**
 * Engine-side expected figures for the Saturday-voice smoke (same trades as
 * scripts/seed_satvoice.py, settled at the smoke's test values). Prints JSON.
 * Run: npx tsx scripts/satvoice-expected.ts
 */
import { Trade } from '../src/types';
import { setFxContext, liveMtm } from '../src/lib/v2engine';

const W = '2026-W35';
const mk = (o: Partial<Trade>): Trade => ({
  id: 'x', symbol: 'X', instrument: 'DOW', direction: 'Long', dateInitiated: '2026-08-25',
  buyPrice: 0, sellPrice: null, buyDate: '2026-08-25', sellDate: null, lotSize: 1, numberOfLots: 1,
  status: 'CarryForwardLong', currency: 'USD', usdToInrRate: null, fridayUsdToInrRates: {},
  realizationRate: 0.8, fridayClosingPrices: {}, entryBrokerage: null, exitBrokerage: null, ...o,
} as Trade);

// U1 settled at 90: DOW close 40100, NIF close 24500 (per-trade stamps = the frozen truth).
const dow = mk({ instrument: 'DOW', buyPrice: 40000, lotSize: 5, fridayClosingPrices: { [W]: 40100 }, fridayUsdToInrRates: { [W]: 90 } });
const nif = mk({ instrument: 'Futures', currency: 'INR', dateInitiated: '2026-08-26', buyDate: '2026-08-26', buyPrice: 24400, lotSize: 75, fridayClosingPrices: { [W]: 24500 } });
// U2 (INR-only) settled at 91: NIF-ONLY close 24350.
const nifOnly = mk({ instrument: 'Futures', currency: 'INR', dateInitiated: '2026-08-26', buyDate: '2026-08-26', buyPrice: 24400, lotSize: 75, fridayClosingPrices: { [W]: 24350 } });

setFxContext({ [W]: { rate: 90, settled: true } });
const out = { dow: liveMtm(dow), nif: liveMtm(nif), u1Total: liveMtm(dow) + liveMtm(nif), u2Total: liveMtm(nifOnly) };
// Sanity: DOW must scale with the rate — the same trade at 95.55 must differ.
setFxContext({});
const dowAt95 = liveMtm(mk({ ...dow, fridayUsdToInrRates: { [W]: 95.55 } }));
console.log(JSON.stringify({ ...out, dowAt95 }));
