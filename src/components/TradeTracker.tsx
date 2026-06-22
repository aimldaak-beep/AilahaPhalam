/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Trade Tracker — ISOLATED signal-outcome tracker. Self-contained: owns its own
 * state, talks only to the `trade_tracker` / `daily_ohlc` tables. It does NOT
 * touch the main trades ledger, types.ts, or the PnL engine.
 */

import { useState, useEffect } from 'react';
import {
  fetchTrackerTrades,
  addTrackerTrade,
  updateTrackerTrade,
  deleteTrackerTrade,
  type TrackerTrade,
} from '../lib/tracker';
import { supabase } from '../lib/supabase';
import { formatPrice } from '../lib/format';
import {
  ArrowLeft,
  Plus,
  Trash2,
  TrendingUp,
  CheckCircle,
  X,
} from 'lucide-react';

interface Props {
  session: any;
  setCurrentView: (view: 'menu') => void;
}

// --- pure helpers -----------------------------------------------------------

const todayStr = () => new Date().toISOString().split('T')[0];

/** Percentage move of `price` vs `entry`, signed by trade direction. */
function pct(price: number, entry: number, direction: 'Long' | 'Short'): number {
  if (!entry) return 0;
  return direction === 'Long'
    ? ((price - entry) / entry) * 100
    : ((entry - price) / entry) * 100;
}

/** "+1.23%" / "-0.45%" — always 2 dp, explicit sign. */
function fmtPct(p: number): string {
  return `${p >= 0 ? '+' : '-'}${Math.abs(p).toFixed(2)}%`;
}

const pctColor = (p: number) => (p >= 0 ? '#5dcaa5' : '#e8a04d');

/** Direction-aware points + percent move of `price` vs `entry`. */
function calcPnl(price: number, entry: number, direction: string): { pts: number; pct: number } {
  const pts = direction === 'Long' ? price - entry : entry - price;
  const pct = entry ? (pts / entry) * 100 : 0;
  return { pts, pct };
}

/** "+2.75pts" / "-38.20pts" — always 2 dp, explicit sign. */
function fmtPts(n: number): string {
  return (n >= 0 ? '+' : '-') + Math.abs(n).toFixed(2) + 'pts';
}

/** "1,530.05" — en-IN grouping, always 2 dp. */
function fmtPrice(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Count of Mon–Fri days strictly after `start`, up to and including `end`. */
function workingDaysBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (e <= s) return 0;
  let count = 0;
  const cur = new Date(s);
  cur.setDate(cur.getDate() + 1);
  while (cur <= e) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Get next N trading days after entry date (skip weekends)
function getNextTradingDates(entryDate: string, n: number = 7): string[] {
  const dates: string[] = [];
  const current = new Date(entryDate);
  while (dates.length < n) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day !== 0 && day !== 6) { // skip Sunday=0, Saturday=6
      dates.push(current.toISOString().split('T')[0]);
    }
  }
  return dates;
}

// Format date for display: "Jun 19"
function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

// Group trades by entry_date
function groupByEntryDate(trades: any[]): Record<string, any[]> {
  return trades.reduce((acc, trade) => {
    const key = trade.entry_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(trade);
    return acc;
  }, {} as Record<string, any[]>);
}

const inputCls =
  'w-full bg-[#172234] border border-white/10 focus:border-[#7fb3d5] transition rounded-lg px-2.5 py-1.5 text-xs text-[#e8edf4] focus:outline-none font-mono';

// ---------------------------------------------------------------------------

