/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Trade, getWeekInfo } from '../types';
import { X, RefreshCw, Calendar, Sparkles } from 'lucide-react';
import { formatNumber, formatAmount, formatPrice } from '../lib/format';

interface CarryForwardModalProps {
  trade: Trade;
  weekKey: string;
  onUpdateFridayClosingPrice: (
    tradeId: string, 
    weekKey: string, 
    price: number, 
    exchangeRate?: number
  ) => void;
  onClose: () => void;
}

export default function CarryForwardModal({ 
  trade, 
  weekKey, 
  onUpdateFridayClosingPrice, 
  onClose 
}: CarryForwardModalProps) {
  const existingPrice = trade.fridayClosingPrices[weekKey];
  const existingRate = trade.fridayUsdToInrRates?.[weekKey];

  const [fridayClosePrice, setFridayClosePrice] = useState<string>(
    existingPrice !== undefined ? existingPrice.toString() : ''
  );
  const [fridayExchangeRate, setFridayExchangeRate] = useState<string>(
    existingRate !== undefined ? existingRate.toString() : '83.24'
  );

  const validateAndSetDecimal = (val: string, setter: (val: string) => void) => {
    const sanitized = val.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 4) {
      parts[1] = parts[1].slice(0, 4);
    }
    setter(parts.join('.'));
  };

  const currencySymbol = trade.currency === 'USD' ? '$' : '₹';
  const entryPrice = trade.direction === 'Long' ? trade.buyPrice : trade.sellPrice;
  const entryDate = trade.direction === 'Long' ? trade.buyDate : trade.sellDate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseFloat(fridayClosePrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      alert('Please enter a valid Friday Close Price.');
      return;
    }

    const rate = trade.currency === 'USD' ? parseFloat(fridayExchangeRate) || 83.24 : undefined;

    onUpdateFridayClosingPrice(trade.id, weekKey, parsedPrice, rate);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
      <div 
        id="carry-forward-modal"
        className="bg-[#0b0f19] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl transition-all overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4.5">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-[#bef264]/10 border border-[#bef264]/20 rounded-xl text-[#bef264] shadow-md">
              <RefreshCw className="w-5 h-5 text-[#bef264]" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm text-white font-sans uppercase tracking-widest">
                Carry Forward Pos.
              </h3>
              <p className="text-[9px] text-[#bef264] font-bold font-mono uppercase tracking-widest">
                {trade.symbol} • {weekKey}
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
          {/* Reference Info card */}
          <div className="bg-slate-950/80 border border-white/5 p-4 rounded-2xl grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="block text-[9px] uppercase font-black tracking-widest text-slate-400 mb-1 font-mono">
                {trade.direction === 'Long' ? 'Buy Entry Price' : 'Sell Entry Price'}
              </span>
              <span className="font-mono text-white font-black text-xs">
                {currencySymbol}{formatPrice(entryPrice)}
              </span>
            </div>
            <div>
              <span className="block text-[9px] uppercase font-black tracking-widest text-slate-400 mb-1 font-mono">
                Date Initiated
              </span>
              <span className="font-mono text-slate-300 font-bold text-xs">
                {trade.dateInitiated}
              </span>
            </div>
          </div>

          {/* Friday Close Price Input */}
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
              Friday Close/Mark Price ({weekKey})
            </label>
            <input
              id="friday-close-price-input"
              type="text"
              inputMode="decimal"
              required
              placeholder="0.00"
              value={fridayClosePrice}
              onChange={e => validateAndSetDecimal(e.target.value, setFridayClosePrice)}
              className="w-full bg-slate-950 border border-white/10 focus:border-[#bef264] transition rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-bold font-mono"
              autoFocus
            />
            <p className="text-[10px] text-slate-400 leading-normal font-medium">
              * Input Friday EOD exchange-traded rate. This price sets the rollover reference for succeeding weeks.
            </p>
          </div>

          {/* USD to INR Exchange rate (if USD trade) */}
          {trade.currency === 'USD' && (
            <div className="bg-slate-950/90 border border-white/5 p-4 rounded-2xl space-y-2">
              <label className="block text-[9px] font-black text-[#bef264] uppercase tracking-widest flex items-center gap-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#bef264] inline-block"></span>
                Friday EOD USD/INR Exchange Rate
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder="e.g. 83.24"
                value={fridayExchangeRate}
                onChange={e => validateAndSetDecimal(e.target.value, setFridayExchangeRate)}
                className="w-full bg-slate-900 border border-white/10 focus:border-[#bef264] transition rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none font-mono font-bold"
              />
              <p className="text-[10px] text-slate-400 leading-normal">
                * Specify the exchange rate used to book cumulative unrealized value on Friday EOD.
              </p>
            </div>
          )}

          <div className="bg-slate-950/45 p-4 rounded-2xl border border-white/5 text-slate-400 text-[10px] leading-relaxed font-mono font-bold uppercase tracking-wider">
            💡 Rolling positions forward retains them as open-position contracts into the subsequent active weeks.
          </div>

          {/* Submit/Cancel buttons */}
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
              id="confirm-carry-forward-btn"
              className="bg-[#bef264] hover:bg-[#bef264]/95 text-[#0b0f19] px-6 py-2.5 rounded-xl text-xs font-black transition cursor-pointer font-mono uppercase tracking-wider shadow-lg"
            >
              Rollover Position
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
