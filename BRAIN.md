# AILAHA PHALAM v2 — BRAIN.md

Ground-truth onboarding law for any Claude Code session on this repo. Written from
the deployed code (not memory). Keep it in sync when you change behavior.

**Live:** https://ailaha-phalam.vercel.app · **Repo:** `git@github.com:aimldaak-beep/AilahaPhalam.git` (branch `main`)
**Local:** `/mnt/c/app/AKS-main/AKS-main` (double-nested ZIP extract — NOT `C:\app\AilahaPhalam`)
**Supabase:** project ref `crhlsheofcneafhbdrld` (Mumbai/ap-south-1)

---

## 1. Product purpose
A private weekly position ledger for a small trading desk. It tracks OPEN (live) futures
positions, marks them to market once a week (Saturday ritual), and books realized P&L into
a journal when they close. Money is shown after profit-share (realization) and net of
brokerage, formatted in the Indian lakh/crore system. It is a single-page app used by an
allowlisted team; there is no public signup.

## 2. Stack
- **Vite 6 + React 19 + TypeScript**, all UI as inline-styled components (no Tailwind classes
  in the app; `index.css` is a minimal reset only). Entry: `src/main.tsx` → `src/App.tsx`.
- **@supabase/supabase-js** for auth + data. Client: `src/lib/supabase.ts` (reads
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` from env; both are set in Vercel for the build).
- **Vercel** hosting; deploy is **GitHub push to `main` → Vercel auto-build** (`vite build` → `dist/`).
  Serverless functions live in `api/` (auto-detected). No `vercel.json`.
- The engine (all P&L math) is `src/types.ts` — ported UNCHANGED from v1. `src/lib/v2engine.ts`
  adapts it (instrument map, Monday-week helpers, formatting). Never fork the math into components.

## 3. Schema & RLS
DDL is NOT reachable from this environment (Management API needs a PAT; no DB password/CLI).
So v2 runs **no-DDL on preserved tables**, and the ideal relational schema is written but not
applied: `supabase/migrations/20260824000000_v2_schema.sql` (apply in the SQL editor with a PAT
or DB password to formalize). The five logical tables + settings and their RUNTIME mapping:

| Logical (migration) | Runtime store (live) |
|---|---|
| `live_trades` + `closed_trades` | `public.trades` — columns `id uuid, user_id uuid, data jsonb, created_at`; the whole Trade object lives in `data`; `data.status` open vs closed splits the two |
| `weekly_marks` | `public.weekly_marks` — mirror of each trade's `data.fridayClosingPrices` (one row per user+trade+week_key) |
| (USD/INR) | **per trade**: `data.usdToInrRate` on every USD trade (§6). Legacy `fridayUsdToInrRates` / `closedUsdToInrRate` and the retired `data.kind='fx_weekly_rates'` sentinel row remain on disk as history only |
| `settings.pin_hash` | `public.user_settings.pin_hash` |
| `settings.theme` | client `localStorage` (`ap_theme`) |
| (email allowlist) | **public Storage object** `config/allowlist.json` (bucket `config`, public read) |

**RLS:** every data table is owner-scoped — `auth.uid() = user_id` for select/insert/update/delete.
A user only ever sees their own rows. The allowlist bucket is public-READ (any user, so the gate
can self-check) and service-key-WRITE only (client JWT writes are RLS-blocked by design).

## 4. Auth — Google OAuth + email allowlist + PIN
- **Google OAuth** via `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: origin })`.
  Unchanged; this is the only sign-in method.
- **Email allowlist** (`src/lib/allowlist.ts`, `api/allowlist.mjs`): after a session exists the app
  fetches `config/allowlist.json`. If the signed-in email is not on it → **"Access restricted"**
  screen (no data). `BOOTSTRAP_OWNERS = ['aimlda.ak@gmail.com','19.aimlda@gmail.com']` are baked in
  and ALWAYS allowed (lockout safety even if Storage fails). Manage via the PIN-gated **Team access**
  panel (under the date) — writes go to `/api/allowlist` (needs `SUPABASE_SERVICE_KEY` set in Vercel;
  returns 501 until then). Guaranteed owner channel: `scripts/manage_allowlist.py` (service key).
- **PIN** (`src/lib/pin.ts`): SHA-256 of `"<userId>:<pin>"` stored in `user_settings.pin_hash`.
  **Set-on-first-use** — the first PIN-gated action with no PIN set opens a SET-PIN flow. Once
  entered it is **unlocked for the session** (`pinOk`). It gates: Closed-trade Edit/Delete,
  Live-trade Edit/Delete, and Team access. It does NOT gate: weekly rate/close inline edits,
  What-if, Add trade, the Saturday panel. (This is a deliberate-action gate, not real crypto.)

## 5. Week law
- Weeks run **MONDAY → SUNDAY**. A week's identity is its **Monday date**; internally the key is
  `getWeekInfo(date).weekKey` = `"YYYY-Www"` (Monday-derived), e.g. `2026-W35` = Mon 24 Aug 2026.
- **Saturday ritual — "the Saturday voice"** (evaluated in **IST**, `Asia/Kolkata`; amended
  2026-09-12: **close stamps only, no FX rate is ever asked**):
  1. From **Saturday 17:00 IST** the ENDING week (the current Mon–Sun week) is asked. If any stamp
     is still missing when Sunday ends, it STAYS asked from Monday — as the **previous** week —
     until every stamp is in, marked **overdue** (red). Exactly one week is ever asked: the most
     recent one whose Saturday 17:00 has passed (`endWeekKey`). Never at initiation.
  2. The ask is ONE form (panel on the Live view, `role=region "Weekly settlement"`): one row per
     live trade initiated before that Saturday — `<symbol> · <instrument> — Saturday close price`
     (a weekly close-stamp into `fridayClosingPrices[endWeekKey]`; the position stays open). A trade
     opened Saturday or Sunday waits for the NEXT Saturday.
  3. The week is owed (`settleDue`) while any asked trade has no stamp for it — derived purely from
     the trades, no store. Nothing to stamp ⇒ nothing is asked. Dismissing ("Later") or leaving the
     Live view turns it into a loud top banner (`role=alert`, ink; red `#C2402E` + "OVERDUE" from
     Monday) that returns until every stamp is in. Only entered numbers count; nothing is pre-filled.
  4. **Save progress** stamps whatever closes were typed; **Settle W-XX** refuses until every asked
     trade has a stamp (naming the missing ones), then stamps them all. Once all stamps are in on
     Sat/Sun the header advances to next week.
  - State is the trades jsonb (+ `weekly_marks` mirror) ⇒ survives reload/redeploy/device.
  - Smoke: `scripts/seed_pertrade.py` → `scripts/smoke-pertrade.mjs` (injected Sunday clock; bumped
    stored `expires_at`) → `scripts/cleanup_pertrade.py`.

