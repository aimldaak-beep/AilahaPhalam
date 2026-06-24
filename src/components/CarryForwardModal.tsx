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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)'}}>
      <div
        id="carry-forward-modal"
        className="w-full max-w-md shadow-2xl transition-all overflow-hidden rounded"
        style={{background:'rgba(8,5,2,0.92)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',border:'1px solid rgba(201,168,76,0.2)',borderRadius:24}}
      >
        <div className="flex items-center justify-between px-6 py-4.5" style={{borderBottom:'1px solid rgba(201,168,76,0.08)'}}>
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl shadow-md" style={{background:'rgba(201,168,76,0.1)',border:'1px solid rgba(201,168,76,0.2)',color:'#C9A84C'}}>
              <RefreshCw className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm font-sans uppercase tracking-widest" style={{color:'#F0E6C8'}}>
                Carry Forward Pos.
              </h3>
              <p className="text-[9px] font-bold font-mono uppercase tracking-widest" style={{color:'#C9A84C'}}>
                {trade.symbol} • {weekKey}
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Reference Info card */}
          <div className="p-4 rounded-lg grid grid-cols-2 gap-4 text-xs" style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.1)',borderRadius:16}}>
            <div>
              <span className="block text-[9px] uppercase font-black tracking-widest mb-1 font-mono" style={{color:'rgba(240,230,200,0.5)'}}>
                {trade.direction === 'Long' ? 'Buy Entry Price' : 'Sell Entry Price'}
              </span>
              <span className="font-mono font-black text-xs" style={{color:'#F0E6C8'}}>
                {currencySymbol}{formatPrice(entryPrice)}
              </span>
            </div>
            <div>
              <span className="block text-[9px] uppercase font-black tracking-widest mb-1 font-mono" style={{color:'rgba(240,230,200,0.5)'}}>
                Date Initiated
              </span>
              <span className="font-mono font-bold text-xs" style={{color:'rgba(240,230,200,0.7)'}}>
                {trade.dateInitiated}
              </span>
            </div>
          </div>

          {/* Friday Close Price Input */}
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.55)'}}>
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
              className="w-full transition rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-bold font-mono"
              style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
              onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
              onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
              autoFocus
            />
            <p className="text-[10px] leading-normal font-medium" style={{color:'rgba(240,230,200,0.5)'}}>
              * Input Friday EOD exchange-traded rate. This price sets the rollover reference for succeeding weeks.
            </p>
          </div>

          {/* USD to INR Exchange rate (if USD trade) */}
          {trade.currency === 'USD' && (
            <div className="p-4 rounded-lg space-y-2" style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.1)',borderRadius:16}}>
              <label className="block text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 font-mono" style={{color:'#C9A84C'}}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background:'#C9A84C'}}></span>
                Friday EOD USD/INR Exchange Rate
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder="e.g. 83.24"
                value={fridayExchangeRate}
                onChange={e => validateAndSetDecimal(e.target.value, setFridayExchangeRate)}
                className="w-full transition rounded-xl px-4 py-2.5 text-xs focus:outline-none font-mono font-bold"
                style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
                onFocus={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor='rgba(201,168,76,0.15)'}
              />
              <p className="text-[10px] leading-normal" style={{color:'rgba(240,230,200,0.5)'}}>
                * Specify the exchange rate used to book cumulative unrealized value on Friday EOD.
              </p>
            </div>
          )}

          <div className="p-4 rounded-lg text-[10px] leading-relaxed font-mono font-bold uppercase tracking-wider" style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.08)',borderRadius:16,color:'rgba(240,230,200,0.35)'}}>
            💡 Rolling positions forward retains them as open-position contracts into the subsequent active weeks.
          </div>

          {/* Submit/Cancel buttons */}
          <div className="flex gap-3 justify-end pt-4" style={{borderTop:'1px solid rgba(201,168,76,0.08)'}}>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-black transition cursor-pointer font-mono uppercase tracking-wider"
              style={{background:'rgba(201,168,76,0.08)',border:'1px solid rgba(201,168,76,0.2)',color:'#C9A84C'}}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-carry-forward-btn"
              className="px-6 py-2.5 rounded-xl text-xs font-black transition cursor-pointer font-mono uppercase tracking-wider shadow-lg"
              style={{background:'#C9A84C',color:'#1A1200',fontWeight:800}}
            >
              Rollover Position
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
