/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Trade,
  Instrument,
  TradeDirection,
  TradeStatus,
  getWeekInfo,
  getWeeksBetween,
} from '../types';
import { X, Pencil, AlertCircle } from 'lucide-react';

interface EditTradeModalProps {
  trade: Trade;
  onSave: (updated: Trade) => void;
  onClose: () => void;
}

const INSTRUMENTS: Instrument[] = [
  'Option',
  'Futures',
  'DOW',
  'Nikkei',
  'Nasdaq',
  'NG',
  'SnP',
  'Gift Nifty',
  'NSE Futures',
  'NSE Options',
];

const STATUSES: { value: TradeStatus; label: string }[] = [
  { value: 'CarryForwardLong', label: 'Open · Carry-Forward Long' },
  { value: 'CarryForwardShort', label: 'Open · Carry-Forward Short' },
  { value: 'Closed', label: 'Closed (same week)' },
  { value: 'CarryForwardClosed', label: 'Closed (carried forward)' },
];

// Field styling shared with the close-trade modal so this feels familiar.
const inputClass =
  'w-full bg-slate-950 border border-white/10 focus:border-[#7fb3d5] transition rounded-xl px-3.5 py-3 text-base text-white focus:outline-none font-bold font-mono';
const labelClass =
  'block text-[13px] font-black text-slate-400 uppercase tracking-widest font-mono mb-1.5';

// Turn a string→string record into string→number, dropping blanks / NaN.
// This is the PnL-safety guard: a blank per-week input is OMITTED, never stored as 0.
function buildNumRecord(map: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  Object.entries(map).forEach(([key, raw]) => {
    const t = (raw ?? '').trim();
    if (t === '') return;
    const n = parseFloat(t);
    if (!isNaN(n)) out[key] = n;
  });
  return out;
}

function recordToStrings(map: Record<string, number> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  Object.entries(map ?? {}).forEach(([key, val]) => {
    out[key] = String(val);
  });
  return out;
}

