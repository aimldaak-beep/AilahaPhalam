/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trade, calculateTradeForWeek, getWeeksBetween, exportToExcel } from '../types';
import { TrendingUp, TrendingDown, Landmark, Sparkles, Scale, BookOpen, Download } from 'lucide-react';
import { formatNumber, formatAmount, formatPrice } from '../lib/format';
import { WeekOffset, totalOffset } from '../lib/offsets';

interface CumulativeStatsProps {
  trades: Trade[];
  weekOffsets: Record<string, WeekOffset>;
}

export default function CumulativeStats({ trades, weekOffsets }: CumulativeStatsProps) {
  // Lifetime reconciliation offset — cumulative sum of every week's offset.
  const lifetimeOffset = totalOffset(weekOffsets);
  const offsetWeekCount = Object.keys(weekOffsets).length;
  // Let's compute consolidated cumulative metrics across all trades in their active weeks!
  let totalGrossProfit = 0;
  let totalBrokerage = 0;
  let totalNetProfit = 0;
  
  // Track overall trade-level stats:
  const totalTradesCount = trades.length;
  let winningTradesCount = 0;
  let losingTradesCount = 0;

  trades.forEach(trade => {
    const todayStr = new Date().toISOString().split('T')[0];
    const endLimitStr = trade.status === 'Closed' || trade.status === 'CarryForwardClosed'
      ? (trade.direction === 'Long' ? (trade.sellDate || todayStr) : (trade.buyDate || todayStr))
      : todayStr;

    const activeWeeks = getWeeksBetween(trade.dateInitiated, endLimitStr);
    
    let tradeGrossSum = 0;
    let tradeBrokerageSum = 0;

    activeWeeks.forEach(w => {
      const calc = calculateTradeForWeek(trade, w.weekKey);
      if (calc.isActive) {
        tradeGrossSum += calc.grossProfit;
        tradeBrokerageSum += calc.brokerageDeducted;
      }
    });

    totalGrossProfit += tradeGrossSum;
    totalBrokerage += tradeBrokerageSum;
    totalNetProfit += (tradeGrossSum - tradeBrokerageSum);

    const netTradePnL = tradeGrossSum - tradeBrokerageSum;
    if (netTradePnL > 0) {
      winningTradesCount++;
    } else if (netTradePnL < 0) {
      losingTradesCount++;
    }
  });

  const winRate = totalTradesCount > 0 ? (winningTradesCount / totalTradesCount) * 100 : 0;

  // Best trade / worst trade based on net weekly sum
  let bestTradeSymbol = '-';
  let bestTradeNet = 0;
  let worstTradeSymbol = '-';
  let worstTradeNet = 0;

  trades.forEach(trade => {
    const todayStr = new Date().toISOString().split('T')[0];
    const endLimitStr = trade.status === 'Closed' || trade.status === 'CarryForwardClosed'
      ? (trade.direction === 'Long' ? (trade.sellDate || todayStr) : (trade.buyDate || todayStr))
      : todayStr;

    const activeWeeks = getWeeksBetween(trade.dateInitiated, endLimitStr);
    const sumNet = activeWeeks.reduce((acc, w) => {
      const calc = calculateTradeForWeek(trade, w.weekKey);
      return acc + (calc.isActive ? calc.netProfit : 0);
    }, 0);

    if (sumNet > bestTradeNet) {
      bestTradeNet = sumNet;
      bestTradeSymbol = trade.symbol;
    }
    if (sumNet < worstTradeNet) {
      worstTradeNet = sumNet;
      worstTradeSymbol = trade.symbol;
    }
  });

  return (
    <div className="space-y-6 text-slate-100">
      {/* Title Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-[#222e42] border border-white/10 rounded-xl text-[#7fb3d5] shadow-xl">
            <Sparkles className="w-4 h-4 text-[#7fb3d5]" />
          </span>
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-200 font-mono">
            Cumulative Core Analytics Matrix
          </h2>
        </div>
        <button
          onClick={() => exportToExcel(trades)}
          className="bg-[#7fb3d5]/10 hover:bg-[#7fb3d5]/20 border border-[#7fb3d5]/30 text-[#7fb3d5] px-4 py-2 rounded-xl text-xs transition duration-200 flex items-center gap-1.5 cursor-pointer font-sans font-bold uppercase tracking-wider shadow-md"
        >
          <Download className="w-3.5 h-3.5 text-[#7fb3d5]" />
          Excel Ledger Raw Export
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Net Profit */}
        <div id="cum-net-profit" className="relative overflow-hidden bg-[#222e42] border border-white/10 rounded-3xl p-5 shadow-lg backdrop-blur-sm transition-all duration-200">
          <div className="absolute right-4 top-4 bg-[#7fb3d5]/10 border border-[#7fb3d5]/20 p-2 rounded-xl text-[#7fb3d5] shadow-md">
            <Landmark className="w-4 h-4 text-[#7fb3d5]" />
          </div>
          <span className="block text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono font-bold">
            Net Cumulative Yield
          </span>
          <span className={`block text-2xl font-black font-mono tracking-tight mt-3 ${
            totalNetProfit >= 0 ? 'text-[#5dcaa5]' : 'text-[#e8a04d]'
          }`}>
            {totalNetProfit >= 0 ? '+' : ''}
            ₹{formatAmount(totalNetProfit)}
          </span>
        </div>

        {/* Win Rate */}
        <div id="cum-win-rate" className="relative overflow-hidden bg-[#222e42] border border-white/10 rounded-3xl p-5 shadow-lg backdrop-blur-sm transition-all duration-200">
          <div className="absolute right-4 top-4 bg-[#7fb3d5]/10 border border-[#7fb3d5]/20 p-2 rounded-xl text-[#7fb3d5] shadow-md">
            <Scale className="w-4 h-4 text-[#7fb3d5]" />
          </div>
          <span className="block text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono font-bold">
            Consolidated Win Rate
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight mt-3 text-white">
            {formatAmount(winRate, 1)}%
          </span>
          <div className="mt-4 flex items-center gap-1.5 text-[9px] font-bold font-mono tracking-wider">
            <span className="bg-[#7fb3d5]/10 border border-[#7fb3d5]/30 text-[#7fb3d5] px-2 py-0.5 rounded-lg">
              {winningTradesCount} WON
            </span>
            <span className="bg-[#e8a04d]/15 border border-[#e8a04d]/30 text-[#e8a04d] px-2 py-0.5 rounded-lg">
              {losingTradesCount} LOST
            </span>
          </div>
        </div>

        {/* Gross Profit */}
        <div id="cum-gross-profit" className="relative overflow-hidden bg-[#222e42] border border-white/10 rounded-3xl p-5 shadow-lg backdrop-blur-sm transition-all duration-200">
          <div className="absolute right-4 top-4 bg-[#7fb3d5]/10 border border-[#7fb3d5]/20 p-2 rounded-xl text-[#7fb3d5] shadow-md">
            <TrendingUp className="w-4 h-4 text-[#7fb3d5]" />
          </div>
          <span className="block text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono font-bold">
            Gross Executed PnL
          </span>
          <span className={`block text-2xl font-black font-mono tracking-tight mt-3 ${
            totalGrossProfit >= 0 ? 'text-[#5dcaa5]' : 'text-[#e8a04d]'
          }`}>
            {totalGrossProfit >= 0 ? '+' : ''}
            ₹{formatAmount(totalGrossProfit)}
          </span>
        </div>

        {/* Total Brokerage */}
        <div id="cum-brokerage" className="relative overflow-hidden bg-[#222e42] border border-white/10 rounded-3xl p-5 shadow-lg backdrop-blur-sm transition-all duration-200">
          <div className="absolute right-4 top-4 bg-[#7fb3d5]/10 border border-[#7fb3d5]/20 p-2 rounded-xl text-[#7fb3d5] shadow-md">
            <TrendingDown className="w-4 h-4 text-[#7fb3d5]" />
          </div>
          <span className="block text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono font-bold">
            Total Brokerage Spent
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight mt-3 text-[#e8a04d] font-bold">
            -₹{formatAmount(totalBrokerage)}
          </span>
        </div>
      </div>

      {/* Total Offset Summary — lifetime running total of all weekly offsets */}
      <div id="cum-lifetime-offset" className="relative overflow-hidden bg-[#222e42] border border-[#7fb3d5]/25 rounded-3xl p-5 shadow-lg backdrop-blur-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="p-2.5 bg-[#7fb3d5]/10 border border-[#7fb3d5]/30 rounded-xl text-[#7fb3d5] shadow-md">
            <Scale className="w-5 h-5 text-[#7fb3d5]" />
          </span>
          <div>
            <span className="block text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono">
              Total Offset Summary (Lifetime)
            </span>
            <span className="block text-[9px] text-slate-400 font-mono mt-0.5">
              Cumulative broker reconciliation across {offsetWeekCount} {offsetWeekCount === 1 ? 'week' : 'weeks'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className={`block text-2xl font-black font-mono tracking-tight ${
            lifetimeOffset === 0 ? 'text-slate-300' : lifetimeOffset > 0 ? 'text-[#5dcaa5]' : 'text-[#e8a04d]'
          }`}>
            {lifetimeOffset > 0 ? '+' : ''}₹{formatAmount(lifetimeOffset)}
          </span>
          <span className="block text-[9px] text-slate-400 font-mono mt-1 uppercase tracking-wider">
            Net incl. offset: {totalNetProfit + lifetimeOffset >= 0 ? '+' : ''}₹{formatAmount(totalNetProfit + lifetimeOffset)}
          </span>
        </div>
      </div>

      {/* Secondary micro details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#222e42] border border-white/10 p-4 rounded-2xl flex items-center justify-between text-xs shadow-md">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#7fb3d5]" />
            <span className="text-slate-300 font-bold font-mono text-[10px] uppercase tracking-wider">Registered Ledgers</span>
          </div>
          <span className="font-bold text-white font-mono text-xs bg-[#172234] px-3 py-1.5 rounded-xl border border-white/10">
            {totalTradesCount.toString().padStart(2, '0')} contracts
          </span>
        </div>

        <div className="bg-[#222e42] border border-white/10 p-4 rounded-2xl flex items-center justify-between text-xs shadow-md">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#7fb3d5]" />
            <span className="text-slate-300 font-bold font-mono text-[10px] uppercase tracking-wider">Top Realized Trade</span>
          </div>
          <span className="font-extrabold text-[#7fb3d5] font-mono text-xs bg-[#7fb3d5]/10 px-3 py-1.5 rounded-xl border border-[#7fb3d5]/20">
            {bestTradeSymbol} {bestTradeNet > 0 ? `(+₹${formatAmount(bestTradeNet, 1)})` : ''}
          </span>
        </div>

        <div className="bg-[#222e42] border border-white/10 p-4 rounded-2xl flex items-center justify-between text-xs shadow-md">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-[#7fb3d5]" />
            <span className="text-slate-300 font-bold font-mono text-[10px] uppercase tracking-wider">Max Deficit Trade</span>
          </div>
          <span className="font-extrabold text-[#e8a04d] font-mono text-xs bg-[#e8a04d]/10 px-3 py-1.5 rounded-xl border border-[#e8a04d]/20">
            {worstTradeSymbol} {worstTradeNet < 0 ? `(-₹${formatAmount(Math.abs(worstTradeNet), 1)})` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
