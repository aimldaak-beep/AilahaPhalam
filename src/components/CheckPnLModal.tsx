/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Trade, estimateInstantPnL } from '../types';
import { X, TrendingUp, TrendingDown, RefreshCw, Layers } from 'lucide-react';
import { formatNumber, formatAmount, formatPrice } from '../lib/format';

interface CheckPnLModalProps {
  trade: Trade;
  onClose: () => void;
}

export default function CheckPnLModal({ trade, onClose }: CheckPnLModalProps) {
  const [currentVal, setCurrentVal] = useState<string>('');

  const validateAndSetDecimal = (val: string, setter: (val: string) => void) => {
    const sanitized = val.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 4) {
      parts[1] = parts[1].slice(0, 4);
    }
    setter(parts.join('.'));
  };
  
  // Determine standard reference price
  const initiatorPrice = trade.direction === 'Long' ? trade.buyPrice : trade.sellPrice;
  const entryLabel = trade.direction === 'Long' ? 'Buy Entry Price' : 'Sell Entry Price';

  const currencySymbol = trade.currency === 'USD' ? '$' : '₹';

  const userPrice = parseFloat(currentVal);
  const evaluation = !isNaN(userPrice) && userPrice > 0 ? estimateInstantPnL(trade, userPrice) : null;  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
      <div 
        id="check-pnl-modal"
        className="bg-[#161f2e] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl transition-all overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4.5">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-[#e8a04d]/10 border border-[#e8a04d]/20 rounded-xl text-[#e8a04d] shadow-md">
              <RefreshCw className="w-5 h-5 animate-spin text-[#cf8b3a]" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm text-white font-sans uppercase tracking-widest">
                Check Current PnL
              </h3>
              <p className="text-[9px] text-slate-400 font-bold font-mono uppercase tracking-widest">
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

        <div className="p-6 space-y-4">
          {/* Reference Info */}
          <div className="grid grid-cols-2 gap-4 bg-slate-950/80 p-4 rounded-2xl border border-white/5 text-slate-100">
            <div>
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 font-mono">
                {entryLabel}
              </span>
              <span className="text-white font-black font-mono text-xs">
                {currencySymbol}{formatPrice(initiatorPrice)}
              </span>
            </div>
            <div>
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 font-mono">
                Lots & Multiplier
              </span>
              <span className="text-slate-300 font-bold font-mono text-xs block">
                {trade.numberOfLots} Lots x {trade.lotSize}
              </span>
            </div>
          </div>

          {/* Current Trading Price Input */}
          <div className="space-y-1.5 animate-fade-in">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
              {trade.direction === 'Long' ? 'Enter temporary Sell value (to check current situation)' : 'Enter temporary Buy value (to check current situation)'}
            </label>
            <div className="relative">
              <input
                id="current-price-pnl-input"
                type="text"
                inputMode="decimal"
                required
                placeholder={trade.direction === 'Long' ? 'Enter temporary Sell Price' : 'Enter temporary Buy Price'}
                value={currentVal}
                onChange={e => validateAndSetDecimal(e.target.value, setCurrentVal)}
                autoFocus
                className="w-full bg-slate-950 border border-white/10 focus:border-[#7fb3d5] transition rounded-xl px-4 py-3 text-white focus:outline-none font-mono text-sm"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[#e8a04d]/80 text-[10px] font-black font-mono select-none uppercase tracking-widest">
                {trade.currency}
              </div>
            </div>
          </div>

          {/* Evaluation Block */}
          {evaluation ? (
            <div className={`p-4 rounded-2xl border transition-all duration-200 shadow-sm ${
              evaluation.points >= 0
                ? 'bg-[#5dcaa5]/10 border-[#5dcaa5]/30 text-[#5dcaa5]'
                : 'bg-[#e8a04d]/10 border-[#e8a04d]/30 text-[#e8a04d]'
            }`}>
              <div className="flex items-center gap-1.5 border-b border-white/5 pb-2.5 mb-3">
                {evaluation.points >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-[#5dcaa5] animate-pulse" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-[#e8a04d] animate-pulse" />
                )}
                <span className="text-[10px] font-black tracking-widest uppercase font-mono">
                  {evaluation.points >= 0 ? 'Estimated Advantage' : 'Estimated Deficit'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-y-3.5 gap-x-2 text-xs">
                <div>
                  <span className="block text-[9px] text-slate-400 font-extrabold tracking-widest uppercase mb-1.5 font-mono">
                    PnL Points
                  </span>
                  <span className="font-mono font-black text-xs">
                    {evaluation.points >= 0 ? '+' : ''}
                    {formatAmount(evaluation.points, 3)} pt
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 font-extrabold tracking-widest uppercase mb-1.5 font-mono">
                    Gross PnL (INR)
                  </span>
                  <span className="font-mono font-black text-xs text-white">
                    {evaluation.grossProfit >= 0 ? '+' : ''}
                    ₹{formatAmount(evaluation.grossProfit)}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 font-extrabold tracking-widest uppercase mb-1.5 font-mono">
                    Double Brokerages
                  </span>
                  <span className="font-mono text-[#e8a04d] text-xs font-black">
                    -₹{formatAmount(evaluation.estimatedBrokerage)}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 font-extrabold tracking-widest uppercase mb-1.5 font-mono">
                    Net Yield (INR Estimate)
                  </span>
                  <span className={`font-mono font-black text-sm block ${
                    evaluation.netProfit >= 0 ? 'text-[#5dcaa5]' : 'text-[#e8a04d]'
                  }`}>
                    {evaluation.netProfit >= 0 ? '+' : ''}
                    ₹{formatAmount(evaluation.netProfit)}
                  </span>
                </div>
              </div>

              <div className="text-[9px] text-slate-400 font-bold font-mono mt-3.5 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-white/5 uppercase tracking-wider">
                ⚠️ Transients simulation block. Realized outcomes do not modify permanent ledgers.
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/60 p-6 rounded-2xl border border-dashed border-white/5 text-center text-slate-400 text-xs font-medium leading-relaxed font-mono">
              <Layers className="w-8 h-8 text-[#e8a04d] mx-auto mb-2.5 stroke-1" />
              Enter current trade rate above to generate instant real-time profit and loss calculations.
            </div>
          )}

          {/* Close button */}
          <div className="flex justify-end pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-950 hover:bg-slate-900 border border-white/5 hover:border-white/10 text-slate-200 px-5 py-2.5 rounded-xl text-xs font-black transition cursor-pointer font-mono uppercase tracking-wider"
            >
              Done Checking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
