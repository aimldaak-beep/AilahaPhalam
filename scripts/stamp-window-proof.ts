/**
 * PROOF — STAMP LAW (2026-09-14): a trade owes a weekly close stamp only for weeks it was ALIVE AT
 * THE WEEK'S CLOSE (initiated on/before that Friday); never a week before it opened; an existing
 * stamp is always honoured; the journal lists/counts accordingly. Real model (lib/weekly.ts) + real
 * engine (types.ts); hard-asserts, non-zero exit on any failure.   npx tsx scripts/stamp-window-proof.ts
 */
import { Trade } from '../src/types';
import { owesStampFor, aliveAtWeekClose, journalWeeks, weekPieces, reconcile } from '../src/lib/weekly';
import { realized, liveMtm, liveMtmRows } from '../src/lib/v2engine';

let fails = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) fails++; };
const T = (o: Partial<Trade>): Trade => ({
  id: 't', symbol: 'X', instrument: 'Futures', direction: 'Long', dateInitiated: '2026-09-07', buyPrice: 24000, sellPrice: null,
  buyDate: '2026-09-07', sellDate: null, lotSize: 75, numberOfLots: 1, status: 'CarryForwardLong', currency: 'INR',
  usdToInrRate: 1, fridayUsdToInrRates: {}, realizationRate: 1, fridayClosingPrices: {}, entryBrokerage: null, exitBrokerage: null, ...o,
} as Trade);
const W36 = '2026-W36', W37 = '2026-W37', W38 = '2026-W38'; // W37 = Mon 7 – Sun 13 Sep 2026, Friday 11 Sep

console.log('1. owesStampFor — alive at the week\'s close');
{
  const sun = T({ id: 'sun', symbol: 'SUN', dateInitiated: '2026-09-13', buyDate: '2026-09-13' }); // opened Sunday 13 Sep (calendar W37)
  const sat = T({ id: 'sat', symbol: 'SAT', dateInitiated: '2026-09-12', buyDate: '2026-09-12' }); // opened Saturday 12 Sep
  const fri = T({ id: 'fri', symbol: 'FRI', dateInitiated: '2026-09-11', buyDate: '2026-09-11' }); // opened Friday 11 Sep
  const wed = T({ id: 'wed', symbol: 'WED', dateInitiated: '2026-09-09', buyDate: '2026-09-09' });
  check('Sunday-opened trade does NOT owe that calendar week (W37)', !owesStampFor(sun, W37));
  check('Saturday-opened trade does NOT owe that calendar week (W37)', !owesStampFor(sat, W37));
  check('Friday-opened trade DOES owe that week (alive at its close)', owesStampFor(fri, W37));
  check('Wednesday-opened trade owes its week', owesStampFor(wed, W37));
  check('Sunday-opened trade owes the FOLLOWING week (W38)', owesStampFor(sun, W38));
  check('never a week before it opened (W36 for a 7-Sep trade)', !owesStampFor(wed, W36) && !owesStampFor(sun, W36));
  check('a week after today is not owed yet (W40 for an open trade today)', !owesStampFor(wed, '2026-W40'));
  check('aliveAtWeekClose = initiated <= Friday', aliveAtWeekClose(fri, '2026-09-11') && !aliveAtWeekClose(sat, '2026-09-11'));
  const sunStamped = T({ ...sun, fridayClosingPrices: { [W37]: 24100 } });
  check('an EXISTING stamp is always honoured, even for a non-alive week', owesStampFor(sunStamped, W37));
}

