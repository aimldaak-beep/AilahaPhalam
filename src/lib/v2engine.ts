/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * v2 engine adapter. The math itself is the UNCHANGED v1 engine in ../types.ts
 * (calculateTradeForWeek / calculateTurnoverAndBrokerage). This module only:
 *   - maps the 6 spec instruments -> v1 Instrument enum so the SAME brokerage
 *     branch runs (entry leg at initiation week, exit leg at close),
 *   - derives the spec's live MTM rows / totals / realized figures from it,
 *   - carries the Monday-week identity (weekKey <-> its Monday date).
 */
import {
  Trade, Instrument, TradeDirection, TradeStatus,
  getWeekInfo, getWeeksBetween, calculateTradeForWeek, getWeekKeyForClose,
  calculateTurnoverAndBrokerage,
} from '../types';

// Spec instrument -> { multiplier (lotSize), default currency, v1 enum for brokerage }.
// The v1 enum decides the brokerage branch in calculateTurnoverAndBrokerage:
//   'Futures'|'Gift Nifty'  -> 0.0003 * turnover ;  the four indices -> $5 * lots.
export type SpecInstrument = 'DOW' | 'NASDAQ' | 'SNP' | 'NIKKEI' | 'GIFTNIFTY' | 'NIFTY FUT' | 'NSE FUT' | 'COPPER-HG' | 'COPPER-MHG';
// `mult` is only the AUTO-FILL default for the forms (null = blank, user must enter the
// script's lot size). The engine NEVER reads this at compute time — it uses the trade's
// stored per-trade `lotSize`. NSE FUT is a stock-future (RELIANCE 250, TCS 175, …).
// COMEX entries (comex:true) render in $ with NO FX conversion (see isComex/dispCcy below);
// they are stored with an internal INR currency so the FX engine leaves them at rate 1. A
// future COMEX row (GOLD-GC, SILVER-SI, …) is a one-line addition here.
export const INSTR: Record<SpecInstrument, { mult: number | null; ccy: 'USD' | 'INR'; v1: Instrument; comex?: boolean; tick?: number; group?: string }> = {
  DOW:        { mult: 5,   ccy: 'USD', v1: 'DOW' },
  NASDAQ:     { mult: 20,  ccy: 'USD', v1: 'Nasdaq' },
  SNP:        { mult: 50,  ccy: 'USD', v1: 'SnP' },
  NIKKEI:     { mult: 100, ccy: 'USD', v1: 'Nikkei' },
  GIFTNIFTY:  { mult: 50,  ccy: 'USD', v1: 'Gift Nifty' },
  'NIFTY FUT':{ mult: 75,  ccy: 'INR', v1: 'Futures' },
  'NSE FUT':  { mult: null, ccy: 'INR', v1: 'NSE Futures' },
  'COPPER-HG':  { mult: 25000, ccy: 'USD', v1: 'COPPER-HG',  comex: true, tick: 0.0005, group: 'COMEX' },
  'COPPER-MHG': { mult: 2500,  ccy: 'USD', v1: 'COPPER-MHG', comex: true, tick: 0.0005, group: 'COMEX' },
};

// COMEX / USD-display helpers. A trade is COMEX iff its instrument's config is comex:true.
// Such trades render in $ with NO FX (their raw P&L stands in USD) and are excluded from ₹ aggregates.
export const isComex = (t: Trade): boolean => INSTR[specNameOf(t.instrument)]?.comex === true;
export const dispCcy = (t: Trade): 'USD' | 'INR' => (isComex(t) ? 'USD' : t.currency);
// Trade-scoped money: identical to inr()/signed()/nf() for non-COMEX (byte-identical), $ for COMEX.
export const amt = (t: Trade, v: number) => (isComex(t) ? '$' : '₹') + Math.abs(v).toLocaleString(isComex(t) ? 'en-US' : 'en-IN', { maximumFractionDigits: 0 });
export const sgn = (t: Trade, v: number) => (v >= 0 ? '+' : '−') + amt(t, v);
export const px = (t: Trade, v: number) => (isComex(t) ? (+v).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : nf(v));
// $-only aggregate formatting (separate line where aggregates appear).
export const usd = (v: number) => '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
export const signedUsd = (v: number) => (v >= 0 ? '+' : '−') + usd(v);
// Reverse map: v1 enum -> spec display name (for rendering stored trades).
export const specNameOf = (v1: Instrument): SpecInstrument => {
  const hit = (Object.keys(INSTR) as SpecInstrument[]).find((k) => INSTR[k].v1 === v1);
  return hit ?? 'NIFTY FUT';
};

