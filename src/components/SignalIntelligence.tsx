/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Signal Intelligence — reads the Supabase `signals` table (populated by the
 * sync daemon), renders the Rumors-palette dashboard: per-timeframe top-5 cards
 * + an all-symbols signal matrix. Read-only; auto-refreshes every 15 minutes.
 * Self-contained — does not touch the trades ledger or PnL math.
 */
import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { getLatestSignals, getLatestSignalPerTF, type SignalRow } from '../lib/signals';
import { ArrowLeft, RefreshCw } from 'lucide-react';

interface Props {
  setCurrentView: (view: 'menu') => void;
}

const TF_LABELS = ['15', '44', '60', '75', 'D'];
const TF_COLORS: Record<string, string> = { '15': '#2D5283', '44': '#B0785D', '60': '#748794', '75': '#5C534D', 'D': '#A09080' };
const TF_TEXT: Record<string, string>   = { '15': '#EFEBE0', '44': '#EFEBE0', '60': '#EFEBE0', '75': '#EFEBE0', 'D': '#EFEBE0' };

const SIGNAL_PRIORITY: Record<string, number> = { JACKPOT: 1, EXTREME: 2, HATRICK: 3, GOLDILOCKS: 4, Q1: 5, NEUTRAL: 99 };
function prioOf(signal: string): number {
  if (!signal) return 99;
  if (signal.includes('JACKPOT')) return 1;
  if (signal.includes('EXTREME')) return 2;
  if (signal.includes('HATRICK')) return 3;
  if (signal.includes('GOLDILOCKS')) return 4;
  if (signal.includes('Q1')) return 5;
  return 99;
}

function getSignalStyle(signal: string) {
  if (!signal || signal === 'NEUTRAL') return { bg: '#F5F3F0', border: '#D4CABA', color: '#A09080', badgeBg: '#D4CABA', badgeColor: '#5C534D' };
  if (signal.includes('LONG'))  return { bg: '#F2F3EE', border: '#B8C0A8', color: '#838368', badgeBg: '#838368', badgeColor: '#fff' };
  if (signal.includes('SHORT')) return { bg: '#FDF8EE', border: '#E8D090', color: '#C9960C', badgeBg: '#C9960C', badgeColor: '#fff' };
  return { bg: '#F5F3F0', border: '#D4CABA', color: '#A09080', badgeBg: '#D4CABA', badgeColor: '#5C534D' };
}

function getSignalType(signal: string) {
  if (!signal || signal === 'NEUTRAL') return '—';
  if (signal.includes('JACKPOT')) return 'JP';
  if (signal.includes('HATRICK')) return 'HT';
  if (signal.includes('GOLDILOCKS')) return 'GL';
  if (signal.includes('EXTREME')) return 'EX';
  if (signal.includes('Q1')) return 'Q1';
  return '—';
}
function getArrow(signal: string) {
  if (!signal || signal === 'NEUTRAL') return '';
  return signal.includes('LONG') ? ' ↑' : ' ↓';
}
function getShortLabel(signal: string) {
  if (!signal || signal === 'NEUTRAL') return '—';
  const arrow = signal.includes('LONG') ? '↑' : '↓';
  const t = getSignalType(signal);
  return t === '—' ? '—' : t + ' ' + arrow;
}

