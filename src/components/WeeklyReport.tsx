/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Trade,
  WeekInfo,
  calculateTradeForWeek,
  getWeeksBetween,
  getWeekInfo,
  getIsClosedInOrBeforeWeek,
  getWeekKeyForClose,
  estimateInstantPnL
} from '../types';
import type { WeekOffset } from '../lib/offsets';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Calculator, 
  DollarSign, 
  Sliders, 
  ArrowUpRight, 
  ArrowDownRight,
  Clock, 
  Lock, 
  BookOpen, 
  SlidersHorizontal,
  CheckCircle,
  HelpCircle,
  AlertCircle,
  Pencil,
  Scale,
  Trash2,
  FastForward
} from 'lucide-react';
import { formatNumber, formatAmount, formatPrice } from '../lib/format';

interface WeeklyReportProps {
  trades: Trade[];
  selectedWeekKey: string;
  onSelectWeek: (weekKey: string) => void;
  onUpdateFridayClosingPrice: (tradeId: string, weekKey: string, price: number, exchangeRate?: number) => void;
  onOpenCheckPnL: (trade: Trade) => void;
  onOpenCloseTrade: (trade: Trade) => void;
  onOpenCarryForward: (trade: Trade, weekKey: string) => void;
  onOpenEditTrade: (trade: Trade) => void;
  onOpenWhatIf: (trade: Trade) => void;
  onDeleteTrade: (trade: Trade) => void;
  weekOffsets: Record<string, WeekOffset>;
  onSaveOffset: (weekKey: string, amount: number, note: string) => void;
  onClearOffset: (weekKey: string) => void;
}

