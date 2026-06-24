/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Trade, 
  getWeekInfo, 
  TradeStatus, 
  WeekInfo, 
  getWeeksBetween, 
  calculateTradeForWeek, 
  exportToExcel 
} from './types';
import WeeklyReport from './components/WeeklyReport';
import CumulativeStats from './components/CumulativeStats';
import InstrumentSummary from './components/InstrumentSummary';
import ExportLedgerView from './components/ExportLedgerView';
import NewTradeForm from './components/NewTradeForm';
import CheckPnLModal from './components/CheckPnLModal';
import CloseTradeModal from './components/CloseTradeModal';
import CarryForwardModal from './components/CarryForwardModal';
import EditTradeModal from './components/EditTradeModal';
import WhatIfCloseModal from './components/WhatIfCloseModal';
import TradeTracker from './components/TradeTracker';
import SignalIntelligence from './components/SignalIntelligence';
import { motion } from 'motion/react';
import {
  Sparkles,
  Trash2,
  Plus,
  TrendingUp,
  Info,
  BookOpen,
  HelpCircle,
  TrendingDown,
  Layers,
  Activity,
  ArrowLeft,
  Download,
  BookPlus,
  CandlestickChart,
  CalendarClock,
  Calendar,
  LogIn,
  LogOut,
  ShieldCheck
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import {
  WeekOffset,
  fetchWeekOffsets,
  saveWeekOffset,
  deleteWeekOffset,
} from './lib/offsets';
import { fetchPinHash } from './lib/pin';
import PinModal from './components/PinModal';

export default function App() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>('');
  const [currentView, setCurrentView] = useState<'menu' | 'weekly' | 'cumulative' | 'summary' | 'export' | 'tracker' | 'signals'>('menu');
  const [weekKeysList, setWeekKeysList] = useState<string[]>([]);

  // Modal Triggers
  const [showAddForm, setShowAddForm] = useState(false);
  const [checkPnLTrade, setCheckPnLTrade] = useState<Trade | null>(null);
  const [closeTradeTarget, setCloseTradeTarget] = useState<Trade | null>(null);
  const [carryForwardTarget, setCarryForwardTarget] = useState<{ trade: Trade; weekKey: string } | null>(null);
  const [editTradeTarget, setEditTradeTarget] = useState<Trade | null>(null);
  const [whatIfTradeTarget, setWhatIfTradeTarget] = useState<Trade | null>(null);

  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Per-week reconciliation offsets, keyed by ISO week key. Separate from trades.
  const [weekOffsets, setWeekOffsets] = useState<Record<string, WeekOffset>>({});

  // PIN gate for destructive actions.
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [pinIntent, setPinIntent] = useState<'authorize' | 'change' | null>(null);
  const [pinActionLabel, setPinActionLabel] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Check for an existing Supabase session on load, and subscribe to auth changes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load all of the signed-in user's trades from Supabase into in-memory state.
  // Starts empty — never auto-seeds demo trades. RLS scopes rows to the current user.
  useEffect(() => {
    if (!session) {
      setTrades([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('trades')
      .select('data, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load trades from Supabase:', error.message);
          setTrades([]);
          return;
        }
        setTrades((data ?? []).map((row) => row.data as Trade));
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Load the signed-in user's per-week offsets. Dedicated path — independent of the trades flow.
  useEffect(() => {
    if (!session) {
      setWeekOffsets({});
      return;
    }
    let cancelled = false;
    fetchWeekOffsets().then((map) => {
      if (!cancelled) setWeekOffsets(map);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Load the user's PIN hash (null until they set one). Dedicated path.
  useEffect(() => {
    if (!session) {
      setPinHash(null);
      return;
    }
    let cancelled = false;
    fetchPinHash().then((hash) => {
      if (!cancelled) setPinHash(hash);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Aurora canvas — gilded/neon particle/stream field behind every page. Binds once a
  // session exists; the <canvas> is now always mounted (outside the view switch).
  useEffect(() => {
    if (!session) return;
    const canvas = document.getElementById('aurora-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: any[] = [];
    const streams: any[] = [];

    const pColorTypes = ['gold', 'gold', 'gold', 'silver', 'silver', 'pink', 'green', 'blue', 'blue'];
    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.8 + 0.3,
        speedX: (Math.random() - 0.5) * 0.35,
        speedY: (Math.random() - 0.5) * 0.35,
        life: Math.random() * 200,
        maxLife: Math.random() * 200 + 100,
        gold: false,
        alpha: Math.random() * 0.5 + 0.15,
        colorType: pColorTypes[i % pColorTypes.length],
      });
    }

    const colorTypes = ['gold', 'gold', 'gold', 'silver', 'silver', 'pink', 'green', 'blue'];
    for (let i = 0; i < 30; i++) {
      streams.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        len: Math.random() * 130 + 60,
        speed: Math.random() * 0.7 + 0.25,
        angle: Math.PI / 2 + (Math.random() - 0.5) * 0.5,
        gold: Math.random() > 0.4,
        width: Math.random() * 1.0 + 0.3,
        alpha: Math.random() * 0.35 + 0.08,
        points: [] as { x: number; y: number }[],
        colorType: colorTypes[i % colorTypes.length],
      });
    }

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const g1 = ctx.createRadialGradient(W * 0.7, H * 0.2, 0, W * 0.7, H * 0.2, W * 0.55);
      g1.addColorStop(0, 'rgba(180,130,30,0.07)');
      g1.addColorStop(1, 'transparent');
      ctx.fillStyle = g1; ctx.globalAlpha = 1; ctx.fillRect(0, 0, W, H);

      const g2 = ctx.createRadialGradient(W * 0.2, H * 0.8, 0, W * 0.2, H * 0.8, W * 0.45);
      g2.addColorStop(0, 'rgba(180,180,200,0.05)');
      g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

      const g3 = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.4);
      g3.addColorStop(0, 'rgba(247,37,133,0.04)');
      g3.addColorStop(1, 'transparent');
      ctx.fillStyle = g3; ctx.globalAlpha = 1; ctx.fillRect(0, 0, W, H);

      const g4 = ctx.createRadialGradient(W * 0.1, H * 0.5, 0, W * 0.1, H * 0.5, W * 0.35);
      g4.addColorStop(0, 'rgba(0,200,120,0.04)');
      g4.addColorStop(1, 'transparent');
      ctx.fillStyle = g4; ctx.fillRect(0, 0, W, H);

      const g5 = ctx.createRadialGradient(W * 0.9, H * 0.7, 0, W * 0.9, H * 0.7, W * 0.3);
      g5.addColorStop(0, 'rgba(0,180,255,0.04)');
      g5.addColorStop(1, 'transparent');
      ctx.fillStyle = g5; ctx.fillRect(0, 0, W, H);

      streams.forEach(s => {
        s.y += s.speed * Math.sin(s.angle);
        s.x += s.speed * Math.cos(s.angle);
        s.points.push({ x: s.x, y: s.y });
        if (s.points.length > s.len) s.points.shift();
        if (s.y > H + 40 || s.x < -40 || s.x > W + 40) {
          s.x = Math.random() * W; s.y = -20; s.points = [];
        }
        if (s.points.length < 2) return;
        for (let i = 1; i < s.points.length; i++) {
          const t = i / s.points.length;
          ctx.globalAlpha = s.alpha * t * t;
          ctx.strokeStyle = (() => {
            const colorType = s.colorType;
            if (colorType === 'gold')
              return `rgba(${200 + Math.floor(t * 40)},${145 + Math.floor(t * 40)},${25 + Math.floor(t * 20)},1)`;
            if (colorType === 'silver')
              return `rgba(${175 + Math.floor(t * 65)},${175 + Math.floor(t * 65)},${195 + Math.floor(t * 45)},1)`;
            if (colorType === 'pink')
              return `rgba(247,${37 + Math.floor(t * 30)},${133 + Math.floor(t * 40)},${t})`;
            if (colorType === 'green')
              return `rgba(${0 + Math.floor(t * 40)},${255 - Math.floor(t * 30)},${100 + Math.floor(t * 50)},${t})`;
            if (colorType === 'blue')
              return `rgba(${0 + Math.floor(t * 30)},${180 + Math.floor(t * 30)},${255},${t})`;
            return `rgba(201,168,76,${t})`;
          })();
          ctx.lineWidth = s.width * t;
          ctx.beginPath();
          ctx.moveTo(s.points[i - 1].x, s.points[i - 1].y);
          ctx.lineTo(s.points[i].x, s.points[i].y);
          ctx.stroke();
        }
      });

      particles.forEach(p => {
        p.x += p.speedX; p.y += p.speedY; p.life++;
        if (p.life > p.maxLife || p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
          p.x = Math.random() * W; p.y = Math.random() * H; p.life = 0;
        }
        const t = p.life / p.maxLife;
        const a = t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;
        ctx.globalAlpha = p.alpha * a;
        ctx.fillStyle = (() => {
          if (p.colorType === 'gold')
            return `rgb(${180 + Math.floor(Math.random() * 40)},${138 + Math.floor(Math.random() * 30)},${28 + Math.floor(Math.random() * 35)})`;
          if (p.colorType === 'silver')
            return `rgb(${178 + Math.floor(Math.random() * 60)},${178 + Math.floor(Math.random() * 60)},${195 + Math.floor(Math.random() * 40)})`;
          if (p.colorType === 'pink')
            return `rgb(247,${37 + Math.floor(Math.random() * 20)},${133 + Math.floor(Math.random() * 40)})`;
          if (p.colorType === 'green')
            return `rgb(${Math.floor(Math.random() * 40)},${200 + Math.floor(Math.random() * 55)},${80 + Math.floor(Math.random() * 60)})`;
          if (p.colorType === 'blue')
            return `rgb(${Math.floor(Math.random() * 30)},${160 + Math.floor(Math.random() * 60)},255)`;
          return `rgb(180,138,28)`;
        })();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [session]);

  // Persist a state mutation to Supabase by diffing the previous list against the next.
  // Each Trade object is stored in the `data` jsonb column; rows are keyed by data->>id
  // (the in-memory Trade.id), so adds insert, edits update, and removals delete the row.
  // React state is updated synchronously/optimistically so the UI & PnL math are unchanged.
  const syncTradesToSupabase = async (prevList: Trade[], nextList: Trade[]) => {
    const prevById = new Map(prevList.map((t) => [t.id, t]));
    const nextById = new Map(nextList.map((t) => [t.id, t]));

    // Inserts and updates
    for (const trade of nextList) {
      const before = prevById.get(trade.id);
      if (!before) {
        const { error } = await supabase.from('trades').insert({ data: trade });
        if (error) console.error('Failed to add trade to Supabase:', error.message);
      } else if (JSON.stringify(before) !== JSON.stringify(trade)) {
        const { error } = await supabase
          .from('trades')
          .update({ data: trade })
          .eq('data->>id', trade.id);
        if (error) console.error('Failed to update trade in Supabase:', error.message);
      }
    }

    // Deletions
    for (const trade of prevList) {
      if (!nextById.has(trade.id)) {
        const { error } = await supabase.from('trades').delete().eq('data->>id', trade.id);
        if (error) console.error('Failed to delete trade from Supabase:', error.message);
      }
    }
  };

  // Sync state mutation with Supabase (replaces the previous localStorage chokepoint).
  const updateTradesState = (updatedList: Trade[]) => {
    const prevList = trades;
    setTrades(updatedList);
    void syncTradesToSupabase(prevList, updatedList);
  };

  // Determine current active week key
  useEffect(() => {
    if (trades.length > 0) {
      // Find the latest week referenced by our active trades
      const todayStr = new Date().toISOString().split('T')[0];
      const weekKeys = new Set<string>();
      weekKeys.add(getWeekInfo(todayStr).weekKey);

      trades.forEach(t => {
        const endLimitStr = t.status === 'Closed' || t.status === 'CarryForwardClosed'
          ? (t.direction === 'Long' ? (t.sellDate || todayStr) : (t.buyDate || todayStr))
          : todayStr;
        getWeeksBetween(t.dateInitiated, endLimitStr).forEach(w => weekKeys.add(w.weekKey));
      });

      const sorted = Array.from(weekKeys).sort();
      setWeekKeysList(sorted);
      // Set to latest active week in database
      if (!selectedWeekKey) {
        setSelectedWeekKey(sorted[sorted.length - 1]);
      }
    } else {
      const todayKey = getWeekInfo(new Date().toISOString().split('T')[0]).weekKey;
      setWeekKeysList([todayKey]);
      if (!selectedWeekKey) {
        setSelectedWeekKey(todayKey);
      }
    }
  }, [trades, selectedWeekKey]);

  // Actions
  const handleAddTrade = (newTrade: Trade) => {
    updateTradesState([newTrade, ...trades]);
  };

  const handleUpdateFridayClosingPrice = (tradeId: string, weekKey: string, price: number, exchangeRate?: number) => {
    const updated = trades.map(t => {
      if (t.id === tradeId) {
        return {
          ...t,
          fridayClosingPrices: {
            ...t.fridayClosingPrices,
            [weekKey]: price
          },
          fridayUsdToInrRates: exchangeRate !== undefined ? {
            ...t.fridayUsdToInrRates,
            [weekKey]: exchangeRate
          } : (t.fridayUsdToInrRates || {})
        };
      }
      return t;
    });
    updateTradesState(updated);
  };

  const handleConfirmCloseTrade = (
    tradeId: string, 
    exitPrice: number, 
    exitDate: string, 
    updatedStatus: TradeStatus,
    closedUsdToInrRate?: number
  ) => {
    const updated = trades.map(t => {
      if (t.id === tradeId) {
        return {
          ...t,
          status: updatedStatus,
          sellPrice: t.direction === 'Long' ? exitPrice : t.sellPrice,
          buyPrice: t.direction === 'Long' ? t.buyPrice : exitPrice,
          sellDate: t.direction === 'Long' ? exitDate : t.sellDate,
          buyDate: t.direction === 'Long' ? t.buyDate : exitDate,
          closedUsdToInrRate: closedUsdToInrRate !== undefined ? closedUsdToInrRate : t.closedUsdToInrRate
        };
      }
      return t;
    });
    updateTradesState(updated);
  };

  // Edit an existing trade in place: replace by id, keeping the same id so the existing
  // syncTradesToSupabase chokepoint UPDATEs the row (data->>id match) rather than inserting.
  // The PnL/week math recomputes from these edited inputs unchanged.
  const handleSaveEditedTrade = (updated: Trade) => {
    updateTradesState(trades.map(t => (t.id === updated.id ? updated : t)));
  };

  // Save (upsert) a week's reconciliation offset. Optimistic local update, then persist
  // via the dedicated offsets path (never through syncTradesToSupabase).
  const handleSaveOffset = async (weekKey: string, amount: number, note: string) => {
    setWeekOffsets((prev) => ({
      ...prev,
      [weekKey]: { ...prev[weekKey], weekKey, amount, note },
    }));
    if (!session) return;
    const saved = await saveWeekOffset(session.user.id, weekKey, amount, note);
    if (saved) {
      setWeekOffsets((prev) => ({ ...prev, [weekKey]: saved }));
    }
  };

  const handleClearOffset = async (weekKey: string) => {
    setWeekOffsets((prev) => {
      const copy = { ...prev };
      delete copy[weekKey];
      return copy;
    });
    if (!session) return;
    await deleteWeekOffset(session.user.id, weekKey);
  };

  // --- PIN-gated destructive actions ---
  // Open the PIN modal, remembering the action to run once the PIN is confirmed.
  const requirePin = (label: string, action: () => void) => {
    setPinActionLabel(label);
    setPendingAction(() => action);
    setPinIntent('authorize');
  };
  const closePinModal = () => {
    setPinIntent(null);
    setPendingAction(null);
    setPinActionLabel('');
  };
  const runPendingAction = () => {
    if (pendingAction) pendingAction();
    setPendingAction(null);
  };

  // The actual destructive operations — only invoked after the PIN is confirmed.
  const doResetDatabase = async () => {
    setTrades([]);
    if (session) {
      const { error } = await supabase.from('trades').delete().eq('user_id', session.user.id);
      if (error) console.error('Failed to reset trades in Supabase:', error.message);
    }
  };
  const doDeleteTrade = (trade: Trade) => {
    updateTradesState(trades.filter((t) => t.id !== trade.id));
  };

  // Gated UI entry points.
  const handleResetDatabase = () =>
    requirePin('Reset ALL data — permanently delete every trade in your ledger.', doResetDatabase);
  const handleDeleteTrade = (trade: Trade) =>
    requirePin(`Delete trade “${trade.symbol}” — this permanently removes it.`, () => doDeleteTrade(trade));

  // Auth actions
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) console.error('Google sign-in failed:', error.message);
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign-out failed:', error.message);
  };

  // Re-calculate real statistics for header widgets to mimic "High Density" top metrics
  let headerTotalNetProfit = 0;
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

    headerTotalNetProfit += (tradeGrossSum - tradeBrokerageSum);
  });

  const activeTradesCount = trades.filter(t => t.status === 'CarryForwardLong' || t.status === 'CarryForwardShort').length;

  // Open (carry-forward) positions — drive the hub's "active trades" badge.
  const openTrades = trades.filter(t => t.status === 'CarryForwardLong' || t.status === 'CarryForwardShort');
  const openCount = openTrades.length;
  const instrumentForOpen = openTrades[0]?.symbol ?? '—';

  // While the initial session check is in flight, hold a minimal splash to avoid flashing the login screen.
  if (authLoading) {
    return (
      <div className="min-h-screen bg-transparent text-[#9B5DE5] flex items-center justify-center font-mono text-xs uppercase tracking-widest">
        Loading…
      </div>
    );
  }

  // Not signed in — show a simple "Sign in with Google" gate instead of the ledger.
  if (!session) {
    return (
      <div className="min-h-screen bg-transparent text-slate-100 font-sans flex flex-col items-center justify-center relative overflow-hidden px-6">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#7fb3d5]/4 rounded-full blur-[130px] pointer-events-none animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] bg-[#7fb3d5]/4 rounded-full blur-[150px] pointer-events-none animate-pulse-slow" style={{ animationDelay: '3s' }} />
        <div className="relative z-10 text-center space-y-8 max-w-sm w-full">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#7fb3d5]/10 border border-[#7fb3d5]/20 rounded-full text-[9px] text-[#7fb3d5] font-mono tracking-widest uppercase font-black">
              ✦ Celestial Position Ledger ✦
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-[#7fb3d5] tracking-widest uppercase font-sans select-none">
              AILAHA PHALAM
            </h1>
          </div>
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full bg-[#7fb3d5]/10 hover:bg-[#7fb3d5]/20 text-[#7fb3d5] border border-[#7fb3d5]/30 font-bold px-4 py-3 rounded-xl text-sm transition duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.98]"
          >
            <LogIn className="w-4 h-4 text-[#7fb3d5]" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-100 font-sans selection:bg-[#9B5DE5]/20 selection:text-[#9B5DE5] flex flex-col justify-between relative overflow-hidden">
      {/* Immersive Background Glows matching Magi Sans style */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#7fb3d5]/4 rounded-full blur-[130px] pointer-events-none animate-pulse-slow" />
      <div className="absolute top-[35%] right-[-10%] w-[500px] h-[500px] bg-[#7fb3d5]/3 rounded-full blur-[140px] pointer-events-none animate-pulse-slow" style={{ animationDelay: '2.5s' }} />
      <div className="absolute bottom-[-10%] left-[10%] w-[550px] h-[550px] bg-[#7fb3d5]/4 rounded-full blur-[150px] pointer-events-none animate-pulse-slow" style={{ animationDelay: '5s' }} />

      <div className="relative z-10">
        {/* Aurora Canvas — always mounted, renders behind every page */}
        <canvas id="aurora-canvas" />

        {/* Premium High-Density Navigation/Header with Magi Colors — hidden on the revamped hub (it has its own header). */}
        {currentView !== 'menu' && (
        <header style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(8,5,2,0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(201,168,76,0.15)',
          padding: '0 24px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 56,
            maxWidth: '100%',
          }}>
            {/* Logo */}
            <div
              onClick={() => setCurrentView('menu')}
              title="Go to Homepage"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexShrink: 0,
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 34, height: 34,
                background: 'linear-gradient(135deg,#C9A84C,#E8D5A3)',
                borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 900, color: '#1A1200',
                fontFamily: "'DM Serif Display', serif",
              }}>A</div>
              <div>
                <div style={{
                  fontSize: 14, fontWeight: 800,
                  color: '#F0E6C8',
                  fontFamily: "'DM Serif Display', serif",
                  letterSpacing: '-0.2px', lineHeight: 1.2,
                }}>Ailaha Phalam</div>
                <div style={{
                  fontSize: 8, letterSpacing: '2.5px',
                  color: 'rgba(201,168,76,0.5)',
                  textTransform: 'uppercase',
                }}>Celestial Metrics</div>
              </div>
            </div>

            {/* Center — active trades */}
            {activeTradesCount > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(201,168,76,0.08)',
                border: '1px solid rgba(201,168,76,0.2)',
                borderRadius: 20, padding: '4px 14px',
                fontSize: 11, color: '#C9A84C', fontWeight: 700,
                letterSpacing: '0.5px',
              }}>
                <div style={{
                  width: 6, height: 6,
                  background: '#C9A84C', borderRadius: '50%',
                  animation: 'pulse 1.5s infinite',
                }} />
                {activeTradesCount} Active · CF
              </div>
            )}

            {/* Right — actions */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(201,168,76,0.1)',
                  border: '1px solid rgba(201,168,76,0.25)',
                  borderRadius: 10, padding: '6px 14px',
                  fontSize: 11, color: '#C9A84C', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.5px',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >+ New Trade</button>

              <button
                type="button"
                onClick={() => setPinIntent('change')}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(201,168,76,0.15)',
                  borderRadius: 10, padding: '6px 14px',
                  fontSize: 11, color: 'rgba(240,230,200,0.5)',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >PIN</button>

              <button
                type="button"
                onClick={() => supabase.auth.signOut()}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(201,168,76,0.15)',
                  borderRadius: 10, padding: '6px 14px',
                  fontSize: 11, color: 'rgba(240,230,200,0.4)',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >Sign out</button>
            </div>
          </div>
        </header>
        )}

        {/* Main Content Stage */}
        <main style={{
          width: '100%',
          minHeight: 'calc(100vh - 56px)',
          padding: '0',
          position: 'relative',
          zIndex: 1,
        }}>
          {currentView === 'menu' ? (
            <>
              {/* Hub */}
              <div style={{
                position: 'relative',
                zIndex: 1,
                minHeight: '100vh',
                padding: '0 24px 40px',
              }}>
                {/* Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '24px 0 32px',
                  borderBottom: '1px solid rgba(201,168,76,0.1)',
                  marginBottom: '40px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 42, height: 42,
                      background: 'linear-gradient(135deg,#C9A84C,#E8D5A3)',
                      borderRadius: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 900, color: '#1A1200',
                      fontFamily: "'DM Serif Display', serif",
                      flexShrink: 0,
                    }}>A</div>
                    <div>
                      <div style={{
                        fontSize: 20, fontWeight: 800, color: '#F0E6C8',
                        fontFamily: "'DM Serif Display', serif",
                        letterSpacing: '-0.3px',
                      }}>Ailaha Phalam</div>
                      <div style={{
                        fontSize: 9, letterSpacing: '3px',
                        color: 'rgba(201,168,76,0.5)',
                        textTransform: 'uppercase', marginTop: 2,
                      }}>Celestial Metrics</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: 'rgba(201,168,76,0.08)',
                      border: '1px solid rgba(201,168,76,0.2)',
                      borderRadius: 20, padding: '5px 14px',
                      fontSize: 11, color: '#C9A84C', fontWeight: 700,
                    }}>
                      <div style={{
                        width: 6, height: 6,
                        background: '#C9A84C', borderRadius: '50%',
                        animation: 'pulse 1.5s infinite',
                      }} />
                      {session?.user?.email?.split('@')[0] || 'AKS'}
                    </div>
                    <button
                      onClick={() => supabase.auth.signOut()}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(201,168,76,0.2)',
                        borderRadius: 8, padding: '6px 14px',
                        fontSize: 11, color: 'rgba(240,230,200,0.5)',
                        cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                      }}
                    >Sign out</button>
                  </div>
                </div>

                {/* Active trades badge */}
                {openCount > 0 && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: 'rgba(201,168,76,0.06)',
                    border: '1px solid rgba(201,168,76,0.15)',
                    borderRadius: 12, padding: '8px 16px',
                    marginBottom: 32, fontSize: 12, color: '#C9A84C', fontWeight: 600,
                  }}>
                    <span style={{
                      width: 8, height: 8, background: '#C9A84C',
                      borderRadius: '50%', display: 'inline-block',
                      animation: 'pulse 1.5s infinite',
                    }} />
                    {openCount} active trade{openCount !== 1 ? 's' : ''} · CF {instrumentForOpen}
                  </div>
                )}

                {/* 8 Tiles Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 16,
                  maxWidth: 960,
                  margin: '0 auto',
                }}>

                  {/* Tile 1 — Initiate Trade */}
                  <div className="tile tile-1" onClick={() => setShowAddForm(true)}>
                    <div className="tile-badge">New</div>
                    <div className="tile-icon">✦</div>
                    <div className="tile-title">Initiate Trade</div>
                    <div className="tile-desc">Open a new position in the ledger</div>
                  </div>

                  {/* Tile 2 — Current Week */}
                  <div className="tile tile-2" onClick={() => {
                    const todayKey = getWeekInfo(new Date().toISOString().split('T')[0]).weekKey;
                    if (weekKeysList.includes(todayKey)) {
                      setSelectedWeekKey(todayKey);
                    } else if (weekKeysList.length > 0) {
                      setSelectedWeekKey(weekKeysList[weekKeysList.length - 1]);
                    }
                    setCurrentView('weekly');
                  }}>
                    <div className="tile-icon">◎</div>
                    <div className="tile-title">Current Week</div>
                    <div className="tile-desc">This week's trades and P&L</div>
                  </div>

                  {/* Tile 3 — Last Week */}
                  <div className="tile tile-3" onClick={() => {
                    if (weekKeysList.length >= 2) {
                      setSelectedWeekKey(weekKeysList[weekKeysList.length - 2]);
                    } else {
                      const today = new Date();
                      today.setDate(today.getDate() - 7);
                      setSelectedWeekKey(getWeekInfo(today.toISOString().split('T')[0]).weekKey);
                    }
                    setCurrentView('weekly');
                  }}>
                    <div className="tile-icon">◷</div>
                    <div className="tile-title">Last Week</div>
                    <div className="tile-desc">Previous week performance</div>
                  </div>

                  {/* Tile 4 — History */}
                  <div className="tile tile-4" onClick={() => setCurrentView('cumulative')}>
                    <div className="tile-icon">⊛</div>
                    <div className="tile-title">History</div>
                    <div className="tile-desc">Full trade archive and search</div>
                  </div>

                  {/* Tile 5 — Summary */}
                  <div className="tile tile-5" onClick={() => setCurrentView('summary')}>
                    <div className="tile-icon">◈</div>
                    <div className="tile-title">Summary</div>
                    <div className="tile-desc">Cumulative stats and insights</div>
                  </div>

                  {/* Tile 6 — Export CSV */}
                  <div className="tile tile-6" onClick={() => setCurrentView('export')}>
                    <div className="tile-icon">⇣</div>
                    <div className="tile-title">Export CSV</div>
                    <div className="tile-desc">Download ledger data</div>
                  </div>

                  {/* Tile 7 — Trade Tracker */}
                  <div className="tile tile-7" onClick={() => setCurrentView('tracker')}>
                    {openCount > 0 && (
                      <div className="tile-badge">{openCount} open</div>
                    )}
                    <div className="tile-icon">⊕</div>
                    <div className="tile-title">Trade Tracker</div>
                    <div className="tile-desc">Signal outcome with OHLC</div>
                  </div>

                  {/* Tile 8 — Signal Intelligence */}
                  <div className="tile tile-8" onClick={() => setCurrentView('signals')}>
                    <div className="tile-badge">Live</div>
                    <div className="tile-icon">⟡</div>
                    <div className="tile-title">Signal Intelligence</div>
                    <div className="tile-desc">208 symbols · Manidhari signals</div>
                  </div>

                </div>

                {/* Bottom brand */}
                <div style={{
                  textAlign: 'center',
                  marginTop: 48,
                  fontSize: 10,
                  color: 'rgba(201,168,76,0.25)',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                }}>
                  Pragatprabhavi Intelligence System
                </div>
              </div>
            </>
          ) : currentView === 'tracker' ? (
            <TradeTracker session={session} setCurrentView={setCurrentView} />
          ) : currentView === 'signals' ? (
            <SignalIntelligence setCurrentView={setCurrentView} />
          ) : (
            <div className="space-y-5">
              {/* Back navigation strip */}
              <div className="flex items-center justify-between bg-[#1e2a3d] border border-white/10 px-4 py-3 rounded-2xl backdrop-blur-sm">
                <button
                  type="button"
                  id="back-to-menu-btn"
                  onClick={() => setCurrentView('menu')}
                  className="flex items-center gap-2 text-xs font-bold text-slate-100 hover:text-[#7fb3d5] transition bg-[#1e2a3d] px-4 py-2 rounded-xl border border-white/10 cursor-pointer active:scale-95 shadow-md"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#7fb3d5]" />
                  Back to Hub Menu
                </button>

                {currentView === 'weekly' && (
                  <span className="text-[10px] bg-[#1e2a3d] border border-white/10 text-[#7fb3d5] px-3.5 py-1.5 rounded-xl font-bold font-mono uppercase tracking-widest">
                    Weekly Ledger Active View
                  </span>
                )}
                {currentView === 'cumulative' && (
                  <span className="text-[10px] bg-[#1e2a3d] border border-white/10 text-[#7fb3d5] px-3.5 py-1.5 rounded-xl font-bold font-mono uppercase tracking-widest">
                    Cumulative Core Analytics View
                  </span>
                )}
                {currentView === 'summary' && (
                  <span className="text-[10px] bg-[#1e2a3d] border border-white/10 text-[#7fb3d5] px-3.5 py-1.5 rounded-xl font-bold font-mono uppercase tracking-widest">
                    Portfolio Segmented Summary
                  </span>
                )}
                {currentView === 'export' && (
                  <span className="text-[10px] bg-[#1e2a3d] border border-[#7fb3d5]/20 text-[#7fb3d5] px-3.5 py-1.5 rounded-xl font-bold font-mono uppercase tracking-widest">
                    Export Configuration Workspace
                  </span>
                )}
              </div>

              {currentView === 'weekly' && (
                <motion.div
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <WeeklyReport
                    trades={trades}
                    selectedWeekKey={selectedWeekKey}
                    onSelectWeek={setSelectedWeekKey}
                    onUpdateFridayClosingPrice={handleUpdateFridayClosingPrice}
                    onOpenCheckPnL={setCheckPnLTrade}
                    onOpenCloseTrade={setCloseTradeTarget}
                    onOpenCarryForward={(trade, weekKey) => setCarryForwardTarget({ trade, weekKey })}
                    onOpenEditTrade={setEditTradeTarget}
                    onOpenWhatIf={setWhatIfTradeTarget}
                    onDeleteTrade={handleDeleteTrade}
                    weekOffsets={weekOffsets}
                    onSaveOffset={handleSaveOffset}
                    onClearOffset={handleClearOffset}
                  />
                </motion.div>
              )}

              {currentView === 'cumulative' && (
                <motion.div
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <CumulativeStats trades={trades} weekOffsets={weekOffsets} />
                </motion.div>
              )}

              {currentView === 'summary' && (
                <motion.div
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <InstrumentSummary trades={trades} />
                </motion.div>
              )}

              {currentView === 'export' && (
                <motion.div
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <ExportLedgerView trades={trades} onOpenEditTrade={setEditTradeTarget} weekOffsets={weekOffsets} />
                </motion.div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Humble Aesthetic Footer — hidden on the revamped hub (it has its own bottom brand). */}
      {currentView !== 'menu' && (
      <footer style={{
        borderTop: '1px solid rgba(201,168,76,0.08)',
        padding: '12px 24px',
        textAlign: 'center',
        fontSize: 9,
        color: 'rgba(201,168,76,0.2)',
        letterSpacing: '2.5px',
        textTransform: 'uppercase',
        background: 'rgba(8,5,2,0.6)',
      }}>
        Ailaha Phalam · Position Ledger Logistics Engine
      </footer>
      )}


      {/* Modals & Popups */}
      {showAddForm && (
        <NewTradeForm
          onAddTrade={handleAddTrade}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {checkPnLTrade && (
        <CheckPnLModal
          trade={checkPnLTrade}
          onClose={() => setCheckPnLTrade(null)}
        />
      )}

      {closeTradeTarget && (
        <CloseTradeModal
          trade={closeTradeTarget}
          onConfirmClose={handleConfirmCloseTrade}
          onClose={() => setCloseTradeTarget(null)}
        />
      )}

      {carryForwardTarget && (
        <CarryForwardModal
          trade={carryForwardTarget.trade}
          weekKey={carryForwardTarget.weekKey}
          onUpdateFridayClosingPrice={handleUpdateFridayClosingPrice}
          onClose={() => setCarryForwardTarget(null)}
        />
      )}

      {editTradeTarget && (
        <EditTradeModal
          trade={editTradeTarget}
          onSave={handleSaveEditedTrade}
          onClose={() => setEditTradeTarget(null)}
        />
      )}

      {whatIfTradeTarget && (
        <WhatIfCloseModal
          trade={whatIfTradeTarget}
          onClose={() => setWhatIfTradeTarget(null)}
        />
      )}

      {pinIntent && session && (
        <PinModal
          userId={session.user.id}
          pinHash={pinHash}
          intent={pinIntent}
          actionLabel={pinActionLabel}
          onAuthorized={runPendingAction}
          onPinHashChange={setPinHash}
          onClose={closePinModal}
        />
      )}
    </div>
  );
}
