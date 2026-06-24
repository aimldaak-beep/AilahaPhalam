/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Trade Tracker — ISOLATED signal-outcome tracker. Self-contained: owns its own
 * state, talks only to the `trade_tracker` / `daily_ohlc` tables. It does NOT
 * touch the main trades ledger, types.ts, or the PnL engine.
 */

import { useState, useEffect, type CSSProperties } from 'react';
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

// Mapped Blue palette
const PALETTE = {
  bg: 'rgba(10,10,25,0.8)',
  text: '#E8E8F0',
  muted: '#87A7AC',
  card: 'rgba(10,10,25,0.8)',
  border: 'rgba(67,72,77,0.12)',
  groupColors: ['#87A7AC', '#E7B97F', '#677A67'],
  long: '#677A67',
  short: '#E7B97F',
  profit: '#677A67',
  loss: '#87A7AC',
};

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

const pctColor = (p: number) => (p >= 0 ? '#677A67' : '#C8943A');

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

// Glass card style token
const glassCard: CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(201,168,76,0.15)',
  borderRadius: 16,
  padding: '20px 24px',
};

// Dark glass for table containers
const darkGlassContainer: CSSProperties = {
  background: 'rgba(0,0,0,0.15)',
  border: '1px solid rgba(201,168,76,0.1)',
  borderRadius: 12,
  overflow: 'hidden',
};

