/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { getWeekInfo, Instrument, TradeDirection, TradeStatus, Trade } from '../types';
import { Plus, X, Calendar, DollarSign, HelpCircle, AlertOctagon } from 'lucide-react';

interface NewTradeFormProps {
  onAddTrade: (trade: Trade) => void;
  onClose: () => void;
}

export default function NewTradeForm({ onAddTrade, onClose }: NewTradeFormProps) {
  const [dateInitiated, setDateInitiated] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [symbol, setSymbol] = useState('');
  const [instrument, setInstrument] = useState<Instrument>('Futures');
  const [direction, setDirection] = useState<TradeDirection>('Long');
  const [entryPrice, setEntryPrice] = useState<string>('');
  const [lotSize, setLotSize] = useState<string>('250');
  const [numberOfLots, setNumberOfLots] = useState<string>('1');


  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [usdToInrRate, setUsdToInrRate] = useState<string>('83.24');
  const [realizationOption, setRealizationOption] = useState<'Full' | '80/20'>('80/20');

  const validateAndSetDecimal = (val: string, setter: (val: string) => void) => {
    // Strip any characters that are not digits or decimal point
    const sanitized = val.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    if (parts.length > 2) return; // ignore extra dots
    if (parts[1] && parts[1].length > 4) {
      parts[1] = parts[1].slice(0, 4); // restrict to 4 decimal places
    }
    setter(parts.join('.'));
  };

  // Dynamic automatic info display
  const weekInfo = getWeekInfo(dateInitiated);

  // Auto-fill default lot sizes based on standard instruments
  useEffect(() => {
    switch (instrument) {
      case 'Futures':
      case 'NSE Futures':
        setLotSize('250');
        setCurrency('INR');
        setRealizationOption('Full');
        break;
      case 'Option':
      case 'NSE Options':
        setLotSize('50');
        setCurrency('INR');
        setRealizationOption('Full');
        break;
      case 'DOW':
      case 'Nasdaq':
        setLotSize('1');
        setCurrency('USD');
        setRealizationOption('80/20');
        break;
      case 'SnP':
        setLotSize('5');
        setCurrency('USD');
        setRealizationOption('80/20');
        break;
      case 'NG':
        setLotSize('1250');
        setCurrency('USD');
        setRealizationOption('80/20');
        break;
      case 'Nikkei':
        setLotSize('100');
        setCurrency('USD');
        setRealizationOption('80/20');
        break;
      case 'Gift Nifty':
        setLotSize('50');
        setCurrency('INR');
        setRealizationOption('80/20');
        break;
    }
  }, [instrument]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || !entryPrice) return;

    const parsedEntryPrice = parseFloat(entryPrice);
    if (isNaN(parsedEntryPrice) || parsedEntryPrice <= 0) return;

    const status: TradeStatus = direction === 'Long' ? 'CarryForwardLong' : 'CarryForwardShort';
    const tradeRate = currency === 'USD' ? parseFloat(usdToInrRate) || 83.24 : 1.0;

    const trade: Trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      symbol: symbol.toUpperCase(),
      instrument,
      direction,
      dateInitiated,
      buyPrice: direction === 'Long' ? parsedEntryPrice : null,
      sellPrice: direction === 'Short' ? parsedEntryPrice : null,
      buyDate: direction === 'Long' ? dateInitiated : null,
      sellDate: direction === 'Short' ? dateInitiated : null,
      lotSize: parseFloat(lotSize) || 1,
      numberOfLots: parseFloat(numberOfLots) || 1,
      status,
      currency,
      usdToInrRate: tradeRate,
      fridayUsdToInrRates: {},
      realizationRate: realizationOption === '80/20' ? 0.8 : 1.0,
      fridayClosingPrices: {},
    };

    onAddTrade(trade);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
      <div 
        id="new-trade-form-card"
        className="bg-[#0b0f19] border border-white/10 rounded-3xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl transition-all duration-200"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4.5">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 shadow-md">
              <Plus className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm text-white font-sans uppercase tracking-widest">
                Initiate New Contract
              </h3>
              <p className="text-[9px] text-[#f97316] font-bold font-mono uppercase tracking-widest">
                Ailaha Phalam Ledger Logistics Engine
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Metadata Display */}
          <div className="bg-slate-950/85 rounded-2xl p-4 border border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300 font-semibold font-mono text-[10px] uppercase tracking-wider">
              <Calendar className="w-4 h-4 text-orange-400" />
              <span>Initiation Date Week:</span>
            </div>
            <div className="flex items-center gap-2 font-black font-mono">
              <span className="bg-orange-500/20 border border-orange-500/40 text-orange-400 px-2.5 py-1 rounded-lg text-[10px] uppercase font-mono tracking-widest shadow-sm">
                Week {weekInfo.weekNum}
              </span>
              <span className="text-slate-300 font-mono text-xs">
                {weekInfo.weekRange}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Symbol */}
            <div className="space-y-1.5 animate-fade-in">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
                Symbol / Security Identifier
              </label>
              <input
                id="symbol-input"
                type="text"
                required
                placeholder="e.g. NIFTY25S"
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 focus:border-[#f97316] transition rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none font-bold font-mono tracking-wide"
              />
            </div>

            {/* Instrument dropdown */}
            <div className="space-y-1.5 animate-fade-in">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
                Instrument Type
              </label>
              <select
                id="instrument-select"
                value={instrument}
                onChange={e => setInstrument(e.target.value as Instrument)}
                className="w-full bg-slate-950 border border-white/10 focus:border-[#f97316] transition rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none font-bold cursor-pointer font-mono"
              >
                <option value="Futures" className="bg-slate-950 text-slate-100">Futures</option>
                <option value="Option" className="bg-slate-950 text-slate-100">Option</option>
                <option value="NSE Futures" className="bg-slate-950 text-slate-100">NSE Futures</option>
                <option value="NSE Options" className="bg-slate-950 text-slate-100">NSE Options</option>
                <option value="DOW" className="bg-slate-950 text-slate-100">DOW</option>
                <option value="Nikkei" className="bg-slate-950 text-slate-100">Nikkei</option>
                <option value="Nasdaq" className="bg-slate-950 text-slate-100">Nasdaq</option>
                <option value="NG" className="bg-slate-950 text-slate-100">NG (Natural Gas)</option>
                <option value="SnP" className="bg-slate-950 text-slate-100">S&P 500</option>
                <option value="Gift Nifty" className="bg-slate-950 text-slate-100">Gift Nifty</option>
              </select>
            </div>
          </div>

          {/* Direction toggle */}
          <div className="space-y-2">
            <label className="block text-[9px] font-black text-slate-350 uppercase tracking-widest font-mono">
              Trade Direction
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                id="dir-long-btn"
                onClick={() => setDirection('Long')}
                className={`py-2.5 px-4 rounded-xl text-xs font-black transition text-center flex items-center justify-center gap-1.5 cursor-pointer font-mono tracking-widest ${
                  direction === 'Long'
                    ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-md'
                    : 'bg-slate-950 border border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping" />
                LONG / BUY FIRST
              </button>
              <button
                type="button"
                id="dir-short-btn"
                onClick={() => setDirection('Short')}
                className={`py-2.5 px-4 rounded-xl text-xs font-black transition text-center flex items-center justify-center gap-1.5 cursor-pointer font-mono tracking-widest ${
                  direction === 'Short'
                    ? 'bg-rose-500/15 border border-rose-500/40 text-rose-455 shadow-md'
                    : 'bg-slate-950 border border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block animate-ping" />
                SHORT / SELL FIRST
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Entry Price */}
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
                {direction === 'Long' ? 'Buy Price' : 'Sell Price'}
              </label>
              <input
                id="entry-price-input"
                type="text"
                inputMode="decimal"
                required
                placeholder="0.00"
                value={entryPrice}
                onChange={e => validateAndSetDecimal(e.target.value, setEntryPrice)}
                className="w-full bg-slate-950 border border-white/10 focus:border-[#f97316] transition rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-bold font-mono"
              />
            </div>

            {/* Lot Size */}
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
                Multiplier Size
              </label>
              <input
                id="lot-size-input"
                type="text"
                inputMode="decimal"
                required
                value={lotSize}
                onChange={e => validateAndSetDecimal(e.target.value, setLotSize)}
                className="w-full bg-slate-950 border border-white/10 focus:border-[#f97316] transition rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none font-bold font-mono"
              />
            </div>

            {/* Lots count */}
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
                No. of Lots
              </label>
              <input
                id="lots-input"
                type="text"
                inputMode="decimal"
                required
                value={numberOfLots}
                onChange={e => validateAndSetDecimal(e.target.value, setNumberOfLots)}
                className="w-full bg-slate-950 border border-white/10 focus:border-[#f97316] transition rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none font-bold font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* Initiation date */}
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
                Initiation Date Form
              </label>
              <input
                id="date-initiated-input"
                type="date"
                required
                value={dateInitiated}
                onChange={e => setDateInitiated(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 focus:border-[#f97316] transition rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-bold font-mono"
              />
            </div>
          </div>

          {/* Currency and Realization Configuration Panel */}
          <div className="border-t border-white/5 pt-4 mt-2 space-y-3">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">
              Accounting & Currency Parameters
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/80 p-4 rounded-2xl border border-white/5">
              {/* Currency Select */}
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-slate-450 uppercase tracking-widest font-mono">
                  Accounting Currency
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-900/65 p-1 rounded-xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrency('INR');
                      if (realizationOption === '80/20' && instrument !== 'Gift Nifty') {
                        setRealizationOption('Full');
                      }
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition flex items-center justify-center gap-1 font-black font-mono cursor-pointer ${
                      currency === 'INR'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ₹ INR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrency('USD');
                      setRealizationOption('80/20');
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition flex items-center justify-center gap-1 font-black font-mono cursor-pointer ${
                      currency === 'USD'
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    $ USD
                  </button>
                </div>
              </div>

              {/* Realization Rate selection */}
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-slate-450 uppercase tracking-widest font-mono" title="USD and Gift Nifty default to 80/20 book profits">
                  Realization Rate Multiplier
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-900/65 p-1 rounded-xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => setRealizationOption('Full')}
                    className={`px-3 py-1.5 text-xs rounded-lg transition font-black font-mono cursor-pointer ${
                      realizationOption === 'Full'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    FULL (1.0)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRealizationOption('80/20')}
                    className={`px-3 py-1.5 text-xs rounded-lg transition font-black font-mono cursor-pointer ${
                      realizationOption === '80/20'
                        ? 'bg-[#f97316]/20 text-orange-400 border border-orange-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    80% (0.8)
                  </button>
                </div>
              </div>

              {/* Conditionally ask for USD to INR exchange rate */}
              {currency === 'USD' && (
                <div className="col-span-1 sm:col-span-2 border-t border-white/5 pt-3 animate-in fade-in space-y-1.5">
                  <label className="block text-[9px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block animate-pulse"></span>
                    USD to INR Conversion Rate
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="e.g. 83.24"
                    value={usdToInrRate}
                    onChange={e => validateAndSetDecimal(e.target.value, setUsdToInrRate)}
                    className="w-full bg-slate-950 border border-white/10 focus:border-orange-500 transition rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-450 mt-1 block leading-normal font-bold">
                    * USD base values will translate to INR ledger automatically using this rate.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Info Banner on Rollover */}
          <div className="border-t border-white/5 pt-4 mt-2">
            <div className="bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/20 flex gap-3 text-emerald-400/90 text-[11px] leading-relaxed font-bold">
              <AlertOctagon className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <span className="font-black text-emerald-400 block mb-1 text-[10px] uppercase tracking-widest font-mono">
                  Active Trade Initiation Modality
                </span>
                This contract will initiate as open-trading in the active positions roster. You can close, check current PnL, or carry it forward at any time from the Weekly Reporting view.
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-950 hover:bg-slate-900 border border-white/5 hover:border-white/10 px-5 py-2.5 rounded-xl text-xs font-black text-slate-200 transition cursor-pointer font-mono uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-btn"
              className="bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-705 text-slate-950 font-extrabold px-6 py-2.5 rounded-xl text-xs transition cursor-pointer font-mono uppercase tracking-wider shadow-lg shadow-emerald-500/10"
            >
              Confirm & Deploy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
