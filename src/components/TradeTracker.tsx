/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Trade Tracker — ISOLATED signal-outcome tracker. Self-contained: owns its own
 * state, talks only to the `trade_tracker` table via src/lib/tracker.ts. It does
 * NOT touch the main trades ledger, types.ts, or the PnL engine.
 */

import { useState, useEffect } from 'react';
import {
  fetchTrackerTrades,
  addTrackerTrade,
  updateTrackerTrade,
  deleteTrackerTrade,
  autoFillOHLC,
  type TrackerTrade,
  type DailyOHLC,
} from '../lib/tracker';
import { formatPrice } from '../lib/format';
import {
  ArrowLeft,
  Plus,
  Lock,
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

/** Next Monday–Friday date after `dateStr` (YYYY-MM-DD). */
function nextWorkingDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().split('T')[0];
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

// --- small presentational bits ----------------------------------------------

function PctLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-1 leading-tight">
      <span className="text-[8px] text-[#8a9bb3] font-mono">{label}</span>
      <span className="text-[10px] font-mono font-bold" style={{ color: pctColor(value) }}>
        {fmtPct(value)}
      </span>
    </div>
  );
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

  // Inline OHLC entry form: which trade is being appended to.
  const [ohlcFor, setOhlcFor] = useState<string | null>(null);
  const [ohlc, setOhlc] = useState({ o: '', h: '', l: '', c: '' });

  // Close modal
  const [closeFor, setCloseFor] = useState<TrackerTrade | null>(null);
  const [closeDate, setCloseDate] = useState(todayStr());
  const [closePrice, setClosePrice] = useState('');

  // How many day columns to show (extendable via the "+" column).
  const [visibleDays, setVisibleDays] = useState(7);

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

  useEffect(() => {
    if (!session) {
      setTrades([]);
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const openTrades = trades.filter((t) => t.status === 'Open');
  const closedTrades = trades.filter((t) => t.status === 'Closed');

  const dayCount = Math.max(
    visibleDays,
    openTrades.reduce((m, t) => Math.max(m, t.daily_data.length), 0)
  );

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

  const openOhlcForm = (trade: TrackerTrade) => {
    setOhlcFor(trade.id);
    setOhlc({ o: '', h: '', l: '', c: '' });
  };

  const ohlcDateFor = (trade: TrackerTrade): string => {
    const last = trade.daily_data[trade.daily_data.length - 1];
    return nextWorkingDay(last ? last.date : trade.entry_date);
  };

  // Pull the day's OHLC from Supabase daily_ohlc and fill the inline inputs.
  const handleAutoFill = async (trade: TrackerTrade) => {
    const d = ohlcDateFor(trade);
    try {
      const o = await autoFillOHLC(trade.symbol, d);
      if (!o) {
        alert(`No daily OHLC found for ${trade.symbol} on ${d}.`);
        return;
      }
      setOhlc({ o: String(o.open), h: String(o.high), l: String(o.low), c: String(o.close) });
    } catch (e: any) {
      alert('Auto-fill failed: ' + (e?.message ?? 'unknown error'));
    }
  };

  const submitOhlc = async (trade: TrackerTrade) => {
    const o = parseFloat(ohlc.o);
    const h = parseFloat(ohlc.h);
    const l = parseFloat(ohlc.l);
    const c = parseFloat(ohlc.c);
    if ([o, h, l, c].some((v) => isNaN(v) || v <= 0)) {
      alert('Enter valid O / H / L / C values.');
      return;
    }
    const entry: DailyOHLC = { date: ohlcDateFor(trade), open: o, high: h, low: l, close: c };
    try {
      await updateTrackerTrade(trade.id, { daily_data: [...trade.daily_data, entry] });
      setOhlcFor(null);
      await load();
    } catch (e: any) {
      alert('Failed to save day: ' + (e?.message ?? 'unknown error'));
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
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="bg-[#7fb3d5]/10 hover:bg-[#7fb3d5]/20 text-[#7fb3d5] border border-[#7fb3d5]/30 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Trade
          </button>
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
          <div className="overflow-x-auto rounded-2xl border border-[#7fb3d5]/25 bg-[#222e42] shadow-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#172234] text-[#8a9bb3] uppercase text-[10px] font-mono tracking-widest border-b border-white/10">
                  <th className="py-2.5 px-3 font-black">Symbol</th>
                  <th className="py-2.5 px-2 font-black">Dir</th>
                  <th className="py-2.5 px-2 font-black">Entry Date</th>
                  <th className="py-2.5 px-2 font-black text-right">Entry ₹</th>
                  <th className="py-2.5 px-2 font-black text-right">Days</th>
                  {Array.from({ length: dayCount }, (_, i) => (
                    <th key={i} className="py-2.5 px-2 font-black text-center min-w-[70px]">D{i + 1}</th>
                  ))}
                  <th className="py-2.5 px-2 font-black text-center">
                    <button
                      type="button"
                      title="Add another day column"
                      onClick={() => setVisibleDays((v) => v + 1)}
                      className="p-1 rounded-md bg-[#7fb3d5]/10 border border-[#7fb3d5]/30 text-[#7fb3d5] hover:bg-[#7fb3d5]/20 transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {openTrades.map((trade) => {
                  const nextSlot = trade.daily_data.length;
                  return (
                    <tr key={trade.id} className="hover:bg-white/5 transition align-top">
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
                      <td className="py-2.5 px-2 font-mono text-[#8a9bb3] text-xs text-right">{workingDaysBetween(trade.entry_date, todayStr())}</td>

                      {Array.from({ length: dayCount }, (_, dIdx) => {
                        const od = trade.daily_data[dIdx];
                        if (od) {
                          return (
                            <td key={dIdx} className="py-2 px-2 align-top">
                              <div className="space-y-0.5 min-w-[60px]">
                                <PctLine label="H" value={pct(od.high, trade.entry_price, trade.direction)} />
                                <PctLine label="L" value={pct(od.low, trade.entry_price, trade.direction)} />
                                <PctLine label="O" value={pct(od.open, trade.entry_price, trade.direction)} />
                                <PctLine label="C" value={pct(od.close, trade.entry_price, trade.direction)} />
                              </div>
                            </td>
                          );
                        }
                        if (dIdx === nextSlot) {
                          const isOpen = ohlcFor === trade.id;
                          return (
                            <td key={dIdx} className="py-2 px-2 align-top text-center">
                              {isOpen ? (
                                <div className="space-y-1 min-w-[120px] bg-[#172234] border border-[#7fb3d5]/30 rounded-lg p-2 text-left">
                                  <div className="text-[8px] text-[#8a9bb3] font-mono mb-1">{ohlcDateFor(trade)}</div>
                                  <div className="grid grid-cols-2 gap-1">
                                    {(['o', 'h', 'l', 'c'] as const).map((k) => (
                                      <input
                                        key={k}
                                        type="text"
                                        inputMode="decimal"
                                        placeholder={k.toUpperCase()}
                                        value={ohlc[k]}
                                        onChange={(e) => setOhlc((p) => ({ ...p, [k]: e.target.value }))}
                                        className="w-full bg-[#1a2332] border border-white/10 focus:border-[#7fb3d5] rounded px-1.5 py-1 text-[10px] text-[#e8edf4] focus:outline-none font-mono"
                                      />
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleAutoFill(trade)}
                                    className="w-full bg-[#5dcaa5]/15 border border-[#5dcaa5]/40 text-[#5dcaa5] rounded px-1 py-1 text-[9px] font-black font-mono uppercase cursor-pointer hover:bg-[#5dcaa5]/25 transition"
                                  >
                                    Auto-fill OHLC
                                  </button>
                                  <div className="flex gap-1 pt-0.5">
                                    <button type="button" onClick={() => submitOhlc(trade)} className="flex-1 bg-[#7fb3d5] text-[#161f2e] rounded px-1 py-1 text-[9px] font-black font-mono uppercase cursor-pointer">Save</button>
                                    <button type="button" onClick={() => setOhlcFor(null)} className="flex-1 bg-[#1e2a3d] border border-white/10 text-[#8a9bb3] rounded px-1 py-1 text-[9px] font-black font-mono uppercase cursor-pointer">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  title="Add this day's OHLC"
                                  onClick={() => openOhlcForm(trade)}
                                  className="p-1 rounded-md bg-[#172234] border border-white/10 text-[#8a9bb3] hover:text-[#7fb3d5] hover:border-[#7fb3d5]/40 transition cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              )}
                            </td>
                          );
                        }
                        return (
                          <td key={dIdx} className="py-2 px-2 text-center text-[#8a9bb3]/40 font-mono text-xs">·</td>
                        );
                      })}

                      <td className="py-2 px-2" />
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            title="Close trade"
                            onClick={() => {
                              setCloseFor(trade);
                              setCloseDate(todayStr());
                              setClosePrice('');
                            }}
                            className="p-1.5 rounded-lg bg-[#e8a04d]/10 border border-[#e8a04d]/30 text-[#e8a04d] hover:bg-[#e8a04d] hover:text-white transition cursor-pointer active:scale-95"
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </button>
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
