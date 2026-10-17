/**
 * EDIT-ALL + PER-WEEK RATE proof (2026-10-17). Pure, IN-MEMORY: reads a trades dump (JSON file) and
 * never imports supabase — creates/edits/deletes NO row. Hard-asserts (exit 1 on any failure):
 *   (1) ROUND TRIP: every trade opened in the edit form and saved untouched is BYTE-IDENTICAL
 *       (JSON) and engine-identical (realized / liveMtm / every weekly piece).
 *   (2) PER-WEEK RATE: on a carried USD trade, setting one week's rate recomputes THAT week at that
 *       rate (engine value + formula agree), leaves the other weeks' rates at base, flows into the
 *       chain (realized = Σ pieces), stores ONLY fridayUsdToInrRates[week]; blanking it restores the
 *       byte-identical original (NULL → base rate).
 *   (3) STAMP EDIT: editing a middle week's stamp re-derives that week and the next (its open), not earlier.
 *   (4) FULL-FIELD EDIT round-trips (edit everything, reopen, save untouched → identical) and a moved
 *       closing date re-files the trade's closing week.
 *   (5) LEGACY closing-week rate (closedUsdToInrRate): untouched = identical; set → engine uses it,
 *       both fields in step; blank → both removed → base rate.
 *   npx tsx scripts/edit-all-proof.ts <trades.json>
 */
import fs from 'fs';
import { Trade, calculateTradeForWeek, getWeekKeyForClose } from '../src/types';
import { realized, liveMtm, isOpen, isClosed, weekRateOf, entryLegBrokerage, exitLegBrokerage } from '../src/lib/v2engine';
import { weekPieces, reconcile } from '../src/lib/weekly';
import { editStateOf, buildEdited, explicitWeekRate } from '../src/lib/edit';

const rows: any[] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter((r: any) => !r.data.kind);
const trades: Trade[] = rows.map((r) => r.data as Trade);
let failures = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };
const fp = (t: Trade) => JSON.stringify({ v: isOpen(t) ? liveMtm(t) : realized(t), p: weekPieces(t).map((p) => [p.weekKey, p.open, p.close, p.rate, p.val, p.stamped]) });
const J = (x: unknown) => JSON.stringify(x);

console.log(`\n(1) ROUND TRIP — ${trades.length} real trades, open edit form → save untouched`);
let rtOk = 0; const rtBad: string[] = [];
for (const t of trades) {
  const e = editStateOf(t, isOpen(t) ? 'live' : 'closed');
  const { updated } = buildEdited(t, e);
  const same = J(updated) === J(t) && fp(updated) === fp(t);
  if (same) rtOk++; else rtBad.push(`${t.symbol} ${t.id}: ${Object.keys(t).filter((k) => J((t as any)[k]) !== J((updated as any)[k])).join(',')}`);
}
check(`byte-identical + engine-identical round trip on ${rtOk}/${trades.length} trades`, rtOk === trades.length, rtBad.join(' | '));

// Formula straight from the spec for one week of a trade: value(open→close) × dir × mult × lots × rate × share − brokerage legs × rate.
const formulaWeek = (t: Trade, weekKey: string, open: number, close: number, legs: ('entry' | 'exit')[]) => {
  const dir = t.direction === 'Long' ? 1 : -1;
  const rate = t.currency === 'USD' ? weekRateOf(t, weekKey) : 1;
  const gross = (close - open) * dir * t.lotSize * t.numberOfLots * rate;
  const brok = legs.reduce((s, l) => s + (l === 'entry' ? entryLegBrokerage(t) : exitLegBrokerage(t)) * rate, 0);
  return (gross - brok) * (t.realizationRate ?? 1);
};

