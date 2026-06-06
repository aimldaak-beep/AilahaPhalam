/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trade, calculateTradeForWeek, getWeeksBetween } from '../types';
import { Sparkles, TrendingUp, TrendingDown, Landmark, Scale, Target, Compass, Award } from 'lucide-react';
import { formatNumber, formatAmount, formatPrice } from '../lib/format';

interface InstrumentSummaryProps {
  trades: Trade[];
}

interface GroupStats {
  name: string;
  instruments: string[];
  colorClass: string;
  icon: React.ReactNode;
  totalTrades: number;
  totalNetProfit: number;
  totalGrossProfit: number;
  totalBrokerage: number;
  winningTrades: number;
  losingTrades: number;
  symbols: string[];
}

export default function InstrumentSummary({ trades }: InstrumentSummaryProps) {
  // Compute consolidated metrics across all trades
  let totalOverallTrades = trades.length;
  let totalOverallNetProfit = 0;
  let overallWinningTradesCount = 0;

  // Let's compute net profit for each trade to do groupings correctly
  const tradeWithPnL = trades.map(trade => {
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

    const netTradePnL = tradeGrossSum - tradeBrokerageSum;
    
    return {
      trade,
      netPnL: netTradePnL,
      grossPnL: tradeGrossSum,
      brokerage: tradeBrokerageSum
    };
  });

  // Calculate overall tallies
  tradeWithPnL.forEach(item => {
    totalOverallNetProfit += item.netPnL;
    if (item.netPnL > 0) {
      overallWinningTradesCount++;
    }
  });

  const overallWinRate = totalOverallTrades > 0 ? (overallWinningTradesCount / totalOverallTrades) * 100 : 0;

  // Group Definitions based on the user's explicit categories:
  // "club all dow together"
  // "club all gift nifty together"
  // "club NSE Futures together"
  // "Club Options Together"
  // "NSE Futures and NSE Options as instrument type should be included"
  const groupsConfig = [
    {
      name: "NSE Futures",
      match: (t: Trade) => t.instrument === 'Futures' || t.instrument === 'NSE Futures',
      colorClass: "bg-teal-500/10 border-teal-505/35 text-teal-400 bg-[#143235] hover:bg-[#1a3d41]",
      icon: <TrendingUp className="w-5 h-5 text-teal-400" />
    },
    {
      name: "NSE & Global Options",
      match: (t: Trade) => t.instrument === 'Option' || t.instrument === 'NSE Options',
      colorClass: "bg-fuchsia-500/10 border-fuchsia-505/35 text-fuchsia-400 bg-[#351a3a] hover:bg-[#422149]",
      icon: <Award className="w-5 h-5 text-fuchsia-400" />
    },
    {
      name: "GIFT Nifty",
      match: (t: Trade) => t.instrument === 'Gift Nifty',
      colorClass: "bg-amber-500/10 border-amber-505/35 text-amber-400 bg-[#3a2c14] hover:bg-[#47371a]",
      icon: <Target className="w-5 h-5 text-amber-400" />
    },
    {
      name: "DOW Conglomerate",
      match: (t: Trade) => t.instrument === 'DOW',
      colorClass: "bg-blue-500/10 border-blue-505/35 text-blue-400 bg-[#162744] hover:bg-[#1b2f51]",
      icon: <Landmark className="w-5 h-5 text-blue-400" />
    },
    {
      name: "Global Indices & Commodities",
      match: (t: Trade) => ['Nasdaq', 'Nikkei', 'SnP', 'NG'].includes(t.instrument),
      colorClass: "bg-slate-500/10 border-slate-505/35 text-slate-300 bg-[#252f36] hover:bg-[#2d3a42]",
      icon: <Compass className="w-5 h-5 text-slate-300" />
    }
  ];

  const groupStatsList: GroupStats[] = groupsConfig.map(cfg => {
    const matchedItems = tradeWithPnL.filter(item => cfg.match(item.trade));
    const symbolsSet = new Set<string>();
    matchedItems.forEach(item => symbolsSet.add(item.trade.symbol));

    let totalNetProfit = 0;
    let totalGrossProfit = 0;
    let totalBrokerage = 0;
    let winningTrades = 0;
    let losingTrades = 0;

    matchedItems.forEach(item => {
      totalNetProfit += item.netPnL;
      totalGrossProfit += item.grossPnL;
      totalBrokerage += item.brokerage;
      
      if (item.netPnL > 0) {
        winningTrades++;
      } else if (item.netPnL < 0) {
        losingTrades++;
      }
    });

    return {
      name: cfg.name,
      instruments: Array.from(new Set(matchedItems.map(item => item.trade.instrument))),
      colorClass: cfg.colorClass,
      icon: cfg.icon,
      totalTrades: matchedItems.length,
      totalNetProfit,
      totalGrossProfit,
      totalBrokerage,
      winningTrades,
      losingTrades,
      symbols: Array.from(symbolsSet)
    };
  });

  return (
    <div className="space-y-6 text-slate-100">
      {/* Visual Title Header */}
      <div className="flex items-center gap-3">
        <span className="p-2 bg-[#242f36] border border-white/10 rounded-xl text-[#bef264] shadow-xl">
          <Sparkles className="w-4 h-4 text-[#bef264]" />
        </span>
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-200 font-mono">
            Instrument Ledger Analytics Matrix
          </h2>
          <p className="text-[10px] text-slate-400 font-mono">
            Grouped contract statistics segmented by portfolio indices
          </p>
        </div>
      </div>

      {/* Main overall stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="relative overflow-hidden bg-[#242f36] border border-white/10 rounded-3xl p-5 shadow-lg backdrop-blur-sm">
          <div className="absolute right-4 top-4 bg-[#bef264]/10 border border-[#bef264]/20 p-2 rounded-xl text-[#bef264] shadow-md">
            <Compass className="w-4 h-4 text-[#bef264]" />
          </div>
          <span className="block text-[9px] font-black text-slate-3 w-max uppercase tracking-widest font-mono font-bold">
            Consolidated Trades
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight mt-3 text-white">
            {totalOverallTrades.toString().padStart(2, '0')} contracts
          </span>
        </div>

        <div className="relative overflow-hidden bg-[#242f36] border border-white/10 rounded-3xl p-5 shadow-lg backdrop-blur-sm">
          <div className="absolute right-4 top-4 bg-[#bef264]/10 border border-[#bef264]/20 p-2 rounded-xl text-[#bef264] shadow-md">
            <TrendingUp className="w-4 h-4 text-[#bef264]" />
          </div>
          <span className="block text-[9px] font-black text-slate-3 w-max uppercase tracking-widest font-mono font-bold">
            Total realized profit
          </span>
          <span className={`block text-2xl font-black font-mono tracking-tight mt-3 ${
            totalOverallNetProfit >= 0 ? 'text-[#bef264]' : 'text-rose-455'
          }`}>
            {totalOverallNetProfit >= 0 ? '+' : ''}
            ₹{formatAmount(totalOverallNetProfit)}
          </span>
        </div>

        <div className="relative overflow-hidden bg-[#242f36] border border-white/10 rounded-3xl p-5 shadow-lg backdrop-blur-sm">
          <div className="absolute right-4 top-4 bg-[#bef264]/10 border border-[#bef264]/20 p-2 rounded-xl text-[#bef264] shadow-md">
            <Scale className="w-4 h-4 text-[#bef264]" />
          </div>
          <span className="block text-[9px] font-black text-slate-2 w-max uppercase tracking-widest font-mono font-bold">
            Winning Trades
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight mt-3 text-white">
            {overallWinningTradesCount} WON ({formatAmount(overallWinRate, 1)}%)
          </span>
        </div>
      </div>

      {/* Group segmentation grid */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black uppercase text-slate-450 tracking-widest font-mono">
          System Integrated Portfolios
        </h3>
        
        <div id="summary-groups-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {groupStatsList.map((group, idx) => {
            const grpWinRate = group.totalTrades > 0 ? (group.winningTrades / group.totalTrades) * 100 : 0;
            return (
              <div 
                key={idx}
                className={`relative overflow-hidden border p-5 rounded-3xl shadow-lg backdrop-blur-sm transition-all duration-200 flex flex-col justify-between min-h-[190px] ${group.colorClass}`}
              >
                {/* Header detail */}
                <div className="flex items-start justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-slate-950/40 border border-white/10 rounded-xl">
                      {group.icon}
                    </span>
                    <div>
                      <h4 className="font-extrabold text-sm uppercase tracking-wider text-white font-sans">
                        {group.name}
                      </h4>
                      <p className="text-[8px] font-bold font-mono tracking-widest opacity-60">
                        {group.totalTrades} {group.totalTrades === 1 ? 'CONTRACT' : 'CONTRACTS'} REGISTERED
                      </p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black font-mono px-2 py-0.5 rounded-md ${
                    group.totalNetProfit >= 0 ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                  }`}>
                    {group.totalNetProfit >= 0 ? 'STATUS: GAIN' : 'STATUS: LOSS'}
                  </span>
                </div>

                {/* Net yield statement */}
                <div className="my-3">
                  <span className="block text-[8px] font-black uppercase tracking-widest opacity-60 font-mono">
                    Net Segment accounting Yield
                  </span>
                  <span className={`block text-xl font-black font-mono tracking-tight mt-1 ${
                    group.totalNetProfit >= 0 ? 'text-[#bef264]' : 'text-rose-400'
                  }`}>
                    {group.totalNetProfit >= 0 ? '+' : ''}
                    ₹{formatPrice(group.totalNetProfit)}
                  </span>
                </div>

                {/* Micro breakdowns */}
                <div className="border-t border-white/5 pt-2.5 flex items-center justify-between text-[9px] font-bold font-mono leading-none tracking-wider text-slate-300">
                  <div>
                    <span>WINRATE: </span>
                    <span className="text-white">{formatAmount(grpWinRate, 0)}%</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">
                      {group.winningTrades} W
                    </span>
                    <span className="bg-rose-500/15 text-rose-400 px-1.5 py-0.5 rounded">
                      {group.losingTrades} L
                    </span>
                  </div>
                </div>

                {/* Symbols tags */}
                {group.symbols.length > 0 && (
                  <div className="mt-2 text-[8px] text-slate-400 uppercase font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                    Active: {group.symbols.join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
