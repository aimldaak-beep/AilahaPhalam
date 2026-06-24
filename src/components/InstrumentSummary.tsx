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
      colorClass: "border rounded-3xl",
      icon: <TrendingUp className="w-5 h-5 text-teal-400" />
    },
    {
      name: "NSE & Global Options",
      match: (t: Trade) => t.instrument === 'Option' || t.instrument === 'NSE Options',
      colorClass: "border rounded-3xl",
      icon: <Award className="w-5 h-5 text-fuchsia-400" />
    },
    {
      name: "GIFT Nifty",
      match: (t: Trade) => t.instrument === 'Gift Nifty',
      colorClass: "border rounded-3xl",
      icon: <Target className="w-5 h-5 text-[#e8a04d]" />
    },
    {
      name: "DOW Conglomerate",
      match: (t: Trade) => t.instrument === 'DOW',
      colorClass: "border rounded-3xl",
      icon: <Landmark className="w-5 h-5 text-blue-400" />
    },
    {
      name: "Global Indices & Commodities",
      match: (t: Trade) => ['Nasdaq', 'Nikkei', 'SnP', 'NG'].includes(t.instrument),
      colorClass: "border rounded-3xl",
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
    <div className="space-y-6" style={{
      width: '100%',
      minHeight: 'calc(100vh - 56px)',
      padding: '20px 28px 40px',
      color: '#F0E6C8',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Visual Title Header */}
      <div className="flex items-center gap-3">
        <span className="p-2 rounded-xl shadow-xl" style={{ background: 'rgba(12,8,3,0.9)', border: '1px solid rgba(201,168,76,0.15)', color: '#C9A84C' }}>
          <Sparkles className="w-4 h-4" style={{ color: '#C9A84C' }} />
        </span>
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest font-mono" style={{ color: '#F0E6C8' }}>
            Instrument Ledger Analytics Matrix
          </h2>
          <p className="text-[10px] font-mono" style={{ color: 'rgba(240,230,200,0.5)' }}>
            Grouped contract statistics segmented by portfolio indices
          </p>
        </div>
      </div>

      {/* Main overall stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="relative overflow-hidden rounded-3xl p-5 shadow-lg backdrop-blur-sm" style={{ background: 'rgba(12,8,3,0.9)', border: '1px solid rgba(201,168,76,0.15)' }}>
          <div className="absolute right-4 top-4 p-2 rounded-xl shadow-md" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#C9A84C' }}>
            <Compass className="w-4 h-4" style={{ color: '#C9A84C' }} />
          </div>
          <span className="block text-[9px] font-black w-max uppercase tracking-widest font-mono font-bold" style={{ color: '#F0E6C8' }}>
            Consolidated Trades
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight mt-3" style={{ color: '#F0E6C8' }}>
            {totalOverallTrades.toString().padStart(2, '0')} contracts
          </span>
        </div>

        <div className="relative overflow-hidden rounded-3xl p-5 shadow-lg backdrop-blur-sm" style={{ background: 'rgba(12,8,3,0.9)', border: '1px solid rgba(201,168,76,0.15)' }}>
          <div className="absolute right-4 top-4 p-2 rounded-xl shadow-md" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#C9A84C' }}>
            <TrendingUp className="w-4 h-4" style={{ color: '#C9A84C' }} />
          </div>
          <span className="block text-[9px] font-black w-max uppercase tracking-widest font-mono font-bold" style={{ color: '#F0E6C8' }}>
            Total realized profit
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight mt-3" style={{ color: totalOverallNetProfit >= 0 ? '#677A67' : '#C9960C' }}>
            {totalOverallNetProfit >= 0 ? '+' : ''}
            ₹{formatAmount(totalOverallNetProfit)}
          </span>
        </div>

        <div className="relative overflow-hidden rounded-3xl p-5 shadow-lg backdrop-blur-sm" style={{ background: 'rgba(12,8,3,0.9)', border: '1px solid rgba(201,168,76,0.15)' }}>
          <div className="absolute right-4 top-4 p-2 rounded-xl shadow-md" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#C9A84C' }}>
            <Scale className="w-4 h-4" style={{ color: '#C9A84C' }} />
          </div>
          <span className="block text-[9px] font-black w-max uppercase tracking-widest font-mono font-bold" style={{ color: '#F0E6C8' }}>
            Winning Trades
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight mt-3" style={{ color: '#F0E6C8' }}>
            {overallWinningTradesCount} WON ({formatAmount(overallWinRate, 1)}%)
          </span>
        </div>
      </div>

      {/* Group segmentation grid */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest font-mono" style={{ color: 'rgba(240,230,200,0.5)' }}>
          System Integrated Portfolios
        </h3>

        <div id="summary-groups-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {groupStatsList.map((group, idx) => {
            const grpWinRate = group.totalTrades > 0 ? (group.winningTrades / group.totalTrades) * 100 : 0;
            return (
              <div
                key={idx}
                className={`relative overflow-hidden p-5 shadow-lg backdrop-blur-sm transition-all duration-200 flex flex-col justify-between min-h-[190px] ${group.colorClass}`}
                style={{ background: 'rgba(12,8,3,0.9)', border: '1px solid rgba(201,168,76,0.15)' }}
              >
                {/* Header detail */}
                <div className="flex items-start justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl" style={{ background: 'rgba(4,2,0,0.95)', border: '1px solid rgba(201,168,76,0.08)' }}>
                      {group.icon}
                    </span>
                    <div>
                      <h4 className="font-extrabold text-sm uppercase tracking-wider font-sans" style={{ color: '#F0E6C8' }}>
                        {group.name}
                      </h4>
                      <p className="text-[8px] font-bold font-mono tracking-widest opacity-60">
                        {group.totalTrades} {group.totalTrades === 1 ? 'CONTRACT' : 'CONTRACTS'} REGISTERED
                      </p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black font-mono px-2 py-0.5 rounded-md`} style={
                    group.totalNetProfit >= 0
                      ? { background: 'rgba(103,122,103,0.1)', border: '1px solid rgba(103,122,103,0.2)', color: '#677A67' }
                      : { background: 'rgba(201,150,12,0.1)', border: '1px solid rgba(201,150,12,0.2)', color: '#C9960C' }
                  }>
                    {group.totalNetProfit >= 0 ? 'STATUS: GAIN' : 'STATUS: LOSS'}
                  </span>
                </div>

                {/* Net yield statement */}
                <div className="my-3">
                  <span className="block text-[8px] font-black uppercase tracking-widest opacity-60 font-mono">
                    Net Segment accounting Yield
                  </span>
                  <span className="block text-xl font-black font-mono tracking-tight mt-1" style={{ color: group.totalNetProfit >= 0 ? '#677A67' : '#C9960C' }}>
                    {group.totalNetProfit >= 0 ? '+' : ''}
                    ₹{formatPrice(group.totalNetProfit)}
                  </span>
                </div>

                {/* Micro breakdowns */}
                <div className="pt-2.5 flex items-center justify-between text-[9px] font-bold font-mono leading-none tracking-wider" style={{ borderTop: '1px solid rgba(201,168,76,0.08)', color: 'rgba(240,230,200,0.7)' }}>
                  <div>
                    <span>WINRATE: </span>
                    <span style={{ color: '#F0E6C8' }}>{formatAmount(grpWinRate, 0)}%</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(103,122,103,0.15)', color: '#677A67' }}>
                      {group.winningTrades} W
                    </span>
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(201,150,12,0.15)', color: '#C9960C' }}>
                      {group.losingTrades} L
                    </span>
                  </div>
                </div>

                {/* Symbols tags */}
                {group.symbols.length > 0 && (
                  <div className="mt-2 text-[8px] uppercase font-mono overflow-hidden text-ellipsis whitespace-nowrap" style={{ color: 'rgba(240,230,200,0.5)' }}>
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
