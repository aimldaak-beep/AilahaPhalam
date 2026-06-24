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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'}}>
      <div
        id="check-pnl-modal"
        className="w-full max-w-md shadow-2xl transition-all overflow-hidden rounded-3xl"
        style={{background:'rgba(8,5,2,0.92)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',border:'1px solid rgba(201,168,76,0.2)',borderRadius:24}}
      >
        <div className="flex items-center justify-between px-6 py-4.5" style={{borderBottom:'1px solid rgba(201,168,76,0.08)'}}>
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl shadow-md" style={{background:'rgba(201,168,76,0.1)',border:'1px solid rgba(201,168,76,0.2)',color:'#C9A84C'}}>
              <RefreshCw className="w-5 h-5 animate-spin" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm font-sans uppercase tracking-widest" style={{color:'#F0E6C8'}}>
                Check Current PnL
              </h3>
              <p className="text-[9px] font-bold font-mono uppercase tracking-widest" style={{color:'rgba(240,230,200,0.5)'}}>
                {trade.symbol} • {trade.instrument}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="transition p-2 rounded-xl cursor-pointer"
            style={{color:'rgba(240,230,200,0.5)'}}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Reference Info */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl" style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.1)',borderRadius:16}}>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-widest mb-1 font-mono" style={{color:'rgba(240,230,200,0.5)'}}>
                {entryLabel}
              </span>
              <span className="font-black font-mono text-xs" style={{color:'#F0E6C8'}}>
                {currencySymbol}{formatPrice(initiatorPrice)}
              </span>
            </div>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-widest mb-1 font-mono" style={{color:'rgba(240,230,200,0.5)'}}>
                Lots & Multiplier
              </span>
              <span className="font-bold font-mono text-xs block" style={{color:'rgba(240,230,200,0.7)'}}>
                {trade.numberOfLots} Lots x {trade.lotSize}
              </span>
            </div>
          </div>

          {/* Current Trading Price Input */}
          <div className="space-y-1.5 animate-fade-in">
            <label className="block text-[9px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.55)'}}>
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
                className="w-full transition rounded-xl px-4 py-3 focus:outline-none font-mono text-sm"
                style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
                onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black font-mono select-none uppercase tracking-widest" style={{color:'rgba(201,168,76,0.6)'}}>
                {trade.currency}
              </div>
            </div>
          </div>

          {/* Evaluation Block */}
          {evaluation ? (
            <div
              className="p-4 rounded-2xl border transition-all duration-200 shadow-sm"
              style={
                evaluation.points >= 0
                  ? {background:'rgba(103,122,103,0.1)',border:'1px solid rgba(103,122,103,0.3)',color:'#677A67'}
                  : {background:'rgba(201,150,12,0.1)',border:'1px solid rgba(201,150,12,0.3)',color:'#C9960C'}
              }
            >
              <div className="flex items-center gap-1.5 pb-2.5 mb-3" style={{borderBottom:'1px solid rgba(201,168,76,0.08)'}}>
                {evaluation.points >= 0 ? (
                  <TrendingUp className="w-4 h-4 animate-pulse" style={{color:'#677A67'}} />
                ) : (
                  <TrendingDown className="w-4 h-4 animate-pulse" style={{color:'#C9960C'}} />
                )}
                <span className="text-[10px] font-black tracking-widest uppercase font-mono">
                  {evaluation.points >= 0 ? 'Estimated Advantage' : 'Estimated Deficit'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-y-3.5 gap-x-2 text-xs">
                <div>
                  <span className="block text-[9px] font-extrabold tracking-widest uppercase mb-1.5 font-mono" style={{color:'rgba(240,230,200,0.5)'}}>
                    PnL Points
                  </span>
                  <span className="font-mono font-black text-xs">
                    {evaluation.points >= 0 ? '+' : ''}
                    {formatAmount(evaluation.points, 3)} pt
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] font-extrabold tracking-widest uppercase mb-1.5 font-mono" style={{color:'rgba(240,230,200,0.5)'}}>
                    Gross PnL (INR)
                  </span>
                  <span className="font-mono font-black text-xs" style={{color:'#F0E6C8'}}>
                    {evaluation.grossProfit >= 0 ? '+' : ''}
                    ₹{formatAmount(evaluation.grossProfit)}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] font-extrabold tracking-widest uppercase mb-1.5 font-mono" style={{color:'rgba(240,230,200,0.5)'}}>
                    Double Brokerages
                  </span>
                  <span className="font-mono text-xs font-black" style={{color:'#C9960C'}}>
                    -₹{formatAmount(evaluation.estimatedBrokerage)}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] font-extrabold tracking-widest uppercase mb-1.5 font-mono" style={{color:'rgba(240,230,200,0.5)'}}>
                    Net Yield (INR Estimate)
                  </span>
                  <span
                    className="font-mono font-black text-sm block"
                    style={{color: evaluation.netProfit >= 0 ? '#677A67' : '#C9960C'}}
                  >
                    {evaluation.netProfit >= 0 ? '+' : ''}
                    ₹{formatAmount(evaluation.netProfit)}
                  </span>
                </div>
              </div>

              <div className="text-[9px] font-bold font-mono mt-3.5 leading-relaxed p-3 rounded-xl uppercase tracking-wider" style={{color:'rgba(240,230,200,0.35)',background:'rgba(4,2,0,0.95)',border:'1px solid rgba(201,168,76,0.08)'}}>
                ⚠️ Transients simulation block. Realized outcomes do not modify permanent ledgers.
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-2xl border border-dashed text-center text-xs font-medium leading-relaxed font-mono" style={{background:'rgba(4,2,0,0.6)',borderColor:'rgba(201,168,76,0.08)',color:'rgba(240,230,200,0.35)'}}>
              <Layers className="w-8 h-8 mx-auto mb-2.5 stroke-1" style={{color:'#C9A84C'}} />
              Enter current trade rate above to generate instant real-time profit and loss calculations.
            </div>
          )}

          {/* Close button */}
          <div className="flex justify-end pt-2" style={{borderTop:'1px solid rgba(201,168,76,0.08)'}}>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-black transition cursor-pointer font-mono uppercase tracking-wider"
              style={{background:'rgba(201,168,76,0.08)',border:'1px solid rgba(201,168,76,0.2)',color:'#C9A84C'}}
            >
              Done Checking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
