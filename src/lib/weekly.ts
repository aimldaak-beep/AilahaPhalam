/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WEEKLY MTM JOURNAL — pure model (no React, no supabase; node proofs import it).
 *
 * Law (2026-09-12): every trade is cut into one PIECE per Mon–Sun week it was alive in,
 * by the unchanged engine (types.ts calculateTradeForWeek):
 *   piece(week) = (this week's close stamp − last week's close stamp, or − entry if opened
 *                 this week, or exit − last stamp in the closing week) × dir × mult × lots
 *                 × the trade's OWN USD/INR rate (USD) × realization
 *                 − the brokerage leg charged that week (entry leg in the initiation week,
 *                   exit leg in the closing week).
 * Each piece is rounded to the rupee. A trade's pieces SUM EXACTLY to its realized P&L
 * (v2engine.realized rounds per week the same way) — the carry-forward reconciliation.
 *
 * A weekly journal W shows:
 *   REALIZED   — trades CLOSED in W, each with its closing-week piece (what was booked in
 *                W) and, for carried trades, the full per-week history + final total;
 *   UNREALIZED — trades still OPEN at W's close, each with its W piece (the change in
 *                value during W, not cumulative since entry);
 *   WEEK TOTAL — realized + unrealized ("what I actually made this week").
 * Summing WEEK TOTAL over all weeks therefore counts every piece exactly once.
 */
import { Trade, calculateTradeForWeek, getWeeksBetween, getWeekKeyForClose, getWeekInfo } from '../types';
import { realized, isOpen, isClosed, closeDateOf, todayStr, weekKeyOf, weekLabel } from './v2engine';

export interface WeekPiece {
  weekKey: string; monday: string; label: string;
  role: 'initiation' | 'intermediate' | 'closing' | 'same-week-closed';
  open: number;      // the mark this week's change is measured FROM (last stamp / entry)
  close: number;     // the mark it is measured TO (this week's stamp / exit)
  stamped: boolean;  // false = no close stamp for this week yet (engine carries last mark → 0 change)
  val: number;       // rounded rupee net change for this week (NaN if a USD trade has no rate)
}

/** Every weekly piece of a trade, initiation → close (or → today for open trades). */
export function weekPieces(t: Trade): WeekPiece[] {
  const endStr = isClosed(t) ? closeDateOf(t) : todayStr();
  const out: WeekPiece[] = [];
  for (const w of getWeeksBetween(t.dateInitiated, endStr)) {
    const c = calculateTradeForWeek(t, w.weekKey);
    if (!c.isActive) continue;
    const closing = c.role === 'closing' || c.role === 'same-week-closed';
    out.push({
      weekKey: w.weekKey, monday: w.mondayDateStr, label: weekLabel(w.mondayDateStr), role: c.role,
      open: c.openingPrice, close: c.closingPrice,
      stamped: closing || t.fridayClosingPrices?.[w.weekKey] != null,
      val: Math.round(c.netProfit),
    });
  }
  return out;
}

/** Carry-forward reconciliation: Σ pieces must equal realized(t) exactly (closed trades). */
export function reconcile(t: Trade): { sum: number; realized: number; ok: boolean } {
  const sum = weekPieces(t).reduce((s, p) => s + p.val, 0);
  const r = realized(t);
  const ok = (isNaN(sum) && isNaN(r)) || sum === r;
  return { sum, realized: r, ok };
}

export interface RealizedRow { trade: Trade; piece: WeekPiece; pieces: WeekPiece[]; total: number; carried: boolean; reconciled: boolean }
export interface OpenRow { trade: Trade; piece: WeekPiece }
export interface JournalWeek {
  weekKey: string; monday: string; label: string;
  ended: boolean;                 // week's Saturday has passed (open positions are marked)
  realizedRows: RealizedRow[]; openRows: OpenRow[];
  realized: number; unrealized: number; total: number;
}

/**
 * Build the journal, newest week first.
 *  - a closed trade's closing week is always listed (its REALIZED row);
 *  - every other week a trade was alive in, up to `lastEndedWeekKey` (the most recent week
 *    whose Saturday has passed), lists it under UNREALIZED with that week's piece;
 *  - the in-progress week is listed only if a trade closed in it (no open marks yet).
 */
export function journalWeeks(trades: Trade[], lastEndedWeekKey: string): JournalWeek[] {
  const weeks = new Map<string, JournalWeek>();
  const wk = (key: string): JournalWeek => {
    let w = weeks.get(key);
    if (!w) {
      const monday = getWeekInfo(mondayFromKey(trades, key)).mondayDateStr;
      w = { weekKey: key, monday, label: weekLabel(monday), ended: key <= lastEndedWeekKey, realizedRows: [], openRows: [], realized: 0, unrealized: 0, total: 0 };
      weeks.set(key, w);
    }
    return w;
  };
  for (const t of trades) {
    const pieces = weekPieces(t);
    if (!pieces.length) continue;
    const closeKey = isClosed(t) ? getWeekKeyForClose(t) : null;
    for (const p of pieces) {
      if (closeKey && p.weekKey === closeKey) {
        const total = realized(t);
        const w = wk(p.weekKey);
        w.realizedRows.push({ trade: t, piece: p, pieces, total, carried: pieces.length > 1, reconciled: reconcile(t).ok });
        w.realized += p.val;
      } else if (p.weekKey <= lastEndedWeekKey) {
        const w = wk(p.weekKey);
        w.openRows.push({ trade: t, piece: p });
        w.unrealized += p.val;
      }
    }
  }
  for (const w of weeks.values()) {
    w.total = w.realized + w.unrealized;
    w.realizedRows.sort((a, b) => closeDateOf(b.trade).localeCompare(closeDateOf(a.trade)));
    w.openRows.sort((a, b) => a.trade.dateInitiated.localeCompare(b.trade.dateInitiated));
  }
  return [...weeks.values()].sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}

// A weekKey's Monday: find it from any trade date inside that week (keys are Monday-derived).
function mondayFromKey(trades: Trade[], key: string): string {
  for (const t of trades) {
    const endStr = isOpen(t) ? todayStr() : closeDateOf(t);
    for (const w of getWeeksBetween(t.dateInitiated, endStr)) if (w.weekKey === key) return w.mondayDateStr;
  }
  return todayStr();
}

export const lastEndedWeekKeyFor = (askDateISO: string) => weekKeyOf(askDateISO);