## 6. USD/INR — the PER-TRADE FX LAW (2026-09-12; supersedes the weekly settlement model)
**Every USD-denominated trade carries its OWN USD/INR rate** — `Trade.usdToInrRate` — entered by
AKS when the trade is opened (Add trade: required for USD, refused without it) and editable any
time via Edit trade (live and closed). That trade's rupee P&L — live MTM, every weekly piece, and
realized — converts at ITS OWN rate for the trade's whole life, including in the journal. The
rate shows on the live card meta (`USD @89.9`), on every weekly ledger row (`@89.9`, plain text),
in the Closed table (`USD/INR` column), in the CSV (`USD/INR` column), and pre-fills What-if.
Editing the rate re-prices the whole trade. **INR trades have no FX field** (store 1, untouched).

DEAD as of 2026-09-12 (removed from code): the universal weekly rate, the rate store
(`fxrates.ts`, sentinel row), provisional/settle cycle, the Saturday rate step, the header
USD/INR control, per-week `@rate` editing, and the "FX rate not set" state. `fxmodel.ts` keeps
only `isDocRow` (the retired store row still exists in `trades` as history and must never load
as a trade) and `shiftISO`. A USD trade with no rate (only possible on a legacy row) computes NaN
and renders **"USD/INR missing — Edit trade"** — never a default.

