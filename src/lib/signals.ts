import { supabase } from './supabase';

export interface SignalRow {
  symbol: string;
  scan_date: string;
  scan_time: string;
  timeframe: string;
  signal: string;
  detail: string;
  price: number;
}

export interface DailyOHLC {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getLatestSignals(): Promise<SignalRow[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('scan_date', today)
    .order('scan_time', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getLatestSignalPerTF():
  Promise<Record<string, Record<string, SignalRow>>> {
  const rows = await getLatestSignals();
  // Group by symbol, keep latest per TF
  const result: Record<string, Record<string, SignalRow>> = {};
  for (const row of rows) {
    if (!result[row.symbol]) result[row.symbol] = {};
    if (!result[row.symbol][row.timeframe]) {
      result[row.symbol][row.timeframe] = row;
    }
  }
  return result;
}

export async function getDailyOHLC(
  symbols: string[],
  date: string
): Promise<DailyOHLC[]> {
  const { data, error } = await supabase
    .from('daily_ohlc')
    .select('*')
    .in('symbol', symbols)
    .eq('date', date);
  if (error) throw error;
  return data || [];
}
