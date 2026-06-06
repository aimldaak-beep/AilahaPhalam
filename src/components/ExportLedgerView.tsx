/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Trade, Instrument, exportToExcel } from '../types';
import { WeekOffset, downloadReconciliationCsv } from '../lib/offsets';
import { 
  Download, 
  Calendar, 
  Filter, 
  Check, 
  Sparkles, 
  Layers, 
  Info,
  Clock,
  Briefcase,
  Pencil
} from 'lucide-react';
import { formatNumber, formatAmount, formatPrice } from '../lib/format';

interface ExportLedgerViewProps {
  trades: Trade[];
  onOpenEditTrade: (trade: Trade) => void;
  weekOffsets: Record<string, WeekOffset>;
}

export default function ExportLedgerView({ trades, onOpenEditTrade, weekOffsets }: ExportLedgerViewProps) {
  const [useDateRange, setUseDateRange] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Available instrument types in the ledger
  const allInstruments: Instrument[] = [
    'NSE Futures',
    'NSE Options',
    'Gift Nifty',
    'DOW',
    'Nasdaq',
    'SnP',
    'Nikkei',
    'Futures',
    'Option',
    'NG'
  ];

  // Selected instruments for filter
  const [selectedInstruments, setSelectedInstruments] = useState<Instrument[]>([]);

  // Toggle instrument selection
  const toggleInstrument = (inst: Instrument) => {
    setSelectedInstruments(prev => {
      if (prev.includes(inst)) {
        return prev.filter(i => i !== inst);
      } else {
        return [...prev, inst];
      }
    });
  };

  // Quick actions
  const selectAllInstruments = () => {
    setSelectedInstruments([...allInstruments]);
  };

  const clearAllInstruments = () => {
    setSelectedInstruments([]);
  };

  // Compute matched trades in real-time
  const matchedTrades = useMemo(() => {
    return trades.filter(t => {
      // 1. Date filter
      if (useDateRange) {
        if (startDate && t.dateInitiated < startDate) return false;
        if (endDate && t.dateInitiated > endDate) return false;
      }
      // 2. Instrument filter
      if (selectedInstruments.length > 0) {
        if (!selectedInstruments.includes(t.instrument)) return false;
      }
      return true;
    });
  }, [trades, useDateRange, startDate, endDate, selectedInstruments]);

  // Execute export
  const handleExport = () => {
    const sDate = useDateRange && startDate ? startDate : undefined;
    const eDate = useDateRange && endDate ? endDate : undefined;
    const insts = selectedInstruments.length > 0 ? selectedInstruments : undefined;
    
    exportToExcel(trades, sDate, eDate, insts);
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Title Header */}
      <div className="flex items-center gap-3">
        <span className="p-2 bg-[#242f36] border border-white/10 rounded-xl text-[#bef264] shadow-xl">
          <Download className="w-4 h-4 text-[#bef264]" />
        </span>
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-200 font-mono">
            System CSV Ledger Exporter
          </h2>
          <p className="text-[10px] text-slate-400 font-mono">
            Generate custom filtered audits for accountancy reconciliation
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Setup controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Chronological bounds */}
          <div className="bg-[#242f36] border border-white/10 rounded-3xl p-6 shadow-lg space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#bef264]" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200 font-mono">
                1. Chronological Bounds (Date Range)
              </h3>
            </div>

            {/* Toggle date limits */}
            <div className="flex bg-slate-900/60 p-1 rounded-xl border border-white/5 max-w-sm">
              <button
                type="button"
                onClick={() => setUseDateRange(false)}
                className={`flex-1 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider rounded-lg transition duration-200 ${
                  !useDateRange 
                    ? 'bg-[#bef264]/15 border border-[#bef264]/25 text-[#bef264]' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Trades (Life-Cycle Span)
              </button>
              <button
                type="button"
                onClick={() => setUseDateRange(true)}
                className={`flex-1 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider rounded-lg transition duration-200 ${
                  useDateRange 
                    ? 'bg-[#bef264]/15 border border-[#bef264]/25 text-[#bef264]' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Custom Range
              </button>
            </div>

            {/* Inputs */}
            {useDateRange && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 animate-fade-in">
                <div>
                  <label htmlFor="export-start-date" className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 font-mono">
                    Initiation Date (From)
                  </label>
                  <input
                    id="export-start-date"
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 hover:border-white/20 focus:border-[#bef264] px-4 py-2.5 rounded-xl text-xs text-white outline-none font-mono transition"
                  />
                </div>
                <div>
                  <label htmlFor="export-end-date" className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 font-mono">
                    Initiation Date (To)
                  </label>
                  <input
                    id="export-end-date"
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 hover:border-white/20 focus:border-[#bef264] px-4 py-2.5 rounded-xl text-xs text-white outline-none font-mono transition"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Instrument Type Filters */}
          <div className="bg-[#242f36] border border-white/10 rounded-3xl p-6 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#bef264]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200 font-mono">
                  2. Segment Filters (Instrument Type)
                </h3>
              </div>

              {/* Select All / Clear All */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={selectAllInstruments}
                  className="text-[9px] font-bold text-[#bef264] hover:underline uppercase tracking-wide font-mono bg-white/5 border border-white/5 px-2 py-1 rounded"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={clearAllInstruments}
                  className="text-[9px] font-bold text-slate-400 hover:text-white uppercase tracking-wide font-mono bg-white/5 border border-white/5 px-2 py-1 rounded"
                >
                  Clear All
                </button>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 font-mono leading-relaxed">
              If no specific segments are chosen, the ledger will output all recorded contract classifications. Click to toggle selection:
            </p>

            {/* Instrument Buttons Board */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-2">
              {allInstruments.map(inst => {
                const isSelected = selectedInstruments.includes(inst);
                return (
                  <button
                    key={inst}
                    type="button"
                    onClick={() => toggleInstrument(inst)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-bold transition duration-150 select-none cursor-pointer ${
                      isSelected
                        ? 'bg-[#bef264]/15 border-[#bef264]/45 text-[#bef264] shadow-md'
                        : 'bg-slate-900/40 border-white/5 text-slate-300 hover:bg-slate-900/80 hover:border-white/10'
                    }`}
                  >
                    <span className="font-mono">{inst}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#bef264]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column: Matched preview & export triggers */}
        <div className="space-y-6">
          <div className="bg-[#242f36] border border-white/10 rounded-3xl p-6 shadow-lg flex flex-col justify-between min-h-[300px]">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#bef264]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#bef264] font-mono">
                  Export Matrix Diagnostics
                </h3>
              </div>

              {/* Status tally board */}
              <div className="bg-slate-950/45 border border-white/5 p-4 rounded-2xl space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 font-mono uppercase font-black">Matched Contracts:</span>
                  <span className="text-sm font-mono font-black text-white">
                    {matchedTrades.length.toString().padStart(2, '0')} / {trades.length.toString().padStart(2, '0')}
                  </span>
                </div>

                <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#bef264] h-full transition-all duration-300"
                    style={{ width: `${trades.length > 0 ? (matchedTrades.length / trades.length) * 100 : 0}%` }}
                  />
                </div>

                <div className="text-[9px] text-slate-400 font-mono space-y-1 bg-black/20 p-2.5 rounded-lg border border-white/5">
                  <div className="flex justify-between">
                    <span>Date Bounds:</span>
                    <span className="text-[#bef264] font-bold">
                      {useDateRange 
                        ? `${startDate || 'Start'} ➜ ${endDate || 'End'}` 
                        : 'All Historical Bounds'
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Selected Segments:</span>
                    <span className="text-white font-bold">
                      {selectedInstruments.length === 0 
                        ? 'All Portfolios' 
                        : selectedInstruments.join(', ')
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-6">
              <button
                type="button"
                onClick={handleExport}
                disabled={matchedTrades.length === 0}
                className={`w-full py-4 rounded-2xl text-xs font-black uppercase tracking-widest font-mono flex items-center justify-center gap-2 transition duration-200 cursor-pointer shadow-lg active:scale-[0.98] ${
                  matchedTrades.length > 0
                    ? 'bg-[#bef264] hover:bg-[#a9db58] text-slate-950 border border-[#bef264]/40 hover:shadow-[0_0_20px_rgba(190,242,100,0.15)] shadow-[#bef264]/5'
                    : 'bg-slate-900 border border-white/5 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Download className="w-4 h-4" />
                Initialize CSV Download
              </button>

              {/* Separate reconciliation CSV — per-week calculated PnL + offset + adjusted total.
                  Keeps the raw per-trade ledger above untouched. */}
              <button
                type="button"
                onClick={() => downloadReconciliationCsv(trades, weekOffsets)}
                className="w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest font-mono flex items-center justify-center gap-2 transition duration-200 cursor-pointer shadow-md active:scale-[0.98] bg-[#242f36] border border-[#bef264]/30 text-[#bef264] hover:bg-[#2e3c45]"
              >
                <Download className="w-4 h-4" />
                Export Weekly Reconciliation CSV
              </button>

              <div className="flex items-start gap-1.5 text-[8.5px] font-medium leading-relaxed text-slate-400 font-mono bg-slate-950/20 p-3 rounded-xl border border-white/5">
                <Info className="w-3.5 h-3.5 text-[#bef264] shrink-0 mt-0.5" />
                <span>
                  The exported document outputs in standard CSV format and is fully compatible with Microsoft Excel, Google Sheets, and Numbers.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Matched Positions Preview List */}
      {matchedTrades.length > 0 && (
        <div className="bg-[#242f36] border border-white/10 rounded-3xl p-6 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-slate-300" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200 font-mono">
                Matching Positions Record Preview
              </h3>
            </div>
            <span className="text-[8px] font-bold text-slate-400 font-mono uppercase tracking-widest bg-slate-950/30 px-2.5 py-1 rounded border border-white/5">
              Live Filter Query
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/5 scrollbar-thin">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 border-b border-white/10 text-slate-400 uppercase text-[9px] font-mono tracking-widest">
                  <th className="py-2.5 px-4 font-bold">Symbol</th>
                  <th className="py-2.5 px-4 font-bold">Instrument</th>
                  <th className="py-2.5 px-4 font-bold">Direction</th>
                  <th className="py-2.5 px-4 font-bold">Initiated</th>
                  <th className="py-2.5 px-4 font-bold text-right">Entry Price</th>
                  <th className="py-2.5 px-4 font-bold">Status</th>
                  <th className="py-2.5 px-4 font-bold text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-slate-300 text-[11px]">
                {matchedTrades.slice(0, 5).map(t => (
                  <tr key={t.id} className="hover:bg-white/5 transition duration-150">
                    <td className="py-2 px-4 font-extrabold text-white">{t.symbol}</td>
                    <td className="py-2 px-4">{t.instrument}</td>
                    <td className="py-2 px-4">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase ${
                        t.direction === 'Long' 
                          ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400' 
                          : 'bg-rose-500/10 border border-rose-500/25 text-rose-400'
                      }`}>
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-slate-400">{t.dateInitiated}</td>
                    <td className="py-2 px-4 text-right text-slate-200 font-bold">
                      {t.currency === 'INR' ? '₹' : '$'}
                      {formatPrice(t.direction === 'Long' ? t.buyPrice : t.sellPrice)}
                    </td>
                    <td className="py-2 px-4">
                      <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider">
                        {t.status.replace('CarryForward', 'CF ')}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right">
                      <button
                        type="button"
                        title="Edit / correct this trade"
                        onClick={() => onOpenEditTrade(t)}
                        className="inline-flex items-center gap-1 bg-slate-800/80 border border-white/10 hover:border-[#bef264]/50 text-slate-300 hover:text-[#bef264] px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {matchedTrades.length > 5 && (
                  <tr>
                    <td colSpan={7} className="py-3 px-4 text-center bg-slate-900/30 text-slate-400 font-bold text-[10px] uppercase tracking-wider font-mono">
                      ✦ And {matchedTrades.length - 5} additional registered trades match current filter ✦
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
