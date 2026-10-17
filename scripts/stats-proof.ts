/**
 * WEEKLY STATISTICS proof (2026-10-17). Pure, read-only on a trades dump (JSON file). For EVERY week and
 * EVERY instrument line the page shows, recompute the same number STRAIGHT FROM THE SPEC FORMULA — not
 * through lib/weekly.ts — and require an exact match:
 *   per trade, per Mon–Sun week it is alive in (owed weeks under the STAMP LAW + its closing week):
 *     opened & closed this week : (exit − entry) × dir × mult × lots × rate × share − (entry leg + exit leg) × rate × share
 *     opened, open at week end  : (stamp − entry) × … − entry leg × rate × share
 *     carried, open at week end : (stamp − last stamp) × …            (no brokerage)
 *     carried, closed this week : (exit − last stamp) × … − exit leg × rate × share
 *   rate = that week's own rate (fridayUsdToInrRates[week] / closedUsdToInrRate in the closing week), NULL →
 *   the trade's base rate; INR = 1. "Last stamp" = the prior week's close stamp (falls back to entry when
 *   the prior week has no stamp — the engine's rule). A carried trade alive at the week's close with no
 *   stamp is NOT zero: it is "unstamped" and excluded.
 *   Rounding (journal law): each week's piece is rounded to the rupee; a CLOSED trade's closing piece
 *   carries the ≤₹1 residual so Σ pieces === realized (round-once). The formula side applies the same rule.
 *   npx tsx scripts/stats-proof.ts <trades.json>
 */
import fs from 'fs';
import { Trade, getWeeksBetween, getWeekInfo, getWeekKeyForClose, calculateTurnoverAndBrokerage } from '../src/types';
import { isOpen, isClosed, specNameOf, todayStr, SpecInstrument } from '../src/lib/v2engine';
import { weeklyStats } from '../src/lib/stats';

