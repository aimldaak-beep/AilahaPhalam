/** NG (NGCOMEX · COMEX Henry Hub Natural Gas) proof — 2026-10-19. IN-MEMORY ONLY: builds scratch trades,
 *  never touches Supabase (no client is even imported). Proves NG is a copper-style COMEX row:
 *  registry (group NGCOMEX, default mult 10000, 3-dp prices, $5 flat per leg) and that realized / weekly
 *  MTM / both brokerage legs come out of the SAME engine functions copper uses — equal to the straight
 *  formula (exit−entry)×mult×lots×rate×share net of the two $5 legs ×rate×share, and byte-identical to a
 *  COPPER-HG trade with the same inputs + manual $5/leg overrides (same code path, no NG-specific math).
 *    npx tsx scripts/ng-proof.ts */
import { Trade, calculateTurnoverAndBrokerage } from '../src/types';
import { INSTR, SpecInstrument, specNameOf, isComex, dispCcy, px, realized, liveMtm, liveMtmRows, entryLegBrokerage, exitLegBrokerage } from '../src/lib/v2engine';
import { weekPieces } from '../src/lib/weekly';

let fails = 0;
const chk = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) fails++; };

// ---- registry ----
const NG = INSTR.NG;
chk('NG registered under group NGCOMEX', NG?.group === 'NGCOMEX', JSON.stringify(NG));
chk('NG default multiplier 10000, USD, comex, tick 0.001, 3 dp', NG.mult === 10000 && NG.ccy === 'USD' && NG.comex === true && NG.tick === 0.001 && NG.dp === 3);
chk('NG is a NEW group, separate from the copper COMEX group', INSTR['COPPER-HG'].group === 'COMEX' && INSTR['COPPER-MHG'].group === 'COMEX' && NG.group !== 'COMEX');
const groups = [...new Set((Object.keys(INSTR) as SpecInstrument[]).map((k) => INSTR[k].group).filter(Boolean))];
chk('dropdown groups in registry order: COMEX then NGCOMEX', JSON.stringify(groups) === '["COMEX","NGCOMEX"]', groups.join(','));
chk('stored v1 enum NG-HH is distinct from the legacy NG value (legacy brokerage branch untouched)', NG.v1 === 'NG-HH' && specNameOf('NG-HH') === 'NG' && specNameOf('NG') === 'NIFTY FUT');
chk('legacy NG brokerage still 0.0003×turnover', calculateTurnoverAndBrokerage(3, 2, 10000, 'NG').brokerage === 0.0003 * 3 * 2 * 10000);
chk('copper auto-brokerage still 0', calculateTurnoverAndBrokerage(4.5, 3, 25000, 'COPPER-HG').brokerage === 0);
chk('NG auto-brokerage = flat $5 per leg (not per lot)', calculateTurnoverAndBrokerage(3, 7, 10000, 'NG-HH').brokerage === 5);

// ---- sample scratch trade (never persisted) ----
// Long 2 lots NG ×10000, opened Mon 05-Oct-2026 @2.950, W41 Friday stamp 3.010, closed Wed 14-Oct-2026 @3.125,
// per-trade USD/INR 88.50, share 80%. Brokerage blank on both legs ⇒ the $5 default per leg.
const S = { entry: 2.950, stamp: 3.010, exit: 3.125, lots: 2, mult: 10000, rate: 88.5, share: 0.8 };
const base = (over: Partial<Trade>): Trade => ({
  id: 'scratch_ng_1', symbol: 'NGX6', instrument: 'NG-HH', direction: 'Long', dateInitiated: '2026-10-05',
  buyPrice: S.entry, sellPrice: S.exit, buyDate: '2026-10-05', sellDate: '2026-10-14', lotSize: S.mult, numberOfLots: S.lots,
  status: 'Closed', currency: 'USD', usdToInrRate: S.rate, fridayUsdToInrRates: {}, realizationRate: S.share,
  fridayClosingPrices: { '2026-W41': S.stamp }, entryBrokerage: null, exitBrokerage: null, ...over,
} as Trade);
const ng = base({});
console.log('\nSAMPLE INPUTS', JSON.stringify(S), 'Long · opened 2026-10-05 · W41 stamp · closed 2026-10-14');

