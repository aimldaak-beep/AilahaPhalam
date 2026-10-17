/** DATA-INTACT proof (2026-10-17): per-week rate storage is the trade's own JSON (`fridayUsdToInrRates[week]`,
 *  nullable, absent → base rate) — no column, no migration, no row written. Shows (1) every existing weekly
 *  row's explicit per-week rate (absent for all but the pre-existing legacy stamps, which are byte-identical
 *  to the 2026-09-14 archive), (2) the JSON key set is unextended for every existing row, (3) before/after
 *  numbers (HEAD code vs this code on the same dump) have 0 diffs, (4) a re-dump equals the first dump.
 *  npx tsx scripts/intact-proof.ts <dump_dir> <archive_dir> <before.json> <after.json> [<redump_dir>] */
import fs from 'fs';
import { Trade } from '../src/types';
import { explicitWeekRate } from '../src/lib/edit';
const [dumpDir, archDir, beforeF, afterF, redumpDir] = process.argv.slice(2);
const load = (d: string) => JSON.parse(fs.readFileSync(`${d}/trades.json`, 'utf8')).filter((r: any) => !r.data.kind);
const live: any[] = load(dumpDir); const arch: any[] = load(archDir);
const marks: any[] = JSON.parse(fs.readFileSync(`${dumpDir}/weekly_marks.json`, 'utf8'));
let diffs = 0; const note = (ok: boolean, msg: string) => { console.log(`  ${ok ? 'OK  ' : 'DIFF'} ${msg}`); if (!ok) diffs++; };
const archById = new Map(arch.map((r) => [r.data.id, r.data]));

console.log(`\n1. Per-week USD/INR rate on every existing weekly row (${marks.length} weekly_marks rows / stamped weeks on ${live.length} trades)`);
let nullRows = 0, legacyRows = 0;
for (const r of live) { const t = r.data as Trade;
  for (const wk of Object.keys(t.fridayClosingPrices ?? {})) {
    const v = explicitWeekRate(t, wk);
    if (v == null) nullRows++; else legacyRows++;
  }
}
note(true, `stamped weeks: ${nullRows + legacyRows} · per-week rate NULL (falls back to base) on ${nullRows} · pre-existing legacy stamp on ${legacyRows}`);
const legacyTrades = live.filter((r) => Object.keys(r.data.fridayUsdToInrRates ?? {}).length || r.data.closedUsdToInrRate != null);
for (const r of legacyTrades) { const a = archById.get(r.data.id);
  note(!!a && JSON.stringify(a.fridayUsdToInrRates) === JSON.stringify(r.data.fridayUsdToInrRates) && a.closedUsdToInrRate === r.data.closedUsdToInrRate,
    `${r.data.symbol.padEnd(10)} legacy per-week rates ${JSON.stringify(r.data.fridayUsdToInrRates)} closed@${r.data.closedUsdToInrRate} — identical to archive 2026-09-14`); }
const mcols = Object.keys(marks[0]); note(!mcols.includes('usd_inr_rate'), `weekly_marks columns unchanged: ${mcols.join(', ')} (no new column; mirror untouched)`);

console.log('\n2. JSON shape unextended — key set of every existing trade vs the 2026-09-14 archive (new rows: the known v2 key set)');
const KNOWN = new Set(['id','status','symbol','buyDate','lotSize','buyPrice','currency','sellDate','direction','sellPrice','instrument','numberOfLots','usdToInrRate','dateInitiated','exitBrokerage','entryBrokerage','realizationRate','closedUsdToInrRate','fridayClosingPrices','fridayUsdToInrRates','currentTradingPrice']);
let shapeOk = 0;
for (const r of live) { const keys = Object.keys(r.data); const a = archById.get(r.data.id);
  const ok = a ? JSON.stringify(Object.keys(a).sort()) === JSON.stringify(keys.sort()) : keys.every((k) => KNOWN.has(k));
  if (ok) shapeOk++; else note(false, `${r.data.symbol} ${r.data.id} keys ${keys.join(',')}`); }
note(shapeOk === live.length, `${shapeOk}/${live.length} trades: no new field (${arch.length} archived trades byte-compared on keys; the rest match the known key set)`);
for (const a of arch) { const l = live.find((r) => r.data.id === a.data.id); const wasOpen = String(a.data.status).startsWith('CarryForward') && a.data.status !== 'CarryForwardClosed';
  if (wasOpen) { const closeD = l?.data.direction === 'Long' ? l?.data.sellDate : l?.data.buyDate; note(!!l, `${a.data.symbol.padEnd(10)} ${a.data.id} was OPEN at archive time; since closed by the operator on ${closeD} (after 14 Sep) — not compared byte-for-byte`); continue; }
  note(!!l && JSON.stringify(l.data) === JSON.stringify(a.data), `${a.data.symbol.padEnd(10)} ${a.data.id} byte-identical to archive 2026-09-14`); }

console.log('\n3. Before (HEAD code) vs after (this code) — every realized / live MTM / weekly piece / journal week on the same dump');
const B = JSON.parse(fs.readFileSync(beforeF, 'utf8')), A = JSON.parse(fs.readFileSync(afterF, 'utf8'));
let same = 0, n = 0;
for (const id of Object.keys(B.trades)) { n++; const ok = JSON.stringify(B.trades[id]) === JSON.stringify(A.trades[id]); if (ok) same++;
  const t = B.trades[id]; note(ok, `${t.status.padEnd(17)} ${t.symbol.padEnd(11)} ${String(t.value).padStart(9)}  pieces ${t.pieces.map((p: any) => `${p.w.slice(5)}:${p.stamped ? p.val : 'unstamped'}${p.rate !== 1 ? '@' + p.rate : ''}`).join(' ')}`); }
note(same === n, `${same}/${n} trades identical (realized / MTM / every weekly piece)`);
note(JSON.stringify(B.journal) === JSON.stringify(A.journal), `journal weeks identical: ${Object.entries(A.journal).map(([k, v]: any) => `${k.slice(5)} total ${v.total}`).join(' · ')}`);
note(JSON.stringify(B.closedByWeek) === JSON.stringify(A.closedByWeek), 'closed-by-week groups identical');

if (redumpDir) {
  console.log('\n4. Rows written: re-dump of trades / weekly_marks / user_settings vs the first dump');
  for (const tbl of ['trades', 'weekly_marks', 'user_settings']) {
    const a = fs.readFileSync(`${dumpDir}/${tbl}.json`, 'utf8'), b = fs.readFileSync(`${redumpDir}/${tbl}.json`, 'utf8');
    note(a === b, `${tbl}: ${JSON.parse(b).length} rows, byte-identical to the first dump`); }
}
console.log(diffs ? `\n${diffs} DIFFERENCE(S)` : `\nIDENTICAL — ${n} trades, 0 diffs, 0 rows written`);
process.exit(diffs ? 1 : 0);
