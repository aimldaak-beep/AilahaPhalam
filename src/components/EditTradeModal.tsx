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
  'w-full rounded-xl px-3.5 py-3 text-base focus:outline-none font-bold font-mono';
const labelClass =
  'block text-[13px] font-black uppercase tracking-widest font-mono mb-1.5';

const inputStyle = {
  background: 'rgba(201,168,76,0.04)',
  border: '1px solid rgba(201,168,76,0.15)',
  borderRadius: 12,
  color: '#F0E6C8',
} as React.CSSProperties;

const optionStyle = { background: '#0A0804', color: '#F0E6C8' } as React.CSSProperties;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
      <div
        id="edit-trade-modal"
        className="w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ background: 'rgba(8,5,2,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 24 }}
      >
        {/* Header — mirrors CloseTradeModal, lime accent + pencil */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(201,168,76,0.08)' }}>
          <div className="flex items-center gap-4">
            <span className="p-2.5 rounded-xl shadow-md" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#C9A84C' }}>
              <Pencil className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm font-sans uppercase tracking-widest" style={{ color: '#F0E6C8' }}>
                Edit Position
              </h3>
              <p className="text-[13px] font-bold font-mono uppercase tracking-widest" style={{ color: '#C9A84C' }}>
                {trade.symbol} • {trade.instrument} • Correct any value
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="transition p-2 rounded-xl cursor-pointer"
            style={{ color: 'rgba(240,230,200,0.5)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}>Symbol</label>
              <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}>Instrument</label>
              <select value={instrument} onChange={(e) => setInstrument(e.target.value as Instrument)} className={inputClass} style={inputStyle}>
                {INSTRUMENTS.map((i) => (
                  <option key={i} value={i} style={optionStyle}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}>Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as TradeDirection)} className={inputClass} style={inputStyle}>
                <option value="Long" style={optionStyle}>Long</option>
                <option value="Short" style={optionStyle}>Short</option>
              </select>
            </div>
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}>Lifecycle Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TradeStatus)} className={inputClass} style={inputStyle}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value} style={optionStyle}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Prices & dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}>Initiation Date</label>
              <input type="date" value={dateInitiated} onChange={(e) => setDateInitiated(e.target.value)} className={inputClass} style={inputStyle} required />
            </div>
            <div className="hidden sm:block" />
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}>{entryPriceLabel}</label>
              <input
                type="text"
                inputMode="decimal"
                value={direction === 'Long' ? buyPrice : sellPrice}
                onChange={(e) => (direction === 'Long' ? setBuyPrice(e.target.value) : setSellPrice(e.target.value))}
                className={inputClass}
                style={inputStyle}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}>Entry Date</label>
              <input
                type="date"
                value={direction === 'Long' ? buyDate : sellDate}
                onChange={(e) => (direction === 'Long' ? setBuyDate(e.target.value) : setSellDate(e.target.value))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}>{exitPriceLabel}</label>
              <input
                type="text"
                inputMode="decimal"
                value={direction === 'Long' ? sellPrice : buyPrice}
                onChange={(e) => (direction === 'Long' ? setSellPrice(e.target.value) : setBuyPrice(e.target.value))}
                className={inputClass}
                style={inputStyle}
                placeholder="0.00 (blank = still open)"
              />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}>Exit Date</label>
              <input
                type="date"
                value={direction === 'Long' ? sellDate : buyDate}
                onChange={(e) => (direction === 'Long' ? setSellDate(e.target.value) : setBuyDate(e.target.value))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Sizing & realization */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}>Lot Size</label>
              <input type="text" inputMode="decimal" value={lotSize} onChange={(e) => setLotSize(e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}># of Lots</label>
              <input type="text" inputMode="decimal" value={numberOfLots} onChange={(e) => setNumberOfLots(e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}>Realization</label>
              <input type="text" inputMode="decimal" value={realizationRate} onChange={(e) => setRealizationRate(e.target.value)} className={inputClass} style={inputStyle} placeholder="1.0 or 0.8" />
            </div>
            <div>
              <label className={labelClass} style={{ color: 'rgba(240,230,200,0.55)' }}>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD')} className={inputClass} style={inputStyle}>
                <option value="INR" style={optionStyle}>INR</option>
                <option value="USD" style={optionStyle}>USD</option>
              </select>
            </div>
          </div>

          {/* USD/INR rates */}
          {currency === 'USD' && (
            <div className="p-4 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.1)' }}>
              <div>
                <label className="block text-[13px] font-black uppercase tracking-widest font-mono mb-1.5" style={{ color: '#C9960C' }}>
                  USD/INR Rate (general)
                </label>
                <input type="text" inputMode="decimal" value={usdToInrRate} onChange={(e) => setUsdToInrRate(e.target.value)} className={inputClass} style={inputStyle} placeholder="e.g. 83.24" />
              </div>
              <div>
                <label className="block text-[13px] font-black uppercase tracking-widest font-mono mb-1.5" style={{ color: '#C9960C' }}>
                  Closed USD/INR Rate
                </label>
                <input type="text" inputMode="decimal" value={closedUsdToInrRate} onChange={(e) => setClosedUsdToInrRate(e.target.value)} className={inputClass} style={inputStyle} placeholder="closing-week rate (blank = use general)" />
                <p className="text-[13px] mt-1 font-medium leading-snug" style={{ color: 'rgba(240,230,200,0.35)' }}>
                  Takes precedence on the closing week. This is the one to fix when correcting a mid-week FX estimate.
                </p>
              </div>
            </div>
          )}

          {/* Per-week Friday closing prices + per-week FX (carry-forward weeks) */}
          {activeWeeks.length > 0 && (
            <div className="p-4 rounded-lg space-y-3" style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.1)' }}>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5" style={{ color: '#C9A84C' }} />
                <span className="text-[13px] font-black uppercase tracking-widest font-mono" style={{ color: '#C9A84C' }}>
                  Per-Week Friday Closes{currency === 'USD' ? ' & FX Rates' : ''}
                </span>
              </div>
              <p className="text-[13px] font-medium leading-snug" style={{ color: 'rgba(240,230,200,0.35)' }}>
                One row per ISO week this trade spans. Leave blank to omit (a blank is never stored as 0). The closing
                week uses the exit price, not a Friday close.
              </p>
              <div className="space-y-2">
                {activeWeeks.map((w) => {
                  const isCloseWeek = w.weekKey === closeWeekKey;
                  return (
                    <div key={w.weekKey} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4 text-[12px] font-mono font-bold leading-tight" style={{ color: 'rgba(240,230,200,0.7)' }}>
                        {w.weekKey}
                        {isCloseWeek && (
                          <span className="block text-[8px] uppercase tracking-wider" style={{ color: '#C9A84C' }}>closing week</span>
                        )}
                      </div>
                      <div className={currency === 'USD' ? 'col-span-4' : 'col-span-8'}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={friClose[w.weekKey] ?? ''}
                          onChange={(e) => setFriClose((p) => ({ ...p, [w.weekKey]: e.target.value }))}
                          className={inputClass}
                          style={inputStyle}
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
                            style={inputStyle}
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
          <div className="flex gap-4 justify-end pt-4 sticky bottom-0" style={{ borderTop: '1px solid rgba(201,168,76,0.08)' }}>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-xl text-sm font-black transition cursor-pointer font-mono uppercase tracking-wider"
              style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: '#C9A84C' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-edit-btn"
              className="px-6 py-3 rounded-xl text-sm font-black transition cursor-pointer font-mono uppercase tracking-wider"
              style={{ background: '#C9A84C', color: '#1A1200', fontWeight: 800 }}
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
