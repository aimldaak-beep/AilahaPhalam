/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Residue of the retired weekly USD/INR rate store (2026-08-28 → 2026-09-12). FX is now
 * PER TRADE (Trade.usdToInrRate, see types.ts / v2engine.tradeRate); nothing reads a
 * weekly rate any more. What survives here:
 *   - the sentinel-row filter: the old store still exists as an RLS-scoped doc row in
 *     `public.trades` (data.kind = 'fx_weekly_rates'), kept as history and NEVER loaded
 *     as a trade;
 *   - shiftISO, a date helper the Saturday-voice timing law uses.
 */

export const FX_DOC_ID = 'fx_weekly_rates_v1';
export const FX_DOC_KIND = 'fx_weekly_rates';

/** Rows in `trades` that are a doc (the retired FX store, or any future non-trade doc), not trades. */
export const isDocRow = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && 'kind' in (data as Record<string, unknown>);

/** ISO date shifted by whole days (UTC-safe for date-only strings). */
export const shiftISO = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
};