export default function EditTradeModal({ trade, onSave, onClose }: EditTradeModalProps) {
  const [symbol, setSymbol] = useState(trade.symbol);
  const [instrument, setInstrument] = useState<Instrument>(trade.instrument);
  const [direction, setDirection] = useState<TradeDirection>(trade.direction);
  const [currency, setCurrency] = useState<'INR' | 'USD'>(trade.currency);
  const [status, setStatus] = useState<TradeStatus>(trade.status);
  const [dateInitiated, setDateInitiated] = useState(trade.dateInitiated);
  const [buyPrice, setBuyPrice] = useState(trade.buyPrice?.toString() ?? '');
  const [sellPrice, setSellPrice] = useState(trade.sellPrice?.toString() ?? '');
  const [buyDate, setBuyDate] = useState(trade.buyDate ?? '');
  const [sellDate, setSellDate] = useState(trade.sellDate ?? '');
  const [lotSize, setLotSize] = useState(trade.lotSize?.toString() ?? '');
  const [numberOfLots, setNumberOfLots] = useState(trade.numberOfLots?.toString() ?? '');
  const [usdToInrRate, setUsdToInrRate] = useState(trade.usdToInrRate?.toString() ?? '');
  const [closedUsdToInrRate, setClosedUsdToInrRate] = useState(
    trade.closedUsdToInrRate?.toString() ?? '',
  );
  const [realizationRate, setRealizationRate] = useState(trade.realizationRate?.toString() ?? '1');
  const [friClose, setFriClose] = useState<Record<string, string>>(() =>
    recordToStrings(trade.fridayClosingPrices),
  );
  const [friFx, setFriFx] = useState<Record<string, string>>(() =>
    recordToStrings(trade.fridayUsdToInrRates),
  );

  // Recompute the weeks this trade spans from the *current* form values, mirroring the
  // end-limit logic in types.ts so editing dates/status re-segments the per-week inputs live.
  const activeWeeks = useMemo(() => {
    if (!dateInitiated) return [];
    const today = new Date().toISOString().split('T')[0];
    const endLimit =
      status === 'Closed' || status === 'CarryForwardClosed'
        ? (direction === 'Long' ? sellDate : buyDate) || today
        : today;
    return getWeeksBetween(dateInitiated, endLimit);
  }, [dateInitiated, status, direction, buyDate, sellDate]);

  // The closing week uses the exit price (not a Friday close), so we label it for clarity.
  const closeWeekKey = useMemo(() => {
    const closeDate = direction === 'Long' ? sellDate : buyDate;
    return closeDate ? getWeekInfo(closeDate).weekKey : null;
  }, [direction, sellDate, buyDate]);

  const parseNum = (s: string, fallback: number): number => {
    const n = parseFloat(s);
    return isNaN(n) ? fallback : n;
  };
  const parseNumOrNull = (s: string): number | null => {
    const t = s.trim();
    if (t === '') return null;
    const n = parseFloat(t);
    return isNaN(n) ? null : n;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!dateInitiated) {
      alert('Initiation date is required.');
      return;
    }
    if (parseNum(lotSize, 0) <= 0 || parseNum(numberOfLots, 0) <= 0) {
      alert('Lot size and number of lots must be greater than zero.');
      return;
    }

    const updated: Trade = {
      ...trade, // preserve id, currentTradingPrice, and anything not surfaced here
      symbol: symbol.trim() || trade.symbol,
      instrument,
      direction,
      dateInitiated,
      buyPrice: parseNumOrNull(buyPrice),
      sellPrice: parseNumOrNull(sellPrice),
      buyDate: buyDate.trim() === '' ? null : buyDate,
      sellDate: sellDate.trim() === '' ? null : sellDate,
      lotSize: parseNum(lotSize, trade.lotSize),
      numberOfLots: parseNum(numberOfLots, trade.numberOfLots),
      status,
      currency,
      usdToInrRate: parseNum(usdToInrRate, trade.usdToInrRate),
      closedUsdToInrRate:
        closedUsdToInrRate.trim() === '' ? undefined : parseNum(closedUsdToInrRate, trade.closedUsdToInrRate ?? 0),
      realizationRate: parseNum(realizationRate, trade.realizationRate),
      fridayClosingPrices: buildNumRecord(friClose),
      fridayUsdToInrRates: buildNumRecord(friFx),
    };

    onSave(updated);
    onClose();
  };

  const entryPriceLabel = direction === 'Long' ? 'Buy / Entry Price' : 'Sell / Entry Price';
  const exitPriceLabel = direction === 'Long' ? 'Sell / Exit Price' : 'Buy / Exit Price';

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
      <div
        id="edit-trade-modal"
        className="bg-[#161f2e] border border-white/10 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header — mirrors CloseTradeModal, lime accent + pencil */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <div className="flex items-center gap-4">
            <span className="p-2.5 bg-[#7fb3d5]/10 border border-[#7fb3d5]/20 rounded-xl text-[#7fb3d5] shadow-md">
              <Pencil className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm text-white font-sans uppercase tracking-widest">
                Edit Position
              </h3>
              <p className="text-[13px] text-[#7fb3d5] font-bold font-mono uppercase tracking-widest">
                {trade.symbol} • {trade.instrument} • Correct any value
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-2 hover:bg-slate-900 rounded-xl cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Symbol</label>
              <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Instrument</label>
              <select value={instrument} onChange={(e) => setInstrument(e.target.value as Instrument)} className={inputClass}>
                {INSTRUMENTS.map((i) => (
                  <option key={i} value={i} className="bg-slate-950">
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as TradeDirection)} className={inputClass}>
                <option value="Long" className="bg-slate-950">Long</option>
                <option value="Short" className="bg-slate-950">Short</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Lifecycle Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TradeStatus)} className={inputClass}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value} className="bg-slate-950">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Prices & dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Initiation Date</label>
              <input type="date" value={dateInitiated} onChange={(e) => setDateInitiated(e.target.value)} className={inputClass} required />
            </div>
            <div className="hidden sm:block" />
            <div>
              <label className={labelClass}>{entryPriceLabel}</label>
              <input
                type="text"
                inputMode="decimal"
                value={direction === 'Long' ? buyPrice : sellPrice}
                onChange={(e) => (direction === 'Long' ? setBuyPrice(e.target.value) : setSellPrice(e.target.value))}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className={labelClass}>Entry Date</label>
              <input
                type="date"
                value={direction === 'Long' ? buyDate : sellDate}
                onChange={(e) => (direction === 'Long' ? setBuyDate(e.target.value) : setSellDate(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{exitPriceLabel}</label>
              <input
                type="text"
                inputMode="decimal"
                value={direction === 'Long' ? sellPrice : buyPrice}
                onChange={(e) => (direction === 'Long' ? setSellPrice(e.target.value) : setBuyPrice(e.target.value))}
                className={inputClass}
                placeholder="0.00 (blank = still open)"
              />
            </div>
            <div>
              <label className={labelClass}>Exit Date</label>
              <input
                type="date"
                value={direction === 'Long' ? sellDate : buyDate}
                onChange={(e) => (direction === 'Long' ? setSellDate(e.target.value) : setBuyDate(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>

          {/* Sizing & realization */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>Lot Size</label>
              <input type="text" inputMode="decimal" value={lotSize} onChange={(e) => setLotSize(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}># of Lots</label>
              <input type="text" inputMode="decimal" value={numberOfLots} onChange={(e) => setNumberOfLots(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Realization</label>
              <input type="text" inputMode="decimal" value={realizationRate} onChange={(e) => setRealizationRate(e.target.value)} className={inputClass} placeholder="1.0 or 0.8" />
            </div>
            <div>
              <label className={labelClass}>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD')} className={inputClass}>
                <option value="INR" className="bg-slate-950">INR</option>
                <option value="USD" className="bg-slate-950">USD</option>
              </select>
            </div>
          </div>

          {/* USD/INR rates */}
          {currency === 'USD' && (
            <div className="bg-slate-950/90 border border-white/5 p-4 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-black text-[#e8a04d] uppercase tracking-widest font-mono mb-1.5">
                  USD/INR Rate (general)
                </label>
                <input type="text" inputMode="decimal" value={usdToInrRate} onChange={(e) => setUsdToInrRate(e.target.value)} className={inputClass} placeholder="e.g. 83.24" />
              </div>
              <div>
                <label className="block text-[13px] font-black text-[#e8a04d] uppercase tracking-widest font-mono mb-1.5">
                  Closed USD/INR Rate
                </label>
                <input type="text" inputMode="decimal" value={closedUsdToInrRate} onChange={(e) => setClosedUsdToInrRate(e.target.value)} className={inputClass} placeholder="closing-week rate (blank = use general)" />
                <p className="text-[13px] text-slate-500 mt-1 font-medium leading-snug">
                  Takes precedence on the closing week. This is the one to fix when correcting a mid-week FX estimate.
                </p>
              </div>
            </div>
          )}

          {/* Per-week Friday closing prices + per-week FX (carry-forward weeks) */}
          {activeWeeks.length > 0 && (
            <div className="bg-slate-950/60 border border-white/5 p-4 rounded-2xl space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-[#7fb3d5]" />
                <span className="text-[13px] font-black text-[#7fb3d5] uppercase tracking-widest font-mono">
                  Per-Week Friday Closes{currency === 'USD' ? ' & FX Rates' : ''}
                </span>
              </div>
              <p className="text-[13px] text-slate-500 font-medium leading-snug">
                One row per ISO week this trade spans. Leave blank to omit (a blank is never stored as 0). The closing
                week uses the exit price, not a Friday close.
              </p>
              <div className="space-y-2">
                {activeWeeks.map((w) => {
                  const isCloseWeek = w.weekKey === closeWeekKey;
                  return (
                    <div key={w.weekKey} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4 text-[12px] font-mono text-slate-300 font-bold leading-tight">
                        {w.weekKey}
                        {isCloseWeek && (
                          <span className="block text-[8px] text-purple-400 uppercase tracking-wider">closing week</span>
                        )}
                      </div>
                      <div className={currency === 'USD' ? 'col-span-4' : 'col-span-8'}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={friClose[w.weekKey] ?? ''}
                          onChange={(e) => setFriClose((p) => ({ ...p, [w.weekKey]: e.target.value }))}
                          className={inputClass}
                          placeholder={isCloseWeek ? 'n/a (uses exit price)' : 'Friday close'}
                        />
                      </div>
                      {currency === 'USD' && (
                        <div className="col-span-4">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={friFx[w.weekKey] ?? ''}
                            onChange={(e) => setFriFx((p) => ({ ...p, [w.weekKey]: e.target.value }))}
                            className={inputClass}
                            placeholder="FX rate"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4 justify-end pt-4 border-t border-white/5 sticky bottom-0">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-950 hover:bg-slate-900 border border-white/5 hover:border-white/10 px-5 py-3 rounded-xl text-sm font-black text-slate-200 transition cursor-pointer font-mono uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-edit-btn"
              className="bg-[#7fb3d5] hover:bg-[#5f9fc8] text-[#161f2e] px-6 py-3 rounded-xl text-sm font-black transition cursor-pointer font-mono uppercase tracking-wider shadow-lg shadow-[#7fb3d5]/10"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
