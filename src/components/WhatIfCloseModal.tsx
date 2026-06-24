/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Trade,
  TradeStatus,
  getWeekInfo,
  getWeeksBetween,
  calculateTradeForWeek,
} from '../types';
import { X, Calculator, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import { formatNumber, formatAmount, formatPrice } from '../lib/format';

interface WhatIfCloseModalProps {
  trade: Trade;
  onClose: () => void;
}

/**
 * READ-ONLY "what-if close" calculator for OPEN positions.
 *
 * It NEVER writes state, NEVER saves to Supabase, NEVER mutates the trade.
 * It builds a throwaway in-memory CLOSED clone of the trade — mirroring exactly the
 * field transform that handleConfirmCloseTrade (App.tsx) + CloseTradeModal apply on a
 * real close — and then runs that clone through the SAME ledger math the real close
 * would use: getWeeksBetween + calculateTradeForWeek summed across weeks. No new/parallel
 * PnL math is introduced, so the previewed number equals what a real close would book.
 */
export default function WhatIfCloseModal({ trade, onClose }: WhatIfCloseModalProps) {
  const todayStr = new Date().toISOString().split('T')[0];

  const [priceVal, setPriceVal] = useState<string>('');
  const [dateVal, setDateVal] = useState<string>(todayStr);
  const [rateVal, setRateVal] = useState<string>(
    trade.currency === 'USD' ? (trade.usdToInrRate?.toString() ?? '83.24') : '',
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

  const initiatorPrice = trade.direction === 'Long' ? trade.buyPrice : trade.sellPrice;
  const entryLabel = trade.direction === 'Long' ? 'Buy Entry Price' : 'Sell Entry Price';
  const priceLabel =
    trade.direction === 'Long' ? 'Hypothetical Sell / Exit Price' : 'Hypothetical Buy / Exit Price';
  const currencySymbol = trade.currency === 'USD' ? '$' : '₹';

  const preview = useMemo(() => {
    const price = parseFloat(priceVal);
    if (isNaN(price) || price <= 0) return null;

    const exitDate = dateVal || todayStr;
    const rate =
      trade.currency === 'USD'
        ? parseFloat(rateVal) || trade.usdToInrRate || 83.24
        : undefined;

    // ---- Build the hypothetical CLOSED clone (same transform as a real close) ----
    const initWeek = getWeekInfo(trade.dateInitiated).weekKey;
    const closeWeek = getWeekInfo(exitDate).weekKey;
    const hypoStatus: TradeStatus = closeWeek > initWeek ? 'CarryForwardClosed' : 'Closed';

    const hypothetical: Trade = {
      ...trade,
      status: hypoStatus,
      sellPrice: trade.direction === 'Long' ? price : trade.sellPrice,
      buyPrice: trade.direction === 'Long' ? trade.buyPrice : price,
      sellDate: trade.direction === 'Long' ? exitDate : trade.sellDate,
      buyDate: trade.direction === 'Long' ? trade.buyDate : exitDate,
      closedUsdToInrRate: trade.currency === 'USD' ? rate : trade.closedUsdToInrRate,
    };

    // ---- Compute via the SAME functions the ledger / real close use ----
    const endLimit = (hypothetical.direction === 'Long' ? hypothetical.sellDate : hypothetical.buyDate) || todayStr;
    const weeks = getWeeksBetween(hypothetical.dateInitiated, endLimit);

    let gross = 0;
    let brokerage = 0;
    let net = 0;
    const rows = weeks.map((w) => {
      const c = calculateTradeForWeek(hypothetical, w.weekKey);
      if (c.isActive) {
        gross += c.grossProfit;
        brokerage += c.brokerageDeducted;
        net += c.netProfit;
      }
      return {
        week: w.weekKey,
        role: c.role,
        open: c.openingPrice,
        close: c.closingPrice,
        net: c.isActive ? c.netProfit : 0,
        active: c.isActive,
      };
    });

    return { rows, gross, brokerage, net, hypoStatus };
  }, [priceVal, dateVal, rateVal, trade, todayStr]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
    >
      <div
        id="whatif-close-modal"
        className="w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{
          background: 'rgba(8,5,2,0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: 24,
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4.5 shrink-0"
          style={{ borderBottom: '1px solid rgba(201,168,76,0.08)' }}
        >
          <div className="flex items-center gap-3">
            <span
              className="p-2.5 rounded-xl shadow-md"
              style={{
                background: 'rgba(201,168,76,0.10)',
                border: '1px solid rgba(201,168,76,0.20)',
                color: '#C9A84C',
              }}
            >
              <Calculator className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm font-sans uppercase tracking-widest" style={{ color: '#F0E6C8' }}>
                What-If Close
              </h3>
              <p className="text-[9px] font-bold font-mono uppercase tracking-widest" style={{ color: '#C9A84C' }}>
                {trade.symbol} • {trade.instrument} • Preview only
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

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Preview-only banner */}
          <div
            className="text-[10px] font-black font-mono uppercase tracking-widest px-4 py-2.5 rounded-xl text-center"
            style={{
              background: 'rgba(201,168,76,0.05)',
              border: '1px solid rgba(201,168,76,0.20)',
              color: '#C9A84C',
            }}
          >
            Preview only — does not close the trade
          </div>

          {/* Entry reference */}
          <div
            className="grid grid-cols-2 gap-4 p-4 rounded-lg"
            style={{
              background: 'rgba(8,5,2,0.9)',
              border: '1px solid rgba(201,168,76,0.08)',
            }}
          >
            <div>
              <span
                className="block text-[9px] font-black uppercase tracking-widest mb-1 font-mono"
                style={{ color: 'rgba(240,230,200,0.5)' }}
              >
                {entryLabel}
              </span>
              <span className="font-black font-mono text-xs" style={{ color: '#F0E6C8' }}>
                {currencySymbol}
                {formatPrice(initiatorPrice)}
              </span>
            </div>
            <div>
              <span
                className="block text-[9px] font-black uppercase tracking-widest mb-1 font-mono"
                style={{ color: 'rgba(240,230,200,0.5)' }}
              >
                Lots & Multiplier
              </span>
              <span className="font-bold font-mono text-xs block" style={{ color: 'rgba(240,230,200,0.7)' }}>
                {trade.numberOfLots} Lots x {trade.lotSize} • {trade.direction}
              </span>
            </div>
          </div>

          {/* Hypothetical inputs */}
          <div className="space-y-1.5">
            <label
              className="block text-[9px] font-black uppercase tracking-widest font-mono"
              style={{ color: 'rgba(240,230,200,0.5)' }}
            >
              {priceLabel}
            </label>
            <div className="relative">
              <input
                id="whatif-price-input"
                type="text"
                inputMode="decimal"
                placeholder={`Enter a hypothetical ${trade.direction === 'Long' ? 'sell' : 'buy'} price`}
                value={priceVal}
                onChange={(e) => validateAndSetDecimal(e.target.value, setPriceVal)}
                autoFocus
                className="w-full rounded-xl px-4 py-3 focus:outline-none font-mono text-sm transition"
                style={{
                  background: 'rgba(201,168,76,0.04)',
                  border: '1px solid rgba(201,168,76,0.15)',
                  borderRadius: 12,
                  color: '#F0E6C8',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.45)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'; }}
              />
              <div
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black font-mono select-none uppercase tracking-widest"
                style={{ color: 'rgba(201,150,12,0.80)' }}
              >
                {trade.currency}
              </div>
            </div>
          </div>

          <div className={`grid ${trade.currency === 'USD' ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
            <div className="space-y-1.5">
              <label
                className="block text-[9px] font-black uppercase tracking-widest font-mono"
                style={{ color: 'rgba(240,230,200,0.5)' }}
              >
                Hypothetical Close Date
              </label>
              <input
                type="date"
                value={dateVal}
                onChange={(e) => setDateVal(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-bold font-mono transition"
                style={{
                  background: 'rgba(201,168,76,0.04)',
                  border: '1px solid rgba(201,168,76,0.15)',
                  borderRadius: 12,
                  color: '#F0E6C8',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.45)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'; }}
              />
            </div>
            {trade.currency === 'USD' && (
              <div className="space-y-1.5">
                <label
                  className="block text-[9px] font-black uppercase tracking-widest font-mono"
                  style={{ color: '#C9960C' }}
                >
                  Close USD/INR Rate
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 83.24"
                  value={rateVal}
                  onChange={(e) => validateAndSetDecimal(e.target.value, setRateVal)}
                  className="w-full rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-bold font-mono transition"
                  style={{
                    background: 'rgba(201,168,76,0.04)',
                    border: '1px solid rgba(201,168,76,0.15)',
                    borderRadius: 12,
                    color: '#F0E6C8',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(201,150,12,0.55)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'; }}
                />
              </div>
            )}
          </div>

          {/* Live evaluation */}
          {preview ? (
            <div
              className="p-4 rounded-lg border transition-all duration-200 shadow-sm"
              style={
                preview.net >= 0
                  ? { background: 'rgba(103,122,103,0.1)', border: '1px solid rgba(103,122,103,0.3)' }
                  : { background: 'rgba(201,150,12,0.1)', border: '1px solid rgba(201,150,12,0.3)' }
              }
            >
              <div
                className="flex items-center justify-between pb-2.5 mb-3"
                style={{ borderBottom: '1px solid rgba(201,168,76,0.08)' }}
              >
                <div className="flex items-center gap-1.5">
                  {preview.net >= 0 ? (
                    <TrendingUp className="w-4 h-4" style={{ color: '#677A67' }} />
                  ) : (
                    <TrendingDown className="w-4 h-4" style={{ color: '#C9960C' }} />
                  )}
                  <span
                    className="text-[10px] font-black tracking-widest uppercase font-mono"
                    style={{ color: '#F0E6C8' }}
                  >
                    If closed: {preview.net >= 0 ? 'Net Gain' : 'Net Loss'}
                  </span>
                </div>
                <span
                  className="text-[8px] font-black font-mono uppercase tracking-widest px-2 py-0.5 rounded"
                  style={{
                    color: '#C9A84C',
                    background: 'rgba(201,168,76,0.10)',
                    border: '1px solid rgba(201,168,76,0.20)',
                  }}
                >
                  {preview.hypoStatus === 'CarryForwardClosed' ? 'CF Closed' : 'Same-week'}
                </span>
              </div>

              {/* Per-week segmentation — shows week marking is applied, exactly like a real close */}
              {preview.rows.length > 1 && (
                <div className="mb-3 space-y-1">
                  {preview.rows.map((r) => (
                    <div key={r.week} className="flex items-center justify-between text-[10px] font-mono">
                      <span style={{ color: 'rgba(240,230,200,0.5)' }}>
                        {r.week} <span style={{ color: 'rgba(240,230,200,0.35)' }}>· {r.role}</span>
                      </span>
                      <span style={{ color: r.net >= 0 ? '#677A67' : '#C9960C' }}>
                        {r.net >= 0 ? '+' : ''}₹{formatAmount(r.net)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-y-3.5 gap-x-2 text-xs">
                <div>
                  <span
                    className="block text-[9px] font-extrabold tracking-widest uppercase mb-1.5 font-mono"
                    style={{ color: 'rgba(240,230,200,0.5)' }}
                  >
                    Gross PnL (INR)
                  </span>
                  <span className="font-mono font-black text-xs" style={{ color: '#F0E6C8' }}>
                    {preview.gross >= 0 ? '+' : ''}₹{formatAmount(preview.gross)}
                  </span>
                </div>
                <div>
                  <span
                    className="block text-[9px] font-extrabold tracking-widest uppercase mb-1.5 font-mono"
                    style={{ color: 'rgba(240,230,200,0.5)' }}
                  >
                    Brokerage (INR)
                  </span>
                  <span className="font-mono text-xs font-black" style={{ color: '#C9960C' }}>
                    -₹{formatAmount(preview.brokerage)}
                  </span>
                </div>
                <div className="col-span-2 pt-2.5" style={{ borderTop: '1px solid rgba(201,168,76,0.08)' }}>
                  <span
                    className="block text-[9px] font-extrabold tracking-widest uppercase mb-1.5 font-mono"
                    style={{ color: 'rgba(240,230,200,0.5)' }}
                  >
                    Net Yield if Closed (INR)
                  </span>
                  <span
                    className="font-mono font-black text-lg block"
                    style={{ color: preview.net >= 0 ? '#677A67' : '#C9960C' }}
                  >
                    {preview.net >= 0 ? '+' : ''}₹{formatAmount(preview.net)}
                  </span>
                </div>
              </div>

              <div
                className="text-[9px] font-bold font-mono mt-3.5 leading-relaxed p-3 rounded-xl uppercase tracking-wider"
                style={{
                  color: 'rgba(240,230,200,0.5)',
                  background: 'rgba(8,5,2,0.9)',
                  border: '1px solid rgba(201,168,76,0.08)',
                }}
              >
                ⚠️ Hypothetical only. The trade stays open — nothing is saved or modified.
              </div>
            </div>
          ) : (
            <div
              className="p-6 rounded-lg border border-dashed text-center text-xs font-medium leading-relaxed font-mono"
              style={{
                background: 'rgba(4,2,0,0.95)',
                borderColor: 'rgba(201,168,76,0.08)',
                color: 'rgba(240,230,200,0.5)',
              }}
            >
              <Layers className="w-8 h-8 mx-auto mb-2.5 stroke-1" style={{ color: '#C9A84C' }} />
              Enter a hypothetical closing price to preview the net PnL a real close would book.
            </div>
          )}

          <div className="flex justify-end pt-2" style={{ borderTop: '1px solid rgba(201,168,76,0.08)' }}>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-black transition cursor-pointer font-mono uppercase tracking-wider"
              style={{
                background: 'rgba(4,2,0,0.95)',
                border: '1px solid rgba(201,168,76,0.15)',
                color: '#F0E6C8',
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