// Input style
const inputStyle: CSSProperties = {
  background: 'rgba(201,168,76,0.04)',
  border: '1px solid rgba(201,168,76,0.15)',
  borderRadius: 8,
  padding: '10px 14px',
  color: '#F0E6C8',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'font-mono',
};

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
    <div
      className="space-y-6"
      style={{
        width: '100%',
        minHeight: '100vh',
        padding: '20px 28px 60px',
        color: '#F0E6C8',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* 9B — Header card */}
      <div
        style={{
          ...glassCard,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <button
          type="button"
          onClick={() => setCurrentView('menu')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            fontWeight: 800,
            color: '#F0E6C8',
            background: 'rgba(201,168,76,0.06)',
            border: '1px solid rgba(201,168,76,0.15)',
            borderRadius: 8,
            padding: '8px 16px',
            cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14, color: '#C9A84C' }} />
          Back to Hub Menu
        </button>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: '#C9A84C',
            background: 'rgba(201,168,76,0.06)',
            border: '1px solid rgba(201,168,76,0.15)',
            borderRadius: 8,
            padding: '6px 14px',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            fontFamily: 'font-mono',
          }}
        >
          Signal Outcome Tracker
        </span>
      </div>

      {/* SECTION 1 — OPEN TRADES */}
      <div className="space-y-4">
        {/* Section header card */}
        <div
          style={{
            ...glassCard,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ padding: 6, background: 'rgba(201,168,76,0.08)', borderRadius: 8, color: '#C9A84C', display: 'inline-flex' }}>
              <TrendingUp style={{ width: 16, height: 16 }} />
            </span>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, fontWeight: 400, color: '#F0E6C8', lineHeight: 1 }}>
              Trade Tracker
            </h2>
            <span style={{ fontSize: 12, color: 'rgba(240,230,200,0.45)' }}>({openTrades.length} open)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={downloadCSV}
              style={{
                background: 'rgba(103,122,103,0.08)',
                border: '1px solid rgba(103,122,103,0.25)',
                borderRadius: 8,
                padding: '8px 16px',
                color: '#677A67',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                letterSpacing: '1px',
              }}
            >
              ↓ CSV
            </button>
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              style={{
                background: '#C9A84C',
                color: '#1A1200',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                letterSpacing: '1px',
              }}
            >
              <Plus style={{ width: 16, height: 16 }} />
              New Trade
            </button>
          </div>
        </div>

        {showNew && (
          <div
            className="space-y-3"
            style={{ ...glassCard }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={nSymbol}
                onChange={(e) => setNSymbol(e.target.value.toUpperCase())}
                placeholder="Symbol"
                style={{ ...inputStyle, textTransform: 'uppercase', fontFamily: 'monospace' }}
              />
              <div className="flex gap-2">
                {(['Long', 'Short'] as const).map((d) => {
                  const active = nDir === d;
                  const activeStyle =
                    d === 'Long'
                      ? { background: 'rgba(103,122,103,0.12)', color: '#677A67', border: '1px solid rgba(103,122,103,0.25)' }
                      : { background: 'rgba(201,152,12,0.12)', color: '#C9960C', border: '1px solid rgba(201,152,12,0.25)' };
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setNDir(d)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all .15s',
                        ...(active
                          ? activeStyle
                          : { background: 'rgba(201,168,76,0.04)', color: 'rgba(240,230,200,0.45)', border: '1px solid rgba(201,168,76,0.15)' }),
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <input type="date" value={nDate} onChange={(e) => setNDate(e.target.value)} style={{ ...inputStyle, fontFamily: 'monospace' }} />
              <input
                type="text"
                inputMode="decimal"
                value={nPrice}
                onChange={(e) => setNPrice(e.target.value)}
                placeholder="Entry price"
                style={{ ...inputStyle, fontFamily: 'monospace' }}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitNew}
                style={{ background: '#C9A84C', color: '#1A1200', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '1px' }}
              >
                Submit
              </button>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                style={{ background: 'rgba(201,168,76,0.04)', color: 'rgba(240,230,200,0.45)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, padding: '8px 20px', fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '1px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ ...darkGlassContainer, borderStyle: 'dashed', padding: '32px', textAlign: 'center' }}>
            <p style={{ color: 'rgba(240,230,200,0.45)', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>Loading…</p>
          </div>
        ) : err ? (
          <div style={{ ...darkGlassContainer, borderColor: 'rgba(232,160,77,0.3)', padding: '24px', textAlign: 'center' }}>
            <p style={{ color: '#C9960C', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>{err}</p>
          </div>
        ) : openTrades.length === 0 ? (
          <div style={{ ...darkGlassContainer, borderStyle: 'dashed', padding: '32px', textAlign: 'center' }}>
            <p style={{ color: 'rgba(240,230,200,0.45)', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>No open tracker trades.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Group trades by entry date */}
            {(() => {
              const grouped = groupByEntryDate(openTrades);
              const sortedEntryDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

              return sortedEntryDates.map((entryDate, groupIndex) => {
                const groupTrades = grouped[entryDate];
                const tradingDates = getNextTradingDates(entryDate, 7);
                const groupColor = PALETTE.groupColors[groupIndex % 3];

                return (
                  <div key={entryDate} style={{ marginBottom: 32, minWidth: 2300 }}>

                    {/* Group Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 16px',
                      background: `${groupColor}15`,
                      borderRadius: 10,
                      marginBottom: 12,
                      borderLeft: `4px solid ${groupColor}`
                    }}>
                      <span style={{
                        fontFamily: "'DM Serif Display', serif",
                        fontSize: 17,
                        fontWeight: 400,
                        color: groupColor,
                      }}>
                        Entry: {formatDateShort(entryDate)}
                      </span>
                      <span style={{
                        background: `${groupColor}20`,
                        color: groupColor,
                        borderRadius: 20,
                        padding: '2px 10px',
                        fontSize: 10,
                        fontWeight: 700,
                      }}>
                        {groupTrades.length} trade{groupTrades.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Column Header Row */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '140px 80px 120px 100px 60px repeat(7, 1fr) 80px',
                      padding: '8px 16px',
                      marginBottom: 4,
                      background: 'rgba(201,168,76,0.05)',
                      borderBottom: '1px solid rgba(201,168,76,0.12)',
                    }}>
                      {['Symbol', 'Dir', 'Entry ₹', 'Days'].map((lbl) => (
                        <div key={lbl} style={{ fontSize: 9, fontWeight: 700, color: 'rgba(201,168,76,0.4)', letterSpacing: '2px', textTransform: 'uppercase' }}>{lbl}</div>
                      ))}
                      <div></div>
                      {tradingDates.map((d) => {
                        const hasData = !!lastAvailableDate && d <= lastAvailableDate;
                        const isLoading = fillingColumn === d;
                        return (
                          <div key={d} style={{ textAlign: 'center' }}>
                            <div style={{
                              fontSize: 13,
                              fontWeight: 800,
                              color: hasData ? '#F0E6C8' : 'rgba(240,230,200,0.45)',
                              marginBottom: 3,
                            }}>
                              {formatDateShort(d)}
                            </div>
                            {/* Bulk fill button for column */}
                            <button
                              onClick={() => hasData && fillColumnForGroup(d, groupTrades)}
                              disabled={!hasData || isLoading}
                              title={hasData ? `Auto-fill all ${formatDateShort(d)}` : 'No data available'}
                              style={{
                                background: hasData ? `${groupColor}20` : 'transparent',
                                border: `1px solid ${hasData ? `${groupColor}50` : 'transparent'}`,
                                borderRadius: 4,
                                padding: '2px 6px',
                                fontSize: 10,
                                fontWeight: 700,
                                color: hasData ? groupColor : 'rgba(201,168,76,0.15)',
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
                          padding: '12px 16px',
                          marginBottom: 6,
                          background: 'rgba(255,255,255,0.03)',
                          backdropFilter: 'blur(20px)',
                          WebkitBackdropFilter: 'blur(20px)',
                          borderRadius: 10,
                          alignItems: 'center',
                          border: '1px solid rgba(201,168,76,0.1)',
                          borderBottomWidth: 1,
                        }}
                      >
                        {/* Symbol */}
                        <div style={{ fontSize: 15, fontWeight: 900, color: '#F0E6C8' }}>
                          {trade.symbol}
                        </div>

                        {/* Direction */}
                        <div>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: trade.direction === 'Long' ? 'rgba(103,122,103,0.15)' : 'rgba(201,152,12,0.15)',
                            color: trade.direction === 'Long' ? '#677A67' : '#C9960C',
                            border: `1px solid ${trade.direction === 'Long' ? 'rgba(103,122,103,0.3)' : 'rgba(201,152,12,0.3)'}`
                          }}>
                            {trade.direction?.toUpperCase()}
                          </span>
                        </div>

                        {/* Entry Price */}
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#F0E6C8', fontFamily: 'monospace' }}>
                          ₹{trade.entry_price?.toLocaleString('en-IN')}
                        </div>

                        {/* Days held */}
                        <div style={{ fontSize: 12, color: 'rgba(240,230,200,0.45)', fontFamily: 'monospace' }}>
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
                                <span style={{ color: 'rgba(201,168,76,0.15)', fontSize: 11 }}>—</span>
                              </div>
                            );
                          }

                          if (!dayData) {
                            return (
                              <div key={d} style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: 10, color: 'rgba(240,230,200,0.45)', cursor: 'pointer' }}>·</span>
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
                                const col = pts >= 0 ? '#677A67' : '#C8943A';
                                const isClose = key === 'C';
                                return (
                                  <div
                                    key={key}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      color: col,
                                      fontFamily: 'monospace',
                                      fontSize: isClose ? 14 : 13,
                                      fontWeight: isClose ? 800 : 400,
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
                              background: 'rgba(201,168,76,0.08)',
                              border: '1px solid rgba(201,168,76,0.2)',
                              borderRadius: 6,
                              padding: '4px 8px',
                              color: '#C9A84C',
                              fontSize: 10,
                              cursor: 'pointer'
                            }}
                          >Close</button>
                          <button
                            onClick={() => remove(trade.id)}
                            style={{
                              background: 'rgba(232,160,77,0.08)',
                              border: '1px solid rgba(232,160,77,0.2)',
                              borderRadius: 6,
                              padding: '4px 8px',
                              color: '#C9960C',
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
        {/* 9D section heading */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingBottom: 12,
            borderBottom: '1px solid rgba(201,168,76,0.12)',
          }}
        >
          <span style={{ padding: 6, background: 'rgba(103,122,103,0.08)', border: '1px solid rgba(103,122,103,0.2)', borderRadius: 8, color: '#677A67', display: 'inline-flex' }}>
            <CheckCircle style={{ width: 16, height: 16 }} />
          </span>
          <span style={{ color: 'rgba(240,230,200,0.45)', fontSize: 9, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' }}>
            Closed Trades ({closedTrades.length})
          </span>
        </div>

        {closedTrades.length === 0 ? (
          <div style={{ ...darkGlassContainer, borderStyle: 'dashed', padding: '32px', textAlign: 'center' }}>
            <p style={{ color: 'rgba(240,230,200,0.45)', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>No closed tracker trades.</p>
          </div>
        ) : (
          /* 9D — Closed trades fixed CSS grid */
          <div style={{ ...darkGlassContainer }}>
            {/* Grid header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '160px 80px 100px 140px 100px 80px 1fr 100px',
                background: 'rgba(201,168,76,0.05)',
                borderBottom: '1px solid rgba(201,168,76,0.12)',
                padding: '8px 20px',
              }}
            >
              {['Symbol', 'Dir', 'Entry Date', 'Entry ₹', 'Close Date', 'Close ₹', 'Move %', 'Actions'].map((h) => (
                <div key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)' }}>{h}</div>
              ))}
            </div>
            {/* Grid rows */}
            {closedTrades.map((trade) => {
              const move = trade.close_price != null ? pct(trade.close_price, trade.entry_price, trade.direction) : 0;
              return (
                <div
                  key={trade.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 80px 100px 140px 100px 80px 1fr 100px',
                    padding: '12px 20px',
                    borderBottom: '1px solid rgba(201,168,76,0.06)',
                    alignItems: 'center',
                    borderRadius: 0,
                  }}
                >
                  <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#F0E6C8', fontSize: 14 }}>{trade.symbol}</div>
                  <div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: 4,
                        color: trade.direction === 'Long' ? '#677A67' : '#C9960C',
                        border: `1px solid ${trade.direction === 'Long' ? 'rgba(103,122,103,0.3)' : 'rgba(201,152,12,0.3)'}`,
                        background: trade.direction === 'Long' ? 'rgba(103,122,103,0.1)' : 'rgba(201,152,12,0.1)',
                      }}
                    >
                      {trade.direction}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'monospace', color: 'rgba(240,230,200,0.45)', fontSize: 12, whiteSpace: 'nowrap' }}>{trade.entry_date}</div>
                  <div style={{ fontFamily: 'monospace', color: '#F0E6C8', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>₹{formatPrice(trade.entry_price)}</div>
                  <div style={{ fontFamily: 'monospace', color: 'rgba(240,230,200,0.45)', fontSize: 12, whiteSpace: 'nowrap' }}>{trade.close_date ?? '—'}</div>
                  <div style={{ fontFamily: 'monospace', color: '#F0E6C8', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>{trade.close_price != null ? '₹' + formatPrice(trade.close_price) : '—'}</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: pctColor(move) }}>{fmtPct(move)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => remove(trade.id)}
                      style={{
                        padding: '6px',
                        borderRadius: 8,
                        background: 'rgba(232,160,77,0.08)',
                        border: '1px solid rgba(232,160,77,0.25)',
                        color: '#C9960C',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 9F — Close modal */}
      {closeFor && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(20px)',
            overflowY: 'auto',
            padding: '40px 20px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 560,
              background: 'rgba(8,5,2,0.95)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: 16,
              overflow: 'hidden',
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 11, fontWeight: 800, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '2px', fontFamily: 'monospace' }}>Close Trade</h3>
              <button type="button" onClick={() => setCloseFor(null)} style={{ color: 'rgba(240,230,200,0.45)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <div style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 14, color: '#F0E6C8', fontWeight: 700, marginBottom: 16 }}>
              {closeFor.symbol} <span style={{ color: 'rgba(240,230,200,0.45)', fontSize: 12 }}>· {closeFor.direction} · entry ₹{formatPrice(closeFor.entry_price)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(240,230,200,0.45)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Close Date</label>
              <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} style={{ ...inputStyle, fontFamily: 'monospace' }} />
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(240,230,200,0.45)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Close Price</label>
              <input type="text" inputMode="decimal" value={closePrice} onChange={(e) => setClosePrice(e.target.value)} placeholder="Close price" style={{ ...inputStyle, fontFamily: 'monospace' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={confirmClose}
                style={{ flex: 1, background: '#C9A84C', color: '#1A1200', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'monospace' }}
              >Confirm</button>
              <button
                type="button"
                onClick={() => setCloseFor(null)}
                style={{ flex: 1, background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)', color: 'rgba(240,230,200,0.45)', borderRadius: 8, padding: '8px 20px', fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'monospace' }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
