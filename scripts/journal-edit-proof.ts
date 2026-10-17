/**
 * JOURNAL-ORIGINATED EDIT → SAVE-REFRESH proof (2026-10-18). Pure, in-memory on a trades dump; writes NO row.
 * Simulates exactly what the Journal's Edit → Save does (the one shared path: editStateOf → buildEdited →
 * commitEdit = trades.map(replace)) on a carried USD trade, then shows the Journal's numbers AFTER the edit
 * (`journalWeeks`, what the view renders) and requires them to equal a STRAIGHT recompute on the same data:
 *   - the trade's weekly pieces  == the spec formula at the (new) per-week rate (stats-proof.ts style);
 *   - each affected WEEK TOTAL   == Σ pieces of every trade in that week (closed realized piece + stamped open pieces);
 *   - REALIZED / UNREALIZED      == Σ of their rows' pieces;
 *   - grand total                == Σ closed realized + Σ stamped open pieces over all trades;
 *   - unaffected weeks identical to before; the deltas equal the trade's piece deltas.
 *   npx tsx scripts/journal-edit-proof.ts <trades.json>
 */
import fs from 'fs';
import { Trade, getWeekKeyForClose } from '../src/types';
import { realized, isOpen, isClosed, weekRateOf, entryLegBrokerage, exitLegBrokerage } from '../src/lib/v2engine';
import { weekPieces, journalWeeks } from '../src/lib/weekly';
import { editStateOf, buildEdited } from '../src/lib/edit';

const rows: any[] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter((r: any) => !r.data.kind);
const trades: Trade[] = rows.map((r) => r.data as Trade);
let failures = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };
const fmt = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('en-IN');
const LAST = '2026-W42';

// straight recompute of what the journal shows, from pieces only (independent of journalWeeks' bookkeeping)
function straight(ts: Trade[]) {
  const weeks: Record<string, { realized: number; unrealized: number; total: number }> = {};
  let grand = 0;
  for (const t of ts) {
    const closeKey = isClosed(t) ? getWeekKeyForClose(t) : null;
    for (const p of weekPieces(t)) {
      const w = (weeks[p.weekKey] ??= { realized: 0, unrealized: 0, total: 0 });
      if (closeKey && p.weekKey === closeKey) w.realized += p.val; else if (p.stamped) w.unrealized += p.val;
    }
  }
  for (const w of Object.values(weeks)) { w.total = w.realized + w.unrealized; grand += w.total; }
  // Journal law: only STAMPED pieces count (a closed trade's unstamped pre-close week — e.g. an unstamped
  // initiation week carrying the entry leg — is listed "unstamped" and excluded, as before this change).
  const grand2 = ts.reduce((s, t) => s + weekPieces(t).filter((p) => p.stamped).reduce((a, p) => a + p.val, 0), 0);
  const closedRealized = ts.filter(isClosed).reduce((s, t) => s + realized(t), 0);
  const excludedUnstamped = ts.reduce((s, t) => s + weekPieces(t).filter((p) => !p.stamped).reduce((a, p) => a + p.val, 0), 0);
  return { weeks, grand, grand2, closedRealized, excludedUnstamped };
}
const formulaPiece = (t: Trade, wk: string, open: number, close: number, legs: ('entry' | 'exit')[]) => {
  const dir = t.direction === 'Long' ? 1 : -1; const rate = t.currency === 'USD' ? weekRateOf(t, wk) : 1;
  const brok = legs.reduce((s, l) => s + (l === 'entry' ? entryLegBrokerage(t) : exitLegBrokerage(t)) * rate, 0);
  return ((close - open) * dir * t.lotSize * t.numberOfLots * rate - brok) * (t.realizationRate ?? 1);
};

// ---- the journal-originated edit: carried USD NIKKEI (W38, W39 stamps, closed W40) — W39 rate → 96.5, W39 stamp → 66540 ----
const id = 'trade_1789711636057_9049909';
const orig = trades.find((t) => t.id === id)!;
const before = journalWeeks(trades, LAST);
const e = editStateOf(orig, 'closed');                      // what the journal's Edit opens (same as Closed/Live)
e.weekRates['2026-W39'] = '96.5'; e.stamps['2026-W39'] = '66540';
const { updated } = buildEdited(orig, e);                   // what Save builds
const next = trades.map((x) => (x.id === id ? updated : x)); // what commitEdit → update(...) stores; the journal re-renders from it
const after = journalWeeks(next, LAST);
const S = straight(next);

console.log(`\nEDIT from the Journal: ${orig.symbol} ${id} · W39 rate base ${orig.usdToInrRate} → 96.5 · W39 stamp 66490 → 66540 · saved through editStateOf → buildEdited → trades.map (the shared commitEdit path)`);
check('no real row written (pure in-memory; this proof never imports supabase)', true);
check('only the edited trade changed in the stored list', next.filter((x, i) => x !== trades[i]).length === 1);

