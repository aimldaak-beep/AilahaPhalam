/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AILAHA PHALAM v2 — built to DESIGN_SPEC.jsx verbatim (layout / spacing / type /
 * both themes / interactions), wired to real Supabase data and the v1 engine.
 * Google OAuth unchanged. Persistence maps onto the preserved tables (see
 * supabase/migrations/20260824000000_v2_schema.sql for the mapping + ideal DDL).
 */
import { useState, useEffect, useMemo, Fragment } from 'react';
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent, CSSProperties } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Trade, TradeDirection, estimateInstantPnL, getWeeksBetween } from './types';
import {
  INSTR, SpecInstrument, specNameOf, signed, nf,
  weekKeyOf, mondayOf, todayStr, weekLabel, heldDays,
  isOpen, isClosed, liveMtmRows, liveMtm, realized, closeDateOf, latestUsdRate, entryLegBrokerage,
  dispCcy, sgn, px, signedUsd, nativePnl, tradeRate, hasLegacyRates, exitLegBrokerage,
} from './lib/v2engine';
import { isDocRow, shiftISO } from './lib/fxmodel';
import { journalWeeks, closedByWeek, weekPieces, reconcile, owesStampFor } from './lib/weekly';
import type { WeekPiece } from './lib/weekly';
import {
  fetchWeeklyMarks, syncWeeklyMarksForTrade, deleteWeeklyMarksForTrade, overlayMissingMarks,
} from './lib/marks';
import { fetchPinHash, savePinHash, hashPin } from './lib/pin';
import { fetchAllowlist, isAllowed, saveAllowlist, BOOTSTRAP_OWNERS } from './lib/allowlist';

const THEMES = {
  white:  { name: 'White',  bg: '#FFFFFF', ink: '#17181A', faint: '#878B87', hair: '#E7E8E5', profit: '#0A7D4F', loss: '#C2402E', swatch: '#FFFFFF' },
  forest: { name: 'Forest', bg: '#121712', ink: '#E9EDE7', faint: '#8FA284', hair: '#27301F', profit: '#EFC44F', loss: '#ABB0AA', swatch: '#121712' },
} as const;
type ThemeKey = keyof typeof THEMES;
type PinAction = 'edit' | 'delete' | 'live-edit' | 'live-delete' | 'team';
type EditState = {
  id: string; kind: 'live' | 'closed';
  symbol: string; instr: SpecInstrument; side: 'LONG' | 'SHORT'; lots: string; mult: string; entry: string; date: string;
  ccy: 'INR' | 'USD'; rate: string; real: number; entryBrok: string;   // rate = the trade's own USD/INR (USD only)
  exit: string; exitBrok: string; closedDate: string;   // closed-only (blank for live)
  origInstr: SpecInstrument; origCcy: 'INR' | 'USD';
};
// JOB 5 — raised type scale (supersedes DESIGN_SPEC's SZ values).
const SZ = { hero: 64, big: 50, num: 19, numSm: 17, meta: 15, label: 13, btn: 15, symbol: 20 };

