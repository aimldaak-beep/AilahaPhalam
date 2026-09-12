/**
 * RECONCILE the live DB against the pre-change backup (archive/2026-09-12T0955Z_pre_pertrade_fx).
 * Ship gate (AKS, 2026-09-12): every pre-existing trade, closed P&L, close stamp and weekly total
 * must be IDENTICAL, else roll back. Exit 1 on any difference beyond the declared migration field.
 *   npx tsx scripts/reconcile_backup.ts <live_trades.json> [<backup_dir>]
 */
import fs from 'fs';
import { Trade } from '../src/types';
import { realized, liveMtm, isOpen, weekKeyOf, closeDateOf } from '../src/lib/v2engine';
import { reconcile, journalWeeks, weekPieces, closedByWeek } from '../src/lib/weekly';

const liveFile = process.argv[2];
const dir = process.argv[3] ?? 'archive/2026-09-12T0955Z_pre_pertrade_fx';
const backup: any[] = JSON.parse(fs.readFileSync(`${dir}/trades.json`, 'utf8')).filter((r: any) => !r.data.kind);
const live: any[] = JSON.parse(fs.readFileSync(liveFile, 'utf8')).filter((r: any) => !r.data.kind);
const before: Record<string, number> = {};
for (const line of fs.readFileSync(`${dir}/realized_before_old_engine.txt`, 'utf8').split('\n')) {
  const m = line.match(/^(OPEN|CLOSED)\s+.*?\s+(INR|USD)\s+(-?\d+)\s+(trade_\S+)/); if (m) before[m[4]] = +m[3];
}
let diffs = 0; const note = (ok: boolean, msg: string) => { console.log(`  ${ok ? 'OK  ' : 'DIFF'} ${msg}`); if (!ok) diffs++; };
// Declared-allowed field changes: the per-trade-FX migration field by default; pass "strict" as the 4th
// argument for a display-only change (2026-09-12 closed-by-week law: DELETE NOTHING, modify nothing).
const ALLOWED = new Set(process.argv[4] === 'strict' ? [] : ['usdToInrRate']);

console.log(`backup ${backup.length} trades · live ${live.length} trades (same owner rows)`);
note(backup.length === live.length, `trade count ${backup.length} vs ${live.length}`);
const liveById = new Map(live.map((r) => [r.data.id, r]));
const marks: any[] = JSON.parse(fs.readFileSync(`${dir}/weekly_marks.json`, 'utf8'));

console.log('\n1. Trade fields (every key except the declared migration field)');
for (const b of backup) {
  const l = liveById.get(b.data.id); if (!l) { note(false, `${b.data.symbol} ${b.data.id} MISSING on live`); continue; }
  const keys = new Set([...Object.keys(b.data), ...Object.keys(l.data)]);
  const changed = [...keys].filter((k) => JSON.stringify(b.data[k]) !== JSON.stringify(l.data[k]));
  const bad = changed.filter((k) => !ALLOWED.has(k));
  note(bad.length === 0, `${b.data.symbol.padEnd(10)} ${b.data.id}: ${changed.length ? 'changed ' + changed.map((k) => `${k} ${JSON.stringify(b.data[k])}→${JSON.stringify(l.data[k])}`).join(', ') : 'identical'}`);
  note(b.user_id === l.user_id && b.id === l.id, `${b.data.symbol.padEnd(10)} row id/user identical`);
}
console.log('\n2. Close stamps (fridayClosingPrices) and weekly_marks mirror');
for (const b of backup) {
  const l = liveById.get(b.data.id)!;
  note(JSON.stringify(b.data.fridayClosingPrices ?? {}) === JSON.stringify(l.data.fridayClosingPrices ?? {}), `${b.data.symbol.padEnd(10)} stamps ${JSON.stringify(l.data.fridayClosingPrices ?? {})}`);
}
const expectMarks = backup.flatMap((b) => Object.entries(b.data.fridayClosingPrices ?? {}).map(([w, p]) => `${b.data.id}|${w}|${p}`)).sort();
const gotMarks = marks.map((m) => `${m.trade_id}|${m.week_key}|${+m.close_price}`).sort();
note(JSON.stringify(expectMarks) === JSON.stringify(gotMarks), `weekly_marks rows ${gotMarks.length} = backup stamps ${expectMarks.length}: ${gotMarks.join(' ; ')}`);