console.log('\n(2) PER-WEEK RATE on a carried USD trade (stamps in ≥2 weeks, closed in a later week)');
const carried = trades.find((t) => t.currency === 'USD' && isClosed(t) && Object.keys(t.fridayClosingPrices ?? {}).length >= 2 && !t.closedUsdToInrRate && !Object.keys(t.fridayUsdToInrRates ?? {}).length)!;
{
  const wks = Object.keys(carried.fridayClosingPrices).sort(); const w2 = wks[1]; const w1 = wks[0];
  const closeWk = getWeekKeyForClose(carried)!;
  console.log(`  trade ${carried.symbol} ${carried.id} base rate ${carried.usdToInrRate} stamps ${J(carried.fridayClosingPrices)} closes ${closeWk}`);
  const before = weekPieces(carried);
  const e = editStateOf(carried, 'closed');
  check('form opens with every weekly rate blank (NULL → base)', Object.values(e.weekRates).every((v) => v === ''), J(e.weekRates));
  const newRate = (carried.usdToInrRate ?? 0) + 2.5;
  e.weekRates[w2] = String(newRate);
  const { updated } = buildEdited(carried, e);
  const after = weekPieces(updated);
  check(`stored ONLY fridayUsdToInrRates[${w2}] = ${newRate}`, J(updated.fridayUsdToInrRates) === J({ [w2]: newRate }) && updated.closedUsdToInrRate === undefined && updated.usdToInrRate === carried.usdToInrRate, J(updated.fridayUsdToInrRates));
  check('every other trade field byte-identical', J({ ...updated, fridayUsdToInrRates: carried.fridayUsdToInrRates }) === J(carried));
  const pw2 = after.find((p) => p.weekKey === w2)!, pw1 = after.find((p) => p.weekKey === w1)!, pc = after.find((p) => p.weekKey === closeWk)!;
  check(`${w2} converts at ${newRate}; ${w1} and ${closeWk} still at base ${carried.usdToInrRate}`, pw2.rate === newRate && pw1.rate === carried.usdToInrRate && pc.rate === carried.usdToInrRate, `${pw1.rate} / ${pw2.rate} / ${pc.rate}`);
  const f2 = formulaWeek(updated, w2, carried.fridayClosingPrices[w1], carried.fridayClosingPrices[w2], []);
  const eng2 = calculateTradeForWeek(updated, w2).netProfit;
  check(`${w2} engine value == formula at the week's rate`, Math.abs(eng2 - f2) < 1e-6 && pw2.val === Math.round(eng2), `engine ${eng2.toFixed(2)} formula ${f2.toFixed(2)} piece ${pw2.val}`);
  check(`${w1} piece unchanged (${pw1.val})`, pw1.val === before.find((p) => p.weekKey === w1)!.val);
  check(`${w2} piece changed (${before.find((p) => p.weekKey === w2)!.val} → ${pw2.val})`, pw2.val !== before.find((p) => p.weekKey === w2)!.val);
  check('chain: Σ pieces === realized (reconciles)', reconcile(updated).ok, `${after.reduce((s, p) => s + p.val, 0)} vs ${realized(updated)}`);
  check('realized moved by exactly the W2 delta (±1 rounding)', Math.abs((realized(updated) - realized(carried)) - (pw2.val - before.find((p) => p.weekKey === w2)!.val)) <= 1, `${realized(carried)} → ${realized(updated)}`);
  // reopen the edited trade: the week's rate shows as explicit; blank it → back to the original bytes
  const e2 = editStateOf(updated, 'closed');
  check(`reopened form shows ${w2} rate ${newRate} explicit, others blank`, e2.weekRates[w2] === String(newRate) && Object.entries(e2.weekRates).filter(([k]) => k !== w2).every(([, v]) => v === ''));
  e2.weekRates[w2] = '';
  const { updated: restored } = buildEdited(updated, e2);
  check('blank the week rate → byte-identical original (NULL falls back to base)', J(restored) === J(carried) && fp(restored) === fp(carried));
  // live recompute: a second edit of the rate in the same form recomputes again
  e.weekRates[w2] = String(newRate + 1);
  check('live recompute: changing the typed rate again changes the week piece again', weekPieces(buildEdited(carried, e).updated).find((p) => p.weekKey === w2)!.val !== pw2.val);
}