const rows: any[] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter((r: any) => !r.data.kind);
const trades: Trade[] = rows.map((r) => r.data as Trade);
let failures = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };
const fmt = (v: number) => (isNaN(v) ? 'NaN' : (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('en-IN'));

// ---- the formula, written independently of lib/weekly.ts ----
type FWeek = { weekKey: string; kind: string; open: number; close: number | null; rate: number; raw: number; val: number; stamped: boolean };
function formulaWeeks(t: Trade): FWeek[] {
  const dir = t.direction === 'Long' ? 1 : -1;
  const entry = (t.direction === 'Long' ? t.buyPrice : t.sellPrice) ?? 0;
  const exit = (t.direction === 'Long' ? t.sellPrice : t.buyPrice) ?? 0;
  const closeDate = t.direction === 'Long' ? t.sellDate : t.buyDate;
  const closed = isClosed(t);
  const closeWk = closed ? getWeekKeyForClose(t) : null;
  const end = closed ? (closeDate ?? todayStr()) : todayStr();
  const entryLeg = t.entryBrokerage ?? calculateTurnoverAndBrokerage(entry, t.numberOfLots, t.lotSize, t.instrument).brokerage;
  const exitLeg = t.exitBrokerage ?? calculateTurnoverAndBrokerage(exit, t.numberOfLots, t.lotSize, t.instrument).brokerage;
  const rateOf = (wk: string) => t.currency !== 'USD' ? 1 : ((wk === closeWk ? (t.closedUsdToInrRate ?? t.fridayUsdToInrRates?.[wk]) : t.fridayUsdToInrRates?.[wk]) ?? t.usdToInrRate ?? NaN);
  const share = t.realizationRate ?? 1;
  const all = getWeeksBetween(t.dateInitiated, end);
  // STAMP LAW: a week counts only if the trade was alive at its close (opened on/before its Friday), or it
  // is the closing week, or a stamp already exists for it. A non-owed opening week folds into the next.
  const out: FWeek[] = []; let carryRaw = 0; let carryOpen: number | null = null; let first = true;
  for (let i = 0; i < all.length; i++) {
    const w = all[i]; const wk = w.weekKey;
    const isClose = wk === closeWk;
    const stamp = t.fridayClosingPrices?.[wk];
    const owed = stamp != null || t.dateInitiated <= w.fridayDateStr || isClose;
    const prevStamp = i > 0 ? t.fridayClosingPrices?.[all[i - 1].weekKey] : undefined;
    const open = first ? entry : (prevStamp ?? entry);
    const rate = rateOf(wk);
    const legs = (first ? entryLeg : 0) + (isClose ? exitLeg : 0);
    const close = isClose ? exit : (stamp ?? null);
    const raw = ((close ?? open) - open) * dir * t.lotSize * t.numberOfLots * rate * share - legs * rate * share;
    if (!owed) { carryRaw += raw; carryOpen ??= open; first = false; continue; }  // fold forward
    const kind = first ? (isClose ? 'opened & closed' : 'opened, open at end') : (isClose ? 'carried, closed' : 'carried, open');
    out.push({ weekKey: wk, kind: carryOpen != null ? kind.replace('carried', 'opened (Sat/Sun fold)') : kind, open: carryOpen ?? open, close, rate, raw: raw + carryRaw, val: Math.round(raw + carryRaw), stamped: isClose || stamp != null });
    carryRaw = 0; carryOpen = null; first = false;
  }
  if (closed && out.length) { // round-once realized; closing piece absorbs the residual
    const realizedOnce = Math.round(out.reduce((s, p) => s + p.raw, 0));
    const others = out.slice(0, -1).reduce((s, p) => s + p.val, 0);
    out[out.length - 1].val = realizedOnce - others;
  }
  return out;
}

// ---- page side ----
const page = weeklyStats(trades);
// ---- formula side, aggregated the same way ----
const F = new Map<string, Map<SpecInstrument, { value: number; stamped: number; unstamped: number }>>();
const tradeWeeks = new Map<string, FWeek[]>();
for (const t of trades) {
  const fw = formulaWeeks(t); tradeWeeks.set(t.id, fw);
  for (const p of fw) {
    const m = F.get(p.weekKey) ?? new Map(); F.set(p.weekKey, m);
    const inst = specNameOf(t.instrument);
    const l = m.get(inst) ?? { value: 0, stamped: 0, unstamped: 0 }; m.set(inst, l);
    if (p.stamped) { l.value += p.val; l.stamped++; } else l.unstamped++;
  }
}

console.log(`\nWEEKLY STATISTICS vs formula — ${trades.length} real trades`);
let lines = 0, weeks = 0; const instruments = new Set<string>(); const covered = new Set<string>();
for (const w of page) {
  weeks++;
  const fm = F.get(w.weekKey);
  check(`${w.weekKey} ${w.label}: ${w.lines.length} instrument line(s), formula has ${fm?.size ?? 0}`, !!fm && fm.size === w.lines.length);
  for (const l of w.lines) {
    lines++; instruments.add(l.instrument); l.contributors.forEach((c) => covered.add(c.trade.id));
    const f = fm?.get(l.instrument);
    const ok = !!f && ((isNaN(f.value) && isNaN(l.value)) || f.value === l.value) && f.stamped === l.stamped && f.unstamped === l.unstamped;
    check(`   ${l.instrument.padEnd(11)} page ${fmt(l.value).padStart(12)}  formula ${fmt(f?.value ?? NaN).padStart(12)}  (${l.stamped} trades${l.unstamped ? `, ${l.unstamped} unstamped` : ''})`, ok);
  }
}
check('every formula week appears on the page', [...F.keys()].every((k) => page.some((w) => w.weekKey === k)));

// ---- side by side: one carried USD trade and one intra-week trade ----
const side = (t: Trade, title: string) => {
  console.log(`\n${title}: ${t.symbol} ${t.id} · ${specNameOf(t.instrument)} ${t.direction} ×${t.lotSize} ${t.numberOfLots} lot · ${t.currency}${t.currency === 'USD' ? ` base @${t.usdToInrRate}` : ''} · share ${t.realizationRate} · opened ${t.dateInitiated}${isClosed(t) ? ` closed ${t.direction === 'Long' ? t.sellDate : t.buyDate}` : ' OPEN'} · stamps ${JSON.stringify(t.fridayClosingPrices)}`);
  console.log('  week       case                      open → close        rate   PAGE value     FORMULA value');
  for (const f of tradeWeeks.get(t.id)!) {
    const pageLine = page.find((w) => w.weekKey === f.weekKey)!.lines.find((l) => l.instrument === specNameOf(t.instrument))!;
    const c = pageLine.contributors.find((x) => x.trade.id === t.id)!;
    const pv = c.piece.stamped ? c.piece.val : NaN;
    const ok = (!c.piece.stamped && !f.stamped) || (pv === f.val && c.piece.rate === f.rate);
    console.log(`  ${f.weekKey}  ${f.kind.padEnd(24)}  ${String(f.open).padStart(9)} → ${String(f.close ?? '—').padStart(9)}  ${String(f.rate).padStart(6)}  ${(c.piece.stamped ? fmt(pv) : 'unstamped').padStart(12)}  ${(f.stamped ? fmt(f.val) : 'unstamped').padStart(14)}  ${ok ? 'MATCH' : 'MISMATCH'}`);
    if (!ok) failures++;
  }
};
const carried = trades.find((t) => t.currency === 'USD' && isClosed(t) && Object.keys(t.fridayClosingPrices ?? {}).length >= 2)!;
side(carried, 'CARRIED USD TRADE');
const legacy = trades.find((t) => t.currency === 'USD' && Object.keys(t.fridayUsdToInrRates ?? {}).length >= 2)!;
side(legacy, 'CARRIED USD TRADE with per-week rates (legacy stamps = the per-week rate field)');
const intra = trades.find((t) => t.currency === 'USD' && isClosed(t) && getWeekInfo(t.dateInitiated).weekKey === getWeekKeyForClose(t) && getWeekKeyForClose(t) !== null)!;
side(intra, 'INTRA-WEEK TRADE (opened & closed the same week)');
const open = trades.find((t) => isOpen(t))!;
side(open, 'OPEN TRADE (this week unstamped → listed, not counted)');

console.log(`\nSUMMARY: weeks=${weeks} lines=${lines} instruments=${instruments.size} trades covered=${covered.size}/${trades.length}${failures ? ` — ${failures} MISMATCH(ES)` : ' — ALL MATCH'}`);
process.exit(failures ? 1 : 0);