type Status = 'ALIGNED_LONG' | 'ALIGNED_SHORT' | 'MOSTLY_LONG' | 'MOSTLY_SHORT' | 'CONFLICT' | 'NEUTRAL';
function computeStatus(perTf: Record<string, SignalRow>): Status {
  let longs = 0, shorts = 0;
  for (const tf of TF_LABELS) {
    const sig = perTf[tf]?.signal;
    if (!sig || sig === 'NEUTRAL') continue;
    if (sig.includes('LONG')) longs++;
    else if (sig.includes('SHORT')) shorts++;
  }
  if (longs === 0 && shorts === 0) return 'NEUTRAL';
  if (shorts === 0) return 'ALIGNED_LONG';
  if (longs === 0) return 'ALIGNED_SHORT';
  if (longs > shorts) return 'MOSTLY_LONG';
  if (shorts > longs) return 'MOSTLY_SHORT';
  return 'CONFLICT';
}
function getStatusStyle(status: Status) {
  switch (status) {
    case 'ALIGNED_LONG':  return { bg: '#F2F3EE', color: '#838368', border: '#B8C0A8', label: '✅ LONG' };
    case 'ALIGNED_SHORT': return { bg: '#FDF8EE', color: '#C9960C', border: '#E8D090', label: '✅ SHORT' };
    case 'CONFLICT':      return { bg: '#FDF9F5', color: '#7a6020', border: '#E8D090', label: '⚡ CONFLICT' };
    case 'MOSTLY_LONG':   return { bg: '#F2F3EE', color: '#838368', border: '#B8C0A8', label: '↗ MOSTLY LONG' };
    case 'MOSTLY_SHORT':  return { bg: '#FDF8EE', color: '#C9960C', border: '#E8D090', label: '↘ MOSTLY SHORT' };
    default:              return { bg: '#EFEBE0', color: '#A09080', border: '#D4CABA', label: '— NEUTRAL' };
  }
}