**Rate precedence in the engine** (`types.ts calculateTradeForWeek`, mirrored by
`v2engine.weekRateOf`): for each week, a LEGACY per-week stamp — `fridayUsdToInrRates[week]`, or
`closedUsdToInrRate` in the closing week, written by the retired weekly model before 2026-09-12 —
wins if present; otherwise the trade's own `usdToInrRate`. New trades never get stamps, so they
convert at their one rate for life. Legacy trades keep their frozen history **byte-identical**
(AKS's ship gate: pre-existing trades, P&Ls, stamps and weekly totals identical to the backup).
An explicit rate change (or currency change) in Edit trade CLEARS the legacy stamps
(`buildEdited`), after which the trade's own rate rules its whole life. The live card meta says
"(weekly history kept)" while legacy stamps exist; the journal history line shows `@rate` on a
piece whose legacy rate differs from the trade's rate.

Migration 2026-09-12 (`scripts/migrate_per_trade_fx.py`, idempotent): every existing USD trade
received its frozen closing-week rate (all 9 closed USD trades → 89.9; no open USD trades
existed); their legacy stamps stay, so nothing re-priced. Backup + gate: the live DB was archived
BEFORE the change to `archive/2026-09-12T0955Z_pre_pertrade_fx/` (trades / weekly_marks /
user_settings + the pre-change engine's realized figures) and `scripts/reconcile_backup.ts
<live_dump.json>` proves every pre-existing trade field (except the declared `usdToInrRate`),
close stamp, weekly_marks row, closed P&L (₹24,20,876) and realized-by-week total IDENTICAL.
Proofs: `scripts/fx-pertrade-proof.ts` (39 checks: per-trade rate on new trades, legacy stamps
win per week, edit clears them, rounding residual, INR untouched, journal carry-forward +
reconciliation), `scripts/fx-baseline.ts` (INR byte-identical), `scripts/weekly-mtm-proof.ts`
(original pre-change goldens still pass).

## 7. MTM math (the engine — `types.ts`, unchanged)
For a live trade, each stamped week produces one ledger row:

```
week N piece = (closeN − prevMark) × direction × multiplier × lots × (the trade's OWN USD/INR rate if USD) × realization
               − (brokerage charged that week)
```
where `prevMark` = the previous week's close, or the entry price for the first (initiation) week;
`direction` = +1 Long / −1 Short; the closing week's `closeN` is the exit price (legacy trades: that
week's stamped rate, §6). Live total = Σ visible weekly rows (each rounded). **Realized** P&L
(closed trades) = Σ of every active week's net, **rounded once** — unchanged since v1 (initiation
week carries the entry-leg brokerage, the closing week the exit-leg). The journal's per-week
pieces are each rounded; on a closed trade the CLOSING piece absorbs the ≤₹1 rounding residual so
Σ pieces === realized exactly (`lib/weekly.ts weekPieces/reconcile`). **Realization scales BOTH
MTM and realized** (it multiplies gross − brokerage).
`estimateInstantPnL` is the What-if variant. All money renders through `inr()/signed()/nf()` (en-IN
lakh/crore) with `font-variant-numeric: tabular-nums`.

## 8. Instruments & the per-trade multiplier law
Spec name → auto-fill multiplier → default currency → v1 enum (selects the brokerage branch):

| Instrument | Auto-fill mult | Currency | v1 enum |
|---|---|---|---|
| DOW | 5 | USD | `DOW` |
| NASDAQ | 20 | USD | `Nasdaq` |
| SNP | 50 | USD | `SnP` |
| NIKKEI | 100 | USD | `Nikkei` |
| GIFTNIFTY | 50 | USD | `Gift Nifty` |
| NIFTY FUT | 75 | INR | `Futures` |
| **NSE FUT** | **(blank)** | INR | `NSE Futures` |
| **COPPER-HG** (COMEX) | 25000 | USD ($) | `COPPER-HG` |
| **COPPER-MHG** (COMEX) | 2500 | USD ($) | `COPPER-MHG` |

**The multiplier is a per-trade EDITABLE value** (v1 behavior). Selecting an instrument auto-fills it
from the table; the user can override it per trade (validated > 0). **NSE FUT** is the stock-future
row: INR-native, its multiplier is **blank on select** — the user must enter the script's lot size
(RELIANCE 250, TCS 175, …); symbol is free text. The trade STORES its own `lotSize`; the engine and
all display read that stored value (MTM, realized, what-if, brokerage, meta, tables, CSV) — the
`INSTR` map's `mult` is ONLY a form auto-fill default, never read at compute time. The multiplier is
editable in full-Edit on both live and closed trades; saving recomputes the whole chain.
(`INSTR.mult` in `v2engine.ts` is `number | null`; NSE FUT is `null`.)

**COMEX group (`comex:true`) — ordinary USD trades under the weekly FX settlement model (§6);
the old "display-only $, no FX" law is DEAD.** COPPER-HG (25000) and COPPER-MHG (2500), tick
0.0005, 4-decimal native prices. COMEX trades are stored `currency:'USD'`, convert at the weekly
rate, and sit **inside the one ₹ headline** like DOW/NASDAQ; `$` survives only as small per-trade
native detail (4-decimal prices via `px`, and the small `signedUsd(nativePnl(t))` line under
Current P&L — `nativePnl` reruns the engine at rate 1). COMEX auto-brokerage = 0 (manual per-leg
override still applies, converted like any USD brokerage). Adding GOLD-GC/SILVER-SI later is a
one-line `INSTR` entry (comex:true) + `Instrument` union value.

## 9. Brokerage — legacy auto-formulas (VERBATIM from `src/types.ts` `calculateTurnoverAndBrokerage`)
```ts
const turnover = price * lots * lotSize;
let brokerage = 0;
if (instrument === 'Futures' || instrument === 'Option' || instrument === 'NG' || instrument === 'Gift Nifty' || instrument === 'NSE Futures' || instrument === 'NSE Options') {
  brokerage = 0.0003 * turnover;
} else {
  // DOW/Nasdaq/SnP/Nikkei is $5 per lot flat
  brokerage = 5 * lots;
}
```
So **GIFTNIFTY & NIFTY FUT → `0.0003 × turnover`** (0.03% of price×lots×multiplier); **DOW, NASDAQ,
SNP, NIKKEI → `5 × lots`** ($5/lot flat, USD). The **entry leg** is charged in the **initiation
week** (Long → buy side, Short → sell side); the **exit leg** at **close**. A per-leg override
(`entryBrokerage`/`exitBrokerage` on the trade) replaces that leg's formula; **blank = auto formula**
(legacy). USD legs are ×the week's rate. Proof/regression: `scripts/brokerage-proof.ts`,
`BROKERAGE_TRUTH.md`.

## 10. What-if calculator (live rows, read-only)
Ghost button beside Close/Edit/Delete → inline calculator: hypothetical exit + hypothetical USD
rate (pre-filled with the trade's own rate). Live would-be P&L via the unchanged
`estimateInstantPnL({...trade, usdToInrRate: hypoRate}, exit)`:
`(price − entry) × dir × multiplier × lots × rate × realization`, **net of BOTH brokerage legs**
(exit leg by the legacy auto formula). Writes NOTHING, no PIN, dismiss on Esc or ✕.

## 11. Journal law — WEEKLY MTM, realized + unrealized, carry-forward (2026-09-12)
Pure model `src/lib/weekly.ts` (`weekPieces`, `reconcile`, `journalWeeks`); the engine is unchanged.
Every trade is cut into one **piece per Mon–Sun week it was alive in** (§7). Each weekly journal
(newest first, `data-week="YYYY-Www"`) shows:
- **REALIZED · closed this week** — trades whose closing date falls in the week, each with its
  **closing-week piece** (what was booked that week). A **carried** trade (alive in >1 week) also
  shows its full per-week history under the row: `W35 +₹… W36 +₹… W37 −₹… = realized +₹total`; a
  loud "does not reconcile" tag appears if Σ pieces ≠ realized (asserted; never expected).
  Rows keep the checkbox (selection shared with Closed view), initiated/closed/held/meta (+`$ @rate`).
- **UNREALIZED · open at week end · change this week** — every trade still open at the week's close
  (initiated ≤ week, closed later or never), with THAT WEEK's piece = this week's stamp minus last
  week's stamp (or minus entry if opened this week), NOT cumulative since entry. Row: symbol ·
  opened · `mark <this week's stamp>` (red "no close stamp" if none) · `from`/`entry <prev mark>` ·
  meta · piece. An unstamped ended week still carries the engine's piece (the entry-leg brokerage
  in an initiation week; 0 otherwise) so pieces always reconcile — the live headline omits
  unstamped weeks, so the two agree once the Saturday stamp is in. A week is listed for open
  positions only once it has ENDED (Saturday 17:00 IST
  passed, i.e. `weekKey ≤ endWeekKey`); the in-progress week appears only if a trade closed in it
  ("Week in progress — open positions mark at Saturday's close").
- **WEEK TOTAL = realized + unrealized** ("what I actually made this week"); the footer repeats
  REALIZED · UNREALIZED · WEEK TOTAL. The journal headline (44px) = Σ WEEK TOTAL over all weeks,
  which counts every piece exactly once (= total realized + open MTM of ended weeks).
Layout: same 7-column row grid as before (`30 | 200 | 130 | 130 | 90 | 1fr | 150`), gold/green money,
hairline rows, grey uppercase section labels. Download-as-Excel is unchanged (closed trades).

## 12. Live trades
Open positions only. Per-trade weekly MTM ledger (§7). Row buttons: **What-if · Edit · Close ·
Delete** (uniform 84px ghost; Delete inked on Forest / loss-color on White). **Edit** (PIN-gated)
opens EVERY initiation field inline in the grid cells: symbol · instrument (dropdown, re-auto-fills
multiplier) · side · lots · entry · init date · currency · **USD/INR rate · this trade** (USD only,
required) · realization · entry-leg brokerage (blank = legacy auto). One Save commits all fields atomically and recomputes the whole weekly MTM chain;
Esc cancels. **Delete** (PIN-gated) confirms ("Delete SYMBOL — entry X, N lots? Its weekly marks go
too.") and removes the trade AND its `weekly_marks`.

## 13. Closed trades — GROUPED BY CLOSING WEEK (2026-09-12)
Display/grouping only (`lib/weekly.ts closedByWeek`; no math of its own): closed trades are grouped by the
week they CLOSED — the journal's Mon–Sun W-XX weeks and labels — newest week first, trades within a week
in close-date order (ties by id = creation order). Each week block (`data-closed-week="YYYY-Www"`) has a
clickable header (`role=button`, `aria-expanded`, name "<label> closed trades"): ▾/▸ · label · N trades
(" · collapsed" when closed) · **REALIZED** gold total = Σ realized of its rows. **Collapsible**: the
latest two weeks are expanded by default, older weeks collapsed (`closedOpen` state overrides per week,
session-only). Inside: a fixed-layout table (`colgroup` widths 32|84|140|64|52|64|104|104|84|64|76|124|100)
— checkbox · Closed · Symbol (ellipsis) · Side · Qty(r) · Mult(r) · Entry(r) · Exit(r) · **Brok(r)** (both
legs, native currency: `entryLegBrokerage + exitLegBrokerage`) · Share(r) · USD/INR(r) · P&L(r) · Edit/Delete.
A trade that lived across weeks gets a second row (`data-history`) with its per-week P&L history
(`historyLine`, shared with the journal): `W35 +₹… W36 +₹… W37 −₹… = realized +₹…`. Rows carry
`data-trade="<id>"`. Multi-select + selected-sum bar (shared with Journal), headline = total realized,
Download-as-Excel unchanged. **Edit** (PIN-gated) opens the full edit grid in place under the row (all live
fields PLUS exit price · exit-leg brokerage · closed date); Save recomputes realized + held-days and re-files
the trade into the correct week if the closed date moved. **Delete** is PIN-gated per row.
Backup + gate for this change: `archive/2026-09-12T1049Z_pre_closed_grouping/` and `scripts/reconcile_backup.ts <live_dump> archive/2026-09-12T1049Z_pre_closed_grouping` → IDENTICAL.
Proof: `fx-pertrade-proof.ts` §6; smoke `seed_closedwk.py` → `smoke-closedwk.mjs` (8 steps) → `cleanup_pertrade.py`.

**Edit guards (both panels):** a confirm line on instrument/currency change ("Recomputes all P&L for
this trade — proceed?"); week-identity integrity — weekly marks earlier than the (possibly new)
initiation week are removed on save, noted in the confirm.

## 14. Download as Excel (Journal + Closed)
Three modes: **complete history · selected trades · date range** (by closing date). CSV columns:
`Symbol, Instrument, Multiplier, Side, Lots, Entry, Exit, Initiated, Closed, Held (days), Week,
Currency, USD/INR, Share, P&L (INR)`. The Journal meta and the Closed table's **Mult** column also show the
trade's stored multiplier.

## 15. Themes (exact hex)
| Token | White | Forest |
|---|---|---|
| bg | `#FFFFFF` | `#121712` |
| ink | `#17181A` | `#E9EDE7` |
| faint | `#878B87` | `#8FA284` (sage) |
| hair | `#E7E8E5` | `#27301F` |
| profit | `#0A7D4F` (green) | `#EFC44F` (flat gold, no glow) |
| loss | `#C2402E` (red) | `#ABB0AA` (grey) |

Theme choice persists in `localStorage` (`ap_theme`), default Forest. Swatches sit in the nav after
Add trade; Team access + Sign out are tiny links under the date (kept out of the nav so the nav
matches the design spec).

## 16. Type scale + layout grid
Type scale (`SZ` map in `App.tsx`): `hero 64 · big 50 · symbol 20 · num 19 · numSm 17 · meta 15 ·
label 13 · btn 15`; plus row-MTM 22, nav tabs 15, weekly-row values 19, journal total 44.

**Content column: content-box, max-width 1140px.** The live-trade card is a **fixed invisible CSS
grid** (no visible gridlines) — every value has a fixed place, identical tracks on every card so
values align vertically across trades:
- Zone 1 identity — `grid 200px | 1fr | 380px`: SYMBOL (ellipsis-guarded) · meta · 4 uniform 84px
  ghost actions (What-if · Edit · Close · Delete), never wrapping.
- Zone 2 numbers — `grid repeat(4, 220px)`: ENTRY · BROKERAGE (entry leg, §9) · CURRENT P&L (22/600) · CLOSED VALUE.
- Zone 3 weekly ledger — indent 200, `grid 160 | 150 | 100 | 150` per week row.
- What-if / Edit / inline-close / exit inputs open inside the grid cells; the card grows, columns never move.
- Journal rows use the same discipline (`grid 30 | 200 | 130 | 130 | 90 | 1fr | 150`); week-close panel on the 220px rhythm.

`DESIGN_SPEC.jsx` (repo root) is the original flex mockup; the raised SZ values and the grid layout supersede it.

## 17. Archive (pre-wipe v1 ledger)
`archive/2026-08-24/` holds the COMPLETE pre-wipe v1 database (CSV + JSON per table, verified
row-for-row before the wipe): the original `trades`, `weekly_marks`, `signals` (134,160 rows),
`daily_ohlc`, etc. This is the historical record from before the v2 rebuild — never regenerated.

## 18. Deploy / rollback
- **Deploy:** `git push origin main` → Vercel auto-builds and promotes production. Verify the live
  bundle changed: `curl -s https://ailaha-phalam.vercel.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'`
  and confirm it matches `dist/assets/` after `vite build`.
- **Rollback:** `git revert <bad-commit> && git push origin main` (safe, forward-moving), or promote
  a previous deployment in the Vercel dashboard. There is no Vercel CLI/token in this environment.
- **Local dev:** `npm run dev` (port 3000). **Typecheck:** `npx tsc --noEmit`. **Build:** `npx vite build`.
- **Proofs:** `npm run test:proofs` (edit-pnl · whatif · weekly-mtm · fx-pertrade). NOTE: `brokerage-proof.ts`
  and `comex-proof.ts` are STALE (they still encode the pre-2026-08 COMEX laws) and fail on purpose-less
  expectations — not regressions; `fx-baseline.ts` must stay byte-identical for INR trades.
- `.env` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and (server-side only)
  `SUPABASE_SERVICE_KEY`. `.env` is gitignored — NEVER commit it, and NEVER put the service key in a
  `VITE_`-prefixed var (it would ship to the browser bundle).

## 19. Two real owner accounts
`aimlda.ak@gmail.com` and `19.aimlda@gmail.com` are the live Google users (aimlda.ak has real
trades). NEVER delete their rows. Smoke/test users are always `smoke-*@example.com`, RLS-scoped,
and deleted after each test run.
