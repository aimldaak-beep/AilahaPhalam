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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', overflowY: 'auto', padding: '40px 20px' }}>
      <div
        id="carry-forward-modal"
        style={{ width: '100%', maxWidth: 560, background: 'rgba(8,5,2,0.95)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 16, overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(201,168,76,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ padding: 10, borderRadius: 10, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#C9A84C', display: 'flex' }}>
              <RefreshCw style={{ width: 18, height: 18 }} />
            </span>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#F0E6C8', margin: 0, fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Carry Forward Pos.
              </h3>
              <p style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(201,168,76,0.4)', margin: 0 }}>
                {trade.symbol} • {weekKey}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'rgba(240,230,200,0.5)', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center' }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Reference Info card */}
          <div style={{ padding: 16, borderRadius: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,168,76,0.1)' }}>
            <div>
              <span style={{ display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: 4, color: 'rgba(240,230,200,0.55)', fontFamily: 'monospace' }}>
                {trade.direction === 'Long' ? 'Buy Entry Price' : 'Sell Entry Price'}
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 12, color: '#F0E6C8' }}>
                {currencySymbol}{formatPrice(entryPrice)}
              </span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: 4, color: 'rgba(240,230,200,0.55)', fontFamily: 'monospace' }}>
                Date Initiated
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'rgba(240,230,200,0.7)' }}>
                {trade.dateInitiated}
              </span>
            </div>
          </div>

          {/* Friday Close Price Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', color: 'rgba(240,230,200,0.55)', fontFamily: 'monospace' }}>
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
              style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, padding: '10px 14px', color: '#F0E6C8', fontSize: 13, outline: 'none', width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }}
              onFocus={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'}
              autoFocus
            />
            <p style={{ fontSize: 10, color: 'rgba(240,230,200,0.45)', margin: 0, fontFamily: "'DM Sans', sans-serif" }}>
              * Input Friday EOD exchange-traded rate. This price sets the rollover reference for succeeding weeks.
            </p>
          </div>

          {/* USD to INR Exchange rate (if USD trade) */}
          {trade.currency === 'USD' && (
            <div style={{ padding: 16, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,168,76,0.1)' }}>
              <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', color: '#C9A84C', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C9A84C', display: 'inline-block' }}></span>
                Friday EOD USD/INR Exchange Rate
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder="e.g. 83.24"
                value={fridayExchangeRate}
                onChange={e => validateAndSetDecimal(e.target.value, setFridayExchangeRate)}
                style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, padding: '10px 14px', color: '#F0E6C8', fontSize: 13, outline: 'none', width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'}
              />
              <p style={{ fontSize: 10, color: 'rgba(240,230,200,0.45)', margin: 0, fontFamily: "'DM Sans', sans-serif" }}>
                * Specify the exchange rate used to book cumulative unrealized value on Friday EOD.
              </p>
            </div>
          )}

          <div style={{ padding: 16, borderRadius: 12, fontSize: 10, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,168,76,0.1)', color: 'rgba(240,230,200,0.35)' }}>
            💡 Rolling positions forward retains them as open-position contracts into the subsequent active weeks.
          </div>

          {/* Submit/Cancel buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid rgba(201,168,76,0.1)' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, color: '#C9A84C', padding: '8px 20px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '1px', fontFamily: 'monospace', textTransform: 'uppercase' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-carry-forward-btn"
              style={{ background: '#C9A84C', color: '#1A1200', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '1px', fontFamily: 'monospace', textTransform: 'uppercase' }}
            >
              Rollover Position
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
