/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared DISPLAY-ONLY number formatting for the whole app.
 *
 * Uses the Indian numbering system (lakh/crore comma grouping) via the built-in
 * 'en-IN' locale, e.g. 1000000 -> "10,00,000" and 10000000 -> "1,00,00,000".
 *
 * IMPORTANT: these helpers are for rendering to screen ONLY. Never use them for
 * stored, calculated, or exported raw values — those stay as plain numbers.
 *
 * Every on-screen number routes through here, so the grouping/locale can be
 * changed in exactly one place later.
 */

const LOCALE = 'en-IN';

/** Base formatter — Indian grouping. Nullish / non-finite renders as '' (mirrors the
 *  previous `value?.toLocaleString(...)` optional-chaining behavior). */
export function formatNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (value == null || !Number.isFinite(value)) return '';
  return value.toLocaleString(LOCALE, options);
}

/** Fixed-decimal amount (default 2 dp), Indian grouping.
 *  Replaces `toLocaleString(undefined, { min: n, max: n })` and `toFixed(n)`. */
export function formatAmount(value: number | null | undefined, digits = 2): string {
  return formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Price-style value with at least `min` decimals (default 2), Indian grouping.
 *  Replaces `toLocaleString(undefined, { minimumFractionDigits: 2 })`. */
export function formatPrice(value: number | null | undefined, min = 2): string {
  return formatNumber(value, { minimumFractionDigits: min });
}
