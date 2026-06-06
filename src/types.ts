/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Instrument = 
  | 'Option' 
  | 'Futures' 
  | 'DOW' 
  | 'Nikkei' 
  | 'Nasdaq' 
  | 'NG' 
  | 'SnP' 
  | 'Gift Nifty'
  | 'NSE Futures'
  | 'NSE Options';

export type TradeDirection = 'Long' | 'Short';

export type TradeStatus = 
  | 'Closed' 
  | 'CarryForwardLong' 
  | 'CarryForwardShort' 
  | 'CarryForwardClosed';

export interface Trade {
  id: string;
  symbol: string;
  instrument: Instrument;
  direction: TradeDirection;
  dateInitiated: string; // YYYY-MM-DD
  buyPrice: number | null;
  sellPrice: number | null;
  buyDate: string | null; // YYYY-MM-DD
  sellDate: string | null; // YYYY-MM-DD
  lotSize: number;
  numberOfLots: number;
  status: TradeStatus;
  currency: 'INR' | 'USD';
  usdToInrRate: number;
  fridayUsdToInrRates: Record<string, number>;
  closedUsdToInrRate?: number;
  realizationRate: number; // 0.8 or 1.0
  
  // Record of week identifier (e.g. "2026-W23") -> Friday closing price
  fridayClosingPrices: Record<string, number>;
  
  // User check-transient trading price for evaluating PnL at "this moment"
  currentTradingPrice?: number | null;
}

export interface WeekInfo {
  weekKey: string; // "YYYY-WXX" e.g., "2026-W23"
  weekNum: number;
  weekRange: string;
  year: number;
  mondayDateStr: string;
  fridayDateStr: string;
}

/**
 * Get the ISO-8601-like week number, range, and key for a given date.
 * Adjusts so that weeks run Monday through Sunday, and range covers Mon-Fri.
 */
export function getWeekInfo(dateStr: string): WeekInfo {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return {
      weekKey: '2026-W01',
      weekNum: 1,
      weekRange: 'Invalid Date',
      year: 2026,
      mondayDateStr: '2026-01-05',
      fridayDateStr: '2026-01-09'
    };
  }

  // Get Monday of the same week
  const day = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  // Calculate week number of year (using Monday)
  const janFirst = new Date(monday.getFullYear(), 0, 1);
  const diffTime = monday.getTime() - janFirst.getTime();
  const diffDays = Math.floor(diffTime / (24 * 60 * 60 * 1000));
  // ISO-like calculation
  const weekNum = Math.ceil((diffDays + janFirst.getDay() + 1) / 7);
  const year = monday.getFullYear();
  const weekKey = `${year}-W${weekNum.toString().padStart(2, '0')}`;

  const options: Intl.DateTimeFormatOptions = { month: 'short', day: '2-digit' };
  const mondayStr = monday.toLocaleDateString('en-US', options);
  const fridayStr = friday.toLocaleDateString('en-US', options);

  return {
    weekKey,
    weekNum,
    weekRange: `${mondayStr} - ${fridayStr}, ${year}`,
    year,
    mondayDateStr: monday.toISOString().split('T')[0],
    fridayDateStr: friday.toISOString().split('T')[0]
  };
}

/**
 * Lists all weekly objects between start date and end date
 */
export function getWeeksBetween(startDateStr: string, endDateStr: string): WeekInfo[] {
  const startInfo = getWeekInfo(startDateStr);
  const endInfo = getWeekInfo(endDateStr);

  const startMon = new Date(startInfo.mondayDateStr);
  const endMon = new Date(endInfo.mondayDateStr);

  const weeks: WeekInfo[] = [];
  const current = new Date(startMon);

  while (current <= endMon) {
    const formatted = current.toISOString().split('T')[0];
    const info = getWeekInfo(formatted);
    // Double check we don't push duplicates
    if (!weeks.some(w => w.weekKey === info.weekKey)) {
      weeks.push(info);
    }
    current.setDate(current.getDate() + 7);
  }

  return weeks.sort((a, b) => a.weekKey.localeCompare(b.weekKey));
}

/**
 * Calculates Turnovers and Brokerages
 */
