/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Trade, getWeekInfo, TradeStatus } from '../types';
import { X, CheckCircle, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { formatNumber, formatAmount, formatPrice } from '../lib/format';

interface CloseTradeModalProps {
  trade: Trade;
  onConfirmClose: (
    tradeId: string, 
    exitPrice: number, 
    exitDate: string, 
    updatedStatus: TradeStatus,
    closedUsdToInrRate?: number
  ) => void;
  onClose: () => void;
}

export default function CloseTradeModal({ trade, onConfirmClose, onClose }: CloseTradeModalProps) {
  const [exitPrice, setExitPrice] = useState<string>('');
  const [exitDate, setExitDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [closedUsdToInrRate, setClosedUsdToInrRate] = useState<string>('83.24');

  const validateAndSetDecimal = (val: string, setter: (val: string) => void) => {
    const sanitized = val.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 4) {
      parts[1] = parts[1].slice(0, 4);
    }
    setter(parts.join('.'));
  };

  const priceLabel = trade.direction === 'Long' ? 'Sell/Exit Price' : 'Buy/Exit Price';
  const pricePlaceholder = trade.direction === 'Long' ? 'Enter Sell execution price' : 'Enter Buy execution price';

  const entryPrice = trade.direction === 'Long' ? trade.buyPrice : trade.sellPrice;
  const entryDate = trade.direction === 'Long' ? trade.buyDate : trade.sellDate;

  const currencySymbol = trade.currency === 'USD' ? '$' : '₹';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseFloat(exitPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      alert('Please enter a valid exit price.');
      return;
    }
    if (!exitDate) {
      alert('Please select a valid exit date.');
      return;
    }

    // Determine if closing week matches initiation week
    const initWeekInfo = getWeekInfo(trade.dateInitiated);
    const closeWeekInfo = getWeekInfo(exitDate);

    let finalStatus: TradeStatus = 'Closed';
    if (closeWeekInfo.weekKey > initWeekInfo.weekKey) {
      finalStatus = 'CarryForwardClosed';
    } else {
      finalStatus = 'Closed'; // closed same week
    }

    const manualExchangeRate = trade.currency === 'USD' ? parseFloat(closedUsdToInrRate) || 83.24 : undefined;

    onConfirmClose(trade.id, parsedPrice, exitDate, finalStatus, manualExchangeRate);
    onClose();
  };  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
      <div 
        id="close-trade-modal"
        className="bg-[#0b0f19] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl transition-all overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4.5">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[#f43f5e] shadow-md animate-pulse">
              <CheckCircle className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm text-white font-sans uppercase tracking-widest">
                Close Position
              </h3>
              <p className="text-[9px] text-[#f43f5e] font-bold font-mono uppercase tracking-widest">
                {trade.symbol} • {trade.instrument}
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
          {/* Reference Card */}
          <div className="bg-slate-950/80 border border-white/5 p-4 rounded-2xl grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="block text-[9px] uppercase font-black tracking-widest text-slate-400 mb-1 font-mono">
                {trade.direction === 'Long' ? 'Initiated Long At' : 'Initiated Short At'}
              </span>
              <span className="font-mono text-white font-black text-xs">
                {currencySymbol}{formatPrice(entryPrice)}
              </span>
            </div>
            <div>
              <span className="block text-[9px] uppercase font-black tracking-widest text-slate-400 mb-1 font-mono">
                Initiated Date
              </span>
              <span className="font-mono text-slate-305 font-bold text-xs">
                {entryDate}
              </span>
            </div>
          </div>

          {/* Exit price input */}
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
              {priceLabel}
            </label>
            <input
              id="exit-price-close-input"
              type="text"
              inputMode="decimal"
              required
              placeholder="0.00"
              value={exitPrice}
              onChange={e => validateAndSetDecimal(e.target.value, setExitPrice)}
              className="w-full bg-slate-950 border border-white/10 focus:border-[#f97316] transition rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-bold font-mono"
              autoFocus
            />
            <p className="text-[10px] text-slate-400 leading-snug font-medium">
              * Input Sell rate for Long position closing, or Buy rate for Short position closing.
            </p>
          </div>

          {/* Conditional Exchange Rate selector */}
          {trade.currency === 'USD' && (
            <div className="bg-slate-950/90 border border-white/5 p-4 rounded-2xl space-y-2">
              <label className="block text-[9px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block animate-pulse"></span>
                Closed USD/INR Exchange Rate
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder="e.g. 83.24"
                value={closedUsdToInrRate}
                onChange={e => validateAndSetDecimal(e.target.value, setClosedUsdToInrRate)}
                className="w-full bg-slate-900 border border-white/10 focus:border-orange-500 transition rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none font-mono"
              />
              <p className="text-[10px] text-slate-450 leading-normal font-bold">
                * Input USD to INR conversion rate to book the profit/loss in INR books.
              </p>
            </div>
          )}

          {/* Exit Date input */}
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
              Execution/Exit Date
            </label>
            <input
              id="exit-date-close-input"
              type="date"
              required
              value={exitDate}
              onChange={e => setExitDate(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 focus:border-[#f97316] transition rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-bold font-mono"
            />
          </div>

          <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5 text-slate-400 text-[10px] leading-relaxed font-mono font-bold uppercase tracking-wider">
            💡 System matches initiation date ({trade.dateInitiated}) and executes weekly roll-over lifecycles.
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
              id="confirm-close-btn"
              className="bg-[#f43f5e] hover:bg-[#rose-600] text-white px-6 py-2.5 rounded-xl text-xs font-black transition cursor-pointer font-mono uppercase tracking-wider shadow-lg shadow-rose-500/10"
            >
              Mark Closed
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
