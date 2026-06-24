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
    <div className="space-y-6" style={{
      width: '100%',
      minHeight: 'calc(100vh - 56px)',
      padding: '20px 28px 40px',
      color: '#F0E6C8',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Title Header */}
      <div className="flex items-center gap-3">
        <span className="p-2 rounded-xl shadow-xl" style={{ background: 'rgba(12,8,3,0.9)', border: '1px solid rgba(201,168,76,0.15)', color: '#C9A84C' }}>
          <Download className="w-4 h-4" style={{ color: '#C9A84C' }} />
        </span>
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest font-mono" style={{ color: '#F0E6C8' }}>
            System CSV Ledger Exporter
          </h2>
          <p className="text-[10px] font-mono" style={{ color: 'rgba(240,230,200,0.5)' }}>
            Generate custom filtered audits for accountancy reconciliation
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Setup controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Chronological bounds */}
          <div className="rounded-3xl p-6 shadow-lg space-y-4" style={{ background: 'rgba(12,8,3,0.9)', border: '1px solid rgba(201,168,76,0.15)' }}>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: '#C9A84C' }} />
              <h3 className="text-xs font-extrabold uppercase tracking-wider font-mono" style={{ color: '#F0E6C8' }}>
                1. Chronological Bounds (Date Range)
              </h3>
            </div>

            {/* Toggle date limits */}
            <div className="flex p-1 rounded-xl max-w-sm" style={{ background: 'rgba(8,5,2,0.9)', border: '1px solid rgba(201,168,76,0.08)' }}>
              <button
                type="button"
                onClick={() => setUseDateRange(false)}
                className={`flex-1 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider rounded-lg transition duration-200`}
                style={
                  !useDateRange
                    ? { background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.25)', color: '#C9A84C' }
                    : { color: 'rgba(240,230,200,0.5)' }
                }
              >
                All Trades (Life-Cycle Span)
              </button>
              <button
                type="button"
                onClick={() => setUseDateRange(true)}
                className={`flex-1 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider rounded-lg transition duration-200`}
                style={
                  useDateRange
                    ? { background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.25)', color: '#C9A84C' }
                    : { color: 'rgba(240,230,200,0.5)' }
                }
              >
                Custom Range
              </button>
            </div>

            {/* Inputs */}
            {useDateRange && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 animate-fade-in">
                <div>
                  <label htmlFor="export-start-date" className="block text-[9px] uppercase tracking-wider font-bold mb-1.5 font-mono" style={{ color: 'rgba(240,230,200,0.5)' }}>
                    Initiation Date (From)
                  </label>
                  <input
                    id="export-start-date"
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl text-xs outline-none font-mono transition"
                    style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 12, color: '#F0E6C8' }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'; }}
                  />
                </div>
                <div>
                  <label htmlFor="export-end-date" className="block text-[9px] uppercase tracking-wider font-bold mb-1.5 font-mono" style={{ color: 'rgba(240,230,200,0.5)' }}>
                    Initiation Date (To)
                  </label>
                  <input
                    id="export-end-date"
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl text-xs outline-none font-mono transition"
                    style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 12, color: '#F0E6C8' }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'; }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Instrument Type Filters */}
          <div className="rounded-3xl p-6 shadow-lg space-y-4" style={{ background: 'rgba(12,8,3,0.9)', border: '1px solid rgba(201,168,76,0.15)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" style={{ color: '#C9A84C' }} />
                <h3 className="text-xs font-extrabold uppercase tracking-wider font-mono" style={{ color: '#F0E6C8' }}>
                  2. Segment Filters (Instrument Type)
                </h3>
              </div>

              {/* Select All / Clear All */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={selectAllInstruments}
                  className="text-[9px] font-bold hover:underline uppercase tracking-wide font-mono px-2 py-1 rounded"
                  style={{ color: '#C9A84C', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)' }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={clearAllInstruments}
                  className="text-[9px] font-bold uppercase tracking-wide font-mono px-2 py-1 rounded"
                  style={{ color: 'rgba(240,230,200,0.5)', background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.08)' }}
                >
                  Clear All
                </button>
              </div>
            </div>

            <p className="text-[10px] font-mono leading-relaxed" style={{ color: 'rgba(240,230,200,0.5)' }}>
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
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition duration-150 select-none cursor-pointer"
                    style={
                      isSelected
                        ? { background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.45)', color: '#C9A84C' }
                        : { background: 'rgba(8,5,2,0.9)', border: '1px solid rgba(201,168,76,0.08)', color: 'rgba(240,230,200,0.7)' }
                    }
                  >
                    <span className="font-mono">{inst}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" style={{ color: '#C9A84C' }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column: Matched preview & export triggers */}
        <div className="space-y-6">
          <div className="rounded-3xl p-6 shadow-lg flex flex-col justify-between min-h-[300px]" style={{ background: 'rgba(12,8,3,0.9)', border: '1px solid rgba(201,168,76,0.15)' }}>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: '#C9A84C' }} />
                <h3 className="text-xs font-extrabold uppercase tracking-wider font-mono" style={{ color: '#C9A84C' }}>
                  Export Matrix Diagnostics
                </h3>
              </div>

              {/* Status tally board */}
              <div className="p-4 rounded-2xl space-y-3.5" style={{ background: 'rgba(4,2,0,0.95)', border: '1px solid rgba(201,168,76,0.08)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase font-black" style={{ color: 'rgba(240,230,200,0.5)' }}>Matched Contracts:</span>
                  <span className="text-sm font-mono font-black" style={{ color: '#F0E6C8' }}>
                    {matchedTrades.length.toString().padStart(2, '0')} / {trades.length.toString().padStart(2, '0')}
                  </span>
                </div>

                <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(8,5,2,0.9)' }}>
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${trades.length > 0 ? (matchedTrades.length / trades.length) * 100 : 0}%`, background: '#C9A84C' }}
                  />
                </div>

                <div className="text-[9px] font-mono space-y-1 p-2.5 rounded-lg" style={{ color: 'rgba(240,230,200,0.5)', background: 'rgba(4,2,0,0.5)', border: '1px solid rgba(201,168,76,0.08)' }}>
                  <div className="flex justify-between">
                    <span>Date Bounds:</span>
                    <span className="font-bold" style={{ color: '#C9A84C' }}>
                      {useDateRange
                        ? `${startDate || 'Start'} ➜ ${endDate || 'End'}`
                        : 'All Historical Bounds'
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Selected Segments:</span>
                    <span className="font-bold" style={{ color: '#F0E6C8' }}>
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
                className="w-full py-4 rounded-2xl text-xs font-black uppercase tracking-widest font-mono flex items-center justify-center gap-2 transition duration-200 cursor-pointer shadow-lg active:scale-[0.98]"
                style={
                  matchedTrades.length > 0
                    ? { background: '#C9A84C', color: '#1A1200', fontWeight: 800, border: '1px solid rgba(201,168,76,0.4)' }
                    : { background: 'rgba(8,5,2,0.9)', border: '1px solid rgba(201,168,76,0.08)', color: 'rgba(240,230,200,0.35)', cursor: 'not-allowed' }
                }
              >
                <Download className="w-4 h-4" />
                Initialize CSV Download
              </button>

              {/* Separate reconciliation CSV — per-week calculated PnL + offset + adjusted total.
                  Keeps the raw per-trade ledger above untouched. */}
              <button
                type="button"
                onClick={() => downloadReconciliationCsv(trades, weekOffsets)}
                className="w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest font-mono flex items-center justify-center gap-2 transition duration-200 cursor-pointer shadow-md active:scale-[0.98]"
                style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', color: '#C9A84C' }}
              >
                <Download className="w-4 h-4" />
                Export Weekly Reconciliation CSV
              </button>

              <div className="flex items-start gap-1.5 text-[8.5px] font-medium leading-relaxed font-mono p-3 rounded-xl" style={{ color: 'rgba(240,230,200,0.5)', background: 'rgba(4,2,0,0.5)', border: '1px solid rgba(201,168,76,0.08)' }}>
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#C9A84C' }} />
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
        <div className="rounded-3xl p-6 shadow-lg space-y-3" style={{ background: 'rgba(12,8,3,0.9)', border: '1px solid rgba(201,168,76,0.15)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" style={{ color: 'rgba(240,230,200,0.7)' }} />
              <h3 className="text-xs font-extrabold uppercase tracking-wider font-mono" style={{ color: '#F0E6C8' }}>
                Matching Positions Record Preview
              </h3>
            </div>
            <span className="text-[8px] font-bold font-mono uppercase tracking-widest px-2.5 py-1 rounded" style={{ color: 'rgba(240,230,200,0.5)', background: 'rgba(4,2,0,0.95)', border: '1px solid rgba(201,168,76,0.08)' }}>
              Live Filter Query
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl scrollbar-thin" style={{ border: '1px solid rgba(201,168,76,0.08)' }}>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b text-[9px] font-mono tracking-widest uppercase" style={{ background: 'rgba(201,168,76,0.06)', borderBottomColor: 'rgba(201,168,76,0.15)', color: 'rgba(240,230,200,0.5)' }}>
                  <th className="py-2.5 px-4 font-bold">Symbol</th>
                  <th className="py-2.5 px-4 font-bold">Instrument</th>
                  <th className="py-2.5 px-4 font-bold">Direction</th>
                  <th className="py-2.5 px-4 font-bold">Initiated</th>
                  <th className="py-2.5 px-4 font-bold text-right">Entry Price</th>
                  <th className="py-2.5 px-4 font-bold">Status</th>
                  <th className="py-2.5 px-4 font-bold text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[11px]" style={{ color: 'rgba(240,230,200,0.7)' }}>
                {matchedTrades.slice(0, 5).map(t => (
                  <tr key={t.id} className="transition duration-150" style={{ borderBottom: '1px solid rgba(201,168,76,0.06)' }}>
                    <td className="py-2 px-4 font-extrabold" style={{ color: '#F0E6C8' }}>{t.symbol}</td>
                    <td className="py-2 px-4">{t.instrument}</td>
                    <td className="py-2 px-4">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase`}
                        style={
                          t.direction === 'Long'
                            ? { background: 'rgba(103,122,103,0.15)', border: '1px solid rgba(103,122,103,0.3)', color: '#677A67' }
                            : { background: 'rgba(201,150,12,0.12)', border: '1px solid rgba(201,150,12,0.3)', color: '#C9960C' }
                        }
                      >
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-2 px-4" style={{ color: 'rgba(240,230,200,0.5)' }}>{t.dateInitiated}</td>
                    <td className="py-2 px-4 text-right font-bold" style={{ color: '#F0E6C8' }}>
                      {t.currency === 'INR' ? '₹' : '$'}
                      {formatPrice(t.direction === 'Long' ? t.buyPrice : t.sellPrice)}
                    </td>
                    <td className="py-2 px-4">
                      <span className="text-[10px] uppercase font-black tracking-wider" style={{ color: 'rgba(240,230,200,0.5)' }}>
                        {t.status.replace('CarryForward', 'CF ')}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right">
                      <button
                        type="button"
                        title="Edit / correct this trade"
                        onClick={() => onOpenEditTrade(t)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer"
                        style={{ background: 'rgba(8,5,2,0.9)', border: '1px solid rgba(201,168,76,0.15)', color: 'rgba(240,230,200,0.7)' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'; e.currentTarget.style.color = '#C9A84C'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'; e.currentTarget.style.color = 'rgba(240,230,200,0.7)'; }}
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {matchedTrades.length > 5 && (
                  <tr>
                    <td colSpan={7} className="py-3 px-4 text-center font-bold text-[10px] uppercase tracking-wider font-mono" style={{ background: 'rgba(8,5,2,0.9)', color: 'rgba(240,230,200,0.5)' }}>
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
