/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WEEKLY STATISTICS — pure model (no React, no supabase; node proofs import it).
 *
 * Read-only view (2026-10-17): weeks newest-first (the journal's Mon–Sun W-XX weeks), and under
 * each week ONE line per instrument that had activity that week:
 *     <instrument> — <net rupee value for that instrument in that week>
 * Purely THIS week's value per instrument, in isolation — nothing from earlier weeks is carried
 * into the number, and there is no cross-instrument total here (that stays in the journal).
 *
 * Per-trade weekly contribution = the trade's journal piece for that week (`lib/weekly.ts
 * weekPieces`, i.e. the unchanged engine `calculateTradeForWeek`), which already IS the law:
 *   - opened AND closed this week: value(entry → exit) at this week's rate − entry-leg − exit-leg;
 *   - opened this week, open at week end: value(entry → this week's stamp) − entry-leg;
 *   - carried in, open at week end: value(last week's stamp → this week's stamp), no brokerage;
 *   - carried in, closed this week: value(last week's stamp → exit) − exit-leg;
 * "value" applies the trade's multiplier, lots, direction, realization share and — for USD trades —
 * THAT week's own rate (`fridayUsdToInrRates[week]`, NULL → the trade's base `usdToInrRate`);
 * INR instruments are native. A carried trade alive at a week's close with NO stamp for that week
 * is never treated as zero: it is counted as `unstamped` on its instrument line and left out of
 * the sum (the line says "(n unstamped)").
 */
import { Trade } from '../types';
import { SpecInstrument, specNameOf, weekLabel } from './v2engine';
import { weekPieces } from './weekly';
import type { WeekPiece } from './weekly';

export interface StatsContributor { trade: Trade; piece: WeekPiece }
export interface StatsLine {
  instrument: SpecInstrument;
  value: number;        // Σ stamped contributors' rupee pieces for this week (NaN if a USD trade has no rate)
  stamped: number;      // contributors counted
  unstamped: number;    // contributors alive at the week's close with no stamp → not counted
  contributors: StatsContributor[];
}
export interface StatsWeek { weekKey: string; monday: string; label: string; lines: StatsLine[] }

/** Build the Weekly Statistics view over the FULL trade list, newest week first. */
export function weeklyStats(trades: Trade[]): StatsWeek[] {
  const weeks = new Map<string, StatsWeek>();
  for (const t of trades) {
    const instrument = specNameOf(t.instrument);
    for (const p of weekPieces(t)) {
      let w = weeks.get(p.weekKey);
      if (!w) { w = { weekKey: p.weekKey, monday: p.monday, label: weekLabel(p.monday), lines: [] }; weeks.set(p.weekKey, w); }
      let line = w.lines.find((l) => l.instrument === instrument);
      if (!line) { line = { instrument, value: 0, stamped: 0, unstamped: 0, contributors: [] }; w.lines.push(line); }
      line.contributors.push({ trade: t, piece: p });
      if (p.stamped) { line.value += p.val; line.stamped++; } else line.unstamped++;
    }
  }
  const order = (k: SpecInstrument) => (Object.keys(INSTR_ORDER) as SpecInstrument[]).indexOf(k);
  for (const w of weeks.values()) w.lines.sort((a, b) => order(a.instrument) - order(b.instrument) || a.instrument.localeCompare(b.instrument));
  return [...weeks.values()].sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}

// Display order of instrument lines inside a week (the INSTR table's order).
const INSTR_ORDER: Record<SpecInstrument, true> = {
  DOW: true, NASDAQ: true, SNP: true, NIKKEI: true, GIFTNIFTY: true, 'NIFTY FUT': true, 'NSE FUT': true, 'COPPER-HG': true, 'COPPER-MHG': true,
};
