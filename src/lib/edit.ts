/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * FULL EDIT — pure model (no React, no supabase; node proofs import it).
 *
 * Every field of a live or closed trade is editable, INCLUDING every weekly row: that week's
 * close stamp (`fridayClosingPrices[week]`) and, for USD trades, that week's own USD/INR rate
 * (`fridayUsdToInrRates[week]`, 2026-10-17 law). The engine (types.ts, unchanged) already
 * honours a per-week rate: for each week `fridayUsdToInrRates[week]` (or `closedUsdToInrRate`
 * in the closing week) wins when present, else the trade's base `usdToInrRate`. So a week's
 * rate is NULLABLE storage inside the trade's own JSON — absent = "fall back to the base rate" —
 * and no existing row changes shape or value.
 *
 * Round-trip law: opening the edit form and saving it untouched produces the same trade
 * (engine numbers identical; the only JSON difference ever allowed is none — see `buildEdited`).
 * Weekly rates are applied as a DIFF against what the form was opened with, so an untouched
 * legacy week keeps its byte-identical `fridayUsdToInrRates` / `closedUsdToInrRate`.
 */
import { Trade, TradeDirection, getWeekKeyForClose } from '../types';
import { INSTR, SpecInstrument, specNameOf, dispCcy, isClosed, closeDateOf, weekKeyOf } from './v2engine';
import { weekPieces } from './weekly';

export type EditKind = 'live' | 'closed';

export type EditState = {
  id: string; kind: EditKind;
  symbol: string; instr: SpecInstrument; side: 'LONG' | 'SHORT'; lots: string; mult: string; entry: string; date: string;
  ccy: 'INR' | 'USD'; rate: string; real: number; entryBrok: string;   // rate = the trade's base USD/INR (USD only)
  exit: string; exitBrok: string; closedDate: string;                    // closed-only (blank for live)
  origInstr: SpecInstrument; origCcy: 'INR' | 'USD';
  // WEEKLY ROWS (2026-10-17): every week's close stamp and (USD) its own rate, as typed.
  stamps: Record<string, string>;        // weekKey -> close stamp text ('' = no stamp)
  weekRates: Record<string, string>;     // weekKey -> that week's USD/INR text ('' = base rate)
  origWeekRates: Record<string, string>; // what the form opened with (diff base, keeps legacy bytes)
};