// ---- Indian (lakh/crore) money formatting — matches DESIGN_SPEC verbatim ----
export const inr = (v: number) => '₹' + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const signed = (v: number) => (v >= 0 ? '+' : '−') + inr(v);
export const nf = (v: number | string) => (+v).toLocaleString('en-IN');

// ---- week identity: Monday date <-> weekKey ----
export const weekKeyOf = (dateStr: string) => getWeekInfo(dateStr).weekKey;
export const mondayOf = (dateStr: string) => getWeekInfo(dateStr).mondayDateStr;
export const todayStr = () => new Date().toISOString().split('T')[0];
/** "W34 · 18–24 Aug" style label for a week, from any date inside it. */
export function weekLabel(dateStr: string): string {
  const wi = getWeekInfo(dateStr);
  const mon = new Date(wi.mondayDateStr);
  const sun = new Date(wi.mondayDateStr); sun.setDate(sun.getDate() + 6);
  const d = (x: Date) => x.getDate();
  const mo = (x: Date) => x.toLocaleDateString('en-US', { month: 'short' });
  const range = mo(mon) === mo(sun) ? `${d(mon)}–${d(sun)} ${mo(sun)}` : `${d(mon)} ${mo(mon)}–${d(sun)} ${mo(sun)}`;
  return `W${wi.weekNum} · ${range}`;
}
export const heldDays = (openStr: string, closeStr: string) =>
  Math.max(Math.round((new Date(closeStr).getTime() - new Date(openStr).getTime()) / 86400000), 0);

// ---- trade helpers ----
export const isOpen = (t: Trade) => t.status === 'CarryForwardLong' || t.status === 'CarryForwardShort';
export const isClosed = (t: Trade) => t.status === 'Closed' || t.status === 'CarryForwardClosed';
export const entryPriceOf = (t: Trade) => (t.direction === 'Long' ? t.buyPrice : t.sellPrice) ?? 0;
export const exitPriceOf  = (t: Trade) => (t.direction === 'Long' ? t.sellPrice : t.buyPrice) ?? 0;

/** Entry-leg brokerage in the trade's native currency — the legacy auto formula for the
 *  entry price, unless a manual entryBrokerage override is set. */
export function entryLegBrokerage(t: Trade): number {
  const formula = calculateTurnoverAndBrokerage(entryPriceOf(t), t.numberOfLots, t.lotSize, t.instrument).brokerage;
  return t.entryBrokerage ?? formula;
}

export interface MtmRow { weekKey: string; monday: string; label: string; close: number; rate: number; val: number; }

/** Live MTM ledger rows — one per week that has a stamped close, brokerage &
 *  realization included (uses the unchanged v1 calculateTradeForWeek). */
export function liveMtmRows(t: Trade): MtmRow[] {
  const rows: MtmRow[] = [];
  const weeks = getWeeksBetween(t.dateInitiated, todayStr());
  for (const w of weeks) {
    const close = t.fridayClosingPrices[w.weekKey];
    if (close == null) continue; // no stamped close yet -> no row (matches spec)
    const calc = calculateTradeForWeek(t, w.weekKey);
    rows.push({
      weekKey: w.weekKey, monday: w.mondayDateStr, label: weekLabel(w.mondayDateStr),
      close, rate: t.fridayUsdToInrRates?.[w.weekKey] ?? t.usdToInrRate ?? 83.24, val: Math.round(calc.netProfit),
    });
  }
  return rows;
}
export const liveMtm = (t: Trade) => liveMtmRows(t).reduce((s, r) => s + r.val, 0);

/** Latest known USD/INR rate for a trade — last stamped weekly rate, else the
 *  trade's entry rate, else 83.24. Prefills the What-if hypothetical rate. */
export function latestUsdRate(t: Trade): number {
  const rows = liveMtmRows(t);
  return rows.length ? rows[rows.length - 1].rate : (t.usdToInrRate ?? 83.24);
}

/** Realized P&L for a closed trade = sum of every active week's net (entry-leg
 *  brokerage in the init week, exit-leg at close, realization scaled). */
export function realized(t: Trade): number {
  const endStr = getGloballyCloseDate(t) ?? todayStr();
  let sum = 0;
  for (const w of getWeeksBetween(t.dateInitiated, endStr)) {
    const calc = calculateTradeForWeek(t, w.weekKey);
    if (calc.isActive) sum += calc.netProfit;
  }
  return Math.round(sum);
}
function getGloballyCloseDate(t: Trade): string | null {
  return t.direction === 'Long' ? t.sellDate : t.buyDate;
}
export const closeDateOf = (t: Trade) => getGloballyCloseDate(t) ?? todayStr();

export type { Trade, TradeDirection, TradeStatus };
export { getWeekKeyForClose };