console.log('2. journalWeeks — the Sunday-opened trade is not listed/counted in W37, listed in W38');
{
  const sun = T({ id: 'sun', symbol: 'SUN', dateInitiated: '2026-09-13', buyDate: '2026-09-13' });
  const wed = T({ id: 'wed', symbol: 'WED', dateInitiated: '2026-09-09', buyDate: '2026-09-09', fridayClosingPrices: { [W37]: 24100 } });
  const jw = journalWeeks([sun, wed], W37);
  const w37 = jw.find((w) => w.weekKey === W37)!; const w38 = jw.find((w) => w.weekKey === W38);
  check('W37 open rows = WED only', w37.openRows.map((r) => r.trade.id).join(',') === 'wed', w37.openRows.map((r) => r.trade.id).join(','));
  check('W37 unstamped count = 0 (SUN owes nothing there)', w37.unstamped === 0, String(w37.unstamped));
  check('W37 unrealized = WED piece (100×75 − 0.0003×24000×75=540) = 6960', w37.unrealized === 6960, String(w37.unrealized));
  check('W38 exists (today ≥ 14 Sep) and lists SUN as unstamped', !!w38 && w38.openRows.some((r) => r.trade.id === 'sun' && !r.piece.stamped) && w38.unstamped >= 1, w38 ? `${w38.openRows.map((r) => r.trade.id)} unstamped ${w38.unstamped}` : 'no W38');
  const sunStamped = T({ ...sun, fridayClosingPrices: { [W37]: 24100 } });
  const jw2 = journalWeeks([sunStamped, wed], W37); const w37b = jw2.find((w) => w.weekKey === W37)!;
  check('a pre-existing W37 stamp on the Sunday trade stays listed and counted', w37b.openRows.some((r) => r.trade.id === 'sun' && r.piece.stamped) && w37b.unrealized === 6960 + (100 * 75 - 540), `${w37b.unrealized}`);
}

console.log('3. FOLD: the non-owed calendar initiation week (entry brokerage) folds into the first owed week; realized reconciles');
{
  // Sunday-opened INR Futures ×75 @24500 (entry leg 0.0003×24500×75 = 551.25), W38 stamp 24600 → 7500 − 551.25 = 6948.75 → 6949
  const sun = T({ id: 'sun', symbol: 'SUN', dateInitiated: '2026-09-13', buyDate: '2026-09-13', buyPrice: 24500, fridayClosingPrices: { [W38]: 24600 } });
  const rows = liveMtmRows(sun);
  check('live ledger: ONE row (W38) = 7500 − 551.25 → 6949 (W37 folded)', rows.length === 1 && rows[0].weekKey === W38 && rows[0].val === 6949, JSON.stringify(rows.map((r) => [r.weekKey, r.val])));
  check('liveMtm = 6949', liveMtm(sun) === 6949, String(liveMtm(sun)));
  const pcs = weekPieces(sun);
  check('journal pieces: ONE piece W38, role initiation, open = entry 24500, val 6949', pcs.length === 1 && pcs[0].weekKey === W38 && pcs[0].role === 'initiation' && pcs[0].open === 24500 && pcs[0].val === 6949, JSON.stringify(pcs));
  const jw = journalWeeks([sun], W38);
  check('journal W38 unrealized = 6949 = live headline; no W37 block', jw.find((w) => w.weekKey === W38)!.unrealized === 6949 && !jw.find((w) => w.weekKey === W37), jw.map((w) => `${w.weekKey}:${w.unrealized}`).join(' '));
  // Closed the following Tuesday at 24200 without a W38 stamp: W37 (non-owed) folds into the closing piece.
  const c = T({ id: 'c', symbol: 'C', status: 'Closed', dateInitiated: '2026-09-13', buyDate: '2026-09-13', buyPrice: 24500, sellPrice: 24200, sellDate: '2026-09-15' });
  const cp = weekPieces(c); const rc = reconcile(c);
  check('closed Sunday-opened trade: ONE piece W38, same-week-closed, open = entry', cp.length === 1 && cp[0].weekKey === W38 && cp[0].role === 'same-week-closed' && cp[0].open === 24500, JSON.stringify(cp.map((p) => [p.weekKey, p.role, p.open, p.val])));
  check('Σ pieces === realized (carry-forward reconciliation intact)', rc.ok, JSON.stringify(rc));
  const jc = journalWeeks([c], W38);
  check('no W37 block; W38 realized = realized(c) (every rupee counted exactly once)', !jc.find((w) => w.weekKey === W37) && jc.find((w) => w.weekKey === W38)!.realized === realized(c), jc.map((w) => `${w.weekKey}:${w.realized}`).join(' '));
  // A pre-existing stamp for the calendar week is honoured — no fold, two pieces as before.
  const legacy = T({ id: 'l', symbol: 'L', dateInitiated: '2026-09-13', buyDate: '2026-09-13', buyPrice: 24500, fridayClosingPrices: { [W37]: 24500, [W38]: 24600 } });
  check('legacy W37 stamp on a Sunday trade: two rows/pieces, no fold', liveMtmRows(legacy).length === 2 && weekPieces(legacy).length === 2 && weekPieces(legacy)[0].val === -551, JSON.stringify(weekPieces(legacy).map((p) => [p.weekKey, p.val])));
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
