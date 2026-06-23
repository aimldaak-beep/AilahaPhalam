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

export async function getLatestSignals():
  Promise<{ signals: SignalRow[]; date: string }> {
  // Find the most recent date that actually has signals (not "today",
  // which may have no rows yet if the scanner hasn't synced).
  const { data: latest } = await supabase
    .from('signals')
    .select('scan_date')
    .order('scan_date', { ascending: false })
    .limit(1);

  const latestDate = latest?.[0]?.scan_date;
  if (!latestDate) return { signals: [], date: '' };

  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('scan_date', latestDate)
    .order('scan_time', { ascending: false });

  if (error) throw error;
  return { signals: data || [], date: latestDate };
}

export async function getLatestSignalPerTF():
  Promise<{
    matrix: Record<string, Record<string, SignalRow>>;
    date: string;
  }> {
  const { signals, date } = await getLatestSignals();
  // Group by symbol, keep latest per TF
  const matrix: Record<string, Record<string, SignalRow>> = {};
  for (const row of signals) {
    if (!matrix[row.symbol]) matrix[row.symbol] = {};
    if (!matrix[row.symbol][row.timeframe]) {
      matrix[row.symbol][row.timeframe] = row;
    }
  }
  return { matrix, date };
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