export const isoFromForm = (s: string) => {
  // accepts dd-mm-yyyy (spec) or yyyy-mm-dd; returns yyyy-mm-dd
  const m = s.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s.trim();
};
export function dmyInput(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

export const entryVal = (tr: Trade) => (tr.direction === 'Long' ? tr.buyPrice : tr.sellPrice) ?? 0;
export const exitVal = (tr: Trade) => (tr.direction === 'Long' ? tr.sellPrice : tr.buyPrice) ?? 0;
export const sideOf = (tr: Trade) => (tr.direction === 'Long' ? 'LONG' : 'SHORT');

/** The EXPLICIT per-week rate stored for a week (null = none → base rate applies). Mirrors the
 *  engine's precedence: in the closing week `closedUsdToInrRate` wins over the week map. */
export function explicitWeekRate(t: Trade, weekKey: string): number | null {
  if (t.currency !== 'USD') return null;
  const closing = isClosed(t) && getWeekKeyForClose(t) === weekKey;
  const v = closing ? (t.closedUsdToInrRate ?? t.fridayUsdToInrRates?.[weekKey]) : t.fridayUsdToInrRates?.[weekKey];
  return v ?? null;
}

const numText = (v: number | null | undefined) => (v == null ? '' : String(v));

/** Open the edit form for a trade: every field, every weekly row, as text. */
export function editStateOf(tr: Trade, kind: EditKind): EditState {
  const spec = specNameOf(tr.instrument);
  const stamps = Object.fromEntries(Object.entries(tr.fridayClosingPrices ?? {}).map(([k, v]) => [k, numText(v)]));
  // Weekly rows = the trade's journal pieces (every week it is alive in). Explicit week rates
  // outside those weeks (e.g. a legacy stamp for a non-owed week) pass through untouched.
  const weekRates: Record<string, string> = {};
  for (const p of weekPieces(tr)) weekRates[p.weekKey] = numText(explicitWeekRate(tr, p.weekKey));
  return {
    id: tr.id, kind,
    symbol: tr.symbol, instr: spec, origInstr: spec,
    side: sideOf(tr), lots: String(tr.numberOfLots), mult: String(tr.lotSize), entry: String(entryVal(tr)),
    date: dmyInput(tr.dateInitiated), ccy: dispCcy(tr), origCcy: dispCcy(tr),
    rate: tr.currency === 'USD' && tr.usdToInrRate != null ? String(tr.usdToInrRate) : '',
    real: tr.realizationRate ?? 1.0, entryBrok: numText(tr.entryBrokerage),
    exit: kind === 'closed' ? String(exitVal(tr)) : '',
    exitBrok: kind === 'closed' ? numText(tr.exitBrokerage) : '',
    closedDate: kind === 'closed' ? dmyInput(closeDateOf(tr)) : '',
    stamps, weekRates, origWeekRates: { ...weekRates },
  };
}

export interface Edited {
  updated: Trade;
  orphans: string[];          // stamps earlier than the (new) initiation week — removed on save
  instrChanged: boolean;
  ccyChanged: boolean;
  rateChanged: boolean;       // the trade's BASE rate (or currency) changed
  keptWeekRates: string[];    // weeks whose explicit rate still overrides the (new) base rate
}

/**
 * Build the updated trade from an edit state. Pure: `orig` in, new object out.
 *  - A blank leg brokerage keeps the key's original shape (absent stays absent, null stays null)
 *    so an untouched save is byte-identical.
 *  - Stamps: the typed map replaces `fridayClosingPrices` (blank = stamp removed); stamps earlier
 *    than the new initiation week are dropped (week-identity integrity, reported as `orphans`).
 *  - Week rates: applied as a DIFF against `origWeekRates` — only weeks the operator changed are
 *    written (set → `fridayUsdToInrRates[week]`, blank → removed). In the closing week a legacy
 *    `closedUsdToInrRate` is kept in step (set/removed with the week) because the engine reads it
 *    first there. If the closing week MOVES, a legacy closing rate stays with the week it priced.
 *  - A currency change clears every week rate (INR has no FX). A BASE rate change does NOT clear
 *    them any more (they are first-class, visible rows now); `keptWeekRates` names the weeks still
 *    overriding so the UI can say so.
 */
export function buildEdited(orig: Trade, e: EditState): Edited {
  const meta = INSTR[e.instr];
  const entry = +e.entry || 0;
  const lots = parseInt(e.lots) || orig.numberOfLots;
  const mult = +e.mult > 0 ? +e.mult : orig.lotSize;   // per-trade multiplier (editable)
  const iso = isoFromForm(e.date);
  const newInitWeek = weekKeyOf(iso);
  // Stamps as typed: '' or non-numeric = no stamp for that week.
  const typed: Record<string, number> = {};
  for (const [wk, s] of Object.entries(e.stamps)) { const v = +s; if (s.trim() !== '' && v > 0) typed[wk] = v; }
  // Week-identity integrity: no mark may be earlier than the (new) initiation week.
  const orphans = Object.keys(typed).filter((wk) => wk < newInitWeek).sort();
  const cleanFcp = Object.fromEntries(Object.entries(typed).filter(([wk]) => wk >= newInitWeek));
  const dir: TradeDirection = e.side === 'LONG' ? 'Long' : 'Short';
  const ccyChanged = e.ccy !== e.origCcy;
  const blankKeeps = (v: number | null | undefined) => (v === undefined ? undefined : null);
  const base: Trade = {
    ...orig,
    symbol: e.symbol.toUpperCase().trim() || orig.symbol, instrument: meta.v1, lotSize: mult,
    direction: dir, numberOfLots: lots, dateInitiated: iso,
    currency: e.ccy, realizationRate: e.real,
    // Per-trade FX: the trade's own base rate (USD); INR trades store 1.
    usdToInrRate: e.ccy === 'USD' ? (+e.rate > 0 ? +e.rate : orig.usdToInrRate) : 1,
    entryBrokerage: e.entryBrok.trim() === '' ? blankKeeps(orig.entryBrokerage) : +e.entryBrok,
    fridayClosingPrices: cleanFcp,
  };
  const rateChanged = ccyChanged || (e.ccy === 'USD' && +e.rate > 0 && +e.rate !== orig.usdToInrRate);

  let updated: Trade;
  if (e.kind === 'live') {
    updated = {
      ...base, status: dir === 'Long' ? 'CarryForwardLong' : 'CarryForwardShort',
      buyPrice: dir === 'Long' ? entry : null, sellPrice: dir === 'Long' ? null : entry,
      buyDate: dir === 'Long' ? iso : null, sellDate: dir === 'Long' ? null : iso,
      exitBrokerage: blankKeeps(orig.exitBrokerage) as null | undefined,
    };
  } else {
    const cIso = isoFromForm(e.closedDate);
    const exit = +e.exit || 0;
    updated = {
      ...base, status: 'Closed',
      buyPrice: dir === 'Long' ? entry : exit, sellPrice: dir === 'Long' ? exit : entry,
      buyDate: dir === 'Long' ? iso : cIso, sellDate: dir === 'Long' ? cIso : iso,
      exitBrokerage: e.exitBrok.trim() === '' ? blankKeeps(orig.exitBrokerage) : +e.exitBrok,
    };
  }

  // ---- per-week USD/INR rates (diff against what the form opened with) ----
  const fur: Record<string, number> = { ...(orig.fridayUsdToInrRates ?? {}) };
  let closedRate: number | undefined = orig.closedUsdToInrRate;
  const origCloseWk = isClosed(orig) ? getWeekKeyForClose(orig) : null;
  const newCloseWk = e.kind === 'closed' ? getWeekKeyForClose(updated) : null;
  if (closedRate != null && origCloseWk && origCloseWk !== newCloseWk) {
    // The closing week moved: the legacy closing-week rate stays with the week it priced.
    if (fur[origCloseWk] == null) fur[origCloseWk] = closedRate;
    closedRate = undefined;
  }
  for (const [wk, s] of Object.entries(e.weekRates)) {
    if (s === (e.origWeekRates[wk] ?? '')) continue;         // untouched → byte-identical
    const v = +s;
    if (s.trim() === '' || !(v > 0)) {
      delete fur[wk];
      if (wk === newCloseWk) closedRate = undefined;
    } else {
      fur[wk] = v;
      if (wk === newCloseWk && closedRate != null) closedRate = v;
    }
  }
  if (ccyChanged) { for (const k of Object.keys(fur)) delete fur[k]; closedRate = undefined; }
  if (JSON.stringify(fur) !== JSON.stringify(orig.fridayUsdToInrRates ?? {})) updated.fridayUsdToInrRates = fur;
  if (closedRate !== orig.closedUsdToInrRate) {
    if (closedRate == null) delete updated.closedUsdToInrRate; else updated.closedUsdToInrRate = closedRate;
  }
  const keptWeekRates = updated.currency === 'USD'
    ? Object.keys(fur).filter((wk) => fur[wk] !== updated.usdToInrRate).sort()
    : [];

  return { updated, orphans, instrChanged: e.instr !== e.origInstr, ccyChanged, rateChanged, keptWeekRates };
}

export { isClosed as editIsClosed };
