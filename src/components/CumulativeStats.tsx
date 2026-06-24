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
    <div style={{
      width: '100%',
      minHeight: '100vh',
      padding: '20px 28px 60px',
      color: '#F0E6C8',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Title Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid rgba(201,168,76,0.1)' }}>
        <div className="flex items-center gap-2">
          <span className="p-2" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 12, color: '#C9A84C' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#C9A84C' }} />
          </span>
          <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.5)', margin: 0 }}>
            Cumulative Core Analytics Matrix
          </h2>
        </div>
        <button
          onClick={() => exportToExcel(trades)}
          style={{ background: '#C9A84C', color: '#1A1200', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '1px', fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Download className="w-3.5 h-3.5" style={{ color: '#1A1200' }} />
          Excel Ledger Raw Export
        </button>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 20,
        width: '100%',
      }}>
        {/* Total Net Profit */}
        <div id="cum-net-profit" className="relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '20px 24px' }}>
          <div className="absolute right-4 top-4 p-2" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 12, color: '#C9A84C' }}>
            <Landmark className="w-4 h-4" style={{ color: '#C9A84C' }} />
          </div>
          <span className="block text-[9px] font-black uppercase tracking-widest font-mono font-bold" style={{ color: 'rgba(240,230,200,0.7)' }}>
            Net Cumulative Yield
          </span>
          <span className={`block text-2xl font-black font-mono tracking-tight mt-3`} style={{ color: totalNetProfit >= 0 ? '#677A67' : '#C9960C' }}>
            {totalNetProfit >= 0 ? '+' : ''}
            ₹{formatAmount(totalNetProfit)}
          </span>
        </div>

        {/* Win Rate */}
        <div id="cum-win-rate" className="relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '20px 24px' }}>
          <div className="absolute right-4 top-4 p-2" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 12, color: '#C9A84C' }}>
            <Scale className="w-4 h-4" style={{ color: '#C9A84C' }} />
          </div>
          <span className="block text-[9px] font-black uppercase tracking-widest font-mono font-bold" style={{ color: 'rgba(240,230,200,0.7)' }}>
            Consolidated Win Rate
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight mt-3" style={{ color: '#F0E6C8' }}>
            {formatAmount(winRate, 1)}%
          </span>
          <div className="mt-4 flex items-center gap-1.5 text-[9px] font-bold font-mono tracking-wider">
            <span className="px-2 py-0.5" style={{ borderRadius: 8, background: 'rgba(103,122,103,0.15)', border: '1px solid rgba(103,122,103,0.3)', color: '#677A67' }}>
              {winningTradesCount} WON
            </span>
            <span className="px-2 py-0.5" style={{ borderRadius: 8, background: 'rgba(201,150,12,0.15)', border: '1px solid rgba(201,150,12,0.3)', color: '#C9960C' }}>
              {losingTradesCount} LOST
            </span>
          </div>
        </div>

        {/* Gross Profit */}
        <div id="cum-gross-profit" className="relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '20px 24px' }}>
          <div className="absolute right-4 top-4 p-2" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 12, color: '#C9A84C' }}>
            <TrendingUp className="w-4 h-4" style={{ color: '#C9A84C' }} />
          </div>
          <span className="block text-[9px] font-black uppercase tracking-widest font-mono font-bold" style={{ color: 'rgba(240,230,200,0.7)' }}>
            Gross Executed PnL
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight mt-3" style={{ color: totalGrossProfit >= 0 ? '#677A67' : '#C9960C' }}>
            {totalGrossProfit >= 0 ? '+' : ''}
            ₹{formatAmount(totalGrossProfit)}
          </span>
        </div>

        {/* Total Brokerage */}
        <div id="cum-brokerage" className="relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '20px 24px' }}>
          <div className="absolute right-4 top-4 p-2" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 12, color: '#C9A84C' }}>
            <TrendingDown className="w-4 h-4" style={{ color: '#C9A84C' }} />
          </div>
          <span className="block text-[9px] font-black uppercase tracking-widest font-mono font-bold" style={{ color: 'rgba(240,230,200,0.7)' }}>
            Total Brokerage Spent
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight mt-3 font-bold" style={{ color: '#C9960C' }}>
            -₹{formatAmount(totalBrokerage)}
          </span>
        </div>
      </div>

      {/* Total Offset Summary — lifetime running total of all weekly offsets */}
      <div id="cum-lifetime-offset" className="relative overflow-hidden flex flex-wrap items-center justify-between gap-4" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '20px 24px', width: '100%', marginTop: 20 }}>
        <div className="flex items-center gap-3">
          <span className="p-2.5" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,168,76,0.1)', borderRadius: 12, color: '#C9A84C' }}>
            <Scale className="w-5 h-5" style={{ color: '#C9A84C' }} />
          </span>
          <div>
            <span className="block text-[9px] font-black uppercase tracking-widest font-mono" style={{ color: 'rgba(240,230,200,0.7)' }}>
              Total Offset Summary (Lifetime)
            </span>
            <span className="block text-[9px] font-mono mt-0.5" style={{ color: 'rgba(240,230,200,0.5)' }}>
              Cumulative broker reconciliation across {offsetWeekCount} {offsetWeekCount === 1 ? 'week' : 'weeks'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="block text-2xl font-black font-mono tracking-tight" style={{ color: lifetimeOffset === 0 ? 'rgba(240,230,200,0.7)' : lifetimeOffset > 0 ? '#677A67' : '#C9960C' }}>
            {lifetimeOffset > 0 ? '+' : ''}₹{formatAmount(lifetimeOffset)}
          </span>
          <span className="block text-[9px] font-mono mt-1 uppercase tracking-wider" style={{ color: 'rgba(240,230,200,0.5)' }}>
            Net incl. offset: {totalNetProfit + lifetimeOffset >= 0 ? '+' : ''}₹{formatAmount(totalNetProfit + lifetimeOffset)}
          </span>
        </div>
      </div>

      {/* Secondary micro details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ marginTop: 16 }}>
        <div className="flex items-center justify-between text-xs" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '20px 24px' }}>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" style={{ color: '#C9A84C' }} />
            <span className="font-bold font-mono text-[10px] uppercase tracking-wider" style={{ color: 'rgba(240,230,200,0.7)' }}>Registered Ledgers</span>
          </div>
          <span className="font-bold font-mono text-xs px-3 py-1.5" style={{ color: '#F0E6C8', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,168,76,0.1)', borderRadius: 12 }}>
            {totalTradesCount.toString().padStart(2, '0')} contracts
          </span>
        </div>

        <div className="flex items-center justify-between text-xs" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '20px 24px' }}>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: '#C9A84C' }} />
            <span className="font-bold font-mono text-[10px] uppercase tracking-wider" style={{ color: 'rgba(240,230,200,0.7)' }}>Top Realized Trade</span>
          </div>
          <span className="font-extrabold font-mono text-xs px-3 py-1.5" style={{ color: '#C9A84C', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 12 }}>
            {bestTradeSymbol} {bestTradeNet > 0 ? `(+₹${formatAmount(bestTradeNet, 1)})` : ''}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '20px 24px' }}>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4" style={{ color: '#C9A84C' }} />
            <span className="font-bold font-mono text-[10px] uppercase tracking-wider" style={{ color: 'rgba(240,230,200,0.7)' }}>Max Deficit Trade</span>
          </div>
          <span className="font-extrabold font-mono text-xs px-3 py-1.5" style={{ color: '#C9960C', background: 'rgba(201,150,12,0.1)', border: '1px solid rgba(201,150,12,0.2)', borderRadius: 12 }}>
            {worstTradeSymbol} {worstTradeNet < 0 ? `(-₹${formatAmount(Math.abs(worstTradeNet), 1)})` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