console.log('\n(3) STAMP EDIT on the same trade: middle week stamp +50 → that week and the next re-derive, earlier weeks untouched');
{
  const wks = Object.keys(carried.fridayClosingPrices).sort(); const w1 = wks[0], w2 = wks[1]; const closeWk = getWeekKeyForClose(carried)!;
  const e = editStateOf(carried, 'closed'); e.stamps[w2] = String(carried.fridayClosingPrices[w2] + 50);
  const { updated } = buildEdited(carried, e); const b = weekPieces(carried), a = weekPieces(updated);
  const pv = (ps: typeof a, k: string) => ps.find((p) => p.weekKey === k)!.val;
  check(`stamp stored: ${w2} ${carried.fridayClosingPrices[w2]} → ${updated.fridayClosingPrices[w2]}`, updated.fridayClosingPrices[w2] === carried.fridayClosingPrices[w2] + 50);
  check(`${w1} unchanged ${pv(b, w1)}`, pv(a, w1) === pv(b, w1));
  check(`${w2} changed ${pv(b, w2)} → ${pv(a, w2)}`, pv(a, w2) !== pv(b, w2));
  check(`${closeWk} changed ${pv(b, closeWk)} → ${pv(a, closeWk)} (its open is ${w2}'s stamp)`, pv(a, closeWk) !== pv(b, closeWk) && a.find((p) => p.weekKey === closeWk)!.open === updated.fridayClosingPrices[w2]);
  check('realized unchanged to the rupee (a mark only moves value between weeks)', Math.abs(realized(updated) - realized(carried)) <= 1 && reconcile(updated).ok, `${realized(carried)} vs ${realized(updated)}`);
  const e3 = editStateOf(carried, 'closed'); e3.stamps[w2] = '';
  const { updated: unst } = buildEdited(carried, e3);
  check(`blank stamp → ${w2} removed and shown unstamped (never zero)`, unst.fridayClosingPrices[w2] === undefined && weekPieces(unst).find((p) => p.weekKey === w2)!.stamped === false);
}

console.log('\n(4) FULL-FIELD EDIT on a closed trade: change everything, reopen, save untouched → identical; moved close date re-files the week');
{
  const t = trades.find((x) => isClosed(x) && x.currency === 'INR' && getWeekKeyForClose(x))!;
  const e = editStateOf(t, 'closed');
  Object.assign(e, { symbol: 'EDITED', instr: 'NIFTY FUT', side: e.side === 'LONG' ? 'SHORT' : 'LONG', lots: '3', mult: '75', entry: '100', exit: '110', date: '01-09-2026', closedDate: '22-09-2026', entryBrok: '12', exitBrok: '13', real: 0.8, ccy: 'USD', rate: '91' });
  e.weekRates['2026-W37'] = '92'; e.stamps['2026-W36'] = '104'; e.stamps['2026-W37'] = '107';
  const { updated, ccyChanged, instrChanged } = buildEdited(t, e);
  check('every field applied', updated.symbol === 'EDITED' && updated.instrument === 'Futures' && updated.numberOfLots === 3 && updated.lotSize === 75 && updated.dateInitiated === '2026-09-01' && getWeekKeyForClose(updated) === '2026-W39' && updated.currency === 'USD' && updated.usdToInrRate === 91 && updated.realizationRate === 0.8 && updated.entryBrokerage === 12 && updated.exitBrokerage === 13 && updated.fridayClosingPrices['2026-W36'] === 104 && updated.fridayClosingPrices['2026-W37'] === 107, J(updated));
  check('closing week re-filed: ' + getWeekKeyForClose(t) + ' → ' + getWeekKeyForClose(updated), getWeekKeyForClose(updated) === '2026-W39');
  check('currency change clears week rates typed before it (INR→USD: no stale FX) — flags for the confirm line', ccyChanged && instrChanged && J(updated.fridayUsdToInrRates ?? {}) === '{}');
  const e2 = editStateOf(updated, 'closed'); e2.weekRates['2026-W37'] = '92';
  const { updated: u2 } = buildEdited(updated, e2);
  check('per-week rate set on the edited trade: W37 @92, W36/W38/W39 @91', weekRateOf(u2, '2026-W37') === 92 && weekRateOf(u2, '2026-W36') === 91 && weekRateOf(u2, '2026-W39') === 91);
  const e3 = editStateOf(u2, 'closed'); const { updated: u3 } = buildEdited(u2, e3);
  check('reopen the fully-edited trade and save untouched → byte-identical', J(u3) === J(u2) && fp(u3) === fp(u2));
  check('Σ pieces === realized on the edited trade', reconcile(u3).ok);
  const live = trades.find(isOpen)!; const el = editStateOf(live, 'live'); el.lots = String(live.numberOfLots + 1); el.stamps['2026-W41'] = '500';
  const { updated: ul } = buildEdited(live, el);
  check(`live trade full edit: lots ${live.numberOfLots} → ${ul.numberOfLots}, stamp W41 500, still open, MTM recomputed ${liveMtm(ul)}`, isOpen(ul) && ul.numberOfLots === live.numberOfLots + 1 && ul.fridayClosingPrices['2026-W41'] === 500 && !isNaN(liveMtm(ul)));
}