const isoFromForm = (s: string) => {
  // accepts dd-mm-yyyy (spec) or yyyy-mm-dd; returns yyyy-mm-dd
  const m = s.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s.trim();
};
const dmy = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [pinHash, setPinHash] = useState<string | null>(null);

  const [themeKey, setThemeKey] = useState<ThemeKey>(() => (localStorage.getItem('ap_theme') as ThemeKey) || 'forest');
  const t = THEMES[themeKey];
  const [view, setView] = useState<'live' | 'journal' | 'closedv' | 'add'>('live');

  const todayISO = todayStr();

  // ---- Settlement ask law ("the Saturday voice"), evaluated in IST ----
  // From Saturday 17:00 IST the ENDING week is asked. If it is still unsettled after
  // Sunday, it stays asked (overdue) from Monday until settled. Exactly one week is ever
  // asked: the most recent one whose Saturday 17:00 has passed. Trades initiated on or
  // after that Saturday wait for the next one.
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const p2 = (n: number) => String(n).padStart(2, '0');
  const istDateISO = `${nowIST.getFullYear()}-${p2(nowIST.getMonth() + 1)}-${p2(nowIST.getDate())}`;
  const satPassed = (nowIST.getDay() === 6 && nowIST.getHours() >= 17) || nowIST.getDay() === 0;
  const askDateISO = satPassed ? istDateISO : shiftISO(istDateISO, -7);
  const endWeekKey = weekKeyOf(askDateISO);
  const endWeekMondayISO = mondayOf(askDateISO);
  const saturdayISO = shiftISO(endWeekMondayISO, 5);
  const askOverdue = !satPassed; // Monday onward with the week still open = red
  // STAMP WINDOW (2026-09-14): the live card shows stamp rows ONLY from Saturday 00:00 IST through
  // Sunday, and only for THAT week (the one whose Friday close just passed). Monday–Friday the card
  // shows the trade and nothing about stamps; stamps stay reachable via the journal week. The
  // Saturday 17:00 alert is unaffected.
  const stampWindow = nowIST.getDay() === 6 || nowIST.getDay() === 0;
  const stampWeekKey = weekKeyOf(istDateISO);

  const [closeEdit, setCloseEdit] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [stampAll, setStampAll] = useState<string | null>(null);          // journal "Stamp all" form open for this weekKey
  const [stampVals, setStampVals] = useState<Record<string, string>>({}); // typed closes, keyed tradeId|weekKey
  const [stampErr, setStampErr] = useState('');
  const [alertDismissed, setAlertDismissed] = useState(false);            // main-page pending alert; returns on any view change
  const [formErr, setFormErr] = useState('');
  const [editErr, setEditErr] = useState('');
  const [closing, setClosing] = useState<{ id: string; px: string; err?: string } | null>(null);
  const [pinOk, setPinOk] = useState(false);
  const [pinAsk, setPinAsk] = useState<{ action: PinAction; id: string } | null>(null);
  const [pinSet, setPinSet] = useState(false); // true when the modal is in SET-PIN mode
  const [pinVal, setPinVal] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [edit, setEdit] = useState<EditState | null>(null);
  const [editConfirm, setEditConfirm] = useState<{ trade: Trade; notes: string[] } | null>(null);
  const [liveDelete, setLiveDelete] = useState<Trade | null>(null);
  const [whatIf, setWhatIf] = useState<{ id: string; exit: string; rate: string } | null>(null); // calculator only — writes nothing
  const [allowlist, setAllowlist] = useState<string[] | null>(null); // null = still loading
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamNew, setTeamNew] = useState('');
  const [teamMsg, setTeamMsg] = useState('');
  const [dlOpen, setDlOpen] = useState(false);
  const [closedOpen, setClosedOpen] = useState<Record<string, boolean>>({}); // Closed view: week expanded/collapsed overrides (default: latest 2 open)
  const [dlMode, setDlMode] = useState<'all' | 'selected' | 'range'>('all');
  const [dlFrom, setDlFrom] = useState('');
  const [dlTo, setDlTo] = useState('');
  const [form, setForm] = useState({ sym: '', instr: 'DOW' as SpecInstrument, side: 'LONG' as 'LONG' | 'SHORT', qty: '1', mult: '5', price: '', date: dmyInput(todayISO), ccy: 'USD' as 'USD' | 'INR', rate: '', real: 0.8, brok: '' });

  // ---- auth ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // ---- load trades + marks ----
  useEffect(() => {
    if (!session) { setTrades([]); return; }
    let cancelled = false;
    supabase.from('trades').select('data, created_at').order('created_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('load trades:', error.message); setTrades([]); return; }
        // The trades table also carries the retired FX-store sentinel row — never a Trade.
        const loaded = (data ?? []).filter((r) => !isDocRow(r.data)).map((r) => r.data as Trade);
        const marks = await fetchWeeklyMarks();
        if (!cancelled) setTrades(overlayMissingMarks(loaded, marks));
      });
    return () => { cancelled = true; };
  }, [session]);

  // ---- load pin hash ----
  useEffect(() => {
    if (!session) { setPinHash(null); return; }
    let cancelled = false;
    fetchPinHash().then((h) => { if (!cancelled) setPinHash(h); });
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => { localStorage.setItem('ap_theme', themeKey); }, [themeKey]);

  // ---- load email allowlist (public bucket) ----
  useEffect(() => {
    if (!session) { setAllowlist(null); return; }
    let cancelled = false;
    fetchAllowlist().then((l) => { if (!cancelled) setAllowlist(l); });
    return () => { cancelled = true; };
  }, [session]);

  const live = useMemo(() => trades.filter(isOpen), [trades]);
  const closed = useMemo(() => trades.filter(isClosed), [trades]);

  // ---- WEEKLY CLOSE STAMPS (2026-09-12 law): a stamp field on every live trade from the moment
  // it is live (any week it is alive, editable any time) + "Stamp all" in the journal + a
  // main-page alert from Saturday 17:00 IST while any live trade is unstamped for the asked
  // week (endWeekKey: this week from Sat 17:00; the previous week before that — overdue).
  // The old auto-popup Saturday panel is retired; its data (fridayClosingPrices) is unchanged.
  // STAMP LAW: owed only for weeks the trade was alive at the close of (opened on/before that Friday).
  const unstampedFor = (weekKey: string) => live.filter((tr) => owesStampFor(tr, weekKey) && tr.fridayClosingPrices[weekKey] == null);
  const pendingTrades = live.filter((tr) => tr.dateInitiated < saturdayISO && tr.fridayClosingPrices[endWeekKey] == null);
  const alertDue = pendingTrades.length > 0;
  const alertUrgent = nowIST.getDay() !== 6; // Sunday onward (the week ended unstamped) = urgent
  const showAlert = alertDue && !alertDismissed;
  useEffect(() => { setAlertDismissed(false); }, [view]); // dismissible, but returns while unstamped
  // W-header: on Sat/Sun, once the ending week's stamps are all in, the header shows next week.
  const headMondayISO = satPassed && !alertDue ? shiftISO(mondayOf(todayISO), 7) : mondayOf(todayISO);

  // ---- persistence: diff prev vs next, mirror to Supabase ----
  const persist = async (prev: Trade[], next: Trade[]) => {
    const uid = session?.user.id;
    const prevById = new Map(prev.map((x) => [x.id, x]));
    const nextById = new Map(next.map((x) => [x.id, x]));
    for (const tr of next) {
      const before = prevById.get(tr.id);
      if (!before) {
        const { error } = await supabase.from('trades').insert({ data: tr });
        if (error) console.error('insert trade:', error.message);
        if (uid) await syncWeeklyMarksForTrade(uid, tr);
      } else if (JSON.stringify(before) !== JSON.stringify(tr)) {
        const { error } = await supabase.from('trades').update({ data: tr }).eq('data->>id', tr.id);
        if (error) console.error('update trade:', error.message);
        if (uid) await syncWeeklyMarksForTrade(uid, tr, before);
      }
    }
    for (const tr of prev) {
      if (!nextById.has(tr.id)) {
        const { error } = await supabase.from('trades').delete().eq('data->>id', tr.id);
        if (error) console.error('delete trade:', error.message);
        if (uid) await deleteWeeklyMarksForTrade(uid, tr.id);
      }
    }
  };
  const update = (next: Trade[]) => { const prev = trades; setTrades(next); void persist(prev, next); };

  // ---- derived totals ----
  // ONE ₹ headline: every trade (USD legs converted at the trade's OWN rate) sums into it.
  // NaN only if a USD trade has no rate — rendered loudly, never defaulted.
  const totalLive = useMemo(() => live.reduce((s, tr) => s + liveMtm(tr), 0), [live]);
  const totalClosed = useMemo(() => closed.reduce((s, tr) => s + realized(tr), 0), [closed]);
  const selSum = useMemo(() => closed.filter((tr) => sel.includes(tr.id)).reduce((s, tr) => s + realized(tr), 0), [sel, closed]);

  // ---- actions ----
  // Stamp typed closes for one week onto the given trades (typed values only — nothing is ever
  // auto-filled). Used by the per-card stamp row and the journal "Stamp all" form.
  const stampKey = (id: string, weekKey: string) => id + '|' + weekKey;
  const applyStamps = (weekKey: string, ids: string[]) => {
    const set = new Set(ids);
    const next = trades.map((tr) => {
      if (!set.has(tr.id)) return tr;
      const v = stampVals[stampKey(tr.id, weekKey)];
      if (v == null || v === '' || !(+v > 0) || tr.fridayClosingPrices[weekKey] === +v) return tr;
      return { ...tr, fridayClosingPrices: { ...tr.fridayClosingPrices, [weekKey]: +v } };
    });
    if (next.some((x, i) => x !== trades[i])) update(next);
  };
  const stampAllSave = (weekKey: string) => {
    const owed = unstampedFor(weekKey);
    const missing = owed.filter((tr) => !(+(stampVals[stampKey(tr.id, weekKey)] ?? '') > 0)).map((tr) => tr.symbol);
    applyStamps(weekKey, owed.map((tr) => tr.id));
    if (missing.length && missing.length < owed.length) { setStampErr(`Stamped what you entered — still unstamped: ${missing.join(', ')}.`); return; }
    if (missing.length === owed.length && owed.length) { setStampErr('Enter at least one closing price.'); return; }
    setStampErr(''); setStampAll(null);
  };

  // Inline-editable weekly CLOSE value (per trade), same UX as @rate — no PIN. MTM recomputes.
  const editClose = (weekKey: string, tradeId: string, close: number) => {
    const next = trades.map((tr) =>
      tr.id === tradeId ? { ...tr, fridayClosingPrices: { ...tr.fridayClosingPrices, [weekKey]: close } } : tr);
    update(next);
  };

  const closeTrade = () => {
    if (!closing || !closing.px) return;
    const tr = live.find((x) => x.id === closing.id);
    if (!tr) return;
    const exit = +closing.px;
    // USD closes convert at the trade's own rate (already on the trade) — nothing to ask.
    const updated: Trade = {
      ...tr,
      status: 'Closed',
      sellPrice: tr.direction === 'Long' ? exit : tr.sellPrice,
      buyPrice: tr.direction === 'Long' ? tr.buyPrice : exit,
      sellDate: tr.direction === 'Long' ? todayISO : tr.sellDate,
      buyDate: tr.direction === 'Long' ? tr.buyDate : todayISO,
    } as Trade;
    update(trades.map((x) => (x.id === tr.id ? updated : x)));
    setClosing(null);
  };

  const deploy = () => {
    const mult = +form.mult;
    if (!form.sym || !form.price || !(mult > 0)) { setFormErr('Symbol, price and a multiplier > 0 are required.'); return; }
    const meta = INSTR[form.instr];
    const ccy: 'INR' | 'USD' = form.ccy;
    // PER-TRADE FX: a USD trade carries its own USD/INR rate from the moment it opens.
    const rate = +form.rate;
    if (ccy === 'USD' && !(rate > 0)) { setFormErr('USD/INR rate required — this trade converts at its own rate for its whole life.'); return; }
    setFormErr('');
    const price = +form.price;
    const now = `trade_${Date.now()}_${Math.floor(performance.now())}`;
    const brok = form.brok.trim() !== '' ? +form.brok : null;
    const newTrade: Trade = {
      id: now,
      symbol: form.sym.toUpperCase(),
      instrument: meta.v1,
      direction: form.side === 'LONG' ? 'Long' : 'Short',
      dateInitiated: isoFromForm(form.date),
      buyPrice: form.side === 'LONG' ? price : null,
      sellPrice: form.side === 'LONG' ? null : price,
      buyDate: form.side === 'LONG' ? isoFromForm(form.date) : null,
      sellDate: form.side === 'LONG' ? null : isoFromForm(form.date),
      lotSize: mult,
      numberOfLots: +form.qty || 1,
      status: form.side === 'LONG' ? 'CarryForwardLong' : 'CarryForwardShort',
      currency: ccy,
      // The trade's own USD/INR rate for its whole life (editable via Edit trade).
      usdToInrRate: ccy === 'USD' ? rate : 1,
      fridayUsdToInrRates: {},
      realizationRate: ccy === 'INR' ? 1.0 : form.real,
      fridayClosingPrices: {},
      entryBrokerage: brok,
      exitBrokerage: null,
    };
    update([newTrade, ...trades]);
    setForm({ ...form, sym: '', price: '', rate: '' });
    setView('live');
  };

  // ---- PIN gate ----
  const askPin = (action: PinAction, id: string) => {
    setPinAsk({ action, id }); setPinVal(''); setPinErr('');
    setPinSet(pinHash == null); // no pin yet -> SET-PIN flow
  };
  const runAction = (action: PinAction, id: string) => {
    if (action === 'edit') { const tr = closed.find((x) => x.id === id); if (tr) openEdit(tr, 'closed'); }
    else if (action === 'delete') { update(trades.filter((x) => x.id !== id)); setSel((s) => s.filter((i) => i !== id)); }
    else if (action === 'live-edit') { const tr = live.find((x) => x.id === id); if (tr) openEdit(tr, 'live'); }
    else if (action === 'live-delete') { const tr = live.find((x) => x.id === id); if (tr) setLiveDelete(tr); }
    else if (action === 'team') { setTeamOpen(true); setTeamMsg(''); setTeamNew(''); }
  };

  // ---- allowlist management (Team access panel) ----
  const persistAllowlist = async (next: string[]) => {
    setAllowlist(next);
    const token = session?.access_token;
    if (!token) return;
    const r = await saveAllowlist(next, token);
    setTeamMsg(r.ok ? 'Saved — access updated.' : (r.status === 501
      ? 'Roster updated locally. Server writes need the owner key set once in Vercel; until then the owner applies changes via manage_allowlist.py.'
      : `Could not save (${r.status}). ${r.message ?? ''}`));
  };
  const teamAdd = () => {
    const e = teamNew.trim().toLowerCase();
    if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setTeamMsg('Enter a valid email.'); return; }
    if ((allowlist ?? []).includes(e) || BOOTSTRAP_OWNERS.includes(e)) { setTeamMsg('Already has access.'); return; }
    setTeamNew('');
    void persistAllowlist([...(allowlist ?? []), e]);
  };
  const teamRemove = (e: string) => { void persistAllowlist((allowlist ?? []).filter((x) => x !== e)); };
  const submitPin = async () => {
    if (!/^\d{4,}$/.test(pinVal)) { setPinErr('At least 4 digits.'); return; }
    const uid = session!.user.id;
    if (pinSet) {
      const h = await hashPin(uid, pinVal);
      const ok = await savePinHash(uid, h);
      if (!ok) { setPinErr('Could not save PIN.'); return; }
      setPinHash(h);
    } else {
      const h = await hashPin(uid, pinVal);
      if (h !== pinHash) { setPinErr('Incorrect PIN.'); return; }
    }
    setPinOk(true);
    if (pinAsk) runAction(pinAsk.action, pinAsk.id);
    setPinAsk(null);
  };
  const act = (action: PinAction, id: string) => { pinOk && pinHash ? runAction(action, id) : askPin(action, id); };
  // ---- FULL EDIT (live + closed): every field editable, atomic Save ----
  const openEdit = (tr: Trade, kind: 'live' | 'closed') => {
    const spec = specNameOf(tr.instrument);
    setEdit({
      id: tr.id, kind,
      symbol: tr.symbol, instr: spec, origInstr: spec,
      side: sideOf(tr), lots: String(tr.numberOfLots), mult: String(tr.lotSize), entry: String(entryVal(tr)),
      date: dmyInput(tr.dateInitiated), ccy: dispCcy(tr), origCcy: dispCcy(tr),
      rate: tr.currency === 'USD' && tr.usdToInrRate != null ? String(tr.usdToInrRate) : '',
      real: tr.realizationRate ?? 1.0, entryBrok: tr.entryBrokerage != null ? String(tr.entryBrokerage) : '',
      exit: kind === 'closed' ? String(exitVal(tr)) : '',
      exitBrok: kind === 'closed' && tr.exitBrokerage != null ? String(tr.exitBrokerage) : '',
      closedDate: kind === 'closed' ? dmyInput(closeDateOf(tr)) : '',
    });
    setWhatIf(null); setClosing(null); setEditErr('');
  };

  // Build the updated trade from an edit state; also report orphaned marks + instr/ccy changes.
  const buildEdited = (e: EditState) => {
    const orig = trades.find((t) => t.id === e.id)!;
    const meta = INSTR[e.instr];
    const entry = +e.entry || 0;
    const lots = parseInt(e.lots) || orig.numberOfLots;
    const mult = +e.mult > 0 ? +e.mult : orig.lotSize;   // per-trade multiplier (editable)
    const iso = isoFromForm(e.date);
    const newInitWeek = weekKeyOf(iso);
    const fcp = orig.fridayClosingPrices || {};
    // Week-identity integrity: no mark may be earlier than the (new) initiation week.
    const orphans = Object.keys(fcp).filter((wk) => wk < newInitWeek).sort();
    const cleanFcp = Object.fromEntries(Object.entries(fcp).filter(([wk]) => wk >= newInitWeek));
    const dir: TradeDirection = e.side === 'LONG' ? 'Long' : 'Short';
    const base: Trade = {
      ...orig,
      symbol: e.symbol.toUpperCase().trim() || orig.symbol, instrument: meta.v1, lotSize: mult,
      direction: dir, numberOfLots: lots, dateInitiated: iso,
      currency: e.ccy, realizationRate: e.real,
      // Per-trade FX: the trade's own rate (USD); INR trades store 1.
      usdToInrRate: e.ccy === 'USD' ? (+e.rate > 0 ? +e.rate : orig.usdToInrRate) : 1,
      entryBrokerage: e.entryBrok.trim() === '' ? null : +e.entryBrok,
      fridayClosingPrices: cleanFcp,
    };
    // An explicit rate change (or currency change) retires any legacy per-week FX stamps:
    // from now on the trade converts at its own rate for its whole life.
    const rateChanged = e.ccy !== e.origCcy || (e.ccy === 'USD' && +e.rate > 0 && +e.rate !== orig.usdToInrRate);
    if (rateChanged) { base.fridayUsdToInrRates = {}; delete base.closedUsdToInrRate; }
    let updated: Trade;
    if (e.kind === 'live') {
      updated = {
        ...base, status: dir === 'Long' ? 'CarryForwardLong' : 'CarryForwardShort',
        buyPrice: dir === 'Long' ? entry : null, sellPrice: dir === 'Long' ? null : entry,
        buyDate: dir === 'Long' ? iso : null, sellDate: dir === 'Long' ? null : iso, exitBrokerage: null,
      };
    } else {
      const cIso = isoFromForm(e.closedDate);
      const exit = +e.exit || 0;
      updated = {
        ...base, status: 'Closed',
        buyPrice: dir === 'Long' ? entry : exit, sellPrice: dir === 'Long' ? exit : entry,
        buyDate: dir === 'Long' ? iso : cIso, sellDate: dir === 'Long' ? cIso : iso,
        exitBrokerage: e.exitBrok.trim() === '' ? null : +e.exitBrok,
      };
    }
    return { updated, orphans, instrChanged: e.instr !== e.origInstr, ccyChanged: e.ccy !== e.origCcy };
  };

  const trySaveEdit = () => {
    if (!edit) return;
    if (edit.ccy === 'USD' && !(+edit.rate > 0)) { setEditErr('USD/INR rate required — a USD trade converts at its own rate.'); return; }
    setEditErr('');
    const { updated, orphans, instrChanged, ccyChanged } = buildEdited(edit);
    const notes: string[] = [];
    if (instrChanged || ccyChanged) notes.push('Recomputes all P&L for this trade — proceed?');
    if (orphans.length) notes.push(`${orphans.length} weekly mark${orphans.length > 1 ? 's' : ''} before the new initiation week (${weekLabel(mondayOf(isoFromForm(edit.date)))}) will be removed: ${orphans.join(', ')}.`);
    if (notes.length) setEditConfirm({ trade: updated, notes });
    else commitEdit(updated);
  };
  const commitEdit = (updated: Trade) => { update(trades.map((x) => (x.id === updated.id ? updated : x))); setEdit(null); setEditConfirm(null); };

  // Delete a live trade. update()'s persist diff removes the trades row AND calls
  // deleteWeeklyMarksForTrade, so its weekly_marks go too.
  const doLiveDelete = () => {
    if (!liveDelete) return;
    update(trades.filter((x) => x.id !== liveDelete.id));
    setLiveDelete(null);
  };

  const exitVal = (tr: Trade) => (tr.direction === 'Long' ? tr.sellPrice : tr.buyPrice) ?? 0;
  const entryVal = (tr: Trade) => (tr.direction === 'Long' ? tr.buyPrice : tr.sellPrice) ?? 0;
  const sideOf = (tr: Trade) => (tr.direction === 'Long' ? 'LONG' : 'SHORT');
  const realPct = (tr: Trade) => Math.round((tr.realizationRate ?? 1) * 100);

  // ---- Excel download ----
  const downloadExcel = () => {
    let rows = closed;
    if (dlMode === 'selected') rows = closed.filter((tr) => sel.includes(tr.id));
    if (dlMode === 'range') rows = closed.filter((tr) => {
      const c = closeDateOf(tr);
      return (!dlFrom || c >= dlFrom) && (!dlTo || c <= dlTo);
    });
    if (!rows.length) return;
    const head = ['Symbol', 'Instrument', 'Multiplier', 'Side', 'Lots', 'Entry', 'Exit', 'Initiated', 'Closed', 'Held (days)', 'Week', 'Currency', 'USD/INR', 'Share', 'P&L (INR)'];
    const lines = rows.map((tr) => {
      const c = closeDateOf(tr);
      return [
        tr.symbol, specNameOf(tr.instrument), tr.lotSize, sideOf(tr), tr.numberOfLots, entryVal(tr), exitVal(tr),
        tr.dateInitiated, c, heldDays(tr.dateInitiated, c), weekLabel(c), dispCcy(tr),
        tr.currency === 'USD' ? (tr.usdToInrRate ?? '') : '', realPct(tr) + '%', realized(tr),
      ].join(',');
    });
    const blob = new Blob([head.join(',') + '\n' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ailaha_phalam_trades_' + dlMode + '.csv';
    a.click(); URL.revokeObjectURL(a.href);
    setDlOpen(false);
  };

  // ---- style helpers (verbatim from spec) ----
  const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontVariantNumeric: 'tabular-nums' as const };
  const sans = { fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" };
  const pl = (v: number) => (v >= 0 ? t.profit : t.loss);
  // Loud missing-rate marker — only reachable if a USD trade has no per-trade rate (legacy row).
  const fxNa = (size = 15) => <span style={{ ...sans, fontSize: size, fontWeight: 600, color: t.loss }}>USD/INR missing — Edit trade</span>;
  const th = (h: string, right?: boolean) => (
    <th key={h} style={{ ...sans, fontSize: SZ.label, fontWeight: 500, color: t.faint, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '14px 0 10px', textAlign: right ? 'right' : 'left', borderBottom: '1px solid ' + t.hair }}>{h}</th>
  );
  const td = (extra = {}) => ({ ...mono, fontSize: SZ.num, padding: '15px 0', borderBottom: '1px solid ' + t.hair, ...extra });
  const lbl = { ...sans, fontSize: SZ.label, fontWeight: 500, color: t.faint, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 } as const;
  const inp = { ...mono, fontSize: SZ.num, border: 'none', borderBottom: '1px solid ' + t.hair, outline: 'none', background: 'none', color: t.ink, padding: '6px 0', width: '100%' } as const;
  const toggle = (on: boolean) => ({ ...sans, fontSize: SZ.btn - 1, fontWeight: 600, padding: '8px 15px', borderRadius: 3, cursor: 'pointer', border: '1px solid ' + (on ? t.ink : t.hair), background: on ? t.ink : 'none', color: on ? t.bg : t.faint });
  const ghost = { ...sans, fontSize: 13, color: t.faint, background: 'none', border: '1px solid ' + t.hair, borderRadius: 3, padding: '5px 12px', cursor: 'pointer' } as const;
  // Delete ghost — mirrors the closed table's Delete color (loss on white, ink on forest).
  const ghostDanger = { ...ghost, color: themeKey === 'white' ? t.loss : t.ink } as const;
  // Compact LONG/SHORT toggle for inline live-edit — row rhythm, not the big Add-form toggle.
  const miniToggle = (on: boolean) => ({ ...sans, fontSize: 13, fontWeight: 600, padding: '4px 10px', borderRadius: 3, cursor: 'pointer', border: '1px solid ' + (on ? t.ink : t.hair), background: on ? t.ink : 'none', color: on ? t.bg : t.faint });
  // Layout-system (grid) helpers: uniform 84px action buttons + zone-2 slot labels.
  const actBtn = { ...sans, fontSize: 13, color: t.faint, background: 'none', border: '1px solid ' + t.hair, borderRadius: 3, padding: '5px 0', width: 84, textAlign: 'center' as const, cursor: 'pointer' };
  const actDanger = { ...actBtn, color: themeKey === 'white' ? t.loss : t.ink };
  const slotLabel = { ...sans, fontSize: SZ.label, color: t.faint, letterSpacing: '0.05em', textTransform: 'uppercase' as const, marginBottom: 4 };
  const gridInput = (w: number) => ({ ...mono, fontSize: SZ.num, width: w, border: 'none', borderBottom: '1px solid ' + t.ink, outline: 'none', background: 'none', color: t.ink } as const);
  const secLabel = { ...sans, fontSize: SZ.label, fontWeight: 500, color: t.faint, letterSpacing: '0.05em', textTransform: 'uppercase' } as const;
  // Carried trade: its full per-week P&L history — every piece it earned, summing to the realized total.
  // Shared by the Journal (realized rows) and the Closed view (grouped by closing week).
  const historyLine = (tr: Trade, pieces: WeekPiece[], total: number, reconciled: boolean, style: CSSProperties = {}) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 14px', fontSize: SZ.meta, color: t.faint, ...style }}>
      {pieces.map((p) => (
        <span key={p.weekKey}>{p.label.split(' · ')[0]} <span style={{ ...mono, fontSize: SZ.numSm, color: isNaN(p.val) ? t.loss : pl(p.val) }}>{isNaN(p.val) ? '—' : signed(p.val)}</span>{tr.currency === 'USD' && p.rate !== tradeRate(tr) ? <span style={{ ...mono, fontSize: SZ.label }}> @{p.rate}</span> : null}</span>
      ))}
      <span>= realized <span style={{ ...mono, fontSize: SZ.numSm, fontWeight: 600, color: isNaN(total) ? t.loss : pl(total) }}>{isNaN(total) ? '—' : signed(total)}</span></span>
      {!reconciled && <span style={{ ...sans, fontWeight: 600, color: t.loss }}>does not reconcile</span>}
    </div>
  );

  const Tab = ({ id, label }: { id: typeof view; label: string }) => (
    <button onClick={() => setView(id)} style={{ ...sans, background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '6px 2px', color: view === id ? t.ink : t.faint, borderBottom: view === id ? '1px solid ' + t.ink : '1px solid transparent' }}>{label}</button>
  );

  const DownloadPanel = () => (
    <span style={{ position: 'relative' }}>
      <button onClick={() => setDlOpen(!dlOpen)} style={{ ...sans, fontSize: 13, fontWeight: 600, color: t.ink, background: 'none', border: '1px solid ' + t.hair, borderRadius: 3, padding: '6px 14px', cursor: 'pointer' }}>Download as Excel</button>
      {dlOpen && (
        <span style={{ position: 'absolute', right: 0, top: 38, zIndex: 5, background: t.bg, border: '1px solid ' + t.hair, borderRadius: 5, padding: '16px 18px', width: 270, display: 'block', boxShadow: '0 8px 28px rgba(0,0,0,0.28)' }}>
          {[
            { k: 'all' as const, label: 'Complete history (' + closed.length + ' trades)' },
            { k: 'selected' as const, label: 'Selected trades (' + sel.length + ')' },
            { k: 'range' as const, label: 'Date range' },
          ].map((o) => (
            <span key={o.k} onClick={() => setDlMode(o.k)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', cursor: 'pointer' }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid ' + (dlMode === o.k ? t.ink : t.hair), background: dlMode === o.k ? t.ink : 'none', display: 'inline-block' }} />
              <span style={{ fontSize: 15, color: dlMode === o.k ? t.ink : t.faint }}>{o.label}</span>
            </span>
          ))}
          {dlMode === 'range' && (
            <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', margin: '8px 0 4px 24px' }}>
              <input value={dlFrom} placeholder="from" onChange={(e) => setDlFrom(e.target.value)} style={{ ...mono, fontSize: 13, width: 92, border: 'none', borderBottom: '1px solid ' + t.hair, outline: 'none', background: 'none', color: t.ink }} />
              <span style={{ fontSize: 13, color: t.faint }}>to</span>
              <input value={dlTo} placeholder="to" onChange={(e) => setDlTo(e.target.value)} style={{ ...mono, fontSize: 13, width: 92, border: 'none', borderBottom: '1px solid ' + t.hair, outline: 'none', background: 'none', color: t.ink }} />
            </span>
          )}
          <div style={{ fontSize: SZ.label, color: t.faint, margin: dlMode === 'range' ? '2px 0 0 24px' : 0 }}>{dlMode === 'range' ? 'YYYY-MM-DD, by closing date' : ''}</div>
          <button onClick={downloadExcel} disabled={dlMode === 'selected' && sel.length === 0} style={{ ...sans, marginTop: 12, width: '100%', fontSize: 13, fontWeight: 600, background: t.ink, color: t.bg, border: 'none', borderRadius: 3, padding: '9px 0', cursor: 'pointer', opacity: dlMode === 'selected' && sel.length === 0 ? 0.45 : 1 }}>Download</button>
        </span>
      )}
    </span>
  );

  // Full edit grid (live + closed) — labeled cells on the 220px rhythm, atomic Save.
  const selStyle = { ...sans, fontSize: SZ.num - 1, border: 'none', borderBottom: '1px solid ' + t.ink, outline: 'none', background: t.bg, color: t.ink, width: 170, cursor: 'pointer', padding: '4px 0' } as const;
  const setE = (patch: Partial<EditState>) => setEdit((e) => (e ? { ...e, ...patch } : e));
  const onEditKey = (ev: ReactKeyboardEvent) => { if (ev.key === 'Enter') trySaveEdit(); if (ev.key === 'Escape') setEdit(null); };
  const editForm = () => {
    if (!edit) return null;
    const e = edit; const isClosed = e.kind === 'closed';
    const cell = (label: string, ctrl: ReactNode) => (<div><div style={slotLabel}>{label}</div>{ctrl}</div>);
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 220px)', rowGap: 18, marginTop: 18, alignItems: 'start' }}>
          {cell('Symbol', <input autoFocus value={e.symbol} onChange={(x) => setE({ symbol: x.target.value })} onKeyDown={onEditKey} style={gridInput(170)} />)}
          {cell('Instrument', (
            <select value={e.instr} onChange={(x) => { const k = x.target.value as SpecInstrument; const d = INSTR[k].mult; setE({ instr: k, ccy: INSTR[k].ccy, mult: d == null ? '' : String(d) }); }} style={selStyle}>
              {(Object.keys(INSTR) as SpecInstrument[]).map((k) => <option key={k} value={k}>{k}{INSTR[k].mult != null ? ` ×${INSTR[k].mult}` : ''}</option>)}
            </select>
          ))}
          {cell('Side', (
            <span style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setE({ side: 'LONG' })} style={miniToggle(e.side === 'LONG')}>LONG</button>
              <button onClick={() => setE({ side: 'SHORT' })} style={miniToggle(e.side === 'SHORT')}>SHORT</button>
            </span>
          ))}
          {cell('Lots', <input value={e.lots} onChange={(x) => setE({ lots: x.target.value.replace(/\D/g, '') })} onKeyDown={onEditKey} style={gridInput(80)} />)}
          {cell('Multiplier', <input value={e.mult} onChange={(x) => setE({ mult: x.target.value.replace(/[^\d.]/g, '') })} onKeyDown={onEditKey} style={gridInput(100)} />)}
          {cell('Entry price', <input value={e.entry} onChange={(x) => setE({ entry: x.target.value.replace(/[^\d.]/g, '') })} onKeyDown={onEditKey} style={gridInput(150)} />)}
          {cell('Init date', <input value={e.date} onChange={(x) => setE({ date: x.target.value })} onKeyDown={onEditKey} style={gridInput(150)} />)}
          {cell('Currency', (
            <span style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setE({ ccy: 'INR' })} style={miniToggle(e.ccy === 'INR')}>₹ INR</button>
              <button onClick={() => setE({ ccy: 'USD' })} style={miniToggle(e.ccy === 'USD')}>$ USD</button>
            </span>
          ))}
          {e.ccy === 'USD' && cell('USD/INR rate · this trade', <input value={e.rate} onChange={(x) => setE({ rate: x.target.value.replace(/[^\d.]/g, '') })} onKeyDown={onEditKey} style={gridInput(100)} />)}
          {cell('Realization', (
            <span style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setE({ real: 1.0 })} style={miniToggle(e.real === 1.0)}>FULL 1.0</button>
              <button onClick={() => setE({ real: 0.8 })} style={miniToggle(e.real === 0.8)}>80% 0.8</button>
            </span>
          ))}
          {cell(`Entry brokerage (${e.ccy === 'USD' ? '$' : '₹'})`, <input placeholder="auto" value={e.entryBrok} onChange={(x) => setE({ entryBrok: x.target.value.replace(/[^\d.]/g, '') })} onKeyDown={onEditKey} style={gridInput(150)} />)}
          {isClosed && cell('Exit price', <input value={e.exit} onChange={(x) => setE({ exit: x.target.value.replace(/[^\d.]/g, '') })} onKeyDown={onEditKey} style={gridInput(150)} />)}
          {isClosed && cell(`Exit brokerage (${e.ccy === 'USD' ? '$' : '₹'})`, <input placeholder="auto" value={e.exitBrok} onChange={(x) => setE({ exitBrok: x.target.value.replace(/[^\d.]/g, '') })} onKeyDown={onEditKey} style={gridInput(150)} />)}
          {isClosed && cell('Closed date', <input value={e.closedDate} onChange={(x) => setE({ closedDate: x.target.value })} onKeyDown={onEditKey} style={gridInput(150)} />)}
        </div>
        {editErr && <div style={{ ...sans, fontSize: SZ.meta, fontWeight: 600, color: t.loss, marginTop: 12 }}>{editErr}</div>}
        <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
          <button onClick={trySaveEdit} style={{ ...sans, fontSize: 13, fontWeight: 600, background: t.ink, color: t.bg, border: 'none', borderRadius: 3, padding: '7px 16px', cursor: 'pointer' }}>Save</button>
          <button onClick={() => setEdit(null)} style={{ ...sans, fontSize: 13, color: t.faint, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel (Esc)</button>
        </div>
      </>
    );
  };

  // ---- auth gate ----
  if (authLoading) return <div style={{ minHeight: '100vh', background: t.bg, color: t.faint, ...mono, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Loading…</div>;
  if (!session) {
    return (
      <div style={{ minHeight: '100vh', background: t.bg, color: t.ink, ...sans, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.06em' }}>AILAHA PHALAM</div>
          <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 4 }}>Weekly position ledger</div>
        </div>
        <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })}
          style={{ ...sans, fontSize: SZ.btn, fontWeight: 600, background: t.ink, color: t.bg, border: 'none', borderRadius: 4, padding: '11px 26px', cursor: 'pointer' }}>Sign in with Google</button>
      </div>
    );
  }

  // ---- allowlist gate (Google OAuth itself is unchanged; this gates the workspace) ----
  const userEmail = session.user.email;
  if (allowlist === null) {
    return <div style={{ minHeight: '100vh', background: t.bg, color: t.faint, ...mono, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Checking access…</div>;
  }
  if (!isAllowed(userEmail, allowlist)) {
    return (
      <div style={{ minHeight: '100vh', background: t.bg, color: t.ink, ...sans, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.06em' }}>AILAHA PHALAM</div>
        <div style={{ fontSize: 22, fontWeight: 600 }}>Access restricted</div>
        <div style={{ fontSize: SZ.meta, color: t.faint, maxWidth: 420 }}>
          {userEmail} isn’t on this workspace’s allowlist. Ask the owner to add you, then sign in again.
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ ...sans, fontSize: SZ.btn, fontWeight: 600, background: t.ink, color: t.bg, border: 'none', borderRadius: 4, padding: '10px 22px', cursor: 'pointer', marginTop: 8 }}>Sign out</button>
      </div>
    );
  }

  // Spec header date is "Monday 24 August 2026" (no comma) — build it explicitly.
  const _hd = new Date(todayISO);
  const headerDate = `${_hd.toLocaleDateString('en-GB', { weekday: 'long' })} ${_hd.getDate()} ${_hd.toLocaleDateString('en-GB', { month: 'long' })} ${_hd.getFullYear()}`;

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.ink, ...sans, transition: 'background 180ms, color 180ms' }}>
      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '48px 24px 96px' }}>

        {/* PENDING-STAMPS ALERT — from Saturday 17:00 IST while any live trade is unstamped for the asked week; urgent (red) from Sunday; dismissible but returns on any navigation while unstamped. */}
        {showAlert && (
          <div role="alert" data-alert="pending-stamps"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '12px 18px', marginBottom: 28, borderRadius: 4,
              background: alertUrgent ? '#C2402E' : t.ink, color: alertUrgent ? '#FFFFFF' : t.bg }}>
            <span style={{ fontSize: SZ.meta, fontWeight: 600 }}>
              {alertUrgent ? 'URGENT · ' : ''}{weekLabel(endWeekMondayISO).split(' · ')[0]} closing values pending — {pendingTrades.length} trade{pendingTrades.length > 1 ? 's' : ''} unstamped ({pendingTrades.map((x) => x.symbol).join(', ')})
            </span>
            <span style={{ display: 'flex', gap: 18, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
              <button onClick={() => { setView('journal'); setStampAll(endWeekKey); setStampErr(''); }} style={{ ...sans, fontSize: SZ.btn, fontWeight: 600, color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Stamp all →</button>
              <button onClick={() => setAlertDismissed(true)} title="Dismiss for now (returns while unstamped)" style={{ ...sans, fontSize: 15, color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: 0.8 }}>✕</button>
            </span>
          </div>
        )}

        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 48 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.06em' }}>AILAHA PHALAM</div>
            <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 2 }}>{headerDate} · {weekLabel(headMondayISO)}</div>
            {/* Team access + Sign out — kept out of the nav so the nav matches DESIGN_SPEC exactly; tiny faint links under the date. */}
            <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
              <button onClick={() => act('team', '')} title="Manage who can sign in" style={{ ...sans, fontSize: SZ.label, color: t.faint, letterSpacing: '0.05em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Team access</button>
              <button onClick={() => supabase.auth.signOut()} title="Sign out" style={{ ...sans, fontSize: SZ.label, color: t.faint, letterSpacing: '0.05em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Sign out</button>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
            <Tab id="live" label="Live trades" />
            <Tab id="journal" label="Journal" />
            <Tab id="closedv" label="Closed trades" />
            <Tab id="add" label="Add trade" />
            {/* THEME — after Add trade (spec) */}
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 6 }}>
              <span style={{ fontSize: SZ.label, color: t.faint, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Theme</span>
              {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([k, th2]) => (
                <button key={k} onClick={() => setThemeKey(k)} title={th2.name} style={{ width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', background: th2.swatch, border: '2px solid ' + (themeKey === k ? t.ink : t.hair) }} />
              ))}
            </span>
          </nav>
        </header>

        {/* PIN modal */}
        {pinAsk && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ background: t.bg, borderRadius: 6, padding: '26px 30px', width: 320, border: '1px solid ' + t.hair }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{pinSet ? 'Set a PIN' : 'Enter PIN'}</div>
              <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 4 }}>
                {pinSet ? 'No PIN yet. Choose one (4+ digits) — it guards Edit, Delete and Team access.' : (pinAsk.action === 'team' ? 'Managing team access.' : (pinAsk.action.includes('delete') ? 'Deleting a trade.' : 'Editing a trade.'))}
              </div>
              <input autoFocus type="password" inputMode="numeric" value={pinVal}
                onChange={(e) => { setPinVal(e.target.value.replace(/\D/g, '')); setPinErr(''); }}
                onKeyDown={(e) => e.key === 'Enter' && submitPin()}
                style={{ ...mono, fontSize: 22, letterSpacing: '0.4em', width: '100%', marginTop: 18, border: 'none', borderBottom: '1px solid ' + t.ink, outline: 'none', background: 'none', color: t.ink, textAlign: 'center', padding: '6px 0' }} />
              {pinErr && <div style={{ fontSize: SZ.meta, color: t.loss, marginTop: 8 }}>{pinErr}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 22 }}>
                <button onClick={() => setPinAsk(null)} style={{ ...sans, fontSize: 13, color: t.faint, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                <button onClick={submitPin} style={{ ...sans, fontSize: 13, fontWeight: 600, background: t.ink, color: t.bg, border: 'none', borderRadius: 3, padding: '8px 18px', cursor: 'pointer' }}>{pinSet ? 'Set PIN' : 'Unlock'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Team access — PIN-gated allowlist manager */}
        {teamOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ background: t.bg, borderRadius: 6, padding: '26px 30px', width: 420, maxWidth: '92vw', border: '1px solid ' + t.hair }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Team access</div>
              <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 4 }}>Google accounts allowed to sign in. Owner accounts are always allowed.</div>
              <div style={{ marginTop: 16 }}>
                {BOOTSTRAP_OWNERS.map((e) => (
                  <div key={e} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: '1px solid ' + t.hair }}>
                    <span style={{ ...mono, fontSize: SZ.numSm, color: t.ink }}>{e}</span>
                    <span style={{ ...sans, fontSize: SZ.label, color: t.faint, letterSpacing: '0.05em', textTransform: 'uppercase', marginLeft: 'auto' }}>owner</span>
                  </div>
                ))}
                {(allowlist ?? []).filter((e) => !BOOTSTRAP_OWNERS.includes(e)).map((e) => (
                  <div key={e} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: '1px solid ' + t.hair }}>
                    <span style={{ ...mono, fontSize: SZ.numSm, color: t.ink }}>{e}</span>
                    <button onClick={() => teamRemove(e)} style={{ ...sans, fontSize: 13, color: themeKey === 'white' ? t.loss : t.ink, background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', padding: 0 }}>Remove</button>
                  </div>
                ))}
                {(allowlist ?? []).filter((e) => !BOOTSTRAP_OWNERS.includes(e)).length === 0 && (
                  <div style={{ fontSize: SZ.meta, color: t.faint, padding: '7px 0' }}>No teammates added yet.</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 14 }}>
                <input value={teamNew} placeholder="teammate@gmail.com" onChange={(e) => { setTeamNew(e.target.value); setTeamMsg(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && teamAdd()}
                  style={{ ...mono, fontSize: SZ.num, flex: 1, border: 'none', borderBottom: '1px solid ' + t.hair, outline: 'none', background: 'none', color: t.ink, padding: '4px 0' }} />
                <button onClick={teamAdd} style={{ ...sans, fontSize: 13, fontWeight: 600, background: t.ink, color: t.bg, border: 'none', borderRadius: 3, padding: '7px 15px', cursor: 'pointer' }}>Add</button>
              </div>
              {teamMsg && <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 12 }}>{teamMsg}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                <button onClick={() => setTeamOpen(false)} style={{ ...sans, fontSize: 13, fontWeight: 600, background: 'none', color: t.faint, border: '1px solid ' + t.hair, borderRadius: 3, padding: '8px 16px', cursor: 'pointer' }}>Done</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit confirm — instrument/currency change and/or orphaned-mark removal */}
        {editConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11 }}>
            <div style={{ background: t.bg, borderRadius: 6, padding: '26px 30px', width: 440, maxWidth: '92vw', border: '1px solid ' + t.hair }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Confirm changes</div>
              {editConfirm.notes.map((n, i) => (
                <div key={i} style={{ fontSize: SZ.meta, color: t.faint, marginTop: 10 }}>{n}</div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 22 }}>
                <button onClick={() => setEditConfirm(null)} style={{ ...sans, fontSize: 13, color: t.faint, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => commitEdit(editConfirm.trade)} style={{ ...sans, fontSize: 13, fontWeight: 600, background: t.ink, color: t.bg, border: 'none', borderRadius: 3, padding: '8px 18px', cursor: 'pointer' }}>Proceed</button>
              </div>
            </div>
          </div>
        )}

        {/* Live-trade delete confirm */}
        {liveDelete && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ background: t.bg, borderRadius: 6, padding: '26px 30px', width: 380, border: '1px solid ' + t.hair }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Delete {liveDelete.symbol}</div>
              <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 6 }}>
                Delete {liveDelete.symbol} — entry {nf(entryVal(liveDelete))}, {liveDelete.numberOfLots} lot{liveDelete.numberOfLots > 1 ? 's' : ''}? Its weekly marks go too.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 22 }}>
                <button onClick={() => setLiveDelete(null)} style={{ ...sans, fontSize: 13, color: t.faint, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                <button onClick={doLiveDelete} style={{ ...sans, fontSize: 13, fontWeight: 600, background: themeKey === 'white' ? t.loss : t.ink, color: themeKey === 'white' ? '#fff' : t.bg, border: 'none', borderRadius: 3, padding: '8px 18px', cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* LIVE */}
        {view === 'live' && (
          <>
            <div style={{ fontSize: SZ.meta, color: t.faint, marginBottom: 8 }}>Open MTM · {live.length} live · after profit share</div>
            {isNaN(totalLive)
              ? <div style={{ ...mono, fontSize: 34, lineHeight: 1, fontWeight: 600, color: t.loss }}>FX rate not set</div>
              : <div style={{ ...mono, fontSize: SZ.hero, lineHeight: 1, fontWeight: 500, color: pl(totalLive) }}>{signed(totalLive)}</div>}
            <div style={{ height: 1, background: t.hair, margin: '36px 0 0' }} />

            {live.length === 0 && <div style={{ fontSize: 15, color: t.faint, marginTop: 24 }}>No live trades — add one from “Add trade”.</div>}

            {live.map((tr) => {
              const rows = liveMtmRows(tr); const m = liveMtm(tr);
              const specName = specNameOf(tr.instrument); const meta = INSTR[specName];
              return (
                <div key={tr.id} style={{ borderBottom: '1px solid ' + t.hair, padding: '22px 0' }}>
                  {/* ZONE 1 — identity line: SYMBOL | meta | actions (fixed tracks) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 380px', alignItems: 'baseline', gap: 14 }}>
                    <span title={tr.symbol} style={{ fontSize: SZ.symbol, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr.symbol}</span>
                    <span style={{ fontSize: SZ.meta, color: t.faint, lineHeight: 1.5 }}>
                      {specName} ×{tr.lotSize} · {sideOf(tr)} · {tr.numberOfLots} lot{tr.numberOfLots > 1 ? 's' : ''} · {dispCcy(tr)}{tr.currency === 'USD' ? (tradeRate(tr) != null ? ` @${tradeRate(tr)}` : ' @?') : ''}{hasLegacyRates(tr) ? ' (weekly history kept)' : ''} · share {realPct(tr)}% · opened {dmy(tr.dateInitiated)}
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button onClick={() => { setClosing(null); setWhatIf(whatIf && whatIf.id === tr.id ? null : { id: tr.id, exit: '', rate: String(latestUsdRate(tr) ?? '') }); }} style={actBtn}>What-if</button>
                      <button onClick={() => { setWhatIf(null); setClosing(null); act('live-edit', tr.id); }} style={actBtn}>Edit</button>
                      <button onClick={() => { setWhatIf(null); setClosing({ id: tr.id, px: '' }); }} style={actBtn}>Close</button>
                      <button onClick={() => act('live-delete', tr.id)} style={actDanger}>Delete</button>
                    </div>
                  </div>

                  {/* ZONE 2 — numbers strip: 4 fixed 220px slots (or the full edit grid, same tracks) */}
                  {edit && edit.id === tr.id ? editForm() : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 220px)', marginTop: 18, alignItems: 'start' }}>
                      <div><div style={slotLabel}>Entry</div><div style={{ ...mono, fontSize: SZ.num, color: t.ink }}>{px(tr, entryVal(tr))}</div></div>
                      <div><div style={slotLabel}>Brokerage · entry leg</div><div style={{ ...mono, fontSize: SZ.num, color: t.ink }}>{(dispCcy(tr) === 'USD' ? '$' : '₹') + nf(Math.round(entryLegBrokerage(tr)))}</div></div>
                      <div><div style={slotLabel}>Current P&amp;L</div>
                        <div style={{ ...mono, fontSize: 22, fontWeight: 600, color: rows.length ? (isNaN(m) ? t.loss : pl(m)) : t.faint }}>{rows.length ? (isNaN(m) ? fxNa(17) : sgn(tr, m)) : '—'}</div>
                        {/* $ survives only as small native per-trade detail */}
                        {tr.currency === 'USD' && rows.length > 0 && !isNaN(m) && (
                          <div style={{ ...mono, fontSize: SZ.label, color: t.faint, marginTop: 3 }}>{signedUsd(nativePnl(tr))} native</div>
                        )}
                      </div>
                      <div><div style={slotLabel}>Closed value</div><div style={{ ...mono, fontSize: SZ.num, color: t.faint }}>{rows.length ? px(tr, rows[rows.length - 1].close) : '—'}</div></div>
                    </div>
                  )}

                  {/* Close (exit) input — grid-aligned, opens in place */}
                  {closing && closing.id === tr.id && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 220px)', marginTop: 14, alignItems: 'end' }}>
                      <div><div style={slotLabel}>Exit price</div>
                        <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                          <input autoFocus placeholder="exit" value={closing.px} onChange={(e) => setClosing({ ...closing, px: e.target.value.replace(/[^\d.]/g, ''), err: undefined })} onKeyDown={(e) => e.key === 'Enter' && closeTrade()} style={gridInput(110)} />
                          <button onClick={closeTrade} style={{ ...sans, fontSize: 13, fontWeight: 600, background: t.ink, color: t.bg, border: 'none', borderRadius: 3, padding: '6px 13px', cursor: 'pointer' }}>Close</button>
                        </span>
                        {closing.err && <div style={{ ...sans, fontSize: SZ.meta, fontWeight: 600, color: t.loss, marginTop: 8, whiteSpace: 'nowrap' }}>{closing.err}</div>}
                      </div>
                    </div>
                  )}

                  {/* What-if — opens in zone 3 grid tracks (indent 200) */}
                  {whatIf && whatIf.id === tr.id && !(edit && edit.id === tr.id) && (() => {
                    const hypoRate = tr.currency === 'USD' ? (parseFloat(whatIf.rate) || latestUsdRate(tr) || NaN) : 1;
                    const pnl = whatIf.exit ? Math.round(estimateInstantPnL({ ...tr, usdToInrRate: hypoRate }, +whatIf.exit).netProfit) : 0;
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '160px 150px 100px 150px', marginLeft: 200, marginTop: 16, alignItems: 'baseline', columnGap: 18 }}>
                        <span style={{ fontSize: SZ.meta, color: t.faint }}>What-if exit</span>
                        <input autoFocus placeholder="exit" value={whatIf.exit} onChange={(e) => setWhatIf({ ...whatIf, exit: e.target.value.replace(/[^\d.]/g, '') })} onKeyDown={(e) => e.key === 'Escape' && setWhatIf(null)} style={gridInput(120)} />
                        {tr.currency === 'USD' ? (
                          <input value={whatIf.rate} onChange={(e) => setWhatIf({ ...whatIf, rate: e.target.value.replace(/[^\d.]/g, '') })} onKeyDown={(e) => e.key === 'Escape' && setWhatIf(null)} style={gridInput(76)} />
                        ) : <span />}
                        <span style={{ ...mono, fontSize: SZ.num, fontWeight: 600, textAlign: 'right', color: whatIf.exit ? (isNaN(pnl) ? t.loss : pl(pnl)) : t.faint }}>{whatIf.exit ? (isNaN(pnl) ? fxNa(SZ.meta) : sgn(tr, pnl)) : '—'}
                          <button onClick={() => setWhatIf(null)} title="Close (Esc)" style={{ ...sans, fontSize: 15, color: t.faint, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 10px' }}>✕</button>
                        </span>
                      </div>
                    );
                  })()}

                  {/* ZONE 3 — weekly MTM ledger: fixed grid, indented 200. A stamped week = its MTM row
                      (close editable inside the stamp window). STAMP LAW + WINDOW (2026-09-14): the
                      WEEKLY CLOSE stamp field + button appears ONLY Sat 00:00 → Sun 23:59 IST, only for
                      that week, and only if the trade was alive at that week's close (opened on/before
                      its Friday) — never for a week before it opened. Mon–Fri: nothing about stamps. */}
                  <div style={{ marginTop: 16 }}>
                    {getWeeksBetween(tr.dateInitiated, todayISO).map((w) => {
                      const r = rows.find((x) => x.weekKey === w.weekKey);
                      if (!r) {
                        if (!stampWindow || w.weekKey !== stampWeekKey || !owesStampFor(tr, w.weekKey)) return null;
                        const k = stampKey(tr.id, w.weekKey); const v = stampVals[k] ?? '';
                        return (
                          <div key={w.weekKey} data-stamp-row={w.weekKey} style={{ display: 'grid', gridTemplateColumns: '160px 150px 100px 150px', marginLeft: 200, padding: '6px 0', alignItems: 'baseline', columnGap: 18 }}>
                            <span style={{ fontSize: SZ.meta, color: t.faint }}>{weekLabel(w.mondayDateStr)}</span>
                            <input placeholder="weekly close" aria-label={`${tr.symbol} ${weekLabel(w.mondayDateStr).split(' · ')[0]} weekly close`} value={v}
                              onChange={(e) => setStampVals({ ...stampVals, [k]: e.target.value.replace(/[^\d.]/g, '') })}
                              onKeyDown={(e) => { if (e.key === 'Enter' && +v > 0) applyStamps(w.weekKey, [tr.id]); }}
                              style={{ ...mono, fontSize: SZ.numSm + 1, width: 120, border: 'none', borderBottom: '1px solid ' + t.hair, outline: 'none', background: 'none', color: t.ink }} />
                            <button onClick={() => { if (+v > 0) applyStamps(w.weekKey, [tr.id]); }} disabled={!(+v > 0)} title="Stamp this week's closing price (editable any time)"
                              style={{ ...sans, fontSize: 13, fontWeight: 600, color: +v > 0 ? t.bg : t.faint, background: +v > 0 ? t.ink : 'none', border: '1px solid ' + (+v > 0 ? t.ink : t.hair), borderRadius: 3, padding: '3px 0', width: 100, cursor: +v > 0 ? 'pointer' : 'default' }}>Stamp {weekLabel(w.mondayDateStr).split(' · ')[0]}</button>
                            <span style={{ ...sans, fontSize: SZ.label, color: t.loss, textAlign: 'right', letterSpacing: '0.05em', textTransform: 'uppercase' }}>unstamped</span>
                          </div>
                        );
                      }
                      return (
                        <div key={w.weekKey} style={{ display: 'grid', gridTemplateColumns: '160px 150px 100px 150px', marginLeft: 200, padding: '6px 0', alignItems: 'baseline', columnGap: 18 }}>
                          <span style={{ fontSize: SZ.meta, color: t.faint }}>{r.label}</span>
                          {closeEdit === (tr.id + '-' + r.weekKey) ? (
                            <input autoFocus defaultValue={r.close}
                              onBlur={(e) => { editClose(r.weekKey, tr.id, +e.target.value.replace(/[^\d.]/g, '') || r.close); setCloseEdit(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { editClose(r.weekKey, tr.id, +(e.target as HTMLInputElement).value.replace(/[^\d.]/g, '') || r.close); setCloseEdit(null); } if (e.key === 'Escape') setCloseEdit(null); }}
                              style={{ ...mono, fontSize: SZ.numSm + 1, width: 120, border: 'none', borderBottom: '1px solid ' + t.ink, outline: 'none', background: 'none', color: t.ink }} />
                          ) : stampWindow ? (
                            <button onClick={() => setCloseEdit(tr.id + '-' + r.weekKey)} title="Edit this week's closing value"
                              style={{ ...mono, fontSize: SZ.numSm + 1, color: t.faint, background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px dashed ' + t.hair, padding: 0, textAlign: 'left' }}>close {px(tr, r.close)}</button>
                          ) : (
                            // Weekday: the week's closing value as plain text — edit it via the journal week.
                            <span style={{ ...mono, fontSize: SZ.numSm + 1, color: t.faint }}>close {px(tr, r.close)}</span>
                          )}
                          {tr.currency === 'USD' ? (
                            // The trade's own rate — the same on every week of its life.
                            <span title="This trade's USD/INR rate (Edit trade to change)" style={{ ...mono, fontSize: SZ.numSm, color: t.faint }}>{isNaN(r.rate) ? fxNa(SZ.label) : `@${r.rate}`}</span>
                          ) : <span />}
                          <span style={{ ...mono, fontSize: SZ.num, fontWeight: 500, textAlign: 'right', color: isNaN(r.val) ? t.loss : pl(r.val) }}>{isNaN(r.val) ? fxNa(SZ.label) : sgn(tr, r.val)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* JOURNAL — weekly MTM: REALIZED (closed this week) + UNREALIZED (open at week end, this week's change) = WEEK TOTAL */}
        {view === 'journal' && (() => {
          const jw = journalWeeks(trades, endWeekKey);
          const grand = jw.reduce((s, w) => s + w.total, 0);
          const rowGrid = { display: 'grid', gridTemplateColumns: '30px 200px 130px 130px 90px 1fr 150px', alignItems: 'baseline', padding: '13px 0', borderBottom: '1px solid ' + t.hair } as const;
          const money = (v: number, size = SZ.num, weight = 600) => (
            <span style={{ ...mono, fontSize: size, fontWeight: weight, textAlign: 'right', color: isNaN(v) ? t.loss : pl(v) }}>{isNaN(v) ? fxNa(SZ.label) : signed(v)}</span>
          );
          const section = (label: string, v: number) => (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 16, paddingBottom: 6, borderBottom: '1px solid ' + t.hair }}>
              <span style={secLabel}>{label}</span>
              <span style={{ marginLeft: 'auto' }}>{money(v, SZ.numSm)}</span>
            </div>
          );
          const wk = (label: string) => label.split(' · ')[0];
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: SZ.meta, color: t.faint }}>Journal · weekly MTM · realized + unrealized · after share</span>
                <DownloadPanel />
              </div>
              <div style={{ ...mono, fontSize: 44, lineHeight: 1, fontWeight: 500, color: isNaN(grand) ? t.loss : pl(grand), marginBottom: 6 }}>{isNaN(grand) ? fxNa(28) : signed(grand)}</div>
              <div style={{ fontSize: SZ.meta, color: t.faint, marginBottom: 20, maxWidth: 900 }}>
                Every trade, every week: CLOSED trades are REALIZED in the week they closed · OPEN trades are UNREALIZED in every week they are alive, marked at that week's close stamp (this week's stamp minus last week's, or minus entry if opened this week) — an unstamped week shows the trade as "unstamped" and is not counted · WEEK TOTAL = realized + unrealized. A trade that spans weeks appears in every week it was alive; its weekly pieces sum to its realized total when it closes.
              </div>
              {sel.length > 0 && (
                <div style={{ marginBottom: 24, padding: '13px 17px', border: '1px solid ' + t.ink, borderRadius: 4, display: 'flex', alignItems: 'baseline', gap: 16 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{sel.length} selected</span>
                  <span style={{ ...mono, fontSize: 22, fontWeight: 600, color: isNaN(selSum) ? t.loss : pl(selSum) }}>{isNaN(selSum) ? fxNa() : signed(selSum)}</span>
                  <button onClick={() => setSel([])} style={{ ...sans, marginLeft: 'auto', fontSize: 13, color: t.faint, background: 'none', border: 'none', cursor: 'pointer' }}>clear</button>
                </div>
              )}
              {jw.map((w) => (
                <div key={w.weekKey} data-week={w.weekKey} style={{ marginBottom: 40 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, paddingBottom: 10, borderBottom: '1px solid ' + t.ink }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{w.label}</span>
                    <span style={{ fontSize: SZ.meta, color: t.faint }}>
                      {w.realizedRows.length} closed · {w.openRows.length} open{w.unstamped ? ` · ${w.unstamped} unstamped` : ''}{!w.ended ? ' · in progress' : ''}
                    </span>
                    {w.unstamped > 0 && stampAll !== w.weekKey && (
                      <button onClick={() => { setStampAll(w.weekKey); setStampErr(''); }} style={{ ...ghost, fontWeight: 600, color: t.ink }}>Stamp all · {w.unstamped}</button>
                    )}
                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 12 }}>
                      <span style={secLabel}>Week total</span>
                      {money(w.total, 22)}
                    </span>
                  </div>

                  {stampAll === w.weekKey && (() => {
                    const owed = unstampedFor(w.weekKey); const wl = w.label.split(' · ')[0];
                    return (
                      <div role="region" aria-label={`Stamp all ${wl}`} style={{ border: '1px solid ' + t.ink, borderRadius: 4, padding: '16px 18px', marginTop: 16 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>Stamp all — {w.label}</div>
                        <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 4, marginBottom: 10 }}>One closing price per live trade still unstamped for this week (a weekly mark — positions stay open). Only entered numbers count; edit any stamp later on the live card.</div>
                        {owed.length === 0 && <div style={{ fontSize: SZ.meta, color: t.faint, padding: '6px 0' }}>Every live trade is stamped for {wl}.</div>}
                        {owed.map((tr) => {
                          const k = stampKey(tr.id, w.weekKey);
                          return (
                            <div key={tr.id} style={{ display: 'grid', gridTemplateColumns: '300px 250px 260px', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid ' + t.hair }}>
                              <span style={{ fontSize: 15, fontWeight: 600 }}>{tr.symbol} <span style={{ color: t.faint, fontWeight: 400 }}>· {specNameOf(tr.instrument)} — {wl} close</span></span>
                              <span style={{ ...mono, fontSize: SZ.numSm, color: t.faint }}>entry {px(tr, entryVal(tr))}</span>
                              <input placeholder="closing price" aria-label={`${tr.symbol} ${wl} close`} value={stampVals[k] ?? ''}
                                onChange={(e) => { setStampVals({ ...stampVals, [k]: e.target.value.replace(/[^\d.]/g, '') }); setStampErr(''); }}
                                onKeyDown={(e) => e.key === 'Enter' && stampAllSave(w.weekKey)}
                                style={{ ...mono, fontSize: SZ.num, border: 'none', borderBottom: '1px solid ' + t.hair, outline: 'none', background: 'none', color: t.ink, width: 190 }} />
                            </div>
                          );
                        })}
                        {stampErr && <div style={{ fontSize: SZ.meta, fontWeight: 600, color: t.loss, marginTop: 10 }}>{stampErr}</div>}
                        <div style={{ marginTop: 14, display: 'flex', gap: 16, alignItems: 'baseline' }}>
                          <button onClick={() => stampAllSave(w.weekKey)} style={{ ...sans, fontSize: SZ.btn, fontWeight: 600, background: t.ink, color: t.bg, border: 'none', borderRadius: 3, padding: '8px 18px', cursor: 'pointer' }}>Stamp {wl}</button>
                          <button onClick={() => { setStampAll(null); setStampErr(''); }} style={{ ...sans, fontSize: SZ.btn, color: t.faint, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    );
                  })()}
                  {w.realizedRows.length > 0 && section('Realized · closed this week', w.realized)}
                  {w.realizedRows.map(({ trade: tr, piece, pieces, total, carried, reconciled }) => {
                    const c = closeDateOf(tr); const held = heldDays(tr.dateInitiated, c);
                    return (
                      <div key={tr.id}>
                        <div style={{ ...rowGrid, borderBottom: carried ? 'none' : rowGrid.borderBottom }}>
                          <span onClick={() => setSel((s) => s.includes(tr.id) ? s.filter((i) => i !== tr.id) : [...s, tr.id])}
                            style={{ display: 'inline-block', width: 15, height: 15, borderRadius: 3, cursor: 'pointer', alignSelf: 'center', border: '1.5px solid ' + (sel.includes(tr.id) ? t.ink : t.hair), background: sel.includes(tr.id) ? t.ink : 'none' }} />
                          <span style={{ ...sans, fontSize: SZ.num, fontWeight: 600 }}>{tr.symbol}</span>
                          <span style={{ fontSize: SZ.meta, color: t.faint }}>initiated {dmy(tr.dateInitiated)}</span>
                          <span style={{ fontSize: SZ.meta, color: t.faint }}>closed {dmy(c)}</span>
                          <span style={{ ...mono, fontSize: SZ.numSm, color: t.faint }}>held {held}d</span>
                          <span style={{ fontSize: SZ.meta, color: t.faint }}>{sideOf(tr)} · {tr.numberOfLots} lot{tr.numberOfLots > 1 ? 's' : ''} · ×{tr.lotSize}{tr.currency === 'USD' ? ` · $ @${tradeRate(tr) ?? '?'}` : ''} · share {realPct(tr)}%{carried ? ` · ${wk(piece.label)} piece` : ''}</span>
                          {money(piece.val)}
                        </div>
                        {carried && historyLine(tr, pieces, total, reconciled, { marginLeft: 230, padding: '0 0 12px', borderBottom: '1px solid ' + t.hair })}
                      </div>
                    );
                  })}

                  {w.openRows.length > 0 && section('Unrealized · open this week · change during the week', w.unrealized)}
                  {w.openRows.map(({ trade: tr, piece }) => (
                    <div key={tr.id} data-open-row={tr.id} style={rowGrid}>
                      <span />
                      <span style={{ ...sans, fontSize: SZ.num, fontWeight: 600 }}>{tr.symbol}</span>
                      <span style={{ fontSize: SZ.meta, color: t.faint }}>opened {dmy(tr.dateInitiated)}</span>
                      {/* Existing stamp: editable here on ANY day (the live card offers it only Sat–Sun). */}
                      {piece.stamped && isOpen(tr) && piece.role !== 'closing' ? (
                        closeEdit === ('j-' + tr.id + '-' + piece.weekKey) ? (
                          <input autoFocus defaultValue={piece.close} aria-label={`${tr.symbol} ${wk(piece.label)} mark`}
                            onBlur={(e) => { editClose(piece.weekKey, tr.id, +e.target.value.replace(/[^\d.]/g, '') || piece.close); setCloseEdit(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { editClose(piece.weekKey, tr.id, +(e.target as HTMLInputElement).value.replace(/[^\d.]/g, '') || piece.close); setCloseEdit(null); } if (e.key === 'Escape') setCloseEdit(null); }}
                            style={{ ...mono, fontSize: SZ.meta, width: 110, border: 'none', borderBottom: '1px solid ' + t.ink, outline: 'none', background: 'none', color: t.ink }} />
                        ) : (
                          <button onClick={() => setCloseEdit('j-' + tr.id + '-' + piece.weekKey)} title="Edit this week's closing stamp" data-mark-edit={piece.weekKey}
                            style={{ ...sans, fontSize: SZ.meta, color: t.faint, background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px dashed ' + t.hair, padding: 0, textAlign: 'left' }}>mark {px(tr, piece.close)}</button>
                        )
                      ) : (
                        <span style={{ fontSize: SZ.meta, color: piece.stamped ? t.faint : t.loss }}>{piece.stamped ? `mark ${px(tr, piece.close)}` : 'unstamped'}</span>
                      )}
                      <span style={{ ...mono, fontSize: SZ.numSm, color: t.faint }}>{piece.role === 'initiation' ? 'entry' : 'from'}</span>
                      <span style={{ fontSize: SZ.meta, color: t.faint }}>{px(tr, piece.open)} · {sideOf(tr)} · {tr.numberOfLots} lot{tr.numberOfLots > 1 ? 's' : ''} · ×{tr.lotSize}{tr.currency === 'USD' ? ` · $ @${tradeRate(tr) ?? '?'}` : ''} · share {realPct(tr)}%{isOpen(tr) ? '' : ' · closed later'}</span>
                      {piece.stamped ? money(piece.val) : <span style={{ ...sans, fontSize: SZ.label, fontWeight: 600, color: t.loss, textAlign: 'right', letterSpacing: '0.05em', textTransform: 'uppercase' }}>unstamped</span>}
                    </div>
                  ))}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 28, marginTop: 14 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span style={secLabel}>Realized</span>{money(w.realized, SZ.numSm, 500)}</span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span style={secLabel}>Unrealized</span>{money(w.unrealized, SZ.numSm, 500)}</span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span style={secLabel}>Week total</span>{money(w.total, SZ.num)}</span>
                  </div>
                </div>
              ))}
              {jw.length === 0 && <div style={{ fontSize: 15, color: t.faint }}>No weeks yet — the journal fills as trades are marked and closed.</div>}
            </>
          );
        })()}

        {/* CLOSED — grouped by CLOSING WEEK (the journal's W-XX weeks), newest first, collapsible; every row keeps Edit/Delete */}
        {view === 'closedv' && (() => {
          const groups = closedByWeek(closed);
          const isWkOpen = (key: string, idx: number) => closedOpen[key] ?? idx < 2; // latest 2 weeks expanded by default
          const COLS = [32, 84, 140, 64, 52, 64, 104, 104, 84, 64, 76, 124, 100];
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: SZ.meta, color: t.faint }}>Realized · {closed.length} trades · by closing week · after share</span>
                <DownloadPanel />
              </div>
              <div style={{ ...mono, fontSize: SZ.big, lineHeight: 1, fontWeight: 500, color: isNaN(totalClosed) ? t.loss : pl(totalClosed) }}>{isNaN(totalClosed) ? fxNa(28) : signed(totalClosed)}</div>
              {sel.length > 0 && (
                <div style={{ marginTop: 18, padding: '13px 17px', border: '1px solid ' + t.ink, borderRadius: 4, display: 'flex', alignItems: 'baseline', gap: 16 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{sel.length} selected</span>
                  <span style={{ ...mono, fontSize: 22, fontWeight: 600, color: isNaN(selSum) ? t.loss : pl(selSum) }}>{isNaN(selSum) ? fxNa() : signed(selSum)}</span>
                  <button onClick={() => setSel([])} style={{ ...sans, marginLeft: 'auto', fontSize: 13, color: t.faint, background: 'none', border: 'none', cursor: 'pointer' }}>clear</button>
                </div>
              )}
              {groups.map((g, gi) => {
                const open = isWkOpen(g.weekKey, gi);
                return (
                  <div key={g.weekKey} data-closed-week={g.weekKey} style={{ marginTop: gi === 0 ? 26 : 34 }}>
                    <div role="button" aria-expanded={open} aria-label={`${g.label} closed trades`} onClick={() => setClosedOpen({ ...closedOpen, [g.weekKey]: !open })}
                      style={{ display: 'flex', alignItems: 'baseline', gap: 14, paddingBottom: 10, borderBottom: '1px solid ' + t.ink, cursor: 'pointer', userSelect: 'none' }}>
                      <span style={{ ...sans, fontSize: 13, color: t.faint, width: 12 }}>{open ? '▾' : '▸'}</span>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{g.label}</span>
                      <span style={{ fontSize: SZ.meta, color: t.faint }}>{g.trades.length} trade{g.trades.length > 1 ? 's' : ''}{open ? '' : ' · collapsed'}</span>
                      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 12 }}>
                        <span style={secLabel}>Realized</span>
                        <span style={{ ...mono, fontSize: 22, fontWeight: 600, color: isNaN(g.total) ? t.loss : pl(g.total) }}>{isNaN(g.total) ? fxNa() : signed(g.total)}</span>
                      </span>
                    </div>
                    {open && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                        <thead><tr>
                          <th style={{ borderBottom: '1px solid ' + t.hair }} />
                          {th('Closed')}{th('Symbol')}{th('Side')}{th('Qty', true)}{th('Mult', true)}{th('Entry', true)}{th('Exit', true)}{th('Brok', true)}{th('Share', true)}{th('USD/INR', true)}{th('P&L', true)}
                          <th style={{ borderBottom: '1px solid ' + t.hair }} />
                        </tr></thead>
                        <tbody>
                          {g.trades.map((tr) => {
                            const p = realized(tr); const on = sel.includes(tr.id); const editing = !!(edit && edit.id === tr.id);
                            const pieces = weekPieces(tr); const carried = pieces.length > 1;
                            const brok = entryLegBrokerage(tr) + exitLegBrokerage(tr);
                            const rowBg = on ? (themeKey === 'white' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.045)') : 'transparent';
                            return (
                              <Fragment key={tr.id}>
                              <tr data-trade={tr.id} style={{ background: rowBg }}>
                                <td style={{ borderBottom: carried ? 'none' : '1px solid ' + t.hair, cursor: 'pointer' }} onClick={() => setSel((s) => on ? s.filter((i) => i !== tr.id) : [...s, tr.id])}>
                                  <span style={{ display: 'inline-block', width: 15, height: 15, borderRadius: 3, border: '1.5px solid ' + (on ? t.ink : t.hair), background: on ? t.ink : 'none' }} />
                                </td>
                                <td style={td({ color: t.faint, fontSize: SZ.numSm, borderBottom: carried ? 'none' : undefined })}>{dmy(closeDateOf(tr))}</td>
                                <td title={tr.symbol} style={{ ...td({ borderBottom: carried ? 'none' : undefined }), ...sans, fontWeight: 600, fontSize: SZ.num, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr.symbol}</td>
                                <td style={{ ...td({ borderBottom: carried ? 'none' : undefined }), ...sans, fontSize: 15, color: tr.direction === 'Long' ? t.ink : t.faint }}>{sideOf(tr)}</td>
                                <td style={td({ textAlign: 'right', borderBottom: carried ? 'none' : undefined })}>{tr.numberOfLots}</td>
                                <td style={td({ textAlign: 'right', color: t.faint, borderBottom: carried ? 'none' : undefined })}>×{tr.lotSize}</td>
                                <td style={td({ textAlign: 'right', borderBottom: carried ? 'none' : undefined })}>{px(tr, entryVal(tr))}</td>
                                <td style={td({ textAlign: 'right', borderBottom: carried ? 'none' : undefined })}>{px(tr, exitVal(tr))}</td>
                                <td title="Brokerage, both legs, in the trade's currency" style={td({ textAlign: 'right', fontSize: SZ.numSm, color: t.faint, borderBottom: carried ? 'none' : undefined })}>{(dispCcy(tr) === 'USD' ? '$' : '₹') + nf(Math.round(brok))}</td>
                                <td style={td({ textAlign: 'right', fontSize: 15, color: t.faint, borderBottom: carried ? 'none' : undefined })}>{realPct(tr)}%</td>
                                <td style={td({ textAlign: 'right', fontSize: SZ.numSm, color: t.faint, borderBottom: carried ? 'none' : undefined })}>{tr.currency === 'USD' ? (tradeRate(tr) ?? fxNa(SZ.label)) : '—'}</td>
                                <td style={td({ textAlign: 'right', fontWeight: 600, color: isNaN(p) ? t.loss : pl(p), borderBottom: carried ? 'none' : undefined })}>{isNaN(p) ? fxNa(SZ.label) : sgn(tr, p)}</td>
                                <td style={{ ...td({ borderBottom: carried ? 'none' : undefined }), textAlign: 'right' }}>
                                  <span style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                    <button onClick={() => editing ? setEdit(null) : act('edit', tr.id)} style={{ ...sans, fontSize: 13, color: t.faint, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{editing ? 'Close' : 'Edit'}</button>
                                    <button onClick={() => act('delete', tr.id)} style={{ ...sans, fontSize: 13, color: themeKey === 'white' ? t.loss : t.ink, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete</button>
                                  </span>
                                </td>
                              </tr>
                              {carried && (
                                // Lived across weeks: its per-week P&L history inline, as in the journal.
                                <tr data-history={tr.id} style={{ background: rowBg }}><td colSpan={13} style={{ borderBottom: '1px solid ' + t.hair, padding: '0 0 12px 116px' }}>
                                  {historyLine(tr, pieces, p, reconcile(tr).ok)}
                                </td></tr>
                              )}
                              {editing && (
                                <tr><td colSpan={13} style={{ borderBottom: '1px solid ' + t.hair, padding: '4px 0 22px' }}>{editForm()}</td></tr>
                              )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
              {closed.length === 0 && <div style={{ fontSize: 15, color: t.faint, marginTop: 16 }}>No closed trades yet.</div>}
              <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 14 }}>
                Weeks are the journal's closing weeks — click a week to collapse or expand it (latest two open by default). Checkbox sums selected trades. Edit and Delete sit behind the PIN{pinOk ? ' — unlocked this session' : (pinHash ? '' : ' — first use sets it')}.
              </div>
            </>
          );
        })()}

        {/* ADD */}
        {view === 'add' && (
          <div style={{ maxWidth: 580 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 28 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Initiate new contract</div>
              <div style={{ ...mono, fontSize: SZ.meta, color: t.faint }}>{weekLabel(todayISO)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px 30px' }}>
              <div><label style={lbl}>Symbol / security</label>
                <input placeholder="e.g. NIFTY25S" value={form.sym} onChange={(e) => setForm({ ...form, sym: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Instrument</label>
                <select value={form.instr} onChange={(e) => { const k = e.target.value as SpecInstrument; const m = INSTR[k]; setForm({ ...form, instr: k, ccy: m.ccy, mult: m.mult == null ? '' : String(m.mult) }); }}
                  style={{ ...inp, ...sans, fontSize: SZ.num - 1, cursor: 'pointer', background: t.bg }}>
                  {(Object.keys(INSTR) as SpecInstrument[]).filter((k) => !INSTR[k].comex).map((k) => <option key={k} value={k}>{k}</option>)}
                  <optgroup label="COMEX">
                    {(Object.keys(INSTR) as SpecInstrument[]).filter((k) => INSTR[k].comex).map((k) => <option key={k} value={k}>{k}</option>)}
                  </optgroup>
                </select></div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
                <button onClick={() => setForm({ ...form, side: 'LONG' })} style={toggle(form.side === 'LONG')}>LONG · buy first</button>
                <button onClick={() => setForm({ ...form, side: 'SHORT' })} style={toggle(form.side === 'SHORT')}>SHORT · sell first</button>
              </div>
              <div><label style={lbl}>{form.side === 'LONG' ? 'Buy' : 'Sell'} price</label>
                <input placeholder="0.00" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, '') })} style={inp} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div><label style={lbl}>Multiplier · lot size</label>
                  <input placeholder={form.instr === 'NSE FUT' ? "e.g. 250" : "size"} value={form.mult} onChange={(e) => setForm({ ...form, mult: e.target.value.replace(/[^\d.]/g, '') })} style={inp} /></div>
                <div><label style={lbl}>Lots</label>
                  <input value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value.replace(/\D/g, '') })} style={inp} /></div>
              </div>
              <div><label style={lbl}>Initiation date</label>
                <input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Accounting currency</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setForm({ ...form, ccy: 'INR' })} style={toggle(form.ccy === 'INR')}>₹ INR</button>
                  <button onClick={() => setForm({ ...form, ccy: 'USD' })} style={toggle(form.ccy === 'USD')}>$ USD</button>
                </div></div>
              <div><label style={lbl}>Realization · profit share</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setForm({ ...form, real: 1.0 })} style={toggle(form.real === 1.0)}>FULL 1.0</button>
                  <button onClick={() => setForm({ ...form, real: 0.8 })} style={toggle(form.real === 0.8)}>80% 0.8</button>
                </div>
                <div style={{ fontSize: SZ.label, color: t.faint, marginTop: 6 }}>MTM and realized P&L both wear this.</div></div>
              <div><label style={lbl}>Entry-leg brokerage ({form.ccy === 'USD' ? '$' : '₹'}, optional)</label>
                <input placeholder="blank = auto formula (legacy)" value={form.brok} onChange={(e) => setForm({ ...form, brok: e.target.value.replace(/[^\d.]/g, '') })} style={inp} />
                <div style={{ fontSize: SZ.label, color: t.faint, marginTop: 6 }}>Charged this week. Exit leg at close.</div></div>
              {form.ccy === 'USD' && (
                <div><label style={lbl}>USD/INR rate · this trade</label>
                  <input placeholder="e.g. 89.90" value={form.rate} onChange={(e) => { setForm({ ...form, rate: e.target.value.replace(/[^\d.]/g, '') }); setFormErr(''); }} style={inp} />
                  <div style={{ fontSize: SZ.label, color: t.faint, marginTop: 6 }}>Stays with the trade for its whole life — every ₹ figure converts at it. Editable via Edit trade.</div></div>
              )}
            </div>
            {formErr && <div style={{ ...sans, fontSize: SZ.meta, fontWeight: 600, color: t.loss, marginTop: 18 }}>{formErr}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 36, paddingTop: 20, borderTop: '1px solid ' + t.hair }}>
              <button onClick={() => { setForm({ ...form, sym: '', price: '', rate: '' }); setFormErr(''); }} style={{ ...sans, fontSize: SZ.btn, color: t.faint, background: 'none', border: '1px solid ' + t.hair, borderRadius: 3, padding: '10px 20px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={deploy} style={{ ...sans, fontSize: SZ.btn, fontWeight: 600, background: t.ink, color: t.bg, border: 'none', borderRadius: 3, padding: '10px 24px', cursor: 'pointer' }}>Confirm &amp; deploy</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function dmyInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}
