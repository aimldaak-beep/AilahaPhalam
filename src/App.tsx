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
  const [currentView, setCurrentView] = useState<'menu' | 'weekly' | 'cumulative' | 'summary' | 'export'>('menu');
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

  // While the initial session check is in flight, hold a minimal splash to avoid flashing the login screen.
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#1a2332] text-[#7fb3d5] flex items-center justify-center font-mono text-xs uppercase tracking-widest">
        Loading…
      </div>
    );
  }

  // Not signed in — show a simple "Sign in with Google" gate instead of the ledger.
  if (!session) {
    return (
      <div className="min-h-screen bg-[#1a2332] text-slate-100 font-sans flex flex-col items-center justify-center relative overflow-hidden px-6">
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
    <div className="min-h-screen bg-[#1a2332] text-slate-100 font-sans selection:bg-[#7fb3d5]/20 selection:text-[#7fb3d5] flex flex-col justify-between relative overflow-hidden">
      {/* Immersive Background Glows matching Magi Sans style */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#7fb3d5]/4 rounded-full blur-[130px] pointer-events-none animate-pulse-slow" />
      <div className="absolute top-[35%] right-[-10%] w-[500px] h-[500px] bg-[#7fb3d5]/3 rounded-full blur-[140px] pointer-events-none animate-pulse-slow" style={{ animationDelay: '2.5s' }} />
      <div className="absolute bottom-[-10%] left-[10%] w-[550px] h-[550px] bg-[#7fb3d5]/4 rounded-full blur-[150px] pointer-events-none animate-pulse-slow" style={{ animationDelay: '5s' }} />

      <div className="relative z-10">
        {/* Premium High-Density Navigation/Header with Magi Colors */}
        <header className="border-b border-white/10 bg-[#1e2a3d] sticky top-0 z-40 px-6 py-4 shadow-xl">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-[#1e2a3d] border border-white/10 flex items-center justify-center font-sans text-xs font-black text-[#7fb3d5]">
                  AP
                </span>
                <div className="flex flex-col">
                  <h1 
                    onClick={() => setCurrentView('menu')}
                    title="Go to Homepage"
                    className="text-lg md:text-xl font-black tracking-widest text-[#7fb3d5] hover:opacity-90 transition duration-200 cursor-pointer select-none font-sans uppercase leading-none"
                  >
                    Ailaha Phalam
                  </h1>
                  <span className="text-[7.5px] uppercase tracking-widest font-mono text-[#7fb3d5]/70 font-black">Celestial Metrics</span>
                </div>
              </div>
              <div className="hidden sm:block h-6 w-px bg-white/10"></div>
              
              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-slate-300 font-bold font-mono">Active Trades</span>
                  <span className="text-xs font-mono text-[#7fb3d5] font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#7fb3d5] inline-block animate-ping" />
                    {activeTradesCount.toString().padStart(2, '0')} CF
                  </span>
                </div>
              </div>
            </div>

            {/* Setup controls & Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowAddForm(true)}
                id="new-trade-btn"
                className="bg-[#7fb3d5]/10 hover:bg-[#7fb3d5]/20 text-[#7fb3d5] border border-[#7fb3d5]/30 font-bold px-4 py-2 rounded-xl text-xs transition duration-200 flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-[0.98]"
              >
                <Plus className="w-4 h-4 text-[#7fb3d5]" />
                New Trade Action
              </button>
              <button
                onClick={handleResetDatabase}
                className="bg-[#1e2a3d] border border-white/5 hover:border-[#7fb3d5]/30 text-slate-300 hover:text-[#7fb3d5] px-3 py-2 rounded-xl text-xs transition duration-200 cursor-pointer"
                title="Reset all data (PIN protected)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPinIntent('change')}
                className="bg-[#1e2a3d] border border-white/5 hover:border-[#7fb3d5]/30 text-slate-300 hover:text-[#7fb3d5] px-3 py-2 rounded-xl text-xs transition duration-200 cursor-pointer flex items-center gap-1.5"
                title={pinHash ? 'Change security PIN' : 'Set security PIN'}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {pinHash ? 'Change PIN' : 'Set PIN'}
              </button>
              <button
                onClick={handleSignOut}
                className="bg-[#1e2a3d] border border-white/5 hover:border-[#7fb3d5]/30 text-slate-300 hover:text-[#7fb3d5] px-3 py-2 rounded-xl text-xs transition duration-200 cursor-pointer flex items-center gap-1.5"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Stage */}
        <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          {currentView === 'menu' ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl mx-auto py-10 px-2 space-y-12"
            >
              {/* Minimal Branding Name in clean solid Magi color */}
              <div className="text-center py-6 space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#7fb3d5]/10 border border-[#7fb3d5]/20 rounded-full text-[9px] text-[#7fb3d5] font-mono tracking-widest uppercase font-black">
                  ✦ Celestial Position Ledger ✦
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-[#7fb3d5] tracking-widest uppercase font-sans select-none">
                  AILAHA PHALAM
                </h2>
              </div>

              {/* Grand Card Grid (Sleek minimalist high density control cards) */}
              <div id="home-dashboard-grid" className="grid grid-cols-2 md:grid-cols-6 gap-3 max-w-5xl mx-auto">
                {/* 1. Add Trade card */}
                <button
                  type="button"
                  id="action-card-add"
                  onClick={() => setShowAddForm(true)}
                  className="group relative bg-[#222e42] hover:bg-[#2a3a52] border border-white/5 hover:border-[#7fb3d5]/30 rounded-2xl transition duration-200 cursor-pointer p-4 min-h-[110px] sm:min-h-[125px] flex flex-col items-center justify-center text-center active:scale-[0.98] shadow-md"
                >
                  <div className="p-2.5 bg-[#172234] text-[#7fb3d5] rounded-xl border border-white/5 shadow-inner mb-2.5">
                    <BookPlus className="w-5 h-5 text-[#7fb3d5]" />
                  </div>
                  <h3 className="font-extrabold text-[11px] sm:text-xs uppercase tracking-widest text-[#7fb3d5] font-sans">
                    Initiate Trade
                  </h3>
                </button>

                {/* 2. Current Week Status card */}
                <button
                  type="button"
                  id="action-card-current"
                  onClick={() => {
                    const todayKey = getWeekInfo(new Date().toISOString().split('T')[0]).weekKey;
                    if (weekKeysList.includes(todayKey)) {
                      setSelectedWeekKey(todayKey);
                    } else if (weekKeysList.length > 0) {
                      setSelectedWeekKey(weekKeysList[weekKeysList.length - 1]);
                    }
                    setCurrentView('weekly');
                  }}
                  className="group relative bg-[#222e42] hover:bg-[#2a3a52] border border-white/5 hover:border-[#7fb3d5]/30 rounded-2xl transition duration-200 cursor-pointer p-4 min-h-[110px] sm:min-h-[125px] flex flex-col items-center justify-center text-center active:scale-[0.98] shadow-md"
                >
                  <div className="p-2.5 bg-[#172234] text-[#7fb3d5] rounded-xl border border-white/5 shadow-inner mb-2.5">
                    <CandlestickChart className="w-5 h-5 text-[#7fb3d5]" />
                  </div>
                  <h3 className="font-extrabold text-[11px] sm:text-xs uppercase tracking-widest text-[#7fb3d5] font-sans">
                    Current Week
                  </h3>
                </button>

                {/* 3. Last Week Status card */}
                <button
                  type="button"
                  id="action-card-last"
                  onClick={() => {
                    if (weekKeysList.length >= 2) {
                      setSelectedWeekKey(weekKeysList[weekKeysList.length - 2]);
                    } else {
                      const today = new Date();
                      today.setDate(today.getDate() - 7);
                      setSelectedWeekKey(getWeekInfo(today.toISOString().split('T')[0]).weekKey);
                    }
                    setCurrentView('weekly');
                  }}
                  className="group relative bg-[#222e42] hover:bg-[#2a3a52] border border-white/5 hover:border-[#7fb3d5]/30 rounded-2xl transition duration-200 cursor-pointer p-4 min-h-[110px] sm:min-h-[125px] flex flex-col items-center justify-center text-center active:scale-[0.98] shadow-md"
                >
                  <div className="p-2.5 bg-[#172234] text-[#7fb3d5] rounded-xl border border-white/5 shadow-inner mb-2.5">
                    <CalendarClock className="w-5 h-5 text-[#7fb3d5]" />
                  </div>
                  <h3 className="font-extrabold text-[11px] sm:text-xs uppercase tracking-widest text-[#7fb3d5] font-sans">
                    Last Week
                  </h3>
                </button>

                {/* 4. History card */}
                <button
                  type="button"
                  id="action-card-history"
                  onClick={() => setCurrentView('cumulative')}
                  className="group relative bg-[#222e42] hover:bg-[#2a3a52] border border-white/5 hover:border-[#7fb3d5]/30 rounded-2xl transition duration-200 cursor-pointer p-4 min-h-[110px] sm:min-h-[125px] flex flex-col items-center justify-center text-center active:scale-[0.98] shadow-md"
                >
                  <div className="p-2.5 bg-[#172234] text-[#7fb3d5] rounded-xl border border-white/5 shadow-inner mb-2.5">
                    <Calendar className="w-5 h-5 text-[#7fb3d5]" />
                  </div>
                  <h3 className="font-extrabold text-[11px] sm:text-xs uppercase tracking-widest text-[#7fb3d5] font-sans">
                    History
                  </h3>
                </button>

                {/* 5. Summary card */}
                <button
                  type="button"
                  id="action-card-summary"
                  onClick={() => setCurrentView('summary')}
                  className="group relative bg-[#222e42] hover:bg-[#2a3a52] border border-white/5 hover:border-[#7fb3d5]/30 rounded-2xl transition duration-200 cursor-pointer p-4 min-h-[110px] sm:min-h-[125px] flex flex-col items-center justify-center text-center active:scale-[0.98] shadow-md"
                >
                  <div className="p-2.5 bg-[#172234] text-[#7fb3d5] rounded-xl border border-white/5 shadow-inner mb-2.5">
                    <Activity className="w-5 h-5 text-[#7fb3d5]" />
                  </div>
                  <h3 className="font-extrabold text-[11px] sm:text-xs uppercase tracking-widest text-[#7fb3d5] font-sans">
                    Summary
                  </h3>
                </button>

                {/* 6. Export CSV card */}
                <button
                  type="button"
                  id="action-card-export"
                  onClick={() => setCurrentView('export')}
                  className="group relative bg-[#222e42] hover:bg-[#2a3a52] border border-[#7fb3d5]/20 hover:border-[#7fb3d5]/40 rounded-2xl transition duration-200 cursor-pointer p-4 min-h-[110px] sm:min-h-[125px] flex flex-col items-center justify-center text-center active:scale-[0.98] shadow-md"
                >
                  <div className="p-2.5 bg-[#172234] text-[#7fb3d5] rounded-xl border-[#7fb3d5]/20 shadow-inner mb-2.5">
                    <Download className="w-5 h-5 text-[#7fb3d5]" />
                  </div>
                  <h3 className="font-extrabold text-[11px] sm:text-xs uppercase tracking-widest text-[#7fb3d5] font-sans">
                    Export CSV
                  </h3>
                </button>
              </div>
            </motion.div>
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

      {/* Humble Aesthetic Footer */}
      <footer className="border-t border-white/5 bg-slate-950/40 py-6 text-slate-500 text-center text-[10px] font-mono tracking-wider">
        <p className="font-extrabold text-slate-400">AILAHA PHALAM • POSITION LEDGER LOGISTICS ENGINE</p>
      </footer>


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
