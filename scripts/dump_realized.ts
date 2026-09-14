/** realized_before_old_engine.txt for a backup dir: one line per trade in the engine's CURRENT state —
 *  "OPEN|CLOSED <symbol> <cur> <realized|liveMtm> <trade id>" (the format reconcile_backup.ts reads).
 *  npx tsx scripts/dump_realized.ts <dir>  (reads <dir>/trades.json, writes <dir>/realized_before_old_engine.txt) */
import fs from 'fs';
import { realized, liveMtm, isOpen } from '../src/lib/v2engine';
const dir = process.argv[2];
const rows: any[] = JSON.parse(fs.readFileSync(`${dir}/trades.json`, 'utf8')).filter((r: any) => !r.data.kind);
const lines = rows.map((r) => { const t = r.data; const v = isOpen(t) ? liveMtm(t) : realized(t);
  return `${isOpen(t) ? 'OPEN  ' : 'CLOSED'} ${t.symbol.padEnd(10)} ${t.currency} ${String(Math.round(v)).padStart(10)} ${t.id}`; });
const total = rows.reduce((s, r) => s + (isOpen(r.data) ? liveMtm(r.data) : realized(r.data)), 0);
lines.push(`TOTAL ${Math.round(total)}`);
fs.writeFileSync(`${dir}/realized_before_old_engine.txt`, lines.join('\n') + '\n'); console.log(lines.join('\n'));
