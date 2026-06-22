/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabase';
import { getDailyOHLC } from './signals';

export interface TrackerTrade {
  id: string;
  user_id: string;
  symbol: string;
  direction: 'Long' | 'Short';
  entry_date: string;
  entry_price: number;
  status: 'Open' | 'Closed';
  close_date?: string;
  close_price?: number;
  daily_data: DailyOHLC[];
  created_at: string;
}

export interface DailyOHLC {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export async function fetchTrackerTrades(): Promise<TrackerTrade[]> {
  const { data, error } = await supabase
    .from('trade_tracker')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addTrackerTrade(
  trade: Omit<TrackerTrade, 'id' | 'user_id' | 'created_at'>
): Promise<TrackerTrade> {
  const { data, error } = await supabase
    .from('trade_tracker')
    .insert(trade)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTrackerTrade(
  id: string,
  updates: Partial<TrackerTrade>
): Promise<void> {
  const { error } = await supabase
    .from('trade_tracker')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTrackerTrade(id: string): Promise<void> {
  const { error } = await supabase
    .from('trade_tracker')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function autoFillOHLC(
  symbol: string,
  date: string
): Promise<{ open: number; high: number; low: number; close: number } | null> {
  const data = await getDailyOHLC([symbol], date);
  if (!data.length) return null;
  const d = data[0];
  return {
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close
  };
}
