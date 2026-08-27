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
| `weekly_rates` | stamped into each USD trade's `data.fridayUsdToInrRates[weekKey]` (no separate table) |
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
- **Saturday week-close ritual** (evaluated in **IST**, `Asia/Kolkata`):
  1. The panel appears ONLY from **Saturday ≥ 18:00 IST through end of Sunday**, and until answered
     ("Later" dismisses for the session). Never on weekdays, never at initiation.
  2. It asks the week that is **ENDING** (the current Mon–Sun week) and lists ONLY live trades
     **initiated before that Saturday**. A trade opened during the week is asked that same Saturday;
     a trade opened Saturday or Sunday waits for the NEXT Saturday.
  3. Never asks a week earlier than a trade's initiation week, and never re-asks a week already marked.
  - Saving stamps `data.fridayClosingPrices[endWeekKey]` (and the USD rate) on the asked trades.

## 6. Weekly USD rates
One USD/INR rate per week. The Saturday panel asks a single rate (pre-filled from the previous
week's stored rate) applied to all USD trades that week. Past rates are **inline-editable** in the
MTM ledger rows (the dashed `@rate` button → type → Enter). Stored per trade in
`data.fridayUsdToInrRates[weekKey]`; INR trades use rate 1.

## 7. MTM math (the engine — `types.ts`, unchanged)
For a live trade, each stamped week produces one ledger row:

```
week N MTM = (closeN − prevMark) × direction × multiplier × lots × (weekN USD rate if USD) × realization
             − (brokerage charged that week)
```
where `prevMark` = the previous week's close, or the entry price for the first (initiation) week;
`direction` = +1 Long / −1 Short. Live total = Σ visible weekly rows. **Realized** P&L (closed
trades) = Σ of every active week's net (initiation week carries the entry-leg brokerage, the closing
week the exit-leg). **Realization scales BOTH MTM and realized** (it multiplies gross − brokerage).
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

**COMEX group (`comex:true`) — display-only $ currency, NO FX.** COPPER-HG (25000) and COPPER-MHG
(2500), tick 0.0005, 4-decimal prices. COMEX trades render P&L/prices in **$** and are **excluded
from every ₹ aggregate** (live hero, closed total, journal week, selected-sum) — shown as their own
`$` line. There is **no USD/INR rate stored, fetched, or applied**: a COMEX trade is stored with an
internal `currency:'INR'` so the FX engine leaves it at rate 1, and the `$`/USD label is derived from
the instrument (`isComex`/`dispCcy`/`sgn`/`px` in `v2engine.ts`). COMEX auto-brokerage = 0. Adding
GOLD-GC/SILVER-SI later is a one-line `INSTR` entry (comex:true) + `Instrument` union value.

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
rate (pre-filled with the latest known rate). Live would-be P&L via the unchanged
`estimateInstantPnL({...trade, usdToInrRate: hypoRate}, exit)`:
`(price − entry) × dir × multiplier × lots × rate × realization`, **net of BOTH brokerage legs**
(exit leg by the legacy auto formula). Writes NOTHING, no PIN, dismiss on Esc or ✕.

## 11. Journal law
Closed trades are clubbed into **Mon–Sun weeks BY CLOSING DATE** (a trade lives in the week it
CLOSED), newest week first. Each week header shows the range + trade count + week total. Each row:
symbol, initiated date, closed date, **held-days** (calendar days between), side/lots/share, P&L.
Rows have checkboxes with a selected-sum bar; the selection is **shared with the Closed view**.

## 12. Live trades
Open positions only. Per-trade weekly MTM ledger (§7). Row buttons: **What-if · Edit · Close ·
Delete** (uniform 84px ghost; Delete inked on Forest / loss-color on White). **Edit** (PIN-gated)
opens EVERY initiation field inline in the grid cells: symbol · instrument (dropdown, re-auto-fills
multiplier) · side · lots · entry · init date · currency · realization · entry-leg brokerage (blank
= legacy auto). One Save commits all fields atomically and recomputes the whole weekly MTM chain;
Esc cancels. **Delete** (PIN-gated) confirms ("Delete SYMBOL — entry X, N lots? Its weekly marks go
too.") and removes the trade AND its `weekly_marks`.

## 13. Closed trades
Table: checkbox · Closed · Symbol · Side · Qty(r) · Entry(r) · Exit(r) · Share(r) · P&L(r) · actions.
Multi-select with a selected-sum bar (shared with Journal). **Edit** (PIN-gated) opens an expanded
grid row with ALL live fields PLUS exit price · exit-leg brokerage (blank = auto) · closed date; Save
recomputes realized P&L + held-days and re-files the trade into the correct journal week if the
closed date moved. **Delete** is PIN-gated per row.

**Edit guards (both panels):** a confirm line on instrument/currency change ("Recomputes all P&L for
this trade — proceed?"); week-identity integrity — weekly marks earlier than the (possibly new)
initiation week are removed on save, noted in the confirm.

## 14. Download as Excel (Journal + Closed)
Three modes: **complete history · selected trades · date range** (by closing date). CSV columns:
`Symbol, Instrument, Multiplier, Side, Lots, Entry, Exit, Initiated, Closed, Held (days), Week,
Currency, Share, P&L (INR)`. The Journal meta and the Closed table's **Mult** column also show the
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
- `.env` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and (server-side only)
  `SUPABASE_SERVICE_KEY`. `.env` is gitignored — NEVER commit it, and NEVER put the service key in a
  `VITE_`-prefixed var (it would ship to the browser bundle).

## 19. Two real owner accounts
`aimlda.ak@gmail.com` and `19.aimlda@gmail.com` are the live Google users (aimlda.ak has real
trades). NEVER delete their rows. Smoke/test users are always `smoke-*@example.com`, RLS-scoped,
and deleted after each test run.