export default function WeeklyReport({
  trades,
  selectedWeekKey,
  onSelectWeek,
  onUpdateFridayClosingPrice,
  onOpenCheckPnL,
  onOpenCloseTrade,
  onOpenCarryForward,
  onOpenEditTrade,
  onOpenWhatIf,
  onDeleteTrade,
  weekOffsets,
  onSaveOffset,
  onClearOffset
}: WeeklyReportProps) {
  
  // 1. Gather all active week ranges represented by existing trades
  const todayStr = new Date().toISOString().split('T')[0];
  const allWeekSet = new Set<string>();
  
  // Always include the current week
  const currentWeekInfo = getWeekInfo(todayStr);
  allWeekSet.add(currentWeekInfo.weekKey);

  trades.forEach(trade => {
    const endLimitStr = trade.status === 'Closed' || trade.status === 'CarryForwardClosed'
      ? (trade.direction === 'Long' ? (trade.sellDate || todayStr) : (trade.buyDate || todayStr))
      : todayStr;

    const weeks = getWeeksBetween(trade.dateInitiated, endLimitStr);
    weeks.forEach(w => allWeekSet.add(w.weekKey));
  });

  const sortedWeeks = Array.from(allWeekSet).sort().map(key => {
    // Generate full Info object for each week key
    const parts = key.split('-W');
    const year = parseInt(parts[0]);
    const weekNum = parseInt(parts[1]);
    
    // Approximate a date in that week to get range
    const d = new Date(year, 0, 1 + (weekNum - 1) * 7);
    return getWeekInfo(d.toISOString().split('T')[0]);
  });

  const currentWeekIndex = sortedWeeks.findIndex(w => w.weekKey === selectedWeekKey);
  const activeWeekInfo = sortedWeeks[currentWeekIndex] || currentWeekInfo;

  // 2. Identify all trades active *during the currently selected week*
  interface TradeWithCalculations {
    trade: Trade;
    role: 'initiation' | 'intermediate' | 'closing' | 'same-week-closed';
    openingPrice: number;
    closingPrice: number;
    points: number;
    grossProfit: number;
    brokerageDeducted: number;
    netProfit: number;
    isMissingFridayClose: boolean;
  }

  const activeTradesInWeek: TradeWithCalculations[] = [];
  let weeklyGrossSum = 0;
  let weeklyBrokerageSum = 0;
  let weeklyNetSum = 0;

  trades.forEach(trade => {
    // Determine spans
    const endLimitStr = trade.status === 'Closed' || trade.status === 'CarryForwardClosed'
      ? (trade.direction === 'Long' ? (trade.sellDate || todayStr) : (trade.buyDate || todayStr))
      : todayStr;

    const weeks = getWeeksBetween(trade.dateInitiated, endLimitStr);
    const hasOverlap = weeks.some(w => w.weekKey === selectedWeekKey);

    if (hasOverlap) {
      const calc = calculateTradeForWeek(trade, selectedWeekKey);
      if (calc.isActive) {
        // Is this trade unclosed at the end of this selected week and missing the Friday closing price?
        const closeWeekKey = getWeekKeyForClose(trade);
        
        const isCurrentlyClosed = closeWeekKey ? closeWeekKey <= selectedWeekKey : false;
        const missingFridayClose = !isCurrentlyClosed && (trade.fridayClosingPrices[selectedWeekKey] === undefined || trade.fridayClosingPrices[selectedWeekKey] === null);

        activeTradesInWeek.push({
          trade,
          role: calc.role,
          openingPrice: calc.openingPrice,
          closingPrice: calc.closingPrice,
          points: calc.points,
          grossProfit: calc.grossProfit,
          brokerageDeducted: calc.brokerageDeducted,
          netProfit: calc.netProfit,
          isMissingFridayClose: missingFridayClose
        });

        weeklyGrossSum += calc.grossProfit;
        weeklyBrokerageSum += calc.brokerageDeducted;
        weeklyNetSum += calc.netProfit;
      }
    }
  });

  // Keep track of Saturday Price Demands list (trades overlapping target weeks requiring inputs)
  const pendingSaturdayDemands = activeTradesInWeek.filter(t => t.isMissingFridayClose);

  // Quick inputs state for Friday closing inputs inside the widget
  const [fridayCloseInputs, setFridayCloseInputs] = useState<Record<string, string>>({});
  const [usdToInrInputs, setUsdToInrInputs] = useState<Record<string, string>>({});

  // --- Per-week reconciliation offset (applied ON TOP of the calculated PnL) ---
  const savedOffset = weekOffsets[selectedWeekKey];
  const savedOffsetAmount = savedOffset?.amount ?? 0;
  const adjustedWeeklyNet = weeklyNetSum + savedOffsetAmount;

  const [offsetAmountInput, setOffsetAmountInput] = useState<string>('');
  const [offsetNoteInput, setOffsetNoteInput] = useState<string>('');

  // Show the selected week's saved offset in the editor; refresh when the week changes.
  useEffect(() => {
    const o = weekOffsets[selectedWeekKey];
    setOffsetAmountInput(o ? String(o.amount) : '');
    setOffsetNoteInput(o?.note ?? '');
  }, [selectedWeekKey, weekOffsets]);

  // Allow a single leading minus and one decimal point (offsets can be negative).
  const sanitizeSigned = (val: string): string => {
    let s = val.replace(/[^0-9.\-]/g, '').replace(/(?!^)-/g, '');
    const parts = s.split('.');
    if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');
    return s;
  };

  const handleSaveOffsetClick = () => {
    const parsed = parseFloat(offsetAmountInput);
    onSaveOffset(selectedWeekKey, isNaN(parsed) ? 0 : parsed, offsetNoteInput.trim());
  };

  const handleClearOffsetClick = () => {
    setOffsetAmountInput('');
    setOffsetNoteInput('');
    onClearOffset(selectedWeekKey);
  };

  const handleFridayInputSave = (tradeId: string, isUsd: boolean) => {
    const val = parseFloat(fridayCloseInputs[tradeId]);
    if (isNaN(val) || val <= 0) {
      alert('Please enter a valid closing price value.');
      return;
    }
    let exchangeRate: number | undefined = undefined;
    if (isUsd) {
      exchangeRate = parseFloat(usdToInrInputs[tradeId]);
      if (isNaN(exchangeRate) || exchangeRate <= 0) {
        alert('Please enter a valid USD to INR exchange rate.');
        return;
      }
    }
    onUpdateFridayClosingPrice(tradeId, selectedWeekKey, val, exchangeRate);
    // Clear input local state
    setFridayCloseInputs(prev => {
      const copy = { ...prev };
      delete copy[tradeId];
      return copy;
    });
    setUsdToInrInputs(prev => {
      const copy = { ...prev };
      delete copy[tradeId];
      return copy;
    });
  };

  const shiftWeek = (dir: 'prev' | 'next') => {
    if (dir === 'prev' && currentWeekIndex > 0) {
      onSelectWeek(sortedWeeks[currentWeekIndex - 1].weekKey);
    } else if (dir === 'next' && currentWeekIndex < sortedWeeks.length - 1) {
      onSelectWeek(sortedWeeks[currentWeekIndex + 1].weekKey);
    }
  };

  // ---- Blotter data (layout only — all numbers come from the existing PnL math) ----
  // Active table shows ALL open positions, regardless of the selected week.
  const openTrades = trades.filter(
    (t) => t.status === 'CarryForwardLong' || t.status === 'CarryForwardShort',
  );

  // Current PnL for an open position. Prefers a live entered price (estimateInstantPnL);
  // otherwise falls back to the last-known mark-to-date via calculateTradeForWeek. Never fabricated.
  const currentPnLForOpenTrade = (trade: Trade): { value: number | null; live: boolean } => {
    if (trade.currentTradingPrice != null && trade.currentTradingPrice > 0) {
      return { value: estimateInstantPnL(trade, trade.currentTradingPrice).netProfit, live: true };
    }
    let net = 0;
    let anyActive = false;
    getWeeksBetween(trade.dateInitiated, todayStr).forEach((w) => {
      const c = calculateTradeForWeek(trade, w.weekKey);
      if (c.isActive) {
        net += c.netProfit;
        anyActive = true;
      }
    });
    return { value: anyActive ? net : null, live: false };
  };

  // Final realized net across a trade's life (existing ledger math).
  const tradeTotalNet = (trade: Trade): number => {
    const end =
      trade.status === 'Closed' || trade.status === 'CarryForwardClosed'
        ? (trade.direction === 'Long' ? trade.sellDate || todayStr : trade.buyDate || todayStr)
        : todayStr;
    return getWeeksBetween(trade.dateInitiated, end).reduce((s, w) => {
      const c = calculateTradeForWeek(trade, w.weekKey);
      return c.isActive ? s + c.netProfit : s;
    }, 0);
  };

  // Closed/settled trades that were active during the selected week.
  const closedInWeek = activeTradesInWeek.filter((item) =>
    getIsClosedInOrBeforeWeek(item.trade, selectedWeekKey),
  );

  return (
    <div className="space-y-6 text-slate-100">
      {/* Week Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#222e42] border border-white/10 rounded-3xl px-6 py-5 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="p-3 bg-[#7fb3d5]/10 border border-[#7fb3d5]/30 rounded-2xl text-[#7fb3d5] shadow-md">
            <Calendar className="w-5 h-5 shrink-0 text-[#7fb3d5]" />
          </span>
          <div>
            <h2 className="text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono">
              Selected Reporting Frame
            </h2>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-extrabold text-[#7fb3d5] font-sans text-lg tracking-wide">
                Week {activeWeekInfo.weekNum}
              </span>
              <span className="text-[10px] text-slate-300 font-mono">
                ({activeWeekInfo.weekRange})
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Week Dropdown */}
          <select
            id="report-week-select"
            value={selectedWeekKey}
            onChange={e => onSelectWeek(e.target.value)}
            className="bg-[#172234] border border-white/10 hover:border-[#7fb3d5]/40 hover:text-[#7fb3d5] text-slate-200 rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#7fb3d5] transition cursor-pointer"
          >
            {sortedWeeks.map(w => (
              <option key={w.weekKey} value={w.weekKey} className="bg-[#172234] text-slate-200">
                Week {w.weekNum} ({w.weekRange.split(',')[0]})
              </option>
            ))}
          </select>

          {/* Navigation Arrows */}
          <div className="flex p-0.5 bg-[#172234] border border-white/10 rounded-xl">
            <button
              onClick={() => shiftWeek('prev')}
              disabled={currentWeekIndex <= 0}
              id="prev-week-btn"
              className="p-2 rounded-lg text-slate-400 hover:text-[#7fb3d5] disabled:opacity-20 disabled:pointer-events-none transition cursor-pointer"
              title="Previous Week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="w-px bg-white/5 self-stretch my-1.5" />
            <button
              onClick={() => shiftWeek('next')}
              disabled={currentWeekIndex >= sortedWeeks.length - 1}
              id="next-week-btn"
              className="p-2 rounded-lg text-slate-400 hover:text-[#7fb3d5] disabled:opacity-20 disabled:pointer-events-none transition cursor-pointer"
              title="Next Week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Saturday 10:00 AM Prompt Warning Banner */}
      {pendingSaturdayDemands.length > 0 && (
        <div id="saturday-closing-warning" className="bg-[#7fb3d5]/5 border border-[#7fb3d5]/20 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex gap-3.5">
            <div className="bg-[#7fb3d5]/10 p-2.5 rounded-2xl text-[#7fb3d5] border border-[#7fb3d5]/20 shrink-0">
              <Clock className="w-5 h-5 text-[#7fb3d5]" />
            </div>
            <div>
              <h4 className="font-extrabold text-[#7fb3d5] text-xs uppercase tracking-widest font-mono">
                Saturday 10:00 AM Closing Price Demanded
              </h4>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-1">
            {pendingSaturdayDemands.map(({ trade }) => {
              const entryPrice = trade.direction === 'Long' ? trade.buyPrice : trade.sellPrice;
              const currencySymbol = trade.currency === 'USD' ? '$' : '₹';
              return (
                <div key={trade.id} className="bg-slate-950/80 border border-white/5 p-4 rounded-2xl flex flex-col justify-between gap-3.5 shadow-md">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-black text-white font-mono text-sm tracking-wide">
                        {trade.symbol}
                      </span>
                      <span className="text-slate-400 block font-mono text-[9px] mt-0.5 font-bold tracking-wider">
                        {trade.instrument} • {trade.direction === 'Long' ? 'Long CF' : 'Short CF'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-300 block font-mono font-bold text-[11px]">Entry: {currencySymbol}{formatNumber(entryPrice)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 flex gap-2">
                       <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Friday close rate"
                        value={fridayCloseInputs[trade.id] || ''}
                        onChange={e => setFridayCloseInputs(prev => ({
                          ...prev,
                          [trade.id]: e.target.value
                        }))}
                        className="w-full flex-1 bg-slate-905 border border-white/10 focus:border-[#e8a04d] transition rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono"
                      />
                      {trade.currency === 'USD' && (
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Rate"
                          value={usdToInrInputs[trade.id] || ''}
                          onChange={e => setUsdToInrInputs(prev => ({
                            ...prev,
                            [trade.id]: e.target.value
                          }))}
                          className="w-20 bg-slate-905 border border-white/10 focus:border-[#e8a04d] transition rounded-xl px-2.5 py-2 text-[11px] text-white focus:outline-none font-mono"
                          title="Exchange Rate e.g. 83.24"
                        />
                      )}
                    </div>
                    <button
                      onClick={() => handleFridayInputSave(trade.id, trade.currency === 'USD')}
                      className="bg-[#e8a04d]/20 hover:bg-[#e8a04d]/35 border border-[#e8a04d]/40 text-[#e8a04d] px-4 py-2 rounded-xl text-xs font-black font-mono transition shrink-0 cursor-pointer shadow-md"
                    >
                      Save EOD
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly performance grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Weekly Net PnL card */}
        <div id="weekly-net-card" className="bg-[#222e42] border border-white/10 rounded-3xl p-5 relative overflow-hidden shadow-lg backdrop-blur-sm">
          <div className="absolute right-4 top-4 bg-[#7fb3d5]/10 text-[#7fb3d5] p-2 border border-[#7fb3d5]/20 rounded-xl shadow-md">
            <Calculator className="w-4 h-4 text-[#7fb3d5]" />
          </div>
          <span className="block text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono font-bold">
            Weekly Net {savedOffsetAmount !== 0 ? 'Reconciled' : 'Realized'}
          </span>
          <span className={`block text-2xl font-black font-mono tracking-wide mt-3 ${
            adjustedWeeklyNet >= 0 ? 'text-[#5dcaa5]' : 'text-[#e8a04d]'
          }`}>
            {adjustedWeeklyNet >= 0 ? '+' : ''}
            ₹{formatAmount(adjustedWeeklyNet)}
          </span>
          <div className="text-[10px] text-slate-300 font-mono mt-3.5 flex items-center gap-1.5 font-bold">
            <span className={`w-1.5 h-1.5 rounded-full ${adjustedWeeklyNet >= 0 ? 'bg-[#5dcaa5]' : 'bg-[#e8a04d]'}`} />
            {savedOffsetAmount !== 0
              ? <>Calc ₹{formatAmount(weeklyNetSum)} {savedOffsetAmount >= 0 ? '+' : '−'} ₹{formatAmount(Math.abs(savedOffsetAmount))} offset</>
              : <>Net of Week {activeWeekInfo.weekNum}</>}
          </div>
        </div>

        {/* Weekly Gross PnL card */}
        <div id="weekly-gross-card" className="bg-[#222e42] border border-white/10 rounded-3xl p-5 relative overflow-hidden shadow-lg backdrop-blur-sm">
          <div className="absolute right-4 top-4 bg-[#7fb3d5]/10 text-[#7fb3d5] p-2 border border-[#7fb3d5]/20 rounded-xl shadow-md">
            <SlidersHorizontal className="w-4 h-4 text-[#7fb3d5]" />
          </div>
          <span className="block text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono font-bold">
            Weekly Gross Profit
          </span>
          <span className={`block text-2xl font-black font-mono tracking-wide mt-3 ${
            weeklyGrossSum >= 0 ? 'text-[#5dcaa5]' : 'text-[#e8a04d]'
          }`}>
            {weeklyGrossSum >= 0 ? '+' : ''}
            ₹{formatAmount(weeklyGrossSum)}
          </span>
          <div className="text-[10px] text-slate-300 font-mono mt-3.5 flex items-center gap-1.5 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7fb3d5]" />
            Gross of Week {activeWeekInfo.weekNum}
          </div>
        </div>

        {/* Weekly Brokerage card */}
        <div id="weekly-brokerage-card" className="bg-[#222e42] border border-white/10 rounded-3xl p-5 relative overflow-hidden shadow-lg backdrop-blur-sm">
          <div className="absolute right-4 top-4 bg-[#7fb3d5]/10 text-[#7fb3d5] p-2 border border-[#7fb3d5]/20 rounded-xl shadow-md">
            <Clock className="w-4 h-4 text-[#7fb3d5]" />
          </div>
          <span className="block text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono font-bold">
            Commissions Deductions
          </span>
          <span className="block text-2xl font-black font-mono tracking-wide mt-3 text-[#e8a04d]">
            -₹{formatAmount(weeklyBrokerageSum)}
          </span>
          <div className="text-[10px] text-slate-300 font-mono mt-3.5 flex items-center gap-1.5 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e8a04d]" />
            Charges for Week {activeWeekInfo.weekNum}
          </div>
        </div>
      </div>

      {/* Per-week reconciliation offset editor */}
      <div id="week-offset-card" className="bg-[#222e42] border border-white/10 rounded-3xl p-5 shadow-lg backdrop-blur-sm space-y-4">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-[#7fb3d5]/10 border border-[#7fb3d5]/30 rounded-lg text-[#7fb3d5]">
            <Scale className="w-4 h-4 text-[#7fb3d5]" />
          </span>
          <span className="text-xs font-black text-[#7fb3d5] uppercase tracking-widest font-mono">
            Broker Reconciliation — Week {activeWeekInfo.weekNum}
          </span>
        </div>

        {/* Calculated → Offset → Adjusted breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#172234] border border-white/10 rounded-2xl p-3.5">
            <span className="block text-[9px] text-slate-300 font-extrabold uppercase tracking-widest mb-1.5 font-mono">Calculated Net</span>
            <span className={`font-mono font-black text-sm ${weeklyNetSum >= 0 ? 'text-slate-100' : 'text-[#e8a04d]'}`}>
              {weeklyNetSum >= 0 ? '+' : ''}₹{formatAmount(weeklyNetSum)}
            </span>
          </div>
          <div className="bg-[#172234] border border-white/10 rounded-2xl p-3.5">
            <span className="block text-[9px] text-slate-300 font-extrabold uppercase tracking-widest mb-1.5 font-mono">Offset Applied</span>
            <span className={`font-mono font-black text-sm ${savedOffsetAmount === 0 ? 'text-slate-400' : savedOffsetAmount > 0 ? 'text-[#5dcaa5]' : 'text-[#e8a04d]'}`}>
              {savedOffsetAmount > 0 ? '+' : ''}₹{formatAmount(savedOffsetAmount)}
            </span>
            {savedOffset?.note ? (
              <span className="block text-[9px] text-slate-400 font-mono mt-1 truncate" title={savedOffset.note}>“{savedOffset.note}”</span>
            ) : null}
          </div>
          <div className="bg-[#7fb3d5]/5 border border-[#7fb3d5]/30 rounded-2xl p-3.5">
            <span className="block text-[9px] text-[#7fb3d5] font-extrabold uppercase tracking-widest mb-1.5 font-mono">Adjusted Total (Reconciled)</span>
            <span className={`font-mono font-black text-base ${adjustedWeeklyNet >= 0 ? 'text-[#5dcaa5]' : 'text-[#e8a04d]'}`}>
              {adjustedWeeklyNet >= 0 ? '+' : ''}₹{formatAmount(adjustedWeeklyNet)}
            </span>
          </div>
        </div>

        {/* Editor */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
          <div className="sm:w-44">
            <input
              id="offset-amount-input"
              type="text"
              inputMode="decimal"
              placeholder="Offset ± (INR)"
              value={offsetAmountInput}
              onChange={e => setOffsetAmountInput(sanitizeSigned(e.target.value))}
              className="w-full bg-slate-950 border border-white/10 focus:border-[#7fb3d5] transition rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-bold font-mono"
            />
          </div>
          <input
            id="offset-note-input"
            type="text"
            placeholder="Note — what the broker said / why it differs"
            value={offsetNoteInput}
            onChange={e => setOffsetNoteInput(e.target.value)}
            className="flex-1 bg-slate-950 border border-white/10 focus:border-[#7fb3d5] transition rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-mono"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveOffsetClick}
              className="bg-[#7fb3d5] hover:bg-[#5f9fc8] text-[#161f2e] px-5 py-2.5 rounded-xl text-xs font-black font-mono uppercase tracking-wider transition cursor-pointer shadow-md active:scale-[0.98]"
            >
              Save
            </button>
            {savedOffset && (
              <button
                type="button"
                onClick={handleClearOffsetClick}
                className="bg-[#1e2a3d] border border-white/10 hover:border-[#e8a04d]/40 text-slate-300 hover:text-[#e8a04d] px-4 py-2.5 rounded-xl text-xs font-black font-mono uppercase tracking-wider transition cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <p className="text-[9px] text-slate-400 font-mono leading-relaxed">
          Offset folds into this week's total only — it never changes the underlying trade/PnL math. Saved to your account and reloaded on login.
        </p>
      </div>

      {/* === ACTIVE POSITIONS — all open trades, any week (live blotter) === */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-[#7fb3d5]/20 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#7fb3d5]/10 border border-[#7fb3d5]/30 rounded-lg text-[#7fb3d5]">
              <TrendingUp className="w-4 h-4 text-[#7fb3d5]" />
            </span>
            <span className="text-xs font-black text-[#7fb3d5] uppercase tracking-widest font-mono">
              Active Positions ({openTrades.length})
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Live · all weeks</span>
        </div>

        {openTrades.length === 0 ? (
          <div className="bg-[#222e42] border border-dashed border-white/10 p-8 rounded-2xl text-center">
            <p className="text-slate-400 text-sm font-bold font-mono">No open positions.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#7fb3d5]/25 bg-[#222e42] shadow-lg">
            <table className="w-full min-w-[820px] text-left border-collapse">
              <thead>
                <tr className="bg-[#172234] text-slate-300 uppercase text-[10px] font-mono tracking-widest border-b border-white/10">
                  <th className="py-2.5 px-4 font-black">Symbol</th>
                  <th className="py-2.5 px-3 font-black">Type</th>
                  <th className="py-2.5 px-3 font-black">Lots</th>
                  <th className="py-2.5 px-3 font-black text-right">Entry</th>
                  <th className="py-2.5 px-3 font-black">Entry Date</th>
                  <th className="py-2.5 px-3 font-black text-right">Current PnL</th>
                  <th className="py-2.5 px-4 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {openTrades.map((trade) => {
                  const sym = trade.currency === 'USD' ? '$' : '₹';
                  const entryPrice = trade.direction === 'Long' ? trade.buyPrice : trade.sellPrice;
                  const { value: curPnl, live } = currentPnLForOpenTrade(trade);
                  return (
                    <tr key={trade.id} id={`active-trade-${trade.id}`} className="hover:bg-white/5 transition">
                      <td className="py-2.5 px-4 font-mono font-extrabold text-white text-sm">{trade.symbol}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-black font-mono uppercase px-1.5 py-0.5 rounded ${trade.direction === 'Long' ? 'bg-[#5dcaa5]/10 text-[#5dcaa5] border border-[#5dcaa5]/25' : 'bg-[#e8a04d]/10 text-[#e8a04d] border border-[#e8a04d]/25'}`}>
                          {trade.direction}
                        </span>
                        <span className="block text-[10px] text-slate-400 font-mono mt-0.5">{trade.instrument}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-200 text-sm whitespace-nowrap">{trade.numberOfLots} × {trade.lotSize}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-100 text-sm text-right font-bold whitespace-nowrap">{sym}{formatPrice(entryPrice)}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-xs whitespace-nowrap">{trade.dateInitiated}</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {curPnl === null ? (
                          <span className="font-mono text-slate-500 text-sm">—</span>
                        ) : (
                          <span
                            className={`font-mono font-black text-sm ${curPnl >= 0 ? 'text-[#5dcaa5]' : 'text-[#e8a04d]'}`}
                            title={live ? 'Live — from your entered current price' : 'Mark-to-date — last recorded weekly closes'}
                          >
                            {curPnl >= 0 ? '+' : ''}₹{formatAmount(curPnl)}
                            <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wider">{live ? 'live' : 'to date'}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" title="Close trade" onClick={() => onOpenCloseTrade(trade)} className="p-1.5 rounded-lg bg-[#e8a04d]/10 border border-[#e8a04d]/30 text-[#e8a04d] hover:bg-[#e8a04d] hover:text-white transition cursor-pointer active:scale-95">
                            <Lock className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" title="Check current PnL" onClick={() => onOpenCheckPnL(trade)} className="p-1.5 rounded-lg bg-[#e8a04d]/10 border border-[#e8a04d]/30 text-[#e8a04d] hover:bg-[#e8a04d] hover:text-[#161f2e] transition cursor-pointer active:scale-95">
                            <DollarSign className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" title="What-if close (preview only)" onClick={() => onOpenWhatIf(trade)} className="p-1.5 rounded-lg bg-[#172234] border border-white/10 text-slate-300 hover:text-[#7fb3d5] hover:border-[#7fb3d5]/50 transition cursor-pointer active:scale-95">
                            <Calculator className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" title="Carry forward" onClick={() => onOpenCarryForward(trade, selectedWeekKey)} className="p-1.5 rounded-lg bg-[#7fb3d5]/10 border border-[#7fb3d5]/30 text-[#7fb3d5] hover:bg-[#7fb3d5] hover:text-[#161f2e] transition cursor-pointer active:scale-95">
                            <FastForward className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" title="Edit / correct" onClick={() => onOpenEditTrade(trade)} className="p-1.5 rounded-lg bg-slate-800/80 border border-white/10 text-slate-300 hover:text-[#7fb3d5] hover:border-[#7fb3d5]/50 transition cursor-pointer active:scale-95">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" title="Delete (PIN protected)" onClick={() => onDeleteTrade(trade)} className="p-1.5 rounded-lg bg-[#e8a04d]/10 border border-[#e8a04d]/30 text-[#e8a04d] hover:bg-[#e8a04d] hover:text-white transition cursor-pointer active:scale-95">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* === CLOSED / SETTLED TRADES — selected week === */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#172234] border border-white/10 rounded-lg text-slate-300">
              <CheckCircle className="w-4 h-4 text-[#5dcaa5]" />
            </span>
            <span className="text-xs font-black text-slate-200 uppercase tracking-widest font-mono">
              Closed Trades — Week {activeWeekInfo.weekNum} ({closedInWeek.length})
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Settled</span>
        </div>

        {closedInWeek.length === 0 ? (
          <div className="bg-[#222e42] border border-dashed border-white/10 p-8 rounded-2xl text-center">
            <p className="text-slate-400 text-sm font-bold font-mono">No settled trades for this week.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#222e42] shadow-lg">
            <table className="w-full min-w-[860px] text-left border-collapse">
              <thead>
                <tr className="bg-[#172234] text-slate-300 uppercase text-[10px] font-mono tracking-widest border-b border-white/10">
                  <th className="py-2.5 px-4 font-black">Symbol</th>
                  <th className="py-2.5 px-3 font-black">Type</th>
                  <th className="py-2.5 px-3 font-black">Lots</th>
                  <th className="py-2.5 px-3 font-black text-right">Entry</th>
                  <th className="py-2.5 px-3 font-black text-right">Close</th>
                  <th className="py-2.5 px-3 font-black">Exit Date</th>
                  <th className="py-2.5 px-3 font-black text-right">Net PnL</th>
                  <th className="py-2.5 px-4 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {closedInWeek.map(({ trade }) => {
                  const sym = trade.currency === 'USD' ? '$' : '₹';
                  const entryPrice = trade.direction === 'Long' ? trade.buyPrice : trade.sellPrice;
                  const exitPrice = trade.direction === 'Long' ? trade.sellPrice : trade.buyPrice;
                  const exitDate = trade.direction === 'Long' ? trade.sellDate : trade.buyDate;
                  const totNet = tradeTotalNet(trade);
                  return (
                    <tr key={trade.id} id={`closed-trade-${trade.id}`} className="hover:bg-white/5 transition">
                      <td className="py-2.5 px-4 font-mono font-extrabold text-white text-sm">{trade.symbol}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-black font-mono uppercase px-1.5 py-0.5 rounded ${trade.direction === 'Long' ? 'bg-[#5dcaa5]/10 text-[#5dcaa5] border border-[#5dcaa5]/25' : 'bg-[#e8a04d]/10 text-[#e8a04d] border border-[#e8a04d]/25'}`}>
                          {trade.direction}
                        </span>
                        <span className="block text-[10px] text-slate-400 font-mono mt-0.5">{trade.instrument}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-200 text-sm whitespace-nowrap">{trade.numberOfLots} × {trade.lotSize}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-100 text-sm text-right font-bold whitespace-nowrap">{sym}{formatPrice(entryPrice)}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-100 text-sm text-right font-bold whitespace-nowrap">{sym}{formatPrice(exitPrice)}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-xs whitespace-nowrap">{exitDate || '—'}</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span className={`font-mono font-black text-sm ${totNet >= 0 ? 'text-[#5dcaa5]' : 'text-[#e8a04d]'}`} title="Final realized net across the trade's life">
                          {totNet >= 0 ? '+' : ''}₹{formatAmount(totNet)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" title="Edit / correct" onClick={() => onOpenEditTrade(trade)} className="p-1.5 rounded-lg bg-slate-800/80 border border-white/10 text-slate-300 hover:text-[#7fb3d5] hover:border-[#7fb3d5]/50 transition cursor-pointer active:scale-95">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" title="Delete (PIN protected)" onClick={() => onDeleteTrade(trade)} className="p-1.5 rounded-lg bg-[#e8a04d]/10 border border-[#e8a04d]/30 text-[#e8a04d] hover:bg-[#e8a04d] hover:text-white transition cursor-pointer active:scale-95">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
