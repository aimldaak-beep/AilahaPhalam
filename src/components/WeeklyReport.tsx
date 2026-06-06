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
  getWeekKeyForClose
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
  Trash2
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

  return (
    <div className="space-y-6 text-slate-100">
      {/* Week Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#242f36] border border-white/10 rounded-3xl px-6 py-5 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="p-3 bg-[#bef264]/10 border border-[#bef264]/30 rounded-2xl text-[#bef264] shadow-md">
            <Calendar className="w-5 h-5 shrink-0 text-[#bef264]" />
          </span>
          <div>
            <h2 className="text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono">
              Selected Reporting Frame
            </h2>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-extrabold text-[#bef264] font-sans text-lg tracking-wide">
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
            className="bg-[#1e272d] border border-white/10 hover:border-[#bef264]/40 hover:text-[#bef264] text-slate-200 rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#bef264] transition cursor-pointer"
          >
            {sortedWeeks.map(w => (
              <option key={w.weekKey} value={w.weekKey} className="bg-[#1e272d] text-slate-200">
                Week {w.weekNum} ({w.weekRange.split(',')[0]})
              </option>
            ))}
          </select>

          {/* Navigation Arrows */}
          <div className="flex p-0.5 bg-[#1e272d] border border-white/10 rounded-xl">
            <button
              onClick={() => shiftWeek('prev')}
              disabled={currentWeekIndex <= 0}
              id="prev-week-btn"
              className="p-2 rounded-lg text-slate-400 hover:text-[#bef264] disabled:opacity-20 disabled:pointer-events-none transition cursor-pointer"
              title="Previous Week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="w-px bg-white/5 self-stretch my-1.5" />
            <button
              onClick={() => shiftWeek('next')}
              disabled={currentWeekIndex >= sortedWeeks.length - 1}
              id="next-week-btn"
              className="p-2 rounded-lg text-slate-400 hover:text-[#bef264] disabled:opacity-20 disabled:pointer-events-none transition cursor-pointer"
              title="Next Week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Saturday 10:00 AM Prompt Warning Banner */}
      {pendingSaturdayDemands.length > 0 && (
        <div id="saturday-closing-warning" className="bg-[#bef264]/5 border border-[#bef264]/20 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex gap-3.5">
            <div className="bg-[#bef264]/10 p-2.5 rounded-2xl text-[#bef264] border border-[#bef264]/20 shrink-0">
              <Clock className="w-5 h-5 text-[#bef264]" />
            </div>
            <div>
              <h4 className="font-extrabold text-[#bef264] text-xs uppercase tracking-widest font-mono">
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
                        className="w-full flex-1 bg-slate-905 border border-white/10 focus:border-orange-500 transition rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono"
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
                          className="w-20 bg-slate-905 border border-white/10 focus:border-orange-500 transition rounded-xl px-2.5 py-2 text-[11px] text-white focus:outline-none font-mono"
                          title="Exchange Rate e.g. 83.24"
                        />
                      )}
                    </div>
                    <button
                      onClick={() => handleFridayInputSave(trade.id, trade.currency === 'USD')}
                      className="bg-orange-500/20 hover:bg-orange-500/35 border border-orange-500/40 text-orange-400 px-4 py-2 rounded-xl text-xs font-black font-mono transition shrink-0 cursor-pointer shadow-md"
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
        <div id="weekly-net-card" className="bg-[#242f36] border border-white/10 rounded-3xl p-5 relative overflow-hidden shadow-lg backdrop-blur-sm">
          <div className="absolute right-4 top-4 bg-[#bef264]/10 text-[#bef264] p-2 border border-[#bef264]/20 rounded-xl shadow-md">
            <Calculator className="w-4 h-4 text-[#bef264]" />
          </div>
          <span className="block text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono font-bold">
            Weekly Net {savedOffsetAmount !== 0 ? 'Reconciled' : 'Realized'}
          </span>
          <span className={`block text-2xl font-black font-mono tracking-wide mt-3 ${
            adjustedWeeklyNet >= 0 ? 'text-[#bef264]' : 'text-rose-400'
          }`}>
            {adjustedWeeklyNet >= 0 ? '+' : ''}
            ₹{formatAmount(adjustedWeeklyNet)}
          </span>
          <div className="text-[10px] text-slate-300 font-mono mt-3.5 flex items-center gap-1.5 font-bold">
            <span className={`w-1.5 h-1.5 rounded-full ${adjustedWeeklyNet >= 0 ? 'bg-[#bef264]' : 'bg-rose-500'}`} />
            {savedOffsetAmount !== 0
              ? <>Calc ₹{formatAmount(weeklyNetSum)} {savedOffsetAmount >= 0 ? '+' : '−'} ₹{formatAmount(Math.abs(savedOffsetAmount))} offset</>
              : <>Net of Week {activeWeekInfo.weekNum}</>}
          </div>
        </div>

        {/* Weekly Gross PnL card */}
        <div id="weekly-gross-card" className="bg-[#242f36] border border-white/10 rounded-3xl p-5 relative overflow-hidden shadow-lg backdrop-blur-sm">
          <div className="absolute right-4 top-4 bg-[#bef264]/10 text-[#bef264] p-2 border border-[#bef264]/20 rounded-xl shadow-md">
            <SlidersHorizontal className="w-4 h-4 text-[#bef264]" />
          </div>
          <span className="block text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono font-bold">
            Weekly Gross Profit
          </span>
          <span className={`block text-2xl font-black font-mono tracking-wide mt-3 ${
            weeklyGrossSum >= 0 ? 'text-[#bef264]' : 'text-rose-400'
          }`}>
            {weeklyGrossSum >= 0 ? '+' : ''}
            ₹{formatAmount(weeklyGrossSum)}
          </span>
          <div className="text-[10px] text-slate-300 font-mono mt-3.5 flex items-center gap-1.5 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#bef264]" />
            Gross of Week {activeWeekInfo.weekNum}
          </div>
        </div>

        {/* Weekly Brokerage card */}
        <div id="weekly-brokerage-card" className="bg-[#242f36] border border-white/10 rounded-3xl p-5 relative overflow-hidden shadow-lg backdrop-blur-sm">
          <div className="absolute right-4 top-4 bg-[#bef264]/10 text-[#bef264] p-2 border border-[#bef264]/20 rounded-xl shadow-md">
            <Clock className="w-4 h-4 text-[#bef264]" />
          </div>
          <span className="block text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono font-bold">
            Commissions Deductions
          </span>
          <span className="block text-2xl font-black font-mono tracking-wide mt-3 text-rose-400">
            -₹{formatAmount(weeklyBrokerageSum)}
          </span>
          <div className="text-[10px] text-slate-300 font-mono mt-3.5 flex items-center gap-1.5 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Charges for Week {activeWeekInfo.weekNum}
          </div>
        </div>
      </div>

      {/* Per-week reconciliation offset editor */}
      <div id="week-offset-card" className="bg-[#242f36] border border-white/10 rounded-3xl p-5 shadow-lg backdrop-blur-sm space-y-4">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-[#bef264]/10 border border-[#bef264]/30 rounded-lg text-[#bef264]">
            <Scale className="w-4 h-4 text-[#bef264]" />
          </span>
          <span className="text-xs font-black text-[#bef264] uppercase tracking-widest font-mono">
            Broker Reconciliation — Week {activeWeekInfo.weekNum}
          </span>
        </div>

        {/* Calculated → Offset → Adjusted breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#1e272d] border border-white/10 rounded-2xl p-3.5">
            <span className="block text-[9px] text-slate-300 font-extrabold uppercase tracking-widest mb-1.5 font-mono">Calculated Net</span>
            <span className={`font-mono font-black text-sm ${weeklyNetSum >= 0 ? 'text-slate-100' : 'text-rose-400'}`}>
              {weeklyNetSum >= 0 ? '+' : ''}₹{formatAmount(weeklyNetSum)}
            </span>
          </div>
          <div className="bg-[#1e272d] border border-white/10 rounded-2xl p-3.5">
            <span className="block text-[9px] text-slate-300 font-extrabold uppercase tracking-widest mb-1.5 font-mono">Offset Applied</span>
            <span className={`font-mono font-black text-sm ${savedOffsetAmount === 0 ? 'text-slate-400' : savedOffsetAmount > 0 ? 'text-[#bef264]' : 'text-rose-400'}`}>
              {savedOffsetAmount > 0 ? '+' : ''}₹{formatAmount(savedOffsetAmount)}
            </span>
            {savedOffset?.note ? (
              <span className="block text-[9px] text-slate-400 font-mono mt-1 truncate" title={savedOffset.note}>“{savedOffset.note}”</span>
            ) : null}
          </div>
          <div className="bg-[#bef264]/5 border border-[#bef264]/30 rounded-2xl p-3.5">
            <span className="block text-[9px] text-[#bef264] font-extrabold uppercase tracking-widest mb-1.5 font-mono">Adjusted Total (Reconciled)</span>
            <span className={`font-mono font-black text-base ${adjustedWeeklyNet >= 0 ? 'text-[#bef264]' : 'text-rose-400'}`}>
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
              className="w-full bg-slate-950 border border-white/10 focus:border-[#bef264] transition rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-bold font-mono"
            />
          </div>
          <input
            id="offset-note-input"
            type="text"
            placeholder="Note — what the broker said / why it differs"
            value={offsetNoteInput}
            onChange={e => setOffsetNoteInput(e.target.value)}
            className="flex-1 bg-slate-950 border border-white/10 focus:border-[#bef264] transition rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-mono"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveOffsetClick}
              className="bg-[#bef264] hover:bg-[#a3e635] text-[#0b0f19] px-5 py-2.5 rounded-xl text-xs font-black font-mono uppercase tracking-wider transition cursor-pointer shadow-md active:scale-[0.98]"
            >
              Save
            </button>
            {savedOffset && (
              <button
                type="button"
                onClick={handleClearOffsetClick}
                className="bg-[#232b31] border border-white/10 hover:border-rose-500/40 text-slate-300 hover:text-rose-400 px-4 py-2.5 rounded-xl text-xs font-black font-mono uppercase tracking-wider transition cursor-pointer"
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

      {/* List of active trades in currently selected week */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1 px-1.5 bg-[#1e272d] border border-white/10 rounded-lg text-slate-300">
              <BookOpen className="w-4 h-4 text-[#bef264]" />
            </span>
            <span className="text-xs font-black text-[#bef264] uppercase tracking-widest font-mono font-bold">
              Weekly Activity Log ({activeTradesInWeek.length} Positions)
            </span>
          </div>
          <span className="text-[10px] text-slate-300 font-mono font-bold">
            TIMELINE SPAN of Week {activeWeekInfo.weekNum}
          </span>
        </div>

        {activeTradesInWeek.length === 0 ? (
          <div className="bg-[#242f36] border border-dashed border-white/10 p-12 rounded-3xl text-center shadow-lg">
            <Sliders className="w-10 h-10 text-[#bef264] mx-auto mb-4" />
            <p className="text-slate-300 text-sm font-bold">No recorded trades active for this week.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeTradesInWeek.map(({ trade, role, openingPrice, closingPrice, points, grossProfit, brokerageDeducted, netProfit, isMissingFridayClose }) => {
              const isClosedState = getIsClosedInOrBeforeWeek(trade, selectedWeekKey);
              
              // Map role badges nicely
              let roleBadge = '';
              let roleClass = '';
              switch (role) {
                case 'same-week-closed':
                  roleBadge = 'SAME WEEK CLOSED';
                  roleClass = 'bg-[#bef264]/10 border border-[#bef264]/30 text-[#bef264]';
                  break;
                case 'initiation':
                  roleBadge = 'INITIATED & ROLL CF';
                  roleClass = 'bg-[#bef264]/10 border border-[#bef264]/30 text-[#bef264]';
                  break;
                case 'closing':
                  roleBadge = 'CF CLOSED IN WEEK';
                  roleClass = 'bg-purple-500/10 border border-purple-500/30 text-purple-400';
                  break;
                case 'intermediate':
                  roleBadge = 'ROLOVER CARRY';
                  roleClass = 'bg-slate-800/80 border border-white/10 text-slate-300';
                  break;
              }

              return (
                <div 
                  key={trade.id} 
                  id={`weekly-trade-item-${trade.id}`}
                  className="bg-[#242f36] border border-white/10 rounded-3xl p-6 hover:border-[#bef264]/35 transition-all duration-200 space-y-4 shadow-xl relative overflow-hidden"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="font-extrabold text-white font-mono text-base tracking-wide">
                          {trade.symbol}
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold font-mono tracking-widest uppercase mt-1 leading-none">
                          {trade.instrument} • {trade.direction === 'Long' ? 'LONG' : 'SHORT'}
                        </span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-mono tracking-widest font-black leading-tight ${roleClass}`}>
                        {roleBadge}
                      </span>
                    </div>

                    {/* Action Panel: edit is always available; close/check/carry only while open */}
                    <div className="flex flex-wrap items-center gap-2">
                      {!isClosedState ? (
                        <>
                          {/* 1. Close Trade */}
                          <button
                            type="button"
                            onClick={() => onOpenCloseTrade(trade)}
                            className="bg-rose-500/10 border border-rose-500/30 hover:border-rose-500/50 text-rose-400 hover:bg-rose-500 hover:text-white px-3 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-md flex items-center gap-1 active:scale-[0.98]"
                          >
                            Close the Trade
                          </button>

                          {/* 2. Check current PnL */}
                          <button
                            type="button"
                            onClick={() => onOpenCheckPnL(trade)}
                            className="bg-amber-500/10 border border-amber-500/30 hover:border-[#bef264]/40 text-amber-400 hover:bg-amber-500 hover:text-[#0b0f19] px-3 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-md flex items-center gap-1 active:scale-[0.98]"
                          >
                            Check current PnL
                          </button>

                          {/* 2b. What-If Close (read-only preview) */}
                          <button
                            type="button"
                            title="What-if close calculator — preview only, does not close the trade"
                            onClick={() => onOpenWhatIf(trade)}
                            className="bg-[#1e272d] border border-white/10 hover:border-[#bef264]/50 text-slate-300 hover:text-[#bef264] px-3 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-md flex items-center gap-1.5 active:scale-[0.98]"
                          >
                            <Calculator className="w-3.5 h-3.5" />
                            What-If
                          </button>

                          {/* 3. Carry Forward */}
                          <button
                            type="button"
                            onClick={() => onOpenCarryForward(trade, selectedWeekKey)}
                            className="bg-[#bef264]/10 border border-[#bef264]/30 hover:border-[#bef264]/65 text-[#bef264] hover:bg-[#bef264] hover:text-[#0b0f19] px-3 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-md flex items-center gap-1 active:scale-[0.98]"
                          >
                            Carry Forward
                          </button>
                        </>
                      ) : (
                        <div className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl font-bold font-mono uppercase tracking-widest leading-none select-none">
                          ✓ Position Settled
                        </div>
                      )}

                      {/* Edit — works on open AND closed trades (correct FX, prices, dates, etc.) */}
                      <button
                        type="button"
                        title="Edit / correct this trade"
                        onClick={() => onOpenEditTrade(trade)}
                        className="bg-slate-800/80 border border-white/10 hover:border-[#bef264]/50 text-slate-300 hover:text-[#bef264] px-3 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-md flex items-center gap-1.5 active:scale-[0.98]"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>

                      {/* Delete — PIN protected (confirmation handled in App before it runs) */}
                      <button
                        type="button"
                        title="Delete this trade (PIN protected)"
                        onClick={() => onDeleteTrade(trade)}
                        className="bg-rose-500/10 border border-rose-500/30 hover:border-rose-500/60 text-rose-400 hover:bg-rose-500 hover:text-white px-3 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer shadow-md flex items-center gap-1.5 active:scale-[0.98]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Calculations Details Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 bg-[#1e272d] border border-white/10 p-4 rounded-2xl text-[11px] shadow-inner">
                    <div>
                      <span className="block text-[9px] text-slate-300 font-extrabold uppercase tracking-widest mb-1.5 font-mono">
                        Opening Rate (Mon)
                      </span>
                      <span className="font-mono text-[#bef264] font-bold text-xs">
                        {trade.currency === 'USD' ? '$' : '₹'}{formatAmount(openingPrice)}
                      </span>
                    </div>

                    <div>
                      <span className="block text-[9px] text-slate-300 font-extrabold uppercase tracking-widest mb-1.5 font-mono">
                        Closing Rate (Fri)
                      </span>
                      {isMissingFridayClose ? (
                        <span className="text-orange-400 font-mono font-black flex items-center gap-1 text-[10px]">
                          <AlertCircle className="w-3.5 h-3.5 text-[#bef264]" />
                          PENDING SATURDAY
                        </span>
                      ) : (
                        <span className="font-mono text-slate-100 font-bold text-xs">
                          {trade.currency === 'USD' ? '$' : '₹'}{formatAmount(closingPrice)}
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="block text-[9px] text-slate-300 font-extrabold uppercase tracking-widest mb-1.5 font-mono">
                        Points Earned
                      </span>
                      <span className={`font-mono font-bold text-xs ${points >= 0 ? 'text-[#bef264]' : 'text-rose-400'}`}>
                        {points >= 0 ? '+' : ''}{formatAmount(points, 3)}
                      </span>
                    </div>

                    <div>
                      <span className="block text-[9px] text-slate-300 font-extrabold uppercase tracking-widest mb-1.5 font-mono">
                        Gross Yield
                      </span>
                      <span className={`font-mono font-bold text-xs ${grossProfit >= 0 ? 'text-[#bef264]' : 'text-rose-400'}`}>
                        {grossProfit >= 0 ? '+' : ''}₹{formatAmount(grossProfit)}
                      </span>
                    </div>

                    <div>
                      <span className="block text-[9px] text-slate-300 font-extrabold uppercase tracking-widest mb-1.5 font-mono">
                        Charges Applied
                      </span>
                      <span className="font-mono text-xs text-rose-400 font-bold">
                        -₹{formatAmount(brokerageDeducted)}
                      </span>
                    </div>

                    <div>
                      <span className="block text-[9px] text-slate-300 font-extrabold uppercase tracking-widest mb-1.5 font-mono">
                        Net PnL
                      </span>
                      <span className={`font-mono font-black text-sm ${netProfit >= 0 ? 'text-[#bef264]' : 'text-rose-405'}`}>
                        {netProfit >= 0 ? '+' : ''}₹{formatAmount(netProfit)}
                      </span>
                    </div>
                  </div>

                  {/* Lot size detail */}
                  <div className="flex justify-between text-[9px] text-slate-450 font-mono px-1 font-bold tracking-wider uppercase">
                    <span>Lots count: {trade.numberOfLots} lots x {trade.lotSize} contract multiplier</span>
                    <span>Initiation Date: {trade.dateInitiated}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
