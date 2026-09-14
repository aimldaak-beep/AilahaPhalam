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
 * Each piece is rounded to the rupee; on a CLOSED trade the closing piece carries the
 * rounding residual so that Σ pieces === realized(t) EXACTLY while realized() itself stays
 * the unchanged round-once figure — the carry-forward reconciliation. Legacy per-week FX
 * stamps (pre-2026-09-12) are honoured per week (`rate` on each piece shows what applied).
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
import { realized, isOpen, isClosed, closeDateOf, todayStr, weekKeyOf, weekLabel, weekRateOf, owesStampFor, aliveAtWeekClose } from './v2engine';

export interface WeekPiece {
  weekKey: string; monday: string; label: string;
  role: 'initiation' | 'intermediate' | 'closing' | 'same-week-closed';
  open: number;      // the mark this week's change is measured FROM (last stamp / entry)
  close: number;     // the mark it is measured TO (this week's stamp / exit)
  stamped: boolean;  // false = no close stamp for this week yet (engine carries last mark → 0 change)
  rate: number;      // USD/INR this week converted at (legacy stamp or the trade's own rate); 1 for INR
  val: number;       // rounded rupee net change for this week (NaN if a USD trade has no rate)
}

/** STAMP LAW (2026-09-14) — defined in v2engine.ts (owesStampFor / aliveAtWeekClose), re-exported here. */
export { owesStampFor, aliveAtWeekClose };

/** Every weekly piece of a trade, initiation → close (or → today for open trades). */
export function weekPieces(t: Trade): WeekPiece[] {
  const endStr = isClosed(t) ? closeDateOf(t) : todayStr();
  const out: WeekPiece[] = [];
  let carry: { val: number; open: number } | null = null; // STAMP LAW: a non-owed, unstamped week folds forward
  for (const w of getWeeksBetween(t.dateInitiated, endStr)) {
    const c = calculateTradeForWeek(t, w.weekKey);
    if (!c.isActive) continue;
    const closing = c.role === 'closing' || c.role === 'same-week-closed';
    const stamped = closing || t.fridayClosingPrices?.[w.weekKey] != null;
    if (!stamped && !owesStampFor(t, w.weekKey)) {
      carry = { val: (carry?.val ?? 0) + c.netProfit, open: carry?.open ?? c.openingPrice };
      continue;
    }
    out.push({
      weekKey: w.weekKey, monday: w.mondayDateStr, label: weekLabel(w.mondayDateStr),
      role: carry ? (closing ? 'same-week-closed' : 'initiation') : c.role,
      open: carry ? carry.open : c.openingPrice, close: c.closingPrice,
      stamped,
      rate: weekRateOf(t, w.weekKey),
      val: Math.round(c.netProfit + (carry?.val ?? 0)),
    });
    carry = null;
  }
  // Closed trade: the closing piece absorbs the rounding residual so Σ pieces === realized(t).
  if (isClosed(t) && out.length) {
    const last = out[out.length - 1];
    const others = out.slice(0, -1).reduce((s, p) => s + p.val, 0);
    const r = realized(t);
    if (!isNaN(r) && !isNaN(others)) last.val = r - others;
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
  ended: boolean;                 // week's Saturday 17:00 IST has passed (informational)
  realizedRows: RealizedRow[]; openRows: OpenRow[];
  realized: number; unrealized: number; total: number;
  unstamped: number;              // open rows in this week with no close stamp yet (excluded from totals)
}

/**
 * Build the journal, newest week first, from the FULL trade list. The only classification
 * per trade is OPEN or CLOSED (2026-09-12 fix — no week gate may drop a trade):
 *  - a CLOSED trade = a REALIZED row in the week it closed (earlier weeks it lived in show
 *    its pre-close pieces as UNREALIZED rows, so its pieces reconcile week by week);
 *  - an OPEN trade = an UNREALIZED row in EVERY week it is alive (initiation → today),
 *    marked at that week's close stamp; a week with no stamp yet is listed "unstamped"
 *    (never omitted, never given an invented mark) and is NOT counted in the week's totals —
 *    except a week the trade was not alive at the close of (opened that Sat/Sun): it owes no stamp
 *    there and is not listed (STAMP LAW, `owesStampFor`).
 * `lastEndedWeekKey` only annotates `ended` (Saturday 17:00 IST passed) for the header.
 * ROOT CAUSE of the 12-Sep bug: the previous version listed open pieces only when
 * `weekKey <= lastEndedWeekKey`, and that key stays at the PREVIOUS week until Saturday
 * 17:00 IST — so trades opened this week vanished from this week's journal.
 */
export function journalWeeks(trades: Trade[], lastEndedWeekKey: string): JournalWeek[] {
  const weeks = new Map<string, JournalWeek>();
  const wk = (key: string): JournalWeek => {
    let w = weeks.get(key);
    if (!w) {
      const monday = getWeekInfo(mondayFromKey(trades, key)).mondayDateStr;
      w = { weekKey: key, monday, label: weekLabel(monday), ended: key <= lastEndedWeekKey, realizedRows: [], openRows: [], realized: 0, unrealized: 0, total: 0, unstamped: 0 };
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
      } else {
        // STAMP LAW: a week the trade was not alive at the close of never reaches here — weekPieces
        // folds it into the first owed week (a pre-existing stamp for it is always kept).
        const w = wk(p.weekKey);
        w.openRows.push({ trade: t, piece: p });
        if (p.stamped) w.unrealized += p.val; else w.unstamped++;
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

/**
 * CLOSED TRADES GROUPED BY CLOSING WEEK (2026-09-12) — display grouping only, no math of its own:
 * the same Mon–Sun weeks as the journal, newest week first, trades within a week in close-date
 * order (ties by id, which carries the creation timestamp). `total` = Σ realized(trade) of the week.
 * Every closed trade lands in exactly one group (its closing week); open trades are excluded.
 */
export interface ClosedWeek { weekKey: string; monday: string; label: string; trades: Trade[]; total: number }
export function closedByWeek(trades: Trade[]): ClosedWeek[] {
  const m = new Map<string, ClosedWeek>();
  for (const t of trades) {
    if (!isClosed(t)) continue;
    const c = closeDateOf(t); const key = weekKeyOf(c);
    let w = m.get(key);
    if (!w) { const monday = getWeekInfo(c).mondayDateStr; w = { weekKey: key, monday, label: weekLabel(monday), trades: [], total: 0 }; m.set(key, w); }
    w.trades.push(t); w.total += realized(t);
  }
  for (const w of m.values()) w.trades.sort((a, b) => closeDateOf(a).localeCompare(closeDateOf(b)) || a.id.localeCompare(b.id));
  return [...m.values()].sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}
