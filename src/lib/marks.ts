/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Weekly MTM marks persistence (`weekly_marks` table).
 *
 * The engine's single source of truth for a trade's per-week marks stays
 * `trade.fridayClosingPrices` inside the `trades.data` jsonb (types.ts is the only PnL
 * math). This module MIRRORS those marks into the dedicated `weekly_marks` table
 * (one row per user+trade+week, RLS-scoped like week_offsets) so every mark is also a
 * queryable first-class row. Mirroring happens from the syncTradesToSupabase chokepoint,
 * so every path that writes a mark (weekly-view week-close input, Saturday banner,
 * CarryForwardModal, EditTradeModal) keeps the table in sync. On load, marks are used
 * only to back-fill weeks a trade's jsonb is missing — jsonb always wins on conflict.
 */

import { supabase } from './supabase';
import { Trade } from '../types';

/** trade_id -> (week_key -> close_price) */
export type MarksByTrade = Record<string, Record<string, number>>;

/** Load all of the signed-in user's weekly marks. RLS scopes to the user. */
export async function fetchWeeklyMarks(): Promise<MarksByTrade> {
  const { data, error } = await supabase
    .from('weekly_marks')
    .select('trade_id, week_key, close_price');

  if (error) {
    console.error('Failed to load weekly marks from Supabase:', error.message);
    return {};
  }

  const map: MarksByTrade = {};
  (data ?? []).forEach((r: { trade_id: string; week_key: string; close_price: number | string }) => {
    const price = Number(r.close_price); // numeric arrives as string from pg; coerce
    if (isNaN(price)) return;
    (map[r.trade_id] ??= {})[r.week_key] = price;
  });
  return map;
}

/**
 * Mirror one trade's fridayClosingPrices into weekly_marks: upsert added/changed weeks,
 * delete weeks removed from the trade. Diffed against the previous trade snapshot so a
 * normal edit touches only the changed rows.
 */
export async function syncWeeklyMarksForTrade(
  userId: string,
  trade: Trade,
  prev?: Trade,
): Promise<void> {
  const next = trade.fridayClosingPrices ?? {};
  const prevMap = prev?.fridayClosingPrices ?? {};

  const upserts = Object.entries(next)
    .filter(([weekKey, price]) => prevMap[weekKey] !== price)
    .map(([weekKey, price]) => ({
      user_id: userId,
      trade_id: trade.id,
      week_key: weekKey,
      close_price: price,
      updated_at: new Date().toISOString(),
    }));
  if (upserts.length > 0) {
    const { error } = await supabase
      .from('weekly_marks')
      .upsert(upserts, { onConflict: 'user_id,trade_id,week_key' });
    if (error) console.error('Failed to save weekly marks to Supabase:', error.message);
  }

  const removed = Object.keys(prevMap).filter((weekKey) => !(weekKey in next));
  if (removed.length > 0) {
    const { error } = await supabase
      .from('weekly_marks')
      .delete()
      .eq('user_id', userId)
      .eq('trade_id', trade.id)
      .in('week_key', removed);
    if (error) console.error('Failed to delete weekly marks from Supabase:', error.message);
  }
}

/** Remove every mark row for one trade (used when the trade itself is deleted). */
export async function deleteWeeklyMarksForTrade(userId: string, tradeId: string): Promise<void> {
  const { error } = await supabase
    .from('weekly_marks')
    .delete()
    .eq('user_id', userId)
    .eq('trade_id', tradeId);
  if (error) console.error('Failed to delete trade weekly marks from Supabase:', error.message);
}

/** Remove all of the user's mark rows (used by Reset ALL alongside the trades wipe). */
export async function deleteAllWeeklyMarks(userId: string): Promise<void> {
  const { error } = await supabase.from('weekly_marks').delete().eq('user_id', userId);
  if (error) console.error('Failed to reset weekly marks in Supabase:', error.message);
}

/**
 * Back-fill loaded trades with marks the jsonb is missing (e.g. a partial earlier sync).
 * The jsonb value always wins when both exist. Returns new objects only where a fill
 * actually happened.
 */
export function overlayMissingMarks(trades: Trade[], marks: MarksByTrade): Trade[] {
  return trades.map((trade) => {
    const tradeMarks = marks[trade.id];
    if (!tradeMarks) return trade;
    const missing = Object.entries(tradeMarks).filter(
      ([weekKey]) => trade.fridayClosingPrices?.[weekKey] === undefined,
    );
    if (missing.length === 0) return trade;
    return {
      ...trade,
      fridayClosingPrices: {
        ...trade.fridayClosingPrices,
        ...Object.fromEntries(missing),
      },
    };
  });
}
