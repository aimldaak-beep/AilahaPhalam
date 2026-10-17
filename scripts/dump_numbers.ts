/** Every computed number the journal shows, per trade and per week, as JSON — for before/after diffs.
 *  npx tsx scripts/dump_numbers.ts <trades.json> <out.json> */
import fs from 'fs';
import { Trade } from '../src/types';
import { realized, liveMtm, liveMtmRows, isOpen } from '../src/lib/v2engine';
import { weekPieces, journalWeeks, closedByWeek } from '../src/lib/weekly';
const rows: any[] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter((r: any) => !r.data.kind);
const trades: Trade[] = rows.map((r) => r.data);
const out: any = { trades: {}, journal: {}, closedByWeek: {} };
for (const t of trades) out.trades[t.id] = {
  symbol: t.symbol, status: t.status, value: isOpen(t) ? liveMtm(t) : realized(t),
  pieces: weekPieces(t).map((p) => ({ w: p.weekKey, open: p.open, close: p.close, rate: p.rate, val: p.val, stamped: p.stamped, role: p.role })),
  ledger: isOpen(t) ? liveMtmRows(t).map((r) => ({ w: r.weekKey, close: r.close, rate: r.rate, val: r.val })) : undefined,
};
for (const w of journalWeeks(trades, '2026-W42')) out.journal[w.weekKey] = { realized: w.realized, unrealized: w.unrealized, total: w.total, closed: w.realizedRows.length, open: w.openRows.length, unstamped: w.unstamped };
for (const g of closedByWeek(trades)) out.closedByWeek[g.weekKey] = { n: g.trades.length, total: g.total };
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(`${trades.length} trades · ${Object.keys(out.journal).length} journal weeks → ${process.argv[3]}`);
