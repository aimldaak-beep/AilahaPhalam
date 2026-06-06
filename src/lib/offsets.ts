/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-week PnL reconciliation offsets.
 *
 * This is a SEPARATE storage path from trades — its own `week_offsets` table and its
 * own CRUD helpers. It never touches syncTradesToSupabase or the trades flow.
 *
 * An offset is a manual adjustment (positive or negative) layered ON TOP of the
 * calculated weekly PnL to reconcile against the broker's end-of-week numbers.
 * It is NOT part of the trade/PnL math (types.ts is untouched).
 */

import { supabase } from './supabase';
import {
  Trade,
  getWeekInfo,
  getWeeksBetween,
  calculateTradeForWeek,
} from '../types';

export interface WeekOffset {
  id?: string; // Supabase row id (uuid), present once persisted
  weekKey: string; // ISO week key, e.g. "2026-W23"
  amount: number; // can be negative
  note: string;
}

/** Load all of the signed-in user's offsets, keyed by week. RLS scopes to the user. */
export async function fetchWeekOffsets(): Promise<Record<string, WeekOffset>> {
  const { data, error } = await supabase
    .from('week_offsets')
    .select('id, week_key, amount, note')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load week offsets from Supabase:', error.message);
    return {};
  }

  const map: Record<string, WeekOffset> = {};
  (data ?? []).forEach((r: { id: string; week_key: string; amount: number | string; note: string | null }) => {
    map[r.week_key] = {
      id: r.id,
      weekKey: r.week_key,
      amount: Number(r.amount) || 0, // numeric arrives as string from pg; coerce
      note: r.note ?? '',
    };
  });
  return map;
}

/** Upsert one week's offset (one row per user+week via the unique constraint). */
export async function saveWeekOffset(
  userId: string,
  weekKey: string,
  amount: number,
  note: string,
): Promise<WeekOffset | null> {
  const { data, error } = await supabase
    .from('week_offsets')
    .upsert({ user_id: userId, week_key: weekKey, amount, note }, { onConflict: 'user_id,week_key' })
    .select('id, week_key, amount, note')
    .single();

  if (error) {
    console.error('Failed to save week offset to Supabase:', error.message);
    return null;
  }
  return {
    id: data.id,
    weekKey: data.week_key,
    amount: Number(data.amount) || 0,
    note: data.note ?? '',
  };
}

/** Remove a week's offset entirely. */
export async function deleteWeekOffset(userId: string, weekKey: string): Promise<boolean> {
  const { error } = await supabase
    .from('week_offsets')
    .delete()
    .eq('user_id', userId)
    .eq('week_key', weekKey);

  if (error) {
    console.error('Failed to delete week offset from Supabase:', error.message);
    return false;
  }
  return true;
}

/**
 * Calculated net PnL per ISO week across all trades — REUSES the existing ledger math
 * (calculateTradeForWeek), it does not reimplement it. Display/reporting layer only.
 */
export function computePerWeekNet(trades: Trade[]): Record<string, number> {
  const todayStr = new Date().toISOString().split('T')[0];
  const perWeek: Record<string, number> = {};

  trades.forEach((trade) => {
    const endLimitStr =
      trade.status === 'Closed' || trade.status === 'CarryForwardClosed'
        ? (trade.direction === 'Long' ? trade.sellDate || todayStr : trade.buyDate || todayStr)
        : todayStr;
    getWeeksBetween(trade.dateInitiated, endLimitStr).forEach((w) => {
      const calc = calculateTradeForWeek(trade, w.weekKey);
      if (calc.isActive) {
        perWeek[w.weekKey] = (perWeek[w.weekKey] ?? 0) + calc.netProfit;
      }
    });
  });

  return perWeek;
}

/** Lifetime offset total — cumulative sum of every week's offset. */
export function totalOffset(offsets: Record<string, WeekOffset>): number {
  return Object.values(offsets).reduce((sum, o) => sum + (o.amount || 0), 0);
}

/**
 * Build & download a dedicated Weekly RECONCILIATION CSV: calculated PnL, offset, note,
 * and adjusted total per week, plus grand totals + lifetime offset. This is its own file
 * with its own columns/rows — the raw per-trade ledger export (exportToExcel) is untouched.
 */
export function downloadReconciliationCsv(
  trades: Trade[],
  offsets: Record<string, WeekOffset>,
): void {
  const perWeekNet = computePerWeekNet(trades);

  // Every week that has trade activity OR an offset.
  const weekKeys = Array.from(
    new Set([...Object.keys(perWeekNet), ...Object.keys(offsets)]),
  ).sort();

  const headers = [
    'ISO Week',
    'Week Range',
    'Calculated Net PnL (INR)',
    'Offset (INR)',
    'Adjusted Net (INR)',
    'Note',
  ];

  let grandCalc = 0;
  let grandOffset = 0;

  const rows = weekKeys.map((wk) => {
    const calc = perWeekNet[wk] ?? 0;
    const off = offsets[wk]?.amount ?? 0;
    const note = offsets[wk]?.note ?? '';
    grandCalc += calc;
    grandOffset += off;

    // Derive a readable range from the week key (mirror WeeklyReport's approach).
    const parts = wk.split('-W');
    const year = parseInt(parts[0]);
    const weekNum = parseInt(parts[1]);
    const approx = new Date(year, 0, 1 + (weekNum - 1) * 7);
    const range = getWeekInfo(approx.toISOString().split('T')[0]).weekRange;

    return [wk, range, calc.toFixed(2), off.toFixed(2), (calc + off).toFixed(2), note];
  });

  const summaryRows = [
    [],
    ['GRAND TOTAL', '', grandCalc.toFixed(2), grandOffset.toFixed(2), (grandCalc + grandOffset).toFixed(2), ''],
    ['LIFETIME OFFSET TOTAL', '', '', grandOffset.toFixed(2), '', ''],
  ];

  const csvContent = [headers, ...rows, ...summaryRows]
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');

  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `ailaha_phalam_reconciliation_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
