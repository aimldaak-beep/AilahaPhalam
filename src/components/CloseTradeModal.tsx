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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'}}>
      <div
        id="close-trade-modal"
        className="w-full max-w-lg shadow-2xl transition-all overflow-hidden rounded"
        style={{background:'rgba(8,5,2,0.92)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',border:'1px solid rgba(201,168,76,0.2)',borderRadius:24}}
      >
        <div className="flex items-center justify-between px-6 py-4.5" style={{borderBottom:'1px solid rgba(201,168,76,0.08)'}}>
          <div className="flex items-center gap-4">
            <span className="p-2.5 rounded-xl shadow-md animate-pulse" style={{background:'rgba(201,150,12,0.1)',border:'1px solid rgba(201,150,12,0.2)',color:'#C9960C'}}>
              <CheckCircle className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm font-sans uppercase tracking-widest" style={{color:'#F0E6C8'}}>
                Close Position
              </h3>
              <p className="text-[13px] font-bold font-mono uppercase tracking-widest" style={{color:'#C9960C'}}>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Reference Card */}
          <div className="p-4 rounded-lg grid grid-cols-2 gap-4 text-sm" style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.1)',borderRadius:16}}>
            <div>
              <span className="block text-[13px] uppercase font-black tracking-widest mb-1 font-mono" style={{color:'rgba(240,230,200,0.5)'}}>
                {trade.direction === 'Long' ? 'Initiated Long At' : 'Initiated Short At'}
              </span>
              <span className="font-mono font-black text-sm" style={{color:'#F0E6C8'}}>
                {currencySymbol}{formatPrice(entryPrice)}
              </span>
            </div>
            <div>
              <span className="block text-[13px] uppercase font-black tracking-widest mb-1 font-mono" style={{color:'rgba(240,230,200,0.5)'}}>
                Initiated Date
              </span>
              <span className="font-mono font-bold text-sm" style={{color:'rgba(240,230,200,0.7)'}}>
                {entryDate}
              </span>
            </div>
          </div>

          {/* Exit price input */}
          <div className="space-y-1.5">
            <label className="block text-[13px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.55)'}}>
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
              className="w-full transition rounded-xl px-3.5 py-3 text-base focus:outline-none font-bold font-mono"
              style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
              onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
              onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
              autoFocus
            />
            <p className="text-[12px] leading-snug font-medium" style={{color:'rgba(240,230,200,0.5)'}}>
              * Input Sell rate for Long position closing, or Buy rate for Short position closing.
            </p>
          </div>

          {/* Conditional Exchange Rate selector */}
          {trade.currency === 'USD' && (
            <div className="p-4 rounded-lg space-y-2" style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.1)',borderRadius:16}}>
              <label className="block text-[13px] font-black uppercase tracking-widest flex items-center gap-1.5 font-mono" style={{color:'#C9960C'}}>
                <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{background:'#C9960C'}}></span>
                Closed USD/INR Exchange Rate
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder="e.g. 83.24"
                value={closedUsdToInrRate}
                onChange={e => validateAndSetDecimal(e.target.value, setClosedUsdToInrRate)}
                className="w-full transition rounded-xl px-4 py-3 text-base focus:outline-none font-mono"
                style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
                onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
              />
              <p className="text-[12px] leading-normal font-bold" style={{color:'rgba(240,230,200,0.5)'}}>
                * Input USD to INR conversion rate to book the profit/loss in INR books.
              </p>
            </div>
          )}

          {/* Exit Date input */}
          <div className="space-y-1.5">
            <label className="block text-[13px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.55)'}}>
              Execution/Exit Date
            </label>
            <input
              id="exit-date-close-input"
              type="date"
              required
              value={exitDate}
              onChange={e => setExitDate(e.target.value)}
              className="w-full transition rounded-xl px-3.5 py-3 text-base focus:outline-none font-bold font-mono"
              style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
              onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
              onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
            />
          </div>

          <div className="p-4 rounded-lg text-[12px] leading-relaxed font-mono font-bold uppercase tracking-wider" style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.08)',borderRadius:16,color:'rgba(240,230,200,0.35)'}}>
            💡 System matches initiation date ({trade.dateInitiated}) and executes weekly roll-over lifecycles.
          </div>

          {/* Action buttons */}
          <div className="flex gap-4 justify-end pt-4" style={{borderTop:'1px solid rgba(201,168,76,0.08)'}}>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-xl text-sm font-black transition cursor-pointer font-mono uppercase tracking-wider"
              style={{background:'rgba(201,168,76,0.08)',border:'1px solid rgba(201,168,76,0.2)',color:'#C9A84C'}}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-close-btn"
              className="px-6 py-3 rounded-xl text-sm font-black transition cursor-pointer font-mono uppercase tracking-wider shadow-lg"
              style={{background:'#C9A84C',color:'#1A1200',fontWeight:800}}
            >
              Mark Closed
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