export function calculateTurnoverAndBrokerage(
  price: number | null,
  lots: number,
  lotSize: number,
  instrument: Instrument
): { turnover: number; brokerage: number } {
  if (price === null || price <= 0) {
    return { turnover: 0, brokerage: 0 };
  }
  const turnover = price * lots * lotSize;
  let brokerage = 0;

  if (instrument === 'Futures' || instrument === 'Option' || instrument === 'NG' || instrument === 'Gift Nifty' || instrument === 'NSE Futures' || instrument === 'NSE Options') {
    brokerage = 0.0003 * turnover;
  } else {
    // DOW/Nasdaq/SnP/Nikkei is $5 per lot flat
    brokerage = 5 * lots;
  }

  return { turnover, brokerage };
}

export interface WeeklyTradeCalculation {
  isActive: boolean;
  role: 'initiation' | 'intermediate' | 'closing' | 'same-week-closed';
  openingPrice: number;
  closingPrice: number;
  points: number;
  grossProfit: number;
  brokerageDeducted: number;
  netProfit: number;
  buyTurnover: number;
  sellTurnover: number;
  buyBrokerage: number;
  sellBrokerage: number;
}

/**
 * Computes calculations for a single trade within a specific week in the timeline
 */
export function calculateTradeForWeek(trade: Trade, targetWeekKey: string): WeeklyTradeCalculation {
  const initInfo = getWeekInfo(trade.dateInitiated);
  const isClosingWeek = getIsClosedInOrBeforeWeek(trade, targetWeekKey) && getWeekKeyForClose(trade) === targetWeekKey;
  const isInitiationWeek = initInfo.weekKey === targetWeekKey;

  // Find all weeks the trade covers
  const todayStr = new Date().toISOString().split('T')[0];
  const endLimitStr = trade.status === 'Closed' || trade.status === 'CarryForwardClosed'
    ? (trade.direction === 'Long' ? (trade.sellDate || todayStr) : (trade.buyDate || todayStr))
    : todayStr;

  const activeWeeks = getWeeksBetween(trade.dateInitiated, endLimitStr);
  const targetIndex = activeWeeks.findIndex(w => w.weekKey === targetWeekKey);

  // If week doesn't overlap trade period, return inactive
  if (targetIndex === -1) {
    return {
      isActive: false,
      role: 'intermediate',
      openingPrice: 0,
      closingPrice: 0,
      points: 0,
      grossProfit: 0,
      brokerageDeducted: 0,
      netProfit: 0,
      buyTurnover: 0,
      sellTurnover: 0,
      buyBrokerage: 0,
      sellBrokerage: 0
    };
  }

  // Determine standard Buy and Sell parameters
  const initiatorPrice = trade.direction === 'Long' ? trade.buyPrice : trade.sellPrice;
  const exitPrice = trade.direction === 'Long' ? trade.sellPrice : trade.buyPrice;

  // Determine exchange rate for this week
  let weeklyExchangeRate = 1.0;
  if (trade.currency === 'USD') {
    if (isClosingWeek) {
      weeklyExchangeRate = trade.closedUsdToInrRate ?? trade.fridayUsdToInrRates?.[targetWeekKey] ?? trade.usdToInrRate ?? 83.24;
    } else {
      weeklyExchangeRate = trade.fridayUsdToInrRates?.[targetWeekKey] ?? trade.usdToInrRate ?? 83.24;
    }
  }

  const buyTurnCalc = calculateTurnoverAndBrokerage(trade.buyPrice, trade.numberOfLots, trade.lotSize, trade.instrument);
  const sellTurnCalc = calculateTurnoverAndBrokerage(trade.sellPrice, trade.numberOfLots, trade.lotSize, trade.instrument);

  let buyBrokerage = buyTurnCalc.brokerage;
  let sellBrokerage = sellTurnCalc.brokerage;

  if (trade.currency === 'USD') {
    buyBrokerage = buyBrokerage * weeklyExchangeRate;
    sellBrokerage = sellBrokerage * weeklyExchangeRate;
  }

  // Determine specific role for this week
  let role: WeeklyTradeCalculation['role'] = 'intermediate';
  if (isInitiationWeek && isClosingWeek) {
    role = 'same-week-closed';
  } else if (isInitiationWeek) {
    role = 'initiation';
  } else if (isClosingWeek) {
    role = 'closing';
  }

  let openingPrice = 0;
  let closingPrice = 0;

  if (role === 'same-week-closed') {
    openingPrice = initiatorPrice || 0;
    closingPrice = exitPrice || 0;
  } else if (role === 'initiation') {
    openingPrice = initiatorPrice || 0;
    // For initiation week carried forward, the friday close of initiation week
    closingPrice = trade.fridayClosingPrices[targetWeekKey] ?? openingPrice;
  } else if (role === 'closing') {
    // Opening is Friday close of previous active week
    const prevWeekKey = activeWeeks[targetIndex - 1]?.weekKey;
    openingPrice = trade.fridayClosingPrices[prevWeekKey] ?? initiatorPrice ?? 0;
    closingPrice = exitPrice || 0;
  } else {
    // Intermediate active week
    const prevWeekKey = activeWeeks[targetIndex - 1]?.weekKey;
    openingPrice = trade.fridayClosingPrices[prevWeekKey] ?? initiatorPrice ?? 0;
    closingPrice = trade.fridayClosingPrices[targetWeekKey] ?? openingPrice;
  }

  // Calculate gross PnL
  let points = 0;
  if (trade.direction === 'Long') {
    points = closingPrice - openingPrice;
  } else {
    points = openingPrice - closingPrice;
  }

  let grossProfit = points * trade.lotSize * trade.numberOfLots;
  if (trade.currency === 'USD') {
    grossProfit = grossProfit * weeklyExchangeRate;
  }

  // Calculate brokerage deducted this week
  let brokerageDeducted = 0;
  if (role === 'same-week-closed') {
    brokerageDeducted = buyBrokerage + sellBrokerage;
  } else if (role === 'initiation') {
    brokerageDeducted = trade.direction === 'Long' ? buyBrokerage : sellBrokerage;
  } else if (role === 'closing') {
    brokerageDeducted = trade.direction === 'Long' ? sellBrokerage : buyBrokerage;
  } else {
    brokerageDeducted = 0;
  }

  const netProfit = (grossProfit - brokerageDeducted) * (trade.realizationRate ?? 1.0);

  return {
    isActive: true,
    role,
    openingPrice,
    closingPrice,
    points,
    grossProfit,
    brokerageDeducted,
    netProfit,
    buyTurnover: buyTurnCalc.turnover,
    sellTurnover: sellTurnCalc.turnover,
    buyBrokerage,
    sellBrokerage
  };
}