export default function TradeTracker({ session, setCurrentView }: Props) {
  const [trades, setTrades] = useState<TrackerTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // New-trade form
  const [showNew, setShowNew] = useState(false);
  const [nSymbol, setNSymbol] = useState('');
  const [nDir, setNDir] = useState<'Long' | 'Short'>('Long');
  const [nDate, setNDate] = useState(todayStr());
  const [nPrice, setNPrice] = useState('');

  // Close modal
  const [closeFor, setCloseFor] = useState<TrackerTrade | null>(null);
  const [closeDate, setCloseDate] = useState(todayStr());
  const [closePrice, setClosePrice] = useState('');

  // Bulk OHLC fill
  const [lastAvailableDate, setLastAvailableDate] = useState<string>('');
  const [fillingColumn, setFillingColumn] = useState<string>('');

  const load = async () => {
    try {
      setErr(null);
      const data = await fetchTrackerTrades();
      setTrades(data);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load tracker trades.');
    } finally {
      setLoading(false);
    }
  };

  const fetchLastAvailableDate = async () => {
    try {
      const { data } = await supabase
        .from('daily_ohlc')
        .select('date')
        .order('date', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        setLastAvailableDate(data[0].date);
      }
    } catch (e) {
      console.error('Error fetching last date:', e);
    }
  };

  useEffect(() => {
    if (!session) {
      setTrades([]);
      setLoading(false);
      return;
    }
    void load();
    void fetchLastAvailableDate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const openTrades = trades.filter((t) => t.status === 'Open');
  const closedTrades = trades.filter((t) => t.status === 'Closed');

  // --- actions --------------------------------------------------------------

  const submitNew = async () => {
    const price = parseFloat(nPrice);
    if (!nSymbol.trim() || isNaN(price) || price <= 0) {
      alert('Enter a symbol and a valid entry price.');
      return;
    }
    try {
      await addTrackerTrade({
        symbol: nSymbol.trim().toUpperCase(),
        direction: nDir,
        entry_date: nDate,
        entry_price: price,
        status: 'Open',
        daily_data: [],
      });
      setNSymbol('');
      setNPrice('');
      setNDir('Long');
      setNDate(todayStr());
      setShowNew(false);
      await load();
    } catch (e: any) {
      alert('Failed to add trade: ' + (e?.message ?? 'unknown error'));
    }
  };

  // Export all trades (one row per daily_data entry) to CSV.
  const downloadCSV = () => {
    const rows: string[] = [];

    rows.push([
      'Symbol', 'Direction', 'Entry Date', 'Entry Price',
      'Status', 'Days Held',
      'Day', 'Date',
      'Open', 'High', 'Low', 'Close',
      'O_pts', 'H_pts', 'L_pts', 'C_pts',
      'O_pct', 'H_pct', 'L_pct', 'C_pct',
    ].join(','));

    trades.forEach((trade) => {
      const isLong = trade.direction === 'Long';
      const daysHeld = Math.floor(
        (new Date().getTime() - new Date(trade.entry_date).getTime()) / 86400000
      );

      if (!trade.daily_data || trade.daily_data.length === 0) {
        rows.push([
          trade.symbol, trade.direction, trade.entry_date, trade.entry_price,
          trade.status, daysHeld,
          '', '', '', '', '', '',
          '', '', '', '',
          '', '', '', '',
        ].join(','));
        return;
      }

      trade.daily_data.forEach((dd: any, idx: number) => {
        const calcP = (price: number) =>
          isLong ? price - trade.entry_price : trade.entry_price - price;
        const calcPct = (price: number) => (calcP(price) / trade.entry_price) * 100;

        rows.push([
          trade.symbol, trade.direction, trade.entry_date, trade.entry_price,
          trade.status, daysHeld,
          `D${idx + 1}`, dd.date,
          dd.open?.toFixed(2) ?? '',
          dd.high?.toFixed(2) ?? '',
          dd.low?.toFixed(2) ?? '',
          dd.close?.toFixed(2) ?? '',
          calcP(dd.open).toFixed(2),
          calcP(dd.high).toFixed(2),
          calcP(dd.low).toFixed(2),
          calcP(dd.close).toFixed(2),
          calcPct(dd.open).toFixed(2),
          calcPct(dd.high).toFixed(2),
          calcPct(dd.low).toFixed(2),
          calcPct(dd.close).toFixed(2),
        ].join(','));
      });
    });

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade_tracker_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Bulk-fill one date column for every trade in an entry-date group.
  const fillColumnForGroup = async (targetDate: string, trades: any[]) => {
    // Don't fill if beyond last available date
    if (!lastAvailableDate || targetDate > lastAvailableDate) return;

    const key = `${targetDate}`;
    setFillingColumn(key);

    try {
      const symbols = trades.map((t) => t.symbol);
      const { data: ohlcData } = await supabase
        .from('daily_ohlc')
        .select('*')
        .in('symbol', symbols)
        .eq('date', targetDate);

      if (!ohlcData || ohlcData.length === 0) {
        alert(`No OHLC data available for ${formatDateShort(targetDate)}`);
        return;
      }

      // Build a map symbol -> ohlc
      const ohlcMap: Record<string, any> = {};
      ohlcData.forEach((row) => { ohlcMap[row.symbol] = row; });

      // Update each trade
      for (const trade of trades) {
        const ohlc = ohlcMap[trade.symbol];
        if (!ohlc) continue;

        // Get existing daily_data or create empty array
        const dailyData = trade.daily_data || [];

        // Check if entry for this date exists
        const existingIdx = dailyData.findIndex((d: any) => d.date === targetDate);

        const entry = {
          date: targetDate,
          open: ohlc.open,
          high: ohlc.high,
          low: ohlc.low,
          close: ohlc.close,
        };

        if (existingIdx >= 0) {
          dailyData[existingIdx] = entry;
        } else {
          dailyData.push(entry);
        }

        // Sort by date
        dailyData.sort((a: any, b: any) => a.date.localeCompare(b.date));

        // Save to Supabase
        await supabase
          .from('trade_tracker')
          .update({ daily_data: dailyData })
          .eq('id', trade.id);
      }

      // Refresh trades
      await load();
    } catch (e) {
      console.error('Error filling column:', e);
    } finally {
      setFillingColumn('');
    }
  };

  const confirmClose = async () => {
    if (!closeFor) return;
    const price = parseFloat(closePrice);
    if (isNaN(price) || price <= 0) {
      alert('Enter a valid close price.');
      return;
    }
    try {
      await updateTrackerTrade(closeFor.id, {
        status: 'Closed',
        close_date: closeDate,
        close_price: price,
      });
      setCloseFor(null);
      setClosePrice('');
      setCloseDate(todayStr());
      await load();
    } catch (e: any) {
      alert('Failed to close trade: ' + (e?.message ?? 'unknown error'));
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this tracker trade? This cannot be undone.')) return;
    try {
      await deleteTrackerTrade(id);
      await load();
    } catch (e: any) {
      alert('Failed to delete: ' + (e?.message ?? 'unknown error'));
    }
  };

  // --- render ---------------------------------------------------------------

  return (
    <div className="space-y-6 text-[#e8edf4]">
      {/* Header + back */}
      <div className="flex items-center justify-between bg-[#1e2a3d] border border-white/10 px-4 py-3 rounded-2xl">
        <button
          type="button"
          onClick={() => setCurrentView('menu')}
          className="flex items-center gap-2 text-xs font-bold text-[#e8edf4] hover:text-[#7fb3d5] transition bg-[#1e2a3d] px-4 py-2 rounded-xl border border-white/10 cursor-pointer active:scale-95"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#7fb3d5]" />
          Back to Hub Menu
        </button>
        <span className="text-[10px] bg-[#1e2a3d] border border-white/10 text-[#7fb3d5] px-3.5 py-1.5 rounded-xl font-bold font-mono uppercase tracking-widest">
          Signal Outcome Tracker
        </span>
      </div>

      {/* SECTION 1 — OPEN TRADES */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#7fb3d5]/10 border border-[#7fb3d5]/30 rounded-lg text-[#7fb3d5]">
              <TrendingUp className="w-4 h-4 text-[#7fb3d5]" />
            </span>
            <h2 className="text-base font-black text-[#7fb3d5] tracking-widest uppercase font-sans">Trade Tracker</h2>
            <span className="text-[10px] text-[#8a9bb3] font-mono">({openTrades.length} open)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={downloadCSV}
              style={{
                background: 'rgba(93,202,165,0.1)',
                border: '1px solid rgba(93,202,165,0.3)',
                borderRadius: 8,
                padding: '6px 14px',
                color: '#5dcaa5',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              ↓ CSV
            </button>
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="bg-[#7fb3d5]/10 hover:bg-[#7fb3d5]/20 text-[#7fb3d5] border border-[#7fb3d5]/30 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              New Trade
            </button>
          </div>
        </div>

        {showNew && (
          <div className="bg-[#222e42] border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={nSymbol}
                onChange={(e) => setNSymbol(e.target.value.toUpperCase())}
                placeholder="Symbol"
                className={inputCls + ' uppercase'}
              />
              <div className="flex gap-2">
                {(['Long', 'Short'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setNDir(d)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold font-mono border transition cursor-pointer ${
                      nDir === d
                        ? d === 'Long'
                          ? 'bg-[#5dcaa5]/15 border-[#5dcaa5]/40 text-[#5dcaa5]'
                          : 'bg-[#e8a04d]/15 border-[#e8a04d]/40 text-[#e8a04d]'
                        : 'bg-[#172234] border-white/10 text-[#8a9bb3] hover:text-[#e8edf4]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <input type="date" value={nDate} onChange={(e) => setNDate(e.target.value)} className={inputCls} />
              <input
                type="text"
                inputMode="decimal"
                value={nPrice}
                onChange={(e) => setNPrice(e.target.value)}
                placeholder="Entry price"
                className={inputCls}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitNew}
                className="bg-[#7fb3d5] hover:bg-[#5f9fc8] text-[#161f2e] px-5 py-2 rounded-lg text-xs font-black font-mono uppercase tracking-wider transition cursor-pointer active:scale-[0.98]"
              >
                Submit
              </button>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="bg-[#1e2a3d] border border-white/10 hover:border-[#e8a04d]/40 text-[#8a9bb3] hover:text-[#e8a04d] px-4 py-2 rounded-lg text-xs font-black font-mono uppercase tracking-wider transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-[#222e42] border border-dashed border-white/10 p-8 rounded-2xl text-center">
            <p className="text-[#8a9bb3] text-sm font-bold font-mono">Loading…</p>
          </div>
        ) : err ? (
          <div className="bg-[#222e42] border border-[#e8a04d]/30 p-6 rounded-2xl text-center">
            <p className="text-[#e8a04d] text-xs font-bold font-mono">{err}</p>
          </div>
        ) : openTrades.length === 0 ? (
          <div className="bg-[#222e42] border border-dashed border-white/10 p-8 rounded-2xl text-center">
            <p className="text-[#8a9bb3] text-sm font-bold font-mono">No open tracker trades.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Group trades by entry date */}
            {(() => {
              const grouped = groupByEntryDate(openTrades);
              const sortedEntryDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

              return sortedEntryDates.map((entryDate) => {
                const groupTrades = grouped[entryDate];
                const tradingDates = getNextTradingDates(entryDate, 7);

                return (
                  <div key={entryDate} style={{ marginBottom: 32, minWidth: 1900 }}>

                    {/* Group Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 16px',
                      background: 'rgba(127,179,213,0.08)',
                      borderRadius: 8,
                      marginBottom: 12,
                      borderLeft: '3px solid #7fb3d5'
                    }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#7fb3d5',
                        letterSpacing: '1px',
                        textTransform: 'uppercase'
                      }}>
                        Entry: {formatDateShort(entryDate)}
                      </span>
                      <span style={{ fontSize: 10, color: '#4a6080' }}>
                        {groupTrades.length} trade{groupTrades.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Column Header Row */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '140px 80px 120px 100px 60px repeat(7, 1fr) 80px',
                      padding: '6px 16px',
                      marginBottom: 4
                    }}>
                      <div style={{ fontSize: 9, color: '#4a6080', letterSpacing: '1px', textTransform: 'uppercase' }}>Symbol</div>
                      <div style={{ fontSize: 9, color: '#4a6080', letterSpacing: '1px', textTransform: 'uppercase' }}>Dir</div>
                      <div style={{ fontSize: 9, color: '#4a6080', letterSpacing: '1px', textTransform: 'uppercase' }}>Entry ₹</div>
                      <div style={{ fontSize: 9, color: '#4a6080', letterSpacing: '1px', textTransform: 'uppercase' }}>Days</div>
                      <div></div>
                      {tradingDates.map((d) => {
                        const hasData = !!lastAvailableDate && d <= lastAvailableDate;
                        const isLoading = fillingColumn === d;
                        return (
                          <div key={d} style={{ textAlign: 'center' }}>
                            <div style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: hasData ? '#7fb3d5' : '#2a3a4a',
                              marginBottom: 3
                            }}>
                              {formatDateShort(d)}
                            </div>
                            {/* Bulk fill button for column */}
                            <button
                              onClick={() => hasData && fillColumnForGroup(d, groupTrades)}
                              disabled={!hasData || isLoading}
                              title={hasData ? `Auto-fill all ${formatDateShort(d)}` : 'No data available'}
                              style={{
                                background: hasData ? 'rgba(127,179,213,0.15)' : 'transparent',
                                border: `1px solid ${hasData ? 'rgba(127,179,213,0.3)' : 'rgba(255,255,255,0.05)'}`,
                                borderRadius: 4,
                                padding: '2px 6px',
                                fontSize: 10,
                                color: hasData ? '#7fb3d5' : '#2a3a4a',
                                cursor: hasData ? 'pointer' : 'not-allowed',
                                width: '100%'
                              }}
                            >
                              {isLoading ? '...' : hasData ? '↓ fill' : '—'}
                            </button>
                          </div>
                        );
                      })}
                      <div></div>
                    </div>

                    {/* Trade Rows */}
                    {groupTrades.map((trade) => (
                      <div
                        key={trade.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '140px 80px 120px 100px 60px repeat(7, 1fr) 80px',
                          padding: '8px 16px',
                          marginBottom: 4,
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: 8,
                          alignItems: 'center',
                          border: '1px solid rgba(255,255,255,0.04)'
                        }}
                      >
                        {/* Symbol */}
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#e8edf4' }}>
                          {trade.symbol}
                        </div>

                        {/* Direction */}
                        <div>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: trade.direction === 'Long'
                              ? 'rgba(93,202,165,0.15)'
                              : 'rgba(232,160,77,0.15)',
                            color: trade.direction === 'Long' ? '#5dcaa5' : '#e8a04d',
                            border: `1px solid ${trade.direction === 'Long'
                              ? 'rgba(93,202,165,0.3)'
                              : 'rgba(232,160,77,0.3)'}`
                          }}>
                            {trade.direction?.toUpperCase()}
                          </span>
                        </div>

                        {/* Entry Price */}
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8edf4' }}>
                          ₹{trade.entry_price?.toLocaleString('en-IN')}
                        </div>

                        {/* Days held */}
                        <div style={{ fontSize: 12, color: '#4a6080' }}>
                          {Math.floor((new Date().getTime() - new Date(trade.entry_date).getTime()) / 86400000)}d
                        </div>

                        {/* Spacer */}
                        <div></div>

                        {/* OHLC per trading date */}
                        {tradingDates.map((d) => {
                          const hasData = !!lastAvailableDate && d <= lastAvailableDate;
                          const dayData = (trade.daily_data || []).find((dd: any) => dd.date === d);

                          if (!hasData) {
                            return (
                              <div key={d} style={{ textAlign: 'center' }}>
                                <span style={{ color: '#1a2a3a', fontSize: 11 }}>—</span>
                              </div>
                            );
                          }

                          if (!dayData) {
                            return (
                              <div key={d} style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: 10, color: '#4a6080', cursor: 'pointer' }}>·</span>
                              </div>
                            );
                          }

                          // Price | Points | % per OHLC value, direction-aware
                          return (
                            <div key={d}>
                              {(['H', 'L', 'O', 'C'] as const).map((key) => {
                                const price =
                                  key === 'H' ? dayData.high
                                  : key === 'L' ? dayData.low
                                  : key === 'O' ? dayData.open
                                  : dayData.close;
                                const { pts, pct } = calcPnl(price, trade.entry_price, trade.direction);
                                const col = pts >= 0 ? '#5dcaa5' : '#e8a04d';
                                const isBold = key === 'C';
                                return (
                                  <div
                                    key={key}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      color: col,
                                      fontSize: 10,
                                      fontWeight: isBold ? 700 : 400,
                                      marginBottom: 2,
                                    }}
                                  >
                                    <span style={{ width: 8 }}>{key}</span>
                                    <span style={{ minWidth: 60, fontFamily: 'monospace' }}>{fmtPrice(price)}</span>
                                    <span style={{ minWidth: 52, fontFamily: 'monospace' }}>{fmtPts(pts)}</span>
                                    <span style={{ fontFamily: 'monospace' }}>{fmtPct(pct)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => { setCloseFor(trade); setCloseDate(todayStr()); setClosePrice(''); }}
                            style={{
                              background: 'rgba(127,179,213,0.1)',
                              border: '1px solid rgba(127,179,213,0.2)',
                              borderRadius: 6,
                              padding: '4px 8px',
                              color: '#7fb3d5',
                              fontSize: 10,
                              cursor: 'pointer'
                            }}
                          >Close</button>
                          <button
                            onClick={() => remove(trade.id)}
                            style={{
                              background: 'rgba(232,160,77,0.1)',
                              border: '1px solid rgba(232,160,77,0.2)',
                              borderRadius: 6,
                              padding: '4px 8px',
                              color: '#e8a04d',
                              fontSize: 10,
                              cursor: 'pointer'
                            }}
                          >Del</button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* SECTION 2 — CLOSED TRADES */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <span className="p-1.5 bg-[#172234] border border-white/10 rounded-lg text-[#5dcaa5]">
            <CheckCircle className="w-4 h-4 text-[#5dcaa5]" />
          </span>
          <span className="text-xs font-black text-[#e8edf4] uppercase tracking-widest font-mono">
            Closed Trades ({closedTrades.length})
          </span>
        </div>

        {closedTrades.length === 0 ? (
          <div className="bg-[#222e42] border border-dashed border-white/10 p-8 rounded-2xl text-center">
            <p className="text-[#8a9bb3] text-sm font-bold font-mono">No closed tracker trades.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#222e42] shadow-lg">
            <table className="w-full min-w-[760px] text-left border-collapse">
              <thead>
                <tr className="bg-[#172234] text-[#8a9bb3] uppercase text-[10px] font-mono tracking-widest border-b border-white/10">
                  <th className="py-2.5 px-3 font-black">Symbol</th>
                  <th className="py-2.5 px-2 font-black">Dir</th>
                  <th className="py-2.5 px-2 font-black">Entry Date</th>
                  <th className="py-2.5 px-2 font-black text-right">Entry ₹</th>
                  <th className="py-2.5 px-2 font-black">Close Date</th>
                  <th className="py-2.5 px-2 font-black text-right">Close ₹</th>
                  <th className="py-2.5 px-2 font-black text-right">Move %</th>
                  <th className="py-2.5 px-2 font-black text-right">Days</th>
                  <th className="py-2.5 px-3 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {closedTrades.map((trade) => {
                  const move = trade.close_price != null ? pct(trade.close_price, trade.entry_price, trade.direction) : 0;
                  return (
                    <tr key={trade.id} className="hover:bg-white/5 transition">
                      <td className="py-2.5 px-3 font-mono font-extrabold text-[#e8edf4] text-sm">{trade.symbol}</td>
                      <td className="py-2.5 px-2">
                        <span
                          className="text-[10px] font-black font-mono uppercase px-1.5 py-0.5 rounded border"
                          style={{
                            color: trade.direction === 'Long' ? '#5dcaa5' : '#e8a04d',
                            borderColor: (trade.direction === 'Long' ? '#5dcaa5' : '#e8a04d') + '40',
                          }}
                        >
                          {trade.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-mono text-[#8a9bb3] text-xs whitespace-nowrap">{trade.entry_date}</td>
                      <td className="py-2.5 px-2 font-mono text-[#e8edf4] text-sm text-right font-bold whitespace-nowrap">₹{formatPrice(trade.entry_price)}</td>
                      <td className="py-2.5 px-2 font-mono text-[#8a9bb3] text-xs whitespace-nowrap">{trade.close_date ?? '—'}</td>
                      <td className="py-2.5 px-2 font-mono text-[#e8edf4] text-sm text-right font-bold whitespace-nowrap">{trade.close_price != null ? '₹' + formatPrice(trade.close_price) : '—'}</td>
                      <td className="py-2.5 px-2 text-right font-mono font-black text-sm" style={{ color: pctColor(move) }}>{fmtPct(move)}</td>
                      <td className="py-2.5 px-2 font-mono text-[#8a9bb3] text-xs text-right">{trade.close_date ? workingDaysBetween(trade.entry_date, trade.close_date) : '—'}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => remove(trade.id)}
                            className="p-1.5 rounded-lg bg-[#e8a04d]/10 border border-[#e8a04d]/30 text-[#e8a04d] hover:bg-[#e8a04d] hover:text-white transition cursor-pointer active:scale-95"
                          >
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

      {/* Close modal */}
      {closeFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-[#161f2e] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-[#7fb3d5] uppercase tracking-widest font-mono">Close Trade</h3>
              <button type="button" onClick={() => setCloseFor(null)} className="text-[#8a9bb3] hover:text-[#e8edf4] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-[#172234] border border-white/10 rounded-lg px-3 py-2 font-mono text-sm text-[#e8edf4] font-bold">
              {closeFor.symbol} <span className="text-[#8a9bb3] text-xs">· {closeFor.direction} · entry ₹{formatPrice(closeFor.entry_price)}</span>
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] text-[#8a9bb3] font-mono uppercase tracking-wider">Close Date</label>
              <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} className={inputCls} />
              <label className="block text-[10px] text-[#8a9bb3] font-mono uppercase tracking-wider">Close Price</label>
              <input type="text" inputMode="decimal" value={closePrice} onChange={(e) => setClosePrice(e.target.value)} placeholder="Close price" className={inputCls} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={confirmClose} className="flex-1 bg-[#7fb3d5] hover:bg-[#5f9fc8] text-[#161f2e] px-4 py-2 rounded-lg text-xs font-black font-mono uppercase tracking-wider transition cursor-pointer">Confirm</button>
              <button type="button" onClick={() => setCloseFor(null)} className="flex-1 bg-[#1e2a3d] border border-white/10 hover:border-[#e8a04d]/40 text-[#8a9bb3] hover:text-[#e8a04d] px-4 py-2 rounded-lg text-xs font-black font-mono uppercase tracking-wider transition cursor-pointer">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