console.log('\n3. Closed P&Ls and open MTM — new engine on LIVE rows vs pre-change engine on BACKUP');
let totB = 0, totL = 0;
for (const b of backup) {
  const l = liveById.get(b.data.id)!; const t = l.data as Trade;
  const v = isOpen(t) ? liveMtm(t) : realized(t); const ref = before[t.id];
  totB += ref; totL += v;
  const rc = reconcile(t);
  note(v === ref && rc.ok, `${(isOpen(t) ? 'OPEN  ' : 'CLOSED')} ${t.symbol.padEnd(10)} ${String(v).padStart(9)} vs before ${String(ref).padStart(9)}${t.currency === 'USD' ? `  @${t.usdToInrRate}` : ''}${rc.ok ? '' : '  NOT RECONCILED'}`);
}
note(totB === totL, `TOTAL ${totL} vs before ${totB}`);

console.log('\n4. Weekly totals — realized by closing week (the old journal law) backup vs live');
const byWeek = (rows: any[]) => { const m: Record<string, number> = {}; for (const r of rows) { const t = r.data as Trade; if (isOpen(t)) continue; const w = weekKeyOf(closeDateOf(t)); m[w] = (m[w] ?? 0) + (before[t.id] ?? NaN); } return m; };
const byWeekLive = () => { const m: Record<string, number> = {}; for (const r of live) { const t = r.data as Trade; if (isOpen(t)) continue; const w = weekKeyOf(closeDateOf(t)); m[w] = (m[w] ?? 0) + realized(t); } return m; };
const wb = byWeek(backup), wl = byWeekLive();
for (const w of Object.keys(wb).sort()) note(wb[w] === wl[w], `${w} realized-by-close-week ${wl[w]} vs before ${wb[w]}`);
console.log('\n4b. Closed trades grouped by closing week (Closed view) — counts + totals vs backup');
const groups = closedByWeek(live.map((r) => r.data as Trade));
const closedBackup = backup.filter((r) => !isOpen(r.data as Trade));
note(groups.reduce((s, g) => s + g.trades.length, 0) === closedBackup.length, `closed trades in groups ${groups.reduce((s, g) => s + g.trades.length, 0)} = backup closed ${closedBackup.length}`);
note(new Set(groups.flatMap((g) => g.trades.map((t) => t.id))).size === closedBackup.length, 'every closed trade appears exactly once');
for (const g of groups) note(g.total === wb[g.weekKey] && g.trades.every((t) => weekKeyOf(closeDateOf(t)) === g.weekKey), `${g.weekKey} ${g.label}: ${g.trades.length} trades, realized ${g.total} vs backup ${wb[g.weekKey]}`);
console.log('\n5. New weekly journal (pieces) on live rows — self-consistency: every piece counted once');
const LAST = '2026-W37';
const jw = journalWeeks(live.map((r) => r.data as Trade), LAST);
for (const w of jw) console.log(`       ${w.weekKey}  realized ${w.realized}  unrealized ${w.unrealized}  total ${w.total}  (${w.realizedRows.length} closed · ${w.openRows.length} open)`);
const closedSum = live.map((r) => r.data as Trade).filter((t) => !isOpen(t)).reduce((s, t) => s + realized(t), 0);
const openPieces = live.map((r) => r.data as Trade).filter(isOpen).reduce((s, t) => s + weekPieces(t).filter((p) => p.weekKey <= LAST).reduce((a, p) => a + p.val, 0), 0);
const unstamped = live.map((r) => r.data as Trade).filter(isOpen).reduce((s, t) => s + weekPieces(t).filter((p) => p.weekKey <= LAST && !p.stamped).reduce((a, p) => a + p.val, 0), 0);
note(jw.reduce((s, w) => s + w.total, 0) === closedSum + openPieces, `Σ week totals ${jw.reduce((s, w) => s + w.total, 0)} = Σ closed realized ${closedSum} + open-trade pieces ≤ ${LAST} ${openPieces} (of which unstamped ended weeks ${unstamped} — entry-leg brokerage of positions awaiting their Saturday stamp; the live headline omits unstamped weeks)`);
const carried = jw.reduce((s, w) => s + w.openRows.filter((r) => !isOpen(r.trade)).reduce((a, r) => a + r.piece.val, 0), 0); // pre-close pieces of closed trades (booked as unrealized in earlier weeks)
note(jw.reduce((s, w) => s + w.realized, 0) === closedSum - carried, `Σ REALIZED lines ${jw.reduce((s, w) => s + w.realized, 0)} = Σ closed realized ${closedSum} − carried pre-close pieces (${carried}) — closing piece = realized − earlier pieces`);
console.log(diffs ? `\n${diffs} DIFFERENCE(S) — DO NOT SHIP` : '\nIDENTICAL — ship gate passed');
process.exit(diffs ? 1 : 0);