/**
 * Helper to determine when the trade is closed (either closed same week or closed subsequent week)
 */
export function getIsClosedInOrBeforeWeek(trade: Trade, weekKey: string): boolean {
  if (trade.status !== 'Closed' && trade.status !== 'CarryForwardClosed') {
    return false;
  }
  const closeWeekKey = getWeekKeyForClose(trade);
  return closeWeekKey ? closeWeekKey <= weekKey : false;
}

export function getWeekKeyForClose(trade: Trade): string | null {
  const closeDate = trade.direction === 'Long' ? trade.sellDate : trade.buyDate;
  if (!closeDate) return null;
  return getWeekInfo(closeDate).weekKey;
}

/**
 * Calculates current transient PnL for live checking (does not alter the standard weekly calculations)
 */
export interface InstantPnL {
  currentPrice: number;
  points: number;
  grossProfit: number;
  totalBrokerage: boolean; // whether both buy/sell brokerage are considered
  estimatedBrokerage: number;
  netProfit: number;
}

export function estimateInstantPnL(trade: Trade, currentPrice: number): InstantPnL {
  const initiatorPrice = trade.direction === 'Long' ? trade.buyPrice : trade.sellPrice;
  if (!initiatorPrice) {
    return { currentPrice, points: 0, grossProfit: 0, totalBrokerage: false, estimatedBrokerage: 0, netProfit: 0 };
  }

  let points = 0;
  if (trade.direction === 'Long') {
    points = currentPrice - initiatorPrice;
  } else {
    points = initiatorPrice - currentPrice;
  }

  const instantExchangeRate = trade.currency === 'USD' ? (trade.usdToInrRate ?? 83.24) : 1.0;

  let grossProfit = points * trade.lotSize * trade.numberOfLots;
  if (trade.currency === 'USD') {
    grossProfit = grossProfit * instantExchangeRate;
  }

  const buyPriceToUse = trade.direction === 'Long' ? (trade.buyPrice ?? currentPrice) : currentPrice;
  const sellPriceToUse = trade.direction === 'Long' ? currentPrice : (trade.sellPrice ?? currentPrice);

  const buyTurnCalc = calculateTurnoverAndBrokerage(buyPriceToUse, trade.numberOfLots, trade.lotSize, trade.instrument);
  const sellTurnCalc = calculateTurnoverAndBrokerage(sellPriceToUse, trade.numberOfLots, trade.lotSize, trade.instrument);

  let buyB = buyTurnCalc.brokerage;
  let sellB = sellTurnCalc.brokerage;
  if (trade.currency === 'USD') {
    buyB = buyB * instantExchangeRate;
    sellB = sellB * instantExchangeRate;
  }

  const estimatedBrokerage = buyB + sellB;
  const netProfit = (grossProfit - estimatedBrokerage) * (trade.realizationRate ?? 1.0);

  return {
    currentPrice,
    points,
    grossProfit,
    totalBrokerage: true,
    estimatedBrokerage,
    netProfit
  };
}

