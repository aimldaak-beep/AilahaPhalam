// Local verification: COMEX P&L math + $ rendering, and non-COMEX byte-identical.
import { Trade } from '../src/types';
import { realized, liveMtm, isComex, dispCcy, sgn, px, signed, nf } from '../src/lib/v2engine';

function T(o: Partial<Trade>): Trade {
  return { id: 't', symbol: 'X', direction: 'Long', currentTradingPrice: null, entryBrokerage: null, exitBrokerage: null,
    fridayClosingPrices: {}, fridayUsdToInrRates: {}, usdToInrRate: 1, realizationRate: 1.0, ...o } as Trade;
}
let ok = true; const chk = (name: string, cond: boolean, extra = '') => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? '  ' + extra : '')); ok = ok && cond; };

// 1. COPPER-HG closed: realized = (exit − entry) × 25000 × lots, in $, no FX, no brokerage.
const entry = 4.5000, exit = 4.5210, lots = 3, mult = 25000;
const copper = T({ symbol: 'HG-SEP', instrument: 'COPPER-HG', dateInitiated: '2026-08-24', buyPrice: entry, sellPrice: exit,
  buyDate: '2026-08-24', sellDate: '2026-08-25', lotSize: mult, numberOfLots: lots, status: 'Closed', currency: 'INR' });
const expected = Math.round((exit - entry) * mult * lots);   // = 0.0210 × 25000 × 3 = 1575
const got = realized(copper);
chk('COPPER-HG realized = (exit−entry)×25000×lots', got === expected, `got ${got}, expected ${expected}`);
chk('COPPER-HG is COMEX', isComex(copper) === true);
chk('COPPER-HG display currency = USD', dispCcy(copper) === 'USD');
chk('COPPER-HG P&L renders in $', sgn(copper, got) === '+$1,575', sgn(copper, got));
chk('COPPER-HG price shows 4 decimals', px(copper, entry) === '4.5000', px(copper, entry));

// COPPER-MHG default multiplier 2500
const mhg = T({ instrument: 'COPPER-MHG', buyPrice: 4.5, sellPrice: 4.6, buyDate: '2026-08-24', sellDate: '2026-08-25', lotSize: 2500, numberOfLots: 1, status: 'Closed', currency: 'INR' });
chk('COPPER-MHG realized = 0.1×2500 = 250 ($)', realized(mhg) === 250 && sgn(mhg, realized(mhg)) === '+$250');

// 2. Existing NIFTY (INR) — helpers byte-identical to signed()/nf().
const nifty = T({ instrument: 'Futures', buyPrice: 24000, sellPrice: 24500, buyDate: '2026-08-24', sellDate: '2026-08-25', lotSize: 75, numberOfLots: 2, status: 'Closed', currency: 'INR' });
chk('NIFTY is NOT comex', isComex(nifty) === false);
chk('NIFTY dispCcy INR', dispCcy(nifty) === 'INR');
chk('NIFTY sgn == signed (byte-identical)', sgn(nifty, 123456) === signed(123456), `${sgn(nifty, 123456)} vs ${signed(123456)}`);
chk('NIFTY px == nf (byte-identical)', px(nifty, 24000) === nf(24000), `${px(nifty, 24000)} vs ${nf(24000)}`);

// 3. Existing DOW (USD, FX-converted → still ₹ display, NOT $).
const dow = T({ instrument: 'DOW', buyPrice: 44000, sellPrice: 44500, buyDate: '2026-08-24', sellDate: '2026-08-25', lotSize: 5, numberOfLots: 1, status: 'Closed', currency: 'USD', usdToInrRate: 83.24 });
chk('DOW is NOT comex (renders ₹ as before)', isComex(dow) === false);
chk('DOW sgn uses ₹', sgn(dow, 100000).startsWith('+₹'), sgn(dow, 100000));

console.log('\n' + (ok ? 'ALL COMEX CHECKS PASS' : 'FAILURES'));
process.exit(ok ? 0 : 1);
