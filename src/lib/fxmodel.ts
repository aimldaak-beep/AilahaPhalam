/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Weekly USD/INR rate model — PURE half (no supabase import, so the engine and node
 * proof scripts can use it). Persistence lives in fxrates.ts. See fxrates.ts for the
 * full settlement law: one rate per Mon–Sun week, provisional through the week,
 * settled+frozen at the Saturday close, settled rate = next week's provisional base,
 * and NO hardcoded fallback anywhere — a missing rate is null / "FX rate not set".
 */

export interface FxWeek { rate: number; settled: boolean; settledAt?: string }
export type FxWeeks = Record<string, FxWeek>; // weekKey "YYYY-Www" -> rate

export const FX_DOC_ID = 'fx_weekly_rates_v1';
export const FX_DOC_KIND = 'fx_weekly_rates';

/** Rows in `trades` that are the FX store (or any future non-trade doc), not trades. */
export const isDocRow = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && 'kind' in (data as Record<string, unknown>);

/**
 * Resolve the rate that governs a week: the week's own stored rate, else the most
 * recent EARLIER week's rate carried forward (a settled Saturday rate is the next
 * week's provisional base). Returns null when nothing is stored — the caller must
 * show "FX rate not set", never substitute a number.
 */
export function rateForWeek(weeks: FxWeeks, weekKey: string): number | null {
  const exact = weeks[weekKey];
  if (exact) return exact.rate;
  const earlier = Object.keys(weeks).filter((w) => w < weekKey).sort();
  return earlier.length ? weeks[earlier[earlier.length - 1]].rate : null;
}

export const isSettled = (weeks: FxWeeks, weekKey: string): boolean =>
  weeks[weekKey]?.settled === true;
