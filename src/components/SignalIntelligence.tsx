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
import { getLatestSignals, getLatestSignalPerTF, getAvailableDates, type SignalRow } from '../lib/signals';
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
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [filter, setFilter] = useState<'ALL' | 'LONG' | 'SHORT' | 'CONFLICT'>('ALL');
  const [search, setSearch] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];

  const load = async (date?: string) => {
    setLoading(true); setErr(null);
    try {
      const [perTFRes, all] = await Promise.all([getLatestSignalPerTF(date), getLatestSignals(date)]);
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

  // On mount: discover available dates and default to the newest.
  useEffect(() => {
    (async () => {
      try {
        const dates = await getAvailableDates();
        setAvailableDates(dates);
        if (dates.length > 0) setSelectedDate(dates[0]);
        else { setDataDate(''); setLoading(false); }
      } catch (e: any) {
        setErr(e?.message ?? 'Failed to load dates.');
        setLoading(false);
      }
    })();
  }, []);

  // Reload signals whenever the selected date changes; refresh it every 15 min.
  useEffect(() => {
    if (!selectedDate) return;
    void load(selectedDate);
    const id = setInterval(() => { void load(selectedDate); }, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [selectedDate]);

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
    fontSize: 10, fontWeight: 700, letterSpacing: '2.5px', color: '#8888AA',
    textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10
  };

  return (
    <div style={{
      width: '100%',
      minHeight: 'calc(100vh - 56px)',
      padding: '20px 28px 60px',
      color: '#F0E6C8',
      fontFamily: "'DM Sans', sans-serif",
    }}>

      {/* TOP BAR */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <div style={{
          fontSize: 9, fontWeight: 700,
          letterSpacing: '3px',
          textTransform: 'uppercase',
          color: 'rgba(201,168,76,0.4)',
        }}>Signal Intelligence · 208 Symbols</div>

        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 10, flexWrap: 'wrap',
        }}>
          {/* Stale warning */}
          {dataDate && dataDate !== todayStr && (
            <div style={{
              background: 'rgba(232,160,77,0.08)',
              border: '1px solid rgba(232,160,77,0.25)',
              borderRadius: 6, padding: '4px 12px',
              fontSize: 10, color: '#e8a04d',
              fontWeight: 600, letterSpacing: '0.5px',
            }}>
              ⚠ Data: {new Date(dataDate)
                .toLocaleDateString('en-IN',
                {day:'numeric',month:'short'})}
            </div>
          )}
          {/* Live badge */}
          {dataDate && dataDate === todayStr && (
            <div style={{
              display: 'flex', alignItems: 'center',
              gap: 5,
              background: 'rgba(131,131,104,0.1)',
              border: '1px solid rgba(131,131,104,0.3)',
              borderRadius: 6, padding: '4px 12px',
              fontSize: 10, color: '#838368',
              fontWeight: 700,
            }}>
              <div style={{
                width: 5, height: 5,
                background: '#838368',
                borderRadius: '50%',
                animation: 'pulse 1.5s infinite',
              }} />
              LIVE
            </div>
          )}
          {/* Last updated */}
          <span style={{
            fontSize: 10,
            color: 'rgba(240,230,200,0.3)',
            fontFamily: 'monospace',
          }}>
            {lastUpdated
              ? `Updated ${lastUpdated
                  .toLocaleTimeString()}`
              : '—'}
          </span>
          {/* Refresh */}
          <button
            type="button"
            onClick={() => {
              void load(selectedDate || undefined);
            }}
            style={{
              display: 'flex', alignItems: 'center',
              gap: 5,
              background: 'rgba(201,168,76,0.08)',
              border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: 6, padding: '5px 12px',
              fontSize: 10, color: '#C9A84C',
              fontWeight: 700, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <RefreshCw style={{width:11,height:11}} />
            Refresh
          </button>
        </div>
      </div>

      {/* DATE NAV */}
      {availableDates.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 6, flexWrap: 'wrap', marginBottom: 20,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: 'rgba(201,168,76,0.35)',
            marginRight: 4,
          }}>History</span>
          {availableDates.map((d) => {
            const isSel = d === selectedDate;
            const isToday = d === todayStr;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                style={{
                  display: 'flex',
                  alignItems: 'center', gap: 4,
                  background: isSel
                    ? 'rgba(201,168,76,0.15)'
                    : 'transparent',
                  border: isSel
                    ? '1px solid rgba(201,168,76,0.4)'
                    : '1px solid rgba(201,168,76,0.1)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 10, fontWeight: 700,
                  color: isSel
                    ? '#C9A84C'
                    : 'rgba(240,230,200,0.4)',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {isToday && (
                  <span style={{
                    color: isSel
                      ? '#C9A84C'
                      : 'rgba(201,168,76,0.4)',
                    fontSize: 10,
                  }}>●</span>
                )}
                {new Date(d).toLocaleDateString(
                  'en-IN',
                  {day:'numeric', month:'short'}
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 3 SUMMARY TILES */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3,1fr)',
        gap: 12,
        marginBottom: 24,
      }}>
        {/* Aligned Long */}
        <div style={{
          background: 'rgba(131,131,104,0.08)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(131,131,104,0.25)',
          borderRadius: 16,
          padding: '20px 24px',
          position: 'relative',
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700,
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            color: 'rgba(131,131,104,0.6)',
            marginBottom: 10,
            fontFamily: "'DM Sans', sans-serif",
          }}>Aligned / Mostly Long</div>
          <div style={{
            fontSize: 42, fontWeight: 800,
            color: '#838368', lineHeight: 1,
            letterSpacing: '-1px',
          }}>{counts.long}</div>
          <div style={{
            fontSize: 10, marginTop: 8,
            color: 'rgba(131,131,104,0.5)',
            letterSpacing: '0.5px',
          }}>symbols bullish</div>
        </div>

        {/* Aligned Short */}
        <div style={{
          background: 'rgba(201,150,12,0.07)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(201,150,12,0.2)',
          borderRadius: 16,
          padding: '20px 24px',
          position: 'relative',
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700,
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            color: 'rgba(201,150,12,0.5)',
            marginBottom: 10,
            fontFamily: "'DM Sans', sans-serif",
          }}>Aligned / Mostly Short</div>
          <div style={{
            fontSize: 42, fontWeight: 800,
            color: '#C9960C', lineHeight: 1,
            letterSpacing: '-1px',
          }}>{counts.short}</div>
          <div style={{
            fontSize: 10, marginTop: 8,
            color: 'rgba(201,150,12,0.4)',
            letterSpacing: '0.5px',
          }}>symbols bearish</div>
        </div>

        {/* Conflict */}
        <div style={{
          background: 'rgba(201,168,76,0.05)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(201,168,76,0.15)',
          borderRadius: 16,
          padding: '20px 24px',
          position: 'relative',
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700,
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            color: 'rgba(201,168,76,0.4)',
            marginBottom: 10,
            fontFamily: "'DM Sans', sans-serif",
          }}>Conflicting Signals</div>
          <div style={{
            fontSize: 42, fontWeight: 800,
            color: '#C9A84C', lineHeight: 1,
            letterSpacing: '-1px',
          }}>{counts.conflict}</div>
          <div style={{
            fontSize: 10, marginTop: 8,
            color: 'rgba(201,168,76,0.3)',
            letterSpacing: '0.5px',
          }}>mixed direction</div>
        </div>
      </div>

      {loading && symbols.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(201,168,76,0.1)',
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
          color: 'rgba(240,230,200,0.3)',
          fontWeight: 600, fontSize: 13,
        }}>Loading signals…</div>
      ) : err ? (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(201,168,76,0.15)',
          borderRadius: 12,
          padding: 24,
          textAlign: 'center',
          color: '#C9A84C',
          fontWeight: 600, fontSize: 12,
        }}>
          {err}
          <div style={{
            fontSize: 11,
            color: 'rgba(240,230,200,0.3)',
            marginTop: 8, fontWeight: 400,
          }}>
            Signals table may be empty for today.
          </div>
        </div>
      ) : (
        <>
          {/* 5 TF TILES — each contains top 5 */}
          <div style={{
            fontSize: 9, fontWeight: 700,
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: 'rgba(201,168,76,0.4)',
            marginBottom: 12,
            fontFamily: "'DM Sans', sans-serif",
          }}>Top Signals · Latest Scan</div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5,1fr)',
            gap: 12,
            marginBottom: 28,
          }}>
            {TF_LABELS.map((tf) => (
              <div key={tf} style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(201,168,76,0.12)',
                borderRadius: 16,
                overflow: 'hidden',
              }}>
                {/* TF Header */}
                <div style={{
                  padding: '12px 16px',
                  borderBottom:
                    '1px solid rgba(201,168,76,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(0,0,0,0.2)',
                }}>
                  <span style={{
                    fontSize: 15, fontWeight: 800,
                    color: TF_COLORS[tf],
                    letterSpacing: '0.5px',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    {tf === 'D' ? 'Daily' : tf + 'm'}
                  </span>
                  <span style={{
                    fontSize: 8, fontWeight: 700,
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    color: 'rgba(201,168,76,0.35)',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>TOP 5</span>
                </div>

                {/* Top 5 list */}
                <div style={{padding: '8px 0'}}>
                  {topByTF[tf] &&
                   topByTF[tf].length > 0
                    ? topByTF[tf].map((s, i) => {
                      const isLong =
                        s.signal.includes('LONG');
                      const isShort =
                        s.signal.includes('SHORT');
                      const sigColor = isLong
                        ? '#838368'
                        : isShort
                        ? '#C9960C'
                        : 'rgba(240,230,200,0.3)';
                      return (
                        <div key={i} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent:
                            'space-between',
                          padding: '8px 14px',
                          borderBottom:
                            i < topByTF[tf].length-1
                            ? '1px solid rgba(201,168,76,0.06)'
                            : 'none',
                        }}>
                          <div>
                            <div style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: '#F0E6C8',
                              letterSpacing: '0.2px',
                            }}>{s.symbol}</div>
                            <div style={{
                              fontSize: 9,
                              color: 'rgba(240,230,200,0.3)',
                              marginTop: 2,
                              fontFamily: 'monospace',
                            }}>
                              ₹{Number(s.price || 0)
                                .toLocaleString('en-IN')}
                            </div>
                          </div>
                          <span style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: sigColor,
                            letterSpacing: '0.5px',
                            fontFamily: "'DM Sans',sans-serif",
                          }}>
                            {getShortLabel(s.signal)}
                          </span>
                        </div>
                      );
                    })
                    : (
                      <div style={{
                        padding: '20px 14px',
                        textAlign: 'center',
                        color: 'rgba(240,230,200,0.2)',
                        fontSize: 11,
                      }}>No signals</div>
                    )
                  }
                </div>
              </div>
            ))}
          </div>

          {/* SIGNAL MATRIX */}
          <div style={{
            fontSize: 9, fontWeight: 700,
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: 'rgba(201,168,76,0.4)',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            All Symbols · Signal Matrix
            <span style={{
              background: 'rgba(201,168,76,0.08)',
              border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 9,
              color: '#C9A84C',
              fontWeight: 700,
            }}>{filtered.length} shown</span>
          </div>

          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(201,168,76,0.12)',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            {/* Matrix toolbar */}
            <div style={{
              padding: '12px 18px',
              borderBottom:
                '1px solid rgba(201,168,76,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 8,
              background: 'rgba(0,0,0,0.15)',
            }}>
              <span style={{
                fontSize: 9, fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: 'rgba(240,230,200,0.3)',
              }}>{symbols.length} symbols</span>
              <div style={{
                display: 'flex', gap: 6,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}>
                <input
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)}
                  placeholder="Search symbol..."
                  style={{
                    background:
                      'rgba(201,168,76,0.04)',
                    border:
                      '1px solid rgba(201,168,76,0.15)',
                    borderRadius: 6,
                    padding: '5px 10px',
                    color: '#F0E6C8',
                    fontSize: 11,
                    outline: 'none',
                    width: 130,
                    fontFamily:
                      "'DM Sans', sans-serif",
                  }}
                />
                {(['ALL','LONG','SHORT','CONFLICT'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 5,
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: 'pointer',
                      letterSpacing: '0.5px',
                      fontFamily:
                        "'DM Sans', sans-serif",
                      border: filter === f
                        ? '1px solid rgba(201,168,76,0.4)'
                        : '1px solid rgba(201,168,76,0.1)',
                      background: filter === f
                        ? 'rgba(201,168,76,0.12)'
                        : 'transparent',
                      color: filter === f
                        ? '#C9A84C'
                        : 'rgba(240,230,200,0.35)',
                    }}
                  >{f}</button>
                ))}
              </div>
            </div>

            {/* Matrix header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns:
                '160px repeat(5,1fr) 160px',
              padding: '8px 18px',
              background:
                'rgba(201,168,76,0.04)',
              borderBottom:
                '1px solid rgba(201,168,76,0.08)',
            }}>
              {['SYMBOL','15m','44m','60m',
                '75m','Daily','STATUS']
                .map((h, i) => (
                <div key={h} style={{
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  textAlign: i===0||i===6
                    ? 'left' : 'center',
                  color: i===0||i===6
                    ? 'rgba(240,230,200,0.3)'
                    : i===1 ? '#2D5283'
                    : i===2 ? '#B0785D'
                    : i===3 ? '#748794'
                    : i===4 ? '#5C534D'
                    : '#A09080',
                }}>{h}</div>
              ))}
            </div>

            {/* Matrix rows */}
            {filtered.length === 0 ? (
              <div style={{
                padding: 30,
                textAlign: 'center',
                color: 'rgba(240,230,200,0.2)',
                fontSize: 12,
              }}>No symbols match.</div>
            ) : filtered.map((row, i) => {
              const st = getStatusStyle(row.status);
              return (
                <div key={row.symbol} style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '160px repeat(5,1fr) 160px',
                  padding: '10px 18px',
                  alignItems: 'center',
                  borderBottom:
                    i < filtered.length-1
                    ? '1px solid rgba(201,168,76,0.05)'
                    : 'none',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement)
                    .style.background =
                    'rgba(201,168,76,0.03)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement)
                    .style.background = 'transparent';
                }}
                >
                  <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: '#F0E6C8',
                    letterSpacing: '0.2px',
                  }}>{row.symbol}</div>
                  {TF_LABELS.map((tf) => {
                    const sig =
                      perTF[row.symbol]?.[tf]
                        ?.signal || 'NEUTRAL';
                    const isL = sig.includes('LONG');
                    const isS =sig.includes('SHORT');
                    return (
                      <div key={tf} style={{
                        textAlign: 'center',
                      }}>
                        <span style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: isL
                            ? '#838368'
                            : isS
                            ? '#C9960C'
                            : 'rgba(240,230,200,0.15)',
                        }}>
                          {getShortLabel(sig)}
                        </span>
                      </div>
                    );
                  })}
                  <div>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                      background: row.status ===
                        'ALIGNED_LONG' ||
                        row.status === 'MOSTLY_LONG'
                        ? 'rgba(131,131,104,0.12)'
                        : row.status ===
                          'ALIGNED_SHORT' ||
                          row.status ===
                          'MOSTLY_SHORT'
                        ? 'rgba(201,150,12,0.1)'
                        : row.status === 'CONFLICT'
                        ? 'rgba(201,168,76,0.08)'
                        : 'transparent',
                      color: row.status ===
                        'ALIGNED_LONG' ||
                        row.status === 'MOSTLY_LONG'
                        ? '#838368'
                        : row.status ===
                          'ALIGNED_SHORT' ||
                          row.status ===
                          'MOSTLY_SHORT'
                        ? '#C9960C'
                        : row.status === 'CONFLICT'
                        ? '#C9A84C'
                        : 'rgba(240,230,200,0.2)',
                      border: '1px solid currentColor',
                    }}>{st.label}</span>
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