console.log('\n1. The trade\'s weekly pieces after the edit == spec formula at the per-week rate');
const pcs = weekPieces(updated);
const entry = orig.sellPrice!, exit = orig.buyPrice!;
const f38 = formulaPiece(updated, '2026-W38', entry, 64990, ['entry']);
const f39 = formulaPiece(updated, '2026-W39', 64990, 66540, []);
const f40 = formulaPiece(updated, '2026-W40', 66540, exit, ['exit']);
const r = Math.round(f38 + f39 + f40);
const exp = { '2026-W38': Math.round(f38), '2026-W39': Math.round(f39), '2026-W40': r - Math.round(f38) - Math.round(f39) };
for (const p of pcs) check(`   ${p.weekKey} piece ${fmt(p.val)} @${p.rate}  formula ${fmt(exp[p.weekKey as keyof typeof exp])}`, p.val === exp[p.weekKey as keyof typeof exp]);
check(`   realized ${fmt(realized(updated))} == round-once Σ formula ${fmt(r)}`, realized(updated) === r);

console.log('\n2. Journal AFTER the edit (what the view renders) vs straight recompute — every week');
const bw = Object.fromEntries(before.map((w) => [w.weekKey, w]));
for (const w of after) {
  const s = S.weeks[w.weekKey]; const b = bw[w.weekKey];
  const same = w.realized === s.realized && w.unrealized === s.unrealized && w.total === s.total;
  const affected = ['2026-W39', '2026-W40'].includes(w.weekKey);
  const changed = !(b.realized === w.realized && b.unrealized === w.unrealized && b.total === w.total);
  check(`   ${w.weekKey}  REALIZED ${fmt(w.realized).padStart(12)}  UNREALIZED ${fmt(w.unrealized).padStart(12)}  WEEK TOTAL ${fmt(w.total).padStart(12)}  (before ${fmt(b.total)})${affected ? '  ← affected' : ''}`, same && changed === affected,
    same ? (changed === affected ? '' : `changed=${changed} expected ${affected}`) : `straight: ${s.realized} / ${s.unrealized} / ${s.total}`);
}
const pieceDelta = (k: string) => pcs.find((p) => p.weekKey === k)!.val - weekPieces(orig).find((p) => p.weekKey === k)!.val;
check(`   W39 total delta ${fmt(after.find((w) => w.weekKey === '2026-W39')!.total - bw['2026-W39'].total)} == the trade's W39 piece delta ${fmt(pieceDelta('2026-W39'))} (unrealized · closed later)`, after.find((w) => w.weekKey === '2026-W39')!.total - bw['2026-W39'].total === pieceDelta('2026-W39'));
check(`   W40 total delta ${fmt(after.find((w) => w.weekKey === '2026-W40')!.total - bw['2026-W40'].total)} == the trade's W40 piece delta ${fmt(pieceDelta('2026-W40'))} (realized · closing piece)`, after.find((w) => w.weekKey === '2026-W40')!.total - bw['2026-W40'].total === pieceDelta('2026-W40'));
check('   REALIZED/UNREALIZED subtotals == Σ their rows\' pieces in every week', after.every((w) => w.realized === w.realizedRows.reduce((s, x) => s + x.piece.val, 0) && w.unrealized === w.openRows.filter((x) => x.piece.stamped).reduce((s, x) => s + x.piece.val, 0)));
check('   the edited trade appears in W38 (open row · closed later), W39 (open row · closed later), W40 (realized row) after the edit', after.find((w) => w.weekKey === '2026-W38')!.openRows.some((x) => x.trade.id === id) && after.find((w) => w.weekKey === '2026-W39')!.openRows.some((x) => x.trade.id === id) && after.find((w) => w.weekKey === '2026-W40')!.realizedRows.some((x) => x.trade.id === id));

console.log('\n3. Grand total');
const gAfter = after.reduce((s, w) => s + w.total, 0), gBefore = before.reduce((s, w) => s + w.total, 0);
check(`   journal grand total after ${fmt(gAfter)} == Σ week totals straight ${fmt(S.grand)} == Σ STAMPED pieces of every trade ${fmt(S.grand2)}`, gAfter === S.grand && gAfter === S.grand2);
check(`   (journal law, unchanged) Σ closed realized ${fmt(S.closedRealized)} + Σ stamped open pieces − Σ excluded unstamped piece values ${fmt(S.excludedUnstamped)} == grand`, S.closedRealized + next.filter(isOpen).reduce((s, t) => s + weekPieces(t).filter((p) => p.stamped).reduce((a, p) => a + p.val, 0), 0) - next.filter(isClosed).reduce((s, t) => s + weekPieces(t).filter((p) => !p.stamped).reduce((a, p) => a + p.val, 0), 0) === gAfter);
check(`   grand delta ${fmt(gAfter - gBefore)} == realized delta of the edited trade ${fmt(realized(updated) - realized(orig))}`, gAfter - gBefore === realized(updated) - realized(orig));

console.log(failures ? `\n${failures} FAILURE(S)` : `\nALL PASS — journal totals after a journal-originated edit match the straight recompute; 0 real rows written`);
process.exit(failures ? 1 : 0);
