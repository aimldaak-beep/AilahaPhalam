# Legacy Brokerage — verbatim ground truth (v1 → v2 port anchor)

Source of record: `src/types.ts` (v1, pre-rebuild). The v2 engine MUST call
these exact formulas. This file is the reference the Phase 2 report checks
against, leg for leg.

## 1. Per-instrument brokerage formula — `calculateTurnoverAndBrokerage` (v1 src/types.ts:150-170)

```ts
const turnover = price * lots * lotSize;
let brokerage = 0;
if (instrument === 'Futures' || instrument === 'Option' || instrument === 'NG' || instrument === 'Gift Nifty' || instrument === 'NSE Futures' || instrument === 'NSE Options') {
  brokerage = 0.0003 * turnover;          // 0.03% of turnover (INR-native instruments)
} else {
  brokerage = 5 * lots;                    // DOW/Nasdaq/SnP/Nikkei — $5 per lot flat (USD)
}
```

Branch membership (the `Instrument` union, src/types.ts:6-16):

| Instrument (enum) | Spec name        | Brokerage formula        |
|-------------------|------------------|--------------------------|
| Futures           | NIFTY FUT        | `0.0003 * turnover`      |
| NSE Futures       | (NSE Futures)    | `0.0003 * turnover`      |
| Option            | —                | `0.0003 * turnover`      |
| NSE Options       | —                | `0.0003 * turnover`      |
| NG                | —                | `0.0003 * turnover`      |
| Gift Nifty        | GIFTNIFTY        | `0.0003 * turnover`      |
| DOW               | DOW              | `5 * lots` ($ flat)      |
| Nasdaq            | NASDAQ           | `5 * lots` ($ flat)      |
| SnP               | SNP              | `5 * lots` ($ flat)      |
| Nikkei            | NIKKEI           | `5 * lots` ($ flat)      |

turnover uses `lotSize` (the multiplier). `price === null || price <= 0` ⇒ `{turnover:0, brokerage:0}`.

## 2. Entry leg vs exit leg — `calculateTradeForWeek` (v1 src/types.ts:236-313)

```ts
const buyTurnCalc  = calculateTurnoverAndBrokerage(trade.buyPrice,  lots, lotSize, instrument);
const sellTurnCalc = calculateTurnoverAndBrokerage(trade.sellPrice, lots, lotSize, instrument);
let buyBrokerage  = buyTurnCalc.brokerage;
let sellBrokerage = sellTurnCalc.brokerage;

// manual per-leg override (blank = formula). Entry = initiating side.
if (direction === 'Long') { buyBrokerage  = entryBrokerage ?? buyBrokerage;  sellBrokerage = exitBrokerage ?? sellBrokerage; }
else                      { sellBrokerage = entryBrokerage ?? sellBrokerage; buyBrokerage  = exitBrokerage ?? buyBrokerage;  }

if (currency === 'USD') { buyBrokerage *= weeklyExchangeRate; sellBrokerage *= weeklyExchangeRate; }

// which leg is charged in THIS week (by role):
same-week-closed : brokerageDeducted = buyBrokerage + sellBrokerage   // both legs
initiation       : brokerageDeducted = Long ? buyBrokerage  : sellBrokerage   // ENTRY leg
closing          : brokerageDeducted = Long ? sellBrokerage : buyBrokerage    // EXIT leg
intermediate     : brokerageDeducted = 0

netProfit = (grossProfit - brokerageDeducted) * (realizationRate ?? 1.0);
```

Leg identity:
- **Entry leg** = initiating side (Long ⇒ buy, Short ⇒ sell); charged in the **initiation week**.
- **Exit leg**  = closing side (Long ⇒ sell, Short ⇒ buy); charged in the **closing week**.
- Same-week open+close ⇒ both legs charged that week.
- `entryBrokerage`/`exitBrokerage` absent (null) ⇒ formula-derived charge (legacy path, byte-identical to pre-rebuild).
- USD ⇒ each leg scaled by that week's USD/INR rate; realization scales the net.

## ⚠ Discrepancy to resolve in Phase 2 (lot size ≠ brokerage formula)
Spec Phase-2 dropdown says **NIFTY FUT lotSize 75**. v1 `NewTradeForm` maps
`Futures`/`NSE Futures` → lotSize **250** (src/components/NewTradeForm.tsx:49-51).
The brokerage *formula* (`0.0003 * turnover`) is unaffected by this, but the
multiplier differs. Phase 2 must use the spec's 75 while keeping the 0.0003×turnover
brokerage branch. Flagging so the port is deliberate, not accidental.