console.log('\n(5) LEGACY closing-week rate (closedUsdToInrRate) — kept in step with the week');
{
  const t = trades.find((x) => x.closedUsdToInrRate != null && Object.keys(x.fridayUsdToInrRates ?? {}).length)!;
  const cw = getWeekKeyForClose(t)!;
  console.log(`  trade ${t.symbol} base ${t.usdToInrRate} fur ${J(t.fridayUsdToInrRates)} closed@${t.closedUsdToInrRate} close week ${cw}`);
  const e = editStateOf(t, 'closed');
  check(`form shows the explicit legacy rates: ${J(e.weekRates)}`, Object.keys(t.fridayUsdToInrRates).every((k) => e.weekRates[k] === String(explicitWeekRate(t, k))));
  check('untouched save byte-identical', J(buildEdited(t, e).updated) === J(t));
  e.weekRates[cw] = '91';
  const { updated } = buildEdited(t, e);
  check(`closing week → 91: fridayUsdToInrRates[${cw}] = 91 AND closedUsdToInrRate = 91; engine converts ${cw} at 91`, updated.fridayUsdToInrRates[cw] === 91 && updated.closedUsdToInrRate === 91 && weekRateOf(updated, cw) === 91 && calculateTradeForWeek(updated, cw).buyBrokerage === calculateTradeForWeek(t, cw).buyBrokerage / (t.closedUsdToInrRate as number) * 91);
  const e2 = editStateOf(updated, 'closed'); e2.weekRates[cw] = '';
  const { updated: u2 } = buildEdited(updated, e2);
  check(`blank the closing week → both removed → base ${t.usdToInrRate}`, u2.fridayUsdToInrRates[cw] === undefined && u2.closedUsdToInrRate === undefined && weekRateOf(u2, cw) === t.usdToInrRate);
  const e3 = editStateOf(t, 'closed'); e3.rate = String((t.usdToInrRate ?? 0) + 1);
  const r3 = buildEdited(t, e3);
  check('base-rate change keeps the explicit week rates (they are visible rows) and names them for the confirm line', r3.rateChanged && J(r3.updated.fridayUsdToInrRates) === J(t.fridayUsdToInrRates) && r3.keptWeekRates.length === Object.keys(t.fridayUsdToInrRates).length, J(r3.keptWeekRates));
}

console.log(failures ? `\n${failures} FAILURE(S)` : `\nALL PASS — ${trades.length} real trades read, 0 rows written (no supabase import in this proof)`);
process.exit(failures ? 1 : 0);
