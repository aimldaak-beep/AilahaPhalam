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
  const evaluation = !isNaN(userPrice) && userPrice > 0 ? estimateInstantPnL(trade, userPrice) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', overflowY: 'auto', padding: '40px 20px' }}>
      <div
        id="check-pnl-modal"
        style={{ width: '100%', maxWidth: 560, background: 'rgba(8,5,2,0.95)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 16, overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(201,168,76,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ padding: 10, borderRadius: 10, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#C9A84C', display: 'flex' }}>
              <RefreshCw style={{ width: 18, height: 18 }} className="animate-spin" />
            </span>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#F0E6C8', margin: 0, fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Check Current PnL
              </h3>
              <p style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(201,168,76,0.4)', margin: 0 }}>
                {trade.symbol} • {trade.instrument}
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
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Reference Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 16, borderRadius: 12, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,168,76,0.1)' }}>
            <div>
              <span style={{ display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: 4, color: 'rgba(240,230,200,0.55)', fontFamily: 'monospace' }}>
                {entryLabel}
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 12, color: '#F0E6C8' }}>
                {currencySymbol}{formatPrice(initiatorPrice)}
              </span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: 4, color: 'rgba(240,230,200,0.55)', fontFamily: 'monospace' }}>
                Lots &amp; Multiplier
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'rgba(240,230,200,0.7)', display: 'block' }}>
                {trade.numberOfLots} Lots x {trade.lotSize}
              </span>
            </div>
          </div>

          {/* Current Trading Price Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px', color: 'rgba(240,230,200,0.55)', fontFamily: 'monospace' }}>
              {trade.direction === 'Long' ? 'Enter temporary Sell value (to check current situation)' : 'Enter temporary Buy value (to check current situation)'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="current-price-pnl-input"
                type="text"
                inputMode="decimal"
                required
                placeholder={trade.direction === 'Long' ? 'Enter temporary Sell Price' : 'Enter temporary Buy Price'}
                value={currentVal}
                onChange={e => validateAndSetDecimal(e.target.value, setCurrentVal)}
                autoFocus
                style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, padding: '10px 14px', color: '#F0E6C8', fontSize: 13, outline: 'none', width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'}
              />
              <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 900, fontFamily: 'monospace', userSelect: 'none', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(201,168,76,0.6)' }}>
                {trade.currency}
              </div>
            </div>
          </div>

          {/* Evaluation Block */}
          {evaluation ? (
            <div
              style={
                evaluation.points >= 0
                  ? { padding: 16, borderRadius: 12, border: '1px solid rgba(103,122,103,0.3)', background: 'rgba(103,122,103,0.1)', color: '#677A67', transition: 'all 0.2s' }
                  : { padding: 16, borderRadius: 12, border: '1px solid rgba(201,150,12,0.3)', background: 'rgba(201,150,12,0.1)', color: '#C9960C', transition: 'all 0.2s' }
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 10, marginBottom: 12, borderBottom: '1px solid rgba(201,168,76,0.08)' }}>
                {evaluation.points >= 0 ? (
                  <TrendingUp style={{ width: 16, height: 16, color: '#677A67' }} className="animate-pulse" />
                ) : (
                  <TrendingDown style={{ width: 16, height: 16, color: '#C9960C' }} className="animate-pulse" />
                )}
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'monospace' }}>
                  {evaluation.points >= 0 ? 'Estimated Advantage' : 'Estimated Deficit'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 8px', fontSize: 12 }}>
                <div>
                  <span style={{ display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'monospace', color: 'rgba(240,230,200,0.5)' }}>
                    PnL Points
                  </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 12 }}>
                    {evaluation.points >= 0 ? '+' : ''}
                    {formatAmount(evaluation.points, 3)} pt
                  </span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'monospace', color: 'rgba(240,230,200,0.5)' }}>
                    Gross PnL (INR)
                  </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 12, color: '#F0E6C8' }}>
                    {evaluation.grossProfit >= 0 ? '+' : ''}
                    ₹{formatAmount(evaluation.grossProfit)}
                  </span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'monospace', color: 'rgba(240,230,200,0.5)' }}>
                    Double Brokerages
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 900, color: '#C9960C' }}>
                    -₹{formatAmount(evaluation.estimatedBrokerage)}
                  </span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'monospace', color: 'rgba(240,230,200,0.5)' }}>
                    Net Yield (INR Estimate)
                  </span>
                  <span
                    style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 14, display: 'block', color: evaluation.netProfit >= 0 ? '#677A67' : '#C9960C' }}
                  >
                    {evaluation.netProfit >= 0 ? '+' : ''}
                    ₹{formatAmount(evaluation.netProfit)}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace', marginTop: 14, lineHeight: 1.6, padding: 12, borderRadius: 8, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(240,230,200,0.35)', background: 'rgba(4,2,0,0.95)', border: '1px solid rgba(201,168,76,0.08)' }}>
                ⚠️ Transients simulation block. Realized outcomes do not modify permanent ledgers.
              </div>
            </div>
          ) : (
            <div style={{ padding: 24, borderRadius: 12, border: '1px dashed rgba(201,168,76,0.08)', textAlign: 'center', fontSize: 12, fontWeight: 500, lineHeight: 1.6, fontFamily: 'monospace', background: 'rgba(4,2,0,0.6)', color: 'rgba(240,230,200,0.35)' }}>
              <Layers style={{ width: 32, height: 32, margin: '0 auto 10px', strokeWidth: 1, color: '#C9A84C', display: 'block' }} />
              Enter current trade rate above to generate instant real-time profit and loss calculations.
            </div>
          )}

          {/* Close button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid rgba(201,168,76,0.1)' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, color: '#C9A84C', padding: '8px 20px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '1px', fontFamily: 'monospace', textTransform: 'uppercase' }}
            >
              Done Checking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
