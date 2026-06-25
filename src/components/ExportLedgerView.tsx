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

  // Shared style tokens
  const glassCard: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(201,168,76,0.15)',
    borderRadius: 16,
    padding: '24px 28px',
    position: 'relative',
    overflow: 'hidden',
  };

  const darkGlassPanel: React.CSSProperties = {
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(201,168,76,0.1)',
    borderRadius: 12,
  };

  const dateInputStyle: React.CSSProperties = {
    background: 'rgba(201,168,76,0.04)',
    border: '1px solid rgba(201,168,76,0.15)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#F0E6C8',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div className="space-y-6" style={{
      width: '100%',
      minHeight: '100vh',
      padding: '20px 28px 60px',
      color: '#F0E6C8',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Title Header */}
      <div style={{
        marginBottom: 28,
        paddingBottom: 16,
        borderBottom: '1px solid rgba(201,168,76,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: 'rgba(201,168,76,0.4)',
            marginBottom: 4,
            fontFamily: "'DM Sans', sans-serif",
          }}>Export Workspace</div>
          <div style={{
            fontSize: 20,
            fontWeight: 800,
            color: '#F0E6C8',
            letterSpacing: '-0.3px',
            fontFamily: "'DM Serif Display', serif",
          }}>Ledger CSV Exporter</div>
          <div style={{
            fontSize: 11,
            color: 'rgba(240,230,200,0.35)',
            marginTop: 4,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Generate filtered audits for accountancy reconciliation
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Setup controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Chronological bounds */}
          <div className="shadow-lg space-y-4" style={glassCard}>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: '#C9A84C' }} />
              <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#F0E6C8', fontFamily: "'DM Sans', sans-serif" }}>
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
                    ? { background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.45)', color: '#C9A84C' }
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
                    ? { background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.45)', color: '#C9A84C' }
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
                  <label htmlFor="export-start-date" className="block mb-1.5" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.45)', fontFamily: "'DM Sans', sans-serif" }}>
                    Initiation Date (From)
                  </label>
                  <input
                    id="export-start-date"
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="transition"
                    style={dateInputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'; }}
                  />
                </div>
                <div>
                  <label htmlFor="export-end-date" className="block mb-1.5" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.45)', fontFamily: "'DM Sans', sans-serif" }}>
                    Initiation Date (To)
                  </label>
                  <input
                    id="export-end-date"
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="transition"
                    style={dateInputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'; }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Instrument Type Filters */}
          <div className="shadow-lg space-y-4" style={glassCard}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" style={{ color: '#C9A84C' }} />
                <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#F0E6C8', fontFamily: "'DM Sans', sans-serif" }}>
                  2. Segment Filters (Instrument Type)
                </h3>
              </div>

              {/* Select All / Clear All */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={selectAllInstruments}
                  className="text-[9px] font-bold hover:underline uppercase tracking-wide px-2 py-1 rounded"
                  style={{ color: '#C9A84C', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)' }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={clearAllInstruments}
                  className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded"
                  style={{ color: 'rgba(240,230,200,0.45)', background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.08)' }}
                >
                  Clear All
                </button>
              </div>
            </div>

            <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(240,230,200,0.45)' }}>
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
                      isSelected ? {
                        background: 'rgba(201,168,76,0.12)',
                        border: '1px solid rgba(201,168,76,0.4)',
                        color: '#C9A84C',
                        borderRadius: 10,
                        padding: '10px 16px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: "'DM Sans', sans-serif",
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      } : {
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(201,168,76,0.1)',
                        color: 'rgba(240,230,200,0.5)',
                        borderRadius: 10,
                        padding: '10px 16px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: "'DM Sans', sans-serif",
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }
                    }
                  >
                    <span>{inst}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" style={{ color: '#C9A84C' }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column: Matched preview & export triggers */}
        <div className="space-y-6">
          <div className="shadow-lg flex flex-col justify-between min-h-[300px]" style={{ ...glassCard }}>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: '#C9A84C' }} />
                <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#C9A84C', fontFamily: "'DM Sans', sans-serif" }}>
                  Export Matrix Diagnostics
                </h3>
              </div>

              {/* Status tally board */}
              <div className="p-4 space-y-3.5" style={darkGlassPanel}>
                <div className="flex items-center justify-between">
                  <span className="uppercase font-black" style={{ color: 'rgba(240,230,200,0.45)', fontSize: 10 }}>Matched Contracts:</span>
                  <span className="font-mono" style={{ color: '#F0E6C8', fontSize: 18, fontWeight: 800 }}>
                    {matchedTrades.length.toString().padStart(2, '0')} / {trades.length.toString().padStart(2, '0')}
                  </span>
                </div>

                <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(8,5,2,0.9)' }}>
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${trades.length > 0 ? (matchedTrades.length / trades.length) * 100 : 0}%`, background: '#C9A84C' }}
                  />
                </div>

                <div className="space-y-1 p-2.5 rounded-lg" style={{ fontSize: 10, color: 'rgba(240,230,200,0.45)', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,168,76,0.1)', borderRadius: 8 }}>
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
                className="w-full py-4 rounded-lg text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition duration-200 shadow-lg active:scale-[0.98]"
                style={
                  matchedTrades.length > 0
                    ? { background: '#C9A84C', color: '#1A1200', border: 'none', borderRadius: 10, padding: '14px 20px', fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: '1.5px', fontFamily: "'DM Sans', sans-serif", width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }
                    : { background: 'rgba(8,5,2,0.9)', border: '1px solid rgba(201,168,76,0.08)', color: 'rgba(240,230,200,0.35)', cursor: 'not-allowed', borderRadius: 10, padding: '14px 20px', fontSize: 12, fontWeight: 800, letterSpacing: '1.5px', fontFamily: "'DM Sans', sans-serif", width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }
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
                className="w-full py-3 rounded-lg text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition duration-200 shadow-md active:scale-[0.98]"
                style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 10, padding: '12px 20px', fontSize: 11, fontWeight: 700, color: '#C9A84C', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '1px' }}
              >
                <Download className="w-4 h-4" />
                Export Weekly Reconciliation CSV
              </button>

              <div className="flex items-start gap-1.5 text-[8.5px] font-medium leading-relaxed p-3 rounded-xl" style={{ color: 'rgba(240,230,200,0.45)', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,168,76,0.1)' }}>
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
        <div className="shadow-lg space-y-3" style={glassCard}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" style={{ color: 'rgba(240,230,200,0.45)' }} />
              <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#F0E6C8', fontFamily: "'DM Sans', sans-serif" }}>
                Matching Positions Record Preview
              </h3>
            </div>
            <span className="text-[8px] font-bold uppercase tracking-widest px-2.5 py-1 rounded" style={{ color: 'rgba(240,230,200,0.45)', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,168,76,0.1)' }}>
              Live Filter Query
            </span>
          </div>

          <div className="overflow-x-auto scrollbar-thin" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,168,76,0.1)', borderRadius: 12 }}>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr style={{ background: 'rgba(201,168,76,0.05)', borderBottom: '1px solid rgba(201,168,76,0.12)' }}>
                  <th className="py-2.5 px-4 font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)' }}>Symbol</th>
                  <th className="py-2.5 px-4 font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)' }}>Instrument</th>
                  <th className="py-2.5 px-4 font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)' }}>Direction</th>
                  <th className="py-2.5 px-4 font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)' }}>Initiated</th>
                  <th className="py-2.5 px-4 font-mono text-right" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)' }}>Entry Price</th>
                  <th className="py-2.5 px-4 font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)' }}>Status</th>
                  <th className="py-2.5 px-4 font-mono text-right" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)' }}>Edit</th>
                </tr>
              </thead>
              <tbody style={{ color: 'rgba(240,230,200,0.7)' }}>
                {matchedTrades.slice(0, 5).map(t => (
                  <tr key={t.id} className="transition duration-150" style={{ borderBottom: '1px solid rgba(201,168,76,0.06)' }}>
                    <td className="py-2 px-4" style={{ color: '#F0E6C8', fontSize: 14, fontWeight: 700 }}>{t.symbol}</td>
                    <td className="py-2 px-4" style={{ fontSize: 13 }}>{t.instrument}</td>
                    <td className="py-2 px-4">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider uppercase`}
                        style={
                          t.direction === 'Long'
                            ? { background: 'rgba(103,122,103,0.15)', border: '1px solid rgba(103,122,103,0.3)', color: '#677A67' }
                            : { background: 'rgba(201,150,12,0.12)', border: '1px solid rgba(201,150,12,0.3)', color: '#C9960C' }
                        }
                      >
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-2 px-4 font-mono" style={{ color: 'rgba(240,230,200,0.45)', fontSize: 13 }}>{t.dateInitiated}</td>
                    <td className="py-2 px-4 text-right font-bold font-mono" style={{ color: '#F0E6C8', fontSize: 13 }}>
                      {t.currency === 'INR' ? '₹' : '$'}
                      {formatPrice(t.direction === 'Long' ? t.buyPrice : t.sellPrice)}
                    </td>
                    <td className="py-2 px-4">
                      <span className="uppercase font-black tracking-wider" style={{ color: 'rgba(240,230,200,0.45)', fontSize: 11 }}>
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
                    <td colSpan={7} className="py-3 px-4 text-center font-bold text-[10px] uppercase tracking-wider font-mono" style={{ background: 'rgba(0,0,0,0.2)', color: 'rgba(240,230,200,0.45)' }}>
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
