/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Weekly USD/INR settlement rates — persistence half (pure model in fxmodel.ts).
 *
 * Model (AKS's spec): one rate per Mon–Sun week. Through the week every USD figure
 * converts at that week's PROVISIONAL rate; at the Saturday/Sunday week close AKS
 * supplies the closing rate, the week recomputes at it and FREEZES (settled: true),
 * and the settled rate becomes the next week's provisional base. Settled weeks never
 * re-price. There is NO hardcoded fallback rate anywhere — a missing rate must surface
 * as "FX rate not set", never a silent default.
 *
 * Persistence: no DDL is reachable on this project, so the store rides as ONE
 * RLS-scoped sentinel row in `public.trades` (`data.kind = 'fx_weekly_rates'`,
 * `data.id = FX_DOC_ID`). It is filtered out of the trade list on load and is never
 * touched by the trade persist diff. Server-side ⇒ survives reload/redeploy/device.
 */

import { supabase } from './supabase';
import { FxWeeks, FX_DOC_ID, FX_DOC_KIND } from './fxmodel';

export type { FxWeek, FxWeeks } from './fxmodel';
export { FX_DOC_ID, FX_DOC_KIND, isDocRow, rateForWeek, isSettled } from './fxmodel';

/** Load the signed-in user's weekly-rate store. {} when none exists yet. */
export async function fetchFxWeeks(): Promise<FxWeeks> {
  const { data, error } = await supabase
    .from('trades')
    .select('data')
    .eq('data->>kind', FX_DOC_KIND)
    .limit(1);
  if (error) { console.error('load fx rates:', error.message); return {}; }
  const doc = data?.[0]?.data as { weeks?: FxWeeks } | undefined;
  return doc?.weeks ?? {};
}

/** Persist the whole store (update the sentinel row, insert it on first save). */
export async function saveFxWeeks(weeks: FxWeeks): Promise<boolean> {
  const doc = { id: FX_DOC_ID, kind: FX_DOC_KIND, weeks };
  const { data, error } = await supabase
    .from('trades').update({ data: doc }).eq('data->>id', FX_DOC_ID).select('id');
  if (error) { console.error('save fx rates:', error.message); return false; }
  if (data && data.length > 0) return true;
  const { error: insErr } = await supabase.from('trades').insert({ data: doc });
  if (insErr) { console.error('insert fx rates:', insErr.message); return false; }
  return true;
}