chk('NG trade is COMEX, displays USD natively, 3-dp prices', isComex(ng) && dispCcy(ng) === 'USD' && px(ng, S.entry) === '2.950' && px(ng, S.exit) === '3.125', `${px(ng, S.entry)} → ${px(ng, S.exit)}`);
chk('copper price formatting unchanged (4 dp)', px(base({ instrument: 'COPPER-HG' }), 4.5) === '4.5000');
chk('entry leg brokerage $5 · exit leg brokerage $5 (engine, blank overrides)', entryLegBrokerage(ng) === 5 && exitLegBrokerage(ng) === 5);

// straight formula, rupees, after share
const grossInr = (S.exit - S.entry) * S.mult * S.lots * S.rate;
const brokInr = (5 + 5) * S.rate;
const formula = Math.round((grossInr - brokInr) * S.share);
const got = realized(ng);
console.log(`FORMULA  (${S.exit}−${S.entry})×${S.mult}×${S.lots}×${S.rate} = ₹${grossInr.toFixed(2)} gross · legs (5+5)×${S.rate} = ₹${brokInr.toFixed(2)} · ×${S.share} ⇒ ₹${formula}`);
console.log(`ENGINE   realized(ng) = ₹${got}`);
chk('ENGINE realized == straight formula net of the two $5 legs', got === formula, `${got} vs ${formula}`);

// weekly MTM pieces (journal) — same weekPieces() copper uses; per-week rate = the trade's rate
const pieces = weekPieces(ng);
console.log('WEEKLY PIECES', pieces.map((p) => `${p.weekKey} ${p.open}→${p.close} @${p.rate} ₹${p.val}${p.stamped ? '' : ' (unstamped)'}`).join(' | '));
const w41 = Math.round(((S.stamp - S.entry) * S.mult * S.lots * S.rate - 5 * S.rate) * S.share);
const w42 = formula - w41; // closing piece carries the rounding residual so the pieces reconcile to realized
chk('W41 piece = (stamp−entry)×mult×lots×rate − $5 entry leg ×rate, ×share', pieces[0].weekKey === '2026-W41' && pieces[0].val === w41 && pieces[0].rate === S.rate, `${pieces[0].val} vs ${w41}`);
chk('W42 closing piece = (exit−stamp)… − $5 exit leg, reconciles to realized', pieces[1].weekKey === '2026-W42' && pieces[1].val === w42 && pieces.reduce((s, p) => s + p.val, 0) === got, `${pieces[1].val} vs ${w42}`);

// live (open) NG: same liveMtmRows()/liveMtm() path copper uses
const live = base({ status: 'CarryForwardLong', sellPrice: null, sellDate: null });
const liveRows = liveMtmRows(live);
const liveFormula = Math.round(((S.stamp - S.entry) * S.mult * S.lots * S.rate - 5 * S.rate) * S.share);
chk('LIVE MTM (W41 stamped row) == (stamp−entry)×mult×lots×rate − $5 entry leg, ×share', liveRows.length >= 1 && liveRows[0].val === liveFormula && liveMtm(live) === liveRows.reduce((s, r) => s + r.val, 0), `${liveRows.map((r) => r.weekKey + ':' + r.val).join(',')} vs ${liveFormula}`);

// SAME PATH AS COPPER: identical inputs on COPPER-HG with manual $5/$5 overrides ⇒ identical numbers
const cu = base({ instrument: 'COPPER-HG', entryBrokerage: 5, exitBrokerage: 5 });
chk('COPPER-HG with the same inputs + manual $5/$5 legs gives the IDENTICAL realized and pieces (one engine path)',
  realized(cu) === got && JSON.stringify(weekPieces(cu).map((p) => [p.weekKey, p.val, p.rate])) === JSON.stringify(pieces.map((p) => [p.weekKey, p.val, p.rate])));
// per-leg override still wins (standing law), converted like any USD leg
const ov = base({ entryBrokerage: 12, exitBrokerage: 0 });
chk('manual per-leg override replaces the $5 default (entry 12, exit 0)', realized(ov) === Math.round((grossInr - 12 * S.rate) * S.share));
// multiplier editable per trade (standing rule): engine reads the stored lotSize, not the registry default
const m2 = base({ lotSize: 2500 });
chk('per-trade multiplier override is what the engine reads (2500 ⇒ formula with 2500)', realized(m2) === Math.round(((S.exit - S.entry) * 2500 * S.lots * S.rate - brokInr) * S.share));

console.log(fails ? `\n${fails} FAIL` : `\nALL PASS · 0 rows written (in-memory only)`);
process.exit(fails ? 1 : 0);
