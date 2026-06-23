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

/**
 * Distinct scan dates, newest first.
 *
 * Fast path: a `signal_dates` view (one cheap query, no row cap). Create it with:
 *   create or replace view signal_dates as
 *   select distinct scan_date from signals order by scan_date desc;
 *
 * Fallback (used until the view exists): walk distinct dates with a cursor —
 * one row per date — so a single day exceeding PostgREST's 1000-row cap can't
 * crowd out older dates the way a plain `.limit(1000)` would.
 */
export async function getAvailableDates(): Promise<string[]> {
  const view = await supabase
    .from('signal_dates')
    .select('scan_date')
    .order('scan_date', { ascending: false });
  if (!view.error && view.data) {
    return view.data.map((r) => r.scan_date);
  }

  const dates: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 1000; i++) {
    let q = supabase
      .from('signals')
      .select('scan_date')
      .order('scan_date', { ascending: false })
      .limit(1);
    if (cursor) q = q.lt('scan_date', cursor);
    const { data, error } = await q;
    if (error) throw error;
    const d = data?.[0]?.scan_date;
    if (!d) break;
    dates.push(d);
    cursor = d;
  }
  return dates;
}

export async function getLatestSignals(targetDate?: string):
  Promise<{ signals: SignalRow[]; date: string }> {
  // Use the requested date if given; otherwise find the most recent date that
  // actually has signals (not "today", which may have no rows yet).
  let date = targetDate;
  if (!date) {
    const { data: latest } = await supabase
      .from('signals')
      .select('scan_date')
      .order('scan_date', { ascending: false })
      .limit(1);
    date = latest?.[0]?.scan_date;
  }
  if (!date) return { signals: [], date: '' };

  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('scan_date', date)
    .order('scan_time', { ascending: false });

  if (error) throw error;
  return { signals: data || [], date };
}

export async function getLatestSignalPerTF(targetDate?: string):
  Promise<{
    matrix: Record<string, Record<string, SignalRow>>;
    date: string;
  }> {
  const { signals, date } = await getLatestSignals(targetDate);
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
