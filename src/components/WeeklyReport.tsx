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
    <div className="space-y-6" style={{
      width: '100%',
      minHeight: '100vh',
      padding: '20px 28px 40px',
      color: '#F0E6C8',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Week Selector Bar */}
      <div style={{
        position: 'sticky',
        top: 56,
        zIndex: 40,
        background: 'rgba(8,5,2,0.92)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(201,168,76,0.12)',
        padding: '10px 0',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <div className="flex items-center gap-3">
          <span className="p-3 rounded-lg shadow-md" style={{background:'rgba(201,168,76,0.1)',border:'1px solid rgba(201,168,76,0.3)',color:'#C9A84C'}}>
            <Calendar className="w-5 h-5 shrink-0" style={{color:'#C9A84C'}} />
          </span>
          <div>
            <h2 className="text-[9px] font-black uppercase tracking-widest font-mono" style={{color:'rgba(240,230,200,0.7)'}}>
              Selected Reporting Frame
            </h2>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-extrabold font-sans text-lg tracking-wide" style={{color:'#C9A84C'}}>
                Week {activeWeekInfo.weekNum}
              </span>
              <span className="text-[10px] font-mono" style={{color:'rgba(240,230,200,0.7)'}}>
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
            className="rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none transition cursor-pointer"
            style={{background:'rgba(5,3,1,0.95)',border:'1px solid rgba(201,168,76,0.15)',color:'#F0E6C8'}}
          >
            {sortedWeeks.map(w => (
              <option key={w.weekKey} value={w.weekKey} style={{background:'#0A0804',color:'#F0E6C8'}}>
                Week {w.weekNum} ({w.weekRange.split(',')[0]})
              </option>
            ))}
          </select>

          {/* Navigation Arrows */}
          <div className="flex p-0.5 rounded-xl" style={{background:'rgba(5,3,1,0.95)',border:'1px solid rgba(201,168,76,0.15)'}}>
            <button
              onClick={() => shiftWeek('prev')}
              disabled={currentWeekIndex <= 0}
              id="prev-week-btn"
              className="p-2 rounded-lg disabled:opacity-20 disabled:pointer-events-none transition cursor-pointer"
              style={{color:'rgba(240,230,200,0.5)'}}
              title="Previous Week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="w-px self-stretch my-1.5" style={{background:'rgba(201,168,76,0.08)'}} />
            <button
              onClick={() => shiftWeek('next')}
              disabled={currentWeekIndex >= sortedWeeks.length - 1}
              id="next-week-btn"
              className="p-2 rounded-lg disabled:opacity-20 disabled:pointer-events-none transition cursor-pointer"
              style={{color:'rgba(240,230,200,0.5)'}}
              title="Next Week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Saturday 10:00 AM Prompt Warning Banner */}
      {pendingSaturdayDemands.length > 0 && (
        <div id="saturday-closing-warning" className="rounded p-5 space-y-4 shadow-xl" style={{background:'rgba(201,168,76,0.05)',border:'1px solid rgba(201,168,76,0.2)'}}>
          <div className="flex gap-3.5">
            <div className="p-2.5 rounded-lg shrink-0" style={{background:'rgba(201,168,76,0.1)',border:'1px solid rgba(201,168,76,0.2)',color:'#C9A84C'}}>
              <Clock className="w-5 h-5" style={{color:'#C9A84C'}} />
            </div>
            <div>
              <h4 className="font-extrabold text-xs uppercase tracking-widest font-mono" style={{color:'#C9A84C'}}>
                Saturday 10:00 AM Closing Price Demanded
              </h4>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-1">
            {pendingSaturdayDemands.map(({ trade }) => {
              const entryPrice = trade.direction === 'Long' ? trade.buyPrice : trade.sellPrice;
              const currencySymbol = trade.currency === 'USD' ? '$' : '₹';
              return (
                <div key={trade.id} className="p-4 rounded-lg flex flex-col justify-between gap-3.5 shadow-md" style={{background:'rgba(4,2,0,0.95)',border:'1px solid rgba(201,168,76,0.08)'}}>
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-black font-mono text-sm tracking-wide" style={{color:'#F0E6C8'}}>
                        {trade.symbol}
                      </span>
                      <span className="block font-mono text-[9px] mt-0.5 font-bold tracking-wider" style={{color:'rgba(240,230,200,0.5)'}}>
                        {trade.instrument} • {trade.direction === 'Long' ? 'Long CF' : 'Short CF'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block font-mono font-bold text-[11px]" style={{color:'rgba(240,230,200,0.7)'}}>Entry: {currencySymbol}{formatNumber(entryPrice)}</span>
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
                        onFocus={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'; }}
                        className="w-full flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none font-mono"
                        style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
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
                          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'; }}
                          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'; }}
                          className="w-20 rounded-xl px-2.5 py-2 text-[11px] focus:outline-none font-mono"
                          style={{background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:12,color:'#F0E6C8'}}
                          title="Exchange Rate e.g. 83.24"
                        />
                      )}
                    </div>
                    <button
                      onClick={() => handleFridayInputSave(trade.id, trade.currency === 'USD')}
                      className="px-4 py-2 rounded-xl text-xs font-black font-mono transition shrink-0 cursor-pointer shadow-md"
                      style={{background:'rgba(201,150,12,0.2)',border:'1px solid rgba(201,150,12,0.4)',color:'#C9960C'}}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
        {/* Weekly Net PnL card */}
        <div id="weekly-net-card" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
          <Calculator className="w-4 h-4" style={{ position: 'absolute', right: 18, top: 18, color: 'rgba(201,168,76,0.4)' }} />
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.5)', marginBottom: 10 }}>
            Weekly Net {savedOffsetAmount !== 0 ? 'Reconciled' : 'Realized'}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1, fontFamily: "'DM Sans', sans-serif", color: adjustedWeeklyNet >= 0 ? '#677A67' : '#C9960C' }}>
            {adjustedWeeklyNet >= 0 ? '+' : ''}₹{formatAmount(adjustedWeeklyNet)}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(240,230,200,0.35)', marginTop: 6, letterSpacing: '1px' }}>
            {savedOffsetAmount !== 0
              ? <>Calc ₹{formatAmount(weeklyNetSum)} {savedOffsetAmount >= 0 ? '+' : '−'} ₹{formatAmount(Math.abs(savedOffsetAmount))} offset</>
              : <>Net of Week {activeWeekInfo.weekNum}</>}
          </div>
        </div>

        {/* Weekly Gross PnL card */}
        <div id="weekly-gross-card" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
          <SlidersHorizontal className="w-4 h-4" style={{ position: 'absolute', right: 18, top: 18, color: 'rgba(201,168,76,0.4)' }} />
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.5)', marginBottom: 10 }}>
            Weekly Gross Profit
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1, fontFamily: "'DM Sans', sans-serif", color: weeklyGrossSum >= 0 ? '#677A67' : '#C9960C' }}>
            {weeklyGrossSum >= 0 ? '+' : ''}₹{formatAmount(weeklyGrossSum)}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(240,230,200,0.35)', marginTop: 6, letterSpacing: '1px' }}>
            Gross of Week {activeWeekInfo.weekNum}
          </div>
        </div>

        {/* Weekly Brokerage card */}
        <div id="weekly-brokerage-card" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
          <Clock className="w-4 h-4" style={{ position: 'absolute', right: 18, top: 18, color: 'rgba(201,168,76,0.4)' }} />
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.5)', marginBottom: 10 }}>
            Commissions Deductions
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1, fontFamily: "'DM Sans', sans-serif", color: '#C9960C' }}>
            -₹{formatAmount(weeklyBrokerageSum)}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(240,230,200,0.35)', marginTop: 6, letterSpacing: '1px' }}>
            Charges for Week {activeWeekInfo.weekNum}
          </div>
        </div>
      </div>

      {/* Per-week reconciliation offset editor */}
      <div id="week-offset-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,168,76,0.12)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Scale className="w-3.5 h-3.5" style={{ color: '#C9A84C' }} />
          Broker Reconciliation — Week {activeWeekInfo.weekNum}
        </div>

        {/* Calculated → Offset → Adjusted breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          <div className="rounded-lg p-3.5" style={{background:'rgba(5,3,1,0.95)',border:'1px solid rgba(201,168,76,0.15)'}}>
            <span className="block text-[9px] font-extrabold uppercase tracking-widest mb-1.5 font-mono" style={{color:'rgba(240,230,200,0.7)'}}>Calculated Net</span>
            <span className="font-mono font-black text-sm" style={{color: weeklyNetSum >= 0 ? '#F0E6C8' : '#C9960C'}}>
              {weeklyNetSum >= 0 ? '+' : ''}₹{formatAmount(weeklyNetSum)}
            </span>
          </div>
          <div className="rounded-lg p-3.5" style={{background:'rgba(5,3,1,0.95)',border:'1px solid rgba(201,168,76,0.15)'}}>
            <span className="block text-[9px] font-extrabold uppercase tracking-widest mb-1.5 font-mono" style={{color:'rgba(240,230,200,0.7)'}}>Offset Applied</span>
            <span className="font-mono font-black text-sm" style={{color: savedOffsetAmount === 0 ? 'rgba(240,230,200,0.5)' : savedOffsetAmount > 0 ? '#677A67' : '#C9960C'}}>
              {savedOffsetAmount > 0 ? '+' : ''}₹{formatAmount(savedOffsetAmount)}
            </span>
            {savedOffset?.note ? (
              <span className="block text-[9px] font-mono mt-1 truncate" style={{color:'rgba(240,230,200,0.5)'}} title={savedOffset.note}>"{savedOffset.note}"</span>
            ) : null}
          </div>
          <div className="rounded-lg p-3.5" style={{background:'rgba(201,168,76,0.05)',border:'1px solid rgba(201,168,76,0.3)'}}>
            <span className="block text-[9px] font-extrabold uppercase tracking-widest mb-1.5 font-mono" style={{color:'#C9A84C'}}>Adjusted Total (Reconciled)</span>
            <span className="font-mono font-black text-base" style={{color: adjustedWeeklyNet >= 0 ? '#677A67' : '#C9960C'}}>
              {adjustedWeeklyNet >= 0 ? '+' : ''}₹{formatAmount(adjustedWeeklyNet)}
            </span>
          </div>
        </div>

        {/* Editor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, marginTop: 10 }}>
          <input
            id="offset-amount-input"
            type="text"
            inputMode="decimal"
            placeholder="Offset ± (INR)"
            value={offsetAmountInput}
            onChange={e => setOffsetAmountInput(sanitizeSigned(e.target.value))}
            style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(201,168,76,0.3)', color: '#F0E6C8', fontSize: 13, fontWeight: 600, padding: '4px 8px', outline: 'none', width: 120, fontFamily: "'DM Sans', sans-serif" }}
          />
          <input
            id="offset-note-input"
            type="text"
            placeholder="Note — what the broker said / why it differs"
            value={offsetNoteInput}
            onChange={e => setOffsetNoteInput(e.target.value)}
            style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(201,168,76,0.15)', color: 'rgba(240,230,200,0.6)', fontSize: 12, padding: '4px 8px', outline: 'none', flex: 1, fontFamily: "'DM Sans', sans-serif" }}
          />
          <button
            type="button"
            onClick={handleSaveOffsetClick}
            style={{ background: '#C9A84C', color: '#1A1200', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: '1px', fontFamily: "'DM Sans', sans-serif" }}
          >
            SAVE
          </button>
          {savedOffset && (
            <button
              type="button"
              onClick={handleClearOffsetClick}
              style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: 'rgba(240,230,200,0.7)', borderRadius: 6, padding: '6px 14px', fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: '1px', fontFamily: "'DM Sans', sans-serif" }}
            >
              CLEAR
            </button>
          )}
        </div>
        <p className="text-[9px] font-mono leading-relaxed" style={{color:'rgba(240,230,200,0.5)', marginTop: 10}}>
          Offset folds into this week's total only — it never changes the underlying trade/PnL math. Saved to your account and reloaded on login.
        </p>
      </div>

      {/* === ACTIVE POSITIONS — all open trades, any week (live blotter) === */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.5)', display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px 8px', borderBottom: '1px solid rgba(201,168,76,0.1)', marginBottom: 0, justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp className="w-3.5 h-3.5" style={{ color: '#C9A84C' }} />
            Active Positions ({openTrades.length})
          </span>
          <span style={{ color: 'rgba(240,230,200,0.35)', letterSpacing: '1px' }}>Live · all weeks</span>
        </div>

        {openTrades.length === 0 ? (
          <div className="border border-dashed p-8 rounded-lg text-center" style={{background:'rgba(12,8,3,0.9)',borderColor:'rgba(201,168,76,0.15)'}}>
            <p className="text-sm font-bold font-mono" style={{color:'rgba(240,230,200,0.5)'}}>No open positions.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg shadow-lg" style={{background:'rgba(12,8,3,0.9)',border:'1px solid rgba(201,168,76,0.25)'}}>
            <div style={{ minWidth: 900 }}>
              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px 130px 100px 1fr 130px 160px 170px', padding: '8px 20px', background: 'rgba(201,168,76,0.06)', borderBottom: '1px solid rgba(201,168,76,0.15)', gap: 8 }}>
                {['SYMBOL', 'TYPE', 'LOTS', 'ENTRY', 'ENTRY DATE', 'CURRENT PNL', 'ACTIONS'].map((h, i) => (
                  <div key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)', textAlign: i >= 5 ? 'right' : 'left' }}>{h}</div>
                ))}
              </div>
              {/* Data rows */}
              {openTrades.map((trade) => {
                const sym = trade.currency === 'USD' ? '$' : '₹';
                const entryPrice = trade.direction === 'Long' ? trade.buyPrice : trade.sellPrice;
                const { value: curPnl, live } = currentPnLForOpenTrade(trade);
                return (
                  <div key={trade.id} id={`active-trade-${trade.id}`} style={{ display: 'grid', gridTemplateColumns: '160px 130px 100px 1fr 130px 160px 170px', padding: '12px 20px', borderBottom: '1px solid rgba(201,168,76,0.06)', alignItems: 'center', gap: 8 }}>
                    <div className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: '#F0E6C8', letterSpacing: '0.3px' }}>{trade.symbol}</div>
                    <div>
                      <span className="font-mono" style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 4, letterSpacing: '1px', display: 'inline-block', ...(trade.direction === 'Long' ? { background: 'rgba(103,122,103,0.1)', color: '#677A67', border: '1px solid rgba(103,122,103,0.25)' } : { background: 'rgba(201,150,12,0.1)', color: '#C9960C', border: '1px solid rgba(201,150,12,0.25)' }) }}>
                        {trade.direction.toUpperCase()}
                      </span>
                      <span className="block font-mono mt-0.5" style={{ fontSize: 10, color: 'rgba(240,230,200,0.5)' }}>{trade.instrument}</span>
                    </div>
                    <div className="font-mono whitespace-nowrap" style={{ fontSize: 13, color: 'rgba(240,230,200,0.7)' }}>{trade.numberOfLots} × {trade.lotSize}</div>
                    <div className="font-mono whitespace-nowrap" style={{ fontSize: 13, fontWeight: 700, color: '#F0E6C8' }}>{sym}{formatPrice(entryPrice)}</div>
                    <div className="font-mono whitespace-nowrap" style={{ fontSize: 11, color: 'rgba(240,230,200,0.5)' }}>{trade.dateInitiated}</div>
                    <div className="font-mono" style={{ textAlign: 'right' }}>
                      {curPnl === null ? (
                        <span style={{ fontSize: 14, color: 'rgba(240,230,200,0.35)' }}>—</span>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 700, color: curPnl >= 0 ? '#677A67' : '#C9960C' }} title={live ? 'Live — from your entered current price' : 'Mark-to-date — last recorded weekly closes'}>
                          {curPnl >= 0 ? '+' : ''}₹{formatAmount(curPnl)}
                          <span className="block" style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(240,230,200,0.35)' }}>{live ? 'live' : 'to date'}</span>
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', paddingRight: 8 }}>
                      <button type="button" title="Close trade" onClick={() => onOpenCloseTrade(trade)} className="p-1 rounded-lg transition cursor-pointer active:scale-95" style={{background:'rgba(201,150,12,0.08)',border:'1px solid rgba(201,150,12,0.2)',color:'#C9960C'}}>
                        <Lock className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="Check current PnL" onClick={() => onOpenCheckPnL(trade)} className="p-1 rounded-lg transition cursor-pointer active:scale-95" style={{background:'rgba(201,150,12,0.08)',border:'1px solid rgba(201,150,12,0.2)',color:'#C9960C'}}>
                        <DollarSign className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="What-if close (preview only)" onClick={() => onOpenWhatIf(trade)} className="p-1 rounded-lg transition cursor-pointer active:scale-95" style={{background:'rgba(201,168,76,0.08)',border:'1px solid rgba(201,168,76,0.2)',color:'#C9A84C'}}>
                        <Calculator className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="Carry forward" onClick={() => onOpenCarryForward(trade, selectedWeekKey)} className="p-1 rounded-lg transition cursor-pointer active:scale-95" style={{background:'rgba(201,168,76,0.08)',border:'1px solid rgba(201,168,76,0.2)',color:'#C9A84C'}}>
                        <FastForward className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="Edit / correct" onClick={() => onOpenEditTrade(trade)} className="p-1 rounded-lg transition cursor-pointer active:scale-95" style={{background:'rgba(201,168,76,0.08)',border:'1px solid rgba(201,168,76,0.2)',color:'#C9A84C'}}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="Delete (PIN protected)" onClick={() => onDeleteTrade(trade)} className="p-1 rounded-lg transition cursor-pointer active:scale-95" style={{background:'rgba(201,150,12,0.08)',border:'1px solid rgba(201,150,12,0.2)',color:'#C9960C'}}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* === CLOSED / SETTLED TRADES — selected week === */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.5)', display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px 8px', borderBottom: '1px solid rgba(201,168,76,0.1)', marginBottom: 0, justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle className="w-3.5 h-3.5" style={{ color: '#677A67' }} />
            Closed Trades — Week {activeWeekInfo.weekNum} ({closedInWeek.length})
          </span>
          <span style={{ color: 'rgba(240,230,200,0.35)', letterSpacing: '1px' }}>Settled</span>
        </div>

        {closedInWeek.length === 0 ? (
          <div className="border border-dashed p-8 rounded-lg text-center" style={{background:'rgba(12,8,3,0.9)',borderColor:'rgba(201,168,76,0.15)'}}>
            <p className="text-sm font-bold font-mono" style={{color:'rgba(240,230,200,0.5)'}}>No settled trades for this week.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg shadow-lg" style={{background:'rgba(12,8,3,0.9)',border:'1px solid rgba(201,168,76,0.15)'}}>
            <div style={{ minWidth: 1010 }}>
              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px 130px 100px 140px 140px 120px 160px 80px', padding: '8px 20px', background: 'rgba(201,168,76,0.06)', borderBottom: '1px solid rgba(201,168,76,0.15)', gap: 8 }}>
                {['SYMBOL', 'TYPE', 'LOTS', 'ENTRY', 'CLOSE', 'EXIT DATE', 'NET PNL', 'ACTIONS'].map((h, i) => (
                  <div key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)', textAlign: i === 6 ? 'right' : i === 7 ? 'center' : 'left' }}>{h}</div>
                ))}
              </div>
              {/* Data rows */}
              {closedInWeek.map(({ trade }) => {
                const sym = trade.currency === 'USD' ? '$' : '₹';
                const entryPrice = trade.direction === 'Long' ? trade.buyPrice : trade.sellPrice;
                const exitPrice = trade.direction === 'Long' ? trade.sellPrice : trade.buyPrice;
                const exitDate = trade.direction === 'Long' ? trade.sellDate : trade.buyDate;
                const totNet = tradeTotalNet(trade);
                return (
                  <div key={trade.id} id={`closed-trade-${trade.id}`} style={{ display: 'grid', gridTemplateColumns: '160px 130px 100px 140px 140px 120px 160px 80px', padding: '12px 20px', borderBottom: '1px solid rgba(201,168,76,0.06)', alignItems: 'center', gap: 8 }}>
                    <div className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: '#F0E6C8', letterSpacing: '0.3px' }}>{trade.symbol}</div>
                    <div>
                      <span className="font-mono" style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 4, letterSpacing: '1px', display: 'inline-block', ...(trade.direction === 'Long' ? { background: 'rgba(103,122,103,0.1)', color: '#677A67', border: '1px solid rgba(103,122,103,0.25)' } : { background: 'rgba(201,150,12,0.1)', color: '#C9960C', border: '1px solid rgba(201,150,12,0.25)' }) }}>
                        {trade.direction.toUpperCase()}
                      </span>
                      <span className="block font-mono mt-0.5" style={{ fontSize: 10, color: 'rgba(240,230,200,0.5)' }}>{trade.instrument}</span>
                    </div>
                    <div className="font-mono whitespace-nowrap" style={{ fontSize: 13, color: 'rgba(240,230,200,0.7)' }}>{trade.numberOfLots} × {trade.lotSize}</div>
                    <div className="font-mono whitespace-nowrap" style={{ fontSize: 13, fontWeight: 700, color: '#F0E6C8' }}>{sym}{formatPrice(entryPrice)}</div>
                    <div className="font-mono whitespace-nowrap" style={{ fontSize: 13, fontWeight: 700, color: '#F0E6C8' }}>{sym}{formatPrice(exitPrice)}</div>
                    <div className="font-mono whitespace-nowrap" style={{ fontSize: 11, color: 'rgba(240,230,200,0.45)', letterSpacing: '0.3px' }}>{exitDate || '—'}</div>
                    <div className="font-mono" style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: totNet >= 0 ? '#677A67' : '#C9960C' }} title="Final realized net across the trade's life">
                        {totNet >= 0 ? '+' : ''}₹{formatAmount(totNet)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                      <button type="button" title="Edit / correct" onClick={() => onOpenEditTrade(trade)} className="p-1 rounded-lg transition cursor-pointer active:scale-95" style={{background:'rgba(201,168,76,0.08)',border:'1px solid rgba(201,168,76,0.2)',color:'#C9A84C'}}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="Delete (PIN protected)" onClick={() => onDeleteTrade(trade)} className="p-1 rounded-lg transition cursor-pointer active:scale-95" style={{background:'rgba(201,150,12,0.08)',border:'1px solid rgba(201,150,12,0.2)',color:'#C9960C'}}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
