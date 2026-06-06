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
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
      <div
        id="whatif-close-modal"
        className="bg-[#161f2e] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4.5 shrink-0">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-[#7fb3d5]/10 border border-[#7fb3d5]/20 rounded-xl text-[#7fb3d5] shadow-md">
              <Calculator className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm text-white font-sans uppercase tracking-widest">
                What-If Close
              </h3>
              <p className="text-[9px] text-[#7fb3d5] font-bold font-mono uppercase tracking-widest">
                {trade.symbol} • {trade.instrument} • Preview only
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

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Preview-only banner */}
          <div className="bg-[#7fb3d5]/5 border border-[#7fb3d5]/20 text-[#7fb3d5] text-[10px] font-black font-mono uppercase tracking-widest px-4 py-2.5 rounded-xl text-center">
            Preview only — does not close the trade
          </div>

          {/* Entry reference */}
          <div className="grid grid-cols-2 gap-4 bg-slate-950/80 p-4 rounded-2xl border border-white/5">
            <div>
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 font-mono">
                {entryLabel}
              </span>
              <span className="text-white font-black font-mono text-xs">
                {currencySymbol}
                {formatPrice(initiatorPrice)}
              </span>
            </div>
            <div>
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 font-mono">
                Lots & Multiplier
              </span>
              <span className="text-slate-300 font-bold font-mono text-xs block">
                {trade.numberOfLots} Lots x {trade.lotSize} • {trade.direction}
              </span>
            </div>
          </div>

          {/* Hypothetical inputs */}
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
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
                className="w-full bg-slate-950 border border-white/10 focus:border-[#7fb3d5] transition rounded-xl px-4 py-3 text-white focus:outline-none font-mono text-sm"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[#e8a04d]/80 text-[10px] font-black font-mono select-none uppercase tracking-widest">
                {trade.currency}
              </div>
            </div>
          </div>

          <div className={`grid ${trade.currency === 'USD' ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
                Hypothetical Close Date
              </label>
              <input
                type="date"
                value={dateVal}
                onChange={(e) => setDateVal(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 focus:border-[#7fb3d5] transition rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-bold font-mono"
              />
            </div>
            {trade.currency === 'USD' && (
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-[#e8a04d] uppercase tracking-widest font-mono">
                  Close USD/INR Rate
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 83.24"
                  value={rateVal}
                  onChange={(e) => validateAndSetDecimal(e.target.value, setRateVal)}
                  className="w-full bg-slate-950 border border-white/10 focus:border-[#e8a04d] transition rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-bold font-mono"
                />
              </div>
            )}
          </div>

          {/* Live evaluation */}
          {preview ? (
            <div
              className={`p-4 rounded-2xl border transition-all duration-200 shadow-sm ${
                preview.net >= 0
                  ? 'bg-[#5dcaa5]/10 border-[#5dcaa5]/30'
                  : 'bg-[#e8a04d]/10 border-[#e8a04d]/30'
              }`}
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-3">
                <div className="flex items-center gap-1.5">
                  {preview.net >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-[#5dcaa5]" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-[#e8a04d]" />
                  )}
                  <span className="text-[10px] font-black tracking-widest uppercase font-mono text-slate-200">
                    If closed: {preview.net >= 0 ? 'Net Gain' : 'Net Loss'}
                  </span>
                </div>
                <span className="text-[8px] font-black font-mono uppercase tracking-widest text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                  {preview.hypoStatus === 'CarryForwardClosed' ? 'CF Closed' : 'Same-week'}
                </span>
              </div>

              {/* Per-week segmentation — shows week marking is applied, exactly like a real close */}
              {preview.rows.length > 1 && (
                <div className="mb-3 space-y-1">
                  {preview.rows.map((r) => (
                    <div key={r.week} className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-400">
                        {r.week} <span className="text-slate-500">· {r.role}</span>
                      </span>
                      <span className={r.net >= 0 ? 'text-[#5dcaa5]' : 'text-[#e8a04d]'}>
                        {r.net >= 0 ? '+' : ''}₹{formatAmount(r.net)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-y-3.5 gap-x-2 text-xs">
                <div>
                  <span className="block text-[9px] text-slate-400 font-extrabold tracking-widest uppercase mb-1.5 font-mono">
                    Gross PnL (INR)
                  </span>
                  <span className="font-mono font-black text-xs text-white">
                    {preview.gross >= 0 ? '+' : ''}₹{formatAmount(preview.gross)}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 font-extrabold tracking-widest uppercase mb-1.5 font-mono">
                    Brokerage (INR)
                  </span>
                  <span className="font-mono text-[#e8a04d] text-xs font-black">
                    -₹{formatAmount(preview.brokerage)}
                  </span>
                </div>
                <div className="col-span-2 border-t border-white/5 pt-2.5">
                  <span className="block text-[9px] text-slate-400 font-extrabold tracking-widest uppercase mb-1.5 font-mono">
                    Net Yield if Closed (INR)
                  </span>
                  <span
                    className={`font-mono font-black text-lg block ${
                      preview.net >= 0 ? 'text-[#5dcaa5]' : 'text-[#e8a04d]'
                    }`}
                  >
                    {preview.net >= 0 ? '+' : ''}₹{formatAmount(preview.net)}
                  </span>
                </div>
              </div>

              <div className="text-[9px] text-slate-400 font-bold font-mono mt-3.5 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-white/5 uppercase tracking-wider">
                ⚠️ Hypothetical only. The trade stays open — nothing is saved or modified.
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/60 p-6 rounded-2xl border border-dashed border-white/5 text-center text-slate-400 text-xs font-medium leading-relaxed font-mono">
              <Layers className="w-8 h-8 text-[#7fb3d5] mx-auto mb-2.5 stroke-1" />
              Enter a hypothetical closing price to preview the net PnL a real close would book.
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-950 hover:bg-slate-900 border border-white/5 hover:border-white/10 text-slate-200 px-5 py-2.5 rounded-xl text-xs font-black transition cursor-pointer font-mono uppercase tracking-wider"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