export default function SignalIntelligence({ setCurrentView }: Props) {
  const [perTF, setPerTF] = useState<Record<string, Record<string, SignalRow>>>({});
  const [allSignals, setAllSignals] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dataDate, setDataDate] = useState<string>('');
  const [filter, setFilter] = useState<'ALL' | 'LONG' | 'SHORT' | 'CONFLICT'>('ALL');
  const [search, setSearch] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const [perTFRes, all] = await Promise.all([getLatestSignalPerTF(), getLatestSignals()]);
      setPerTF(perTFRes.matrix);
      setAllSignals(all.signals);
      setDataDate(all.date);
      setLastUpdated(new Date());
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load signals.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, 15 * 60 * 1000); // 15 min
    return () => clearInterval(id);
  }, []);

  // Top 5 per timeframe, sorted by signal priority (then most recent).
  const topByTF = useMemo(() => {
    const out: Record<string, SignalRow[]> = {};
    for (const tf of TF_LABELS) {
      out[tf] = allSignals
        .filter((s) => s.timeframe === tf && s.signal && s.signal !== 'NEUTRAL')
        .sort((a, b) => prioOf(a.signal) - prioOf(b.signal) || (b.scan_time || '').localeCompare(a.scan_time || ''))
        .slice(0, 5);
    }
    return out;
  }, [allSignals]);

  const symbols = useMemo(() => Object.keys(perTF).sort(), [perTF]);
  const rows = useMemo(() => symbols.map((sym) => ({ symbol: sym, status: computeStatus(perTF[sym]) })), [symbols, perTF]);

  const filtered = rows.filter((r) => {
    const matchSearch = r.symbol.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'ALL' ||
      (filter === 'LONG' && (r.status === 'ALIGNED_LONG' || r.status === 'MOSTLY_LONG')) ||
      (filter === 'SHORT' && (r.status === 'ALIGNED_SHORT' || r.status === 'MOSTLY_SHORT')) ||
      (filter === 'CONFLICT' && r.status === 'CONFLICT');
    return matchSearch && matchFilter;
  });

  const counts = useMemo(() => {
    const c = { long: 0, short: 0, conflict: 0 };
    for (const r of rows) {
      if (r.status === 'ALIGNED_LONG' || r.status === 'MOSTLY_LONG') c.long++;
      else if (r.status === 'ALIGNED_SHORT' || r.status === 'MOSTLY_SHORT') c.short++;
      else if (r.status === 'CONFLICT') c.conflict++;
    }
    return c;
  }, [rows]);

  const sectionTitle: CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '2.5px', color: '#838368',
    textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10
  };

  return (
    <div style={{ background: '#EFEBE0', borderRadius: 16, padding: '20px 22px', fontFamily: "'DM Sans', 'Inter', sans-serif", color: '#5C534D' }}>

      {/* Local bar (Ailaha Phalam has its own header — this is just back + status) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <button
          type="button"
          onClick={() => setCurrentView('menu')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1.5px solid #D4CABA', color: '#5C534D', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} /> Back to Hub Menu
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {dataDate && dataDate !== todayStr && (
            <div style={{
              background: 'rgba(232,160,77,0.15)',
              border: '1px solid rgba(232,160,77,0.3)',
              borderRadius: 8,
              padding: '4px 12px',
              fontSize: 11,
              color: '#e8a04d',
              fontWeight: 600
            }}>
              ⚠️ Data as of {new Date(dataDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              {' '}— today's scan not yet synced
            </div>
          )}
          {dataDate && dataDate === todayStr && (
            <div style={{
              background: 'rgba(131,131,104,0.15)',
              border: '1px solid rgba(131,131,104,0.4)',
              borderRadius: 8,
              padding: '4px 12px',
              fontSize: 11,
              color: '#838368',
              fontWeight: 700
            }}>
              ● LIVE
            </div>
          )}
          <span style={{ fontSize: 11, color: '#A09080', fontFamily: 'monospace' }}>
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : '—'}
          </span>
          <button
            type="button"
            onClick={() => { void load(); }}
            title="Refresh now"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#864A4F', border: 'none', color: '#EFEBE0', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary stat cards (computed from live data) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 22 }}>
        {[
          { bg: '#838368', label: 'Aligned / mostly long', val: counts.long, textColor: '#EFEBE0', sub: 'rgba(239,235,224,0.65)' },
          { bg: '#C9960C', label: 'Aligned / mostly short', val: counts.short, textColor: '#fff', sub: 'rgba(255,255,255,0.7)' },
          { bg: '#864A4F', label: 'Conflicting', val: counts.conflict, textColor: '#EFEBE0', sub: 'rgba(239,235,224,0.65)' }
        ].map((h, i) => (
          <div key={i} style={{ background: h.bg, borderRadius: 16, padding: '18px 22px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: h.sub, marginBottom: 8 }}>{h.label}</div>
            <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: h.textColor }}>{h.val}</div>
          </div>
        ))}
      </div>

      {loading && symbols.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 40, textAlign: 'center', color: '#A09080', fontWeight: 700, fontSize: 13 }}>Loading signals…</div>
      ) : err ? (
        <div style={{ background: '#fff', border: '1.5px solid #E8D090', borderRadius: 16, padding: 24, textAlign: 'center', color: '#7a6020', fontWeight: 700, fontSize: 12 }}>
          {err}
          <div style={{ fontSize: 11, color: '#A09080', marginTop: 8, fontWeight: 400 }}>
            (If the `signals` table doesn't exist yet or has no rows for today, this will be empty.)
          </div>
        </div>
      ) : (
        <>
          {/* TOP SIGNALS PER TF */}
          <div style={sectionTitle}>
            <div style={{ width: 3, height: 14, background: '#864A4F', borderRadius: 3 }} />
            Top signals — latest scan
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 22 }}>
            {TF_LABELS.map((tf) => (
              <div key={tf} style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(92,83,77,0.1)' }}>
                <div style={{ background: TF_COLORS[tf], padding: '11px 13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: TF_TEXT[tf], letterSpacing: '0.5px' }}>{tf === 'D' ? 'Daily' : tf + 'm'}</span>
                  <span style={{ fontSize: 9, color: TF_TEXT[tf], opacity: 0.6, background: 'rgba(255,255,255,0.18)', padding: '2px 7px', borderRadius: 7, fontWeight: 600 }}>TOP 5</span>
                </div>
                <div style={{ background: '#fff', padding: 8, minHeight: 60 }}>
                  {topByTF[tf] && topByTF[tf].length > 0 ? topByTF[tf].map((s, i) => {
                    const st = getSignalStyle(s.signal);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 9px', borderRadius: 9, marginBottom: i < topByTF[tf].length - 1 ? 5 : 0, background: st.bg, border: `1.5px solid ${st.border}` }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: st.color }}>{s.symbol}</div>
                          <div style={{ fontSize: 11, marginTop: 1, fontFamily: 'monospace', color: st.color, opacity: 0.55 }}>₹{Number(s.price || 0).toLocaleString('en-IN')}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 7, background: st.badgeBg, color: st.badgeColor }}>{getShortLabel(s.signal)}</span>
                      </div>
                    );
                  }) : (
                    <div style={{ padding: 14, textAlign: 'center', color: '#A09080', fontSize: 11, fontWeight: 600 }}>No signals</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* SIGNAL MATRIX */}
          <div style={sectionTitle}>
            <div style={{ width: 3, height: 14, background: '#864A4F', borderRadius: 3 }} />
            All symbols — signal matrix
            <span style={{ background: '#fdf5f5', color: '#864A4F', border: '1.5px solid #e8c8ca', borderRadius: 10, padding: '2px 9px', fontSize: 9, fontWeight: 700 }}>{filtered.length} shown</span>
          </div>

          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(92,83,77,0.1)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1.5px solid #EFEBE0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#D4CABA', letterSpacing: '2px', textTransform: 'uppercase' }}>{symbols.length} symbols</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search symbol..."
                  style={{ background: '#EFEBE0', border: '1.5px solid #D4CABA', borderRadius: 8, padding: '5px 10px', color: '#5C534D', fontSize: 11, outline: 'none', width: 130, fontFamily: "'DM Sans', 'Inter', sans-serif" }} />
                {(['ALL', 'LONG', 'SHORT', 'CONFLICT'] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    style={{ padding: '5px 12px', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.3px',
                      border: `1.5px solid ${filter === f ? '#864A4F' : '#D4CABA'}`, background: filter === f ? '#864A4F' : '#fff', color: filter === f ? '#EFEBE0' : '#838368', fontFamily: "'DM Sans', 'Inter', sans-serif" }}>{f}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '150px repeat(5,1fr) 155px', padding: '10px 18px', background: '#EFEBE0', borderBottom: '1px solid #D4CABA' }}>
              {['SYMBOL', '15m', '44m', '60m', '75m', 'Daily', 'STATUS'].map((h, i) => (
                <div key={h} style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase',
                  textAlign: i === 0 || i === 6 ? 'left' : 'center',
                  color: i === 0 || i === 6 ? '#D4CABA' : i === 1 ? '#2D5283' : i === 2 ? '#B0785D' : i === 3 ? '#748794' : i === 4 ? '#5C534D' : '#A09080'
                }}>{h}</div>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#A09080', fontSize: 12, fontWeight: 600 }}>No symbols match.</div>
            ) : filtered.map((row, i) => {
              const st = getStatusStyle(row.status);
              return (
                <div key={row.symbol} style={{ display: 'grid', gridTemplateColumns: '150px repeat(5,1fr) 155px', padding: '10px 18px', alignItems: 'center', borderBottom: i < filtered.length - 1 ? '1px solid #EFEBE0' : 'none' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#5C534D' }}>{row.symbol}</div>
                  {TF_LABELS.map((tf) => {
                    const sig = perTF[row.symbol]?.[tf]?.signal || 'NEUTRAL';
                    return (
                      <div key={tf} style={{ textAlign: 'center' }}>
                        <span style={{ color: TF_COLORS[tf], fontSize: 13, fontWeight: 700 }}>{getSignalType(sig)}</span>
                        <span style={{ color: sig.includes('LONG') ? '#838368' : sig.includes('SHORT') ? '#C9960C' : '#A09080', fontSize: 14, fontWeight: 800, marginLeft: 2 }}>{getArrow(sig)}</span>
                      </div>
                    );
                  })}
                  <div>
                    <span style={{ display: 'inline-block', padding: '4px 11px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: st.bg, color: st.color, border: `1.5px solid ${st.border}` }}>{st.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