/**
 * Exports historical trades data as an Excel-friendly CSV with proper headers, currency conversions, 
 * and absolute weekly-ledger-summed realized statistics.
 */
export function exportToExcel(trades: Trade[], startDate?: string, endDate?: string, instruments?: string[]) {
  let filtered = trades;
  if (startDate) {
    filtered = filtered.filter(t => t.dateInitiated >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter(t => t.dateInitiated <= endDate);
  }
  if (instruments && instruments.length > 0) {
    filtered = filtered.filter(t => instruments.includes(t.instrument));
  }

  const headers = [
    "Position ID",
    "Symbol",
    "Instrument",
    "Direction",
    "Initiation Date",
    "Entry Rate",
    "Lots",
    "Multiplier",
    "Currency",
    "USD/INR Exchange Rate",
    "Exit Date",
    "Exit Rate",
    "Realization Rate",
    "Gross Profit (INR)",
    "Brokerage Deductions (INR)",
    "Net Accounting Yield (INR)",
    "Lifecycle Status"
  ];

  const rows = filtered.map(t => {
    const todayStr = new Date().toISOString().split('T')[0];
    const endLimitStr = t.status === 'Closed' || t.status === 'CarryForwardClosed'
      ? (t.direction === 'Long' ? (t.sellDate || todayStr) : (t.buyDate || todayStr))
      : todayStr;

    const activeWeeks = getWeeksBetween(t.dateInitiated, endLimitStr);
    
    let tradeGrossSum = 0;
    let tradeBrokerageSum = 0;

    activeWeeks.forEach(w => {
      const calc = calculateTradeForWeek(t, w.weekKey);
      if (calc.isActive) {
        tradeGrossSum += calc.grossProfit;
        tradeBrokerageSum += calc.brokerageDeducted;
      }
    });

    const netYield = tradeGrossSum - tradeBrokerageSum;
    const entryRate = t.direction === 'Long' ? t.buyPrice : t.sellPrice;
    const exitRate = t.direction === 'Long' ? t.sellPrice : t.buyPrice;

    return [
      t.id,
      t.symbol,
      t.instrument,
      t.direction,
      t.dateInitiated,
      entryRate ?? "",
      t.numberOfLots,
      t.lotSize,
      t.currency,
      t.usdToInrRate,
      t.direction === 'Long' ? (t.sellDate || "Open") : (t.buyDate || "Open"),
      exitRate ?? "Open",
      t.realizationRate,
      tradeGrossSum.toFixed(2),
      tradeBrokerageSum.toFixed(2),
      netYield.toFixed(2),
      t.status
    ];
  });

  // Convert row data to CSV content
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => {
      const strVal = String(cell ?? "");
      if (strVal.includes(",") || strVal.includes('"') || strVal.includes("\n")) {
        return `"${strVal.replace(/"/g, '""')}"`;
      }
      return strVal;
    }).join(","))
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `ailaha_phalam_ledger_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
