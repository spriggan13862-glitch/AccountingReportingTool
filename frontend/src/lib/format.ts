/**
 * Global number and currency formatting utilities.
 *
 * All monetary displays in the app should use these helpers so that
 * reporting settings (currency symbol, decimals, negative format) apply
 * consistently everywhere.
 *
 * Usage:
 *   formatCurrency(1234567.89)    → "$1,234,568"
 *   formatCurrency(-5000)         → "($5,000)"
 *   formatCurrency(5000, { decimals: 2 }) → "$5,000.00"
 *   formatNumber(12345.6)         → "12,346"
 *   formatPercent(12.345)         → "12.3%"
 */

export interface FormatOptions {
  /** Currency symbol prefix. Defaults to "$". */
  symbol?: string
  /** Decimal places. Defaults to 0 for amounts, 1 for percents, 2 for ratios. */
  decimals?: number
  /** How to render negative values. "parentheses" → (5,000), "minus" → -$5,000. Defaults to "parentheses". */
  negativeFormat?: 'parentheses' | 'minus'
  /** If true and value is 0, return "—". Defaults to false. */
  dashForZero?: boolean
}

const DEFAULT_SYMBOL = '$'
const DEFAULT_NEGATIVE_FORMAT: FormatOptions['negativeFormat'] = 'parentheses'

function _format(value: number, decimals: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Format a monetary amount with comma separators and currency symbol.
 * Negative values use parentheses by default: ($5,000).
 */
export function formatCurrency(
  value: number | null | undefined,
  options: FormatOptions = {},
): string {
  if (value == null) return '—'
  const {
    symbol = DEFAULT_SYMBOL,
    decimals = 0,
    negativeFormat = DEFAULT_NEGATIVE_FORMAT,
    dashForZero = false,
  } = options

  if (dashForZero && value === 0) return '—'

  const abs = Math.abs(value)
  const formatted = `${symbol}${_format(abs, decimals)}`

  if (value < 0) {
    return negativeFormat === 'parentheses' ? `(${formatted})` : `-${formatted}`
  }
  return formatted
}

/**
 * Compact format for large numbers (used in summary chips / badges).
 * $1,234,567 → $1.2M · $45,000 → $45K · $999 → $999
 */
export function formatCurrencyCompact(
  value: number | null | undefined,
  symbol = DEFAULT_SYMBOL,
): string {
  if (value == null) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}K`
  return `${sign}${symbol}${abs.toFixed(0)}`
}

/**
 * Format a plain number with comma separators (no currency symbol).
 */
export function formatNumber(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (value == null) return '—'
  return _format(value, decimals)
}

/**
 * Format a percentage value.
 * 12.345 → "12.3%"
 */
export function formatPercent(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null) return '—'
  return `${value.toFixed(decimals)}%`
}

/**
 * Format a ratio / multiplier.
 * 1.234 → "1.23x"
 */
export function formatRatio(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (value == null) return '—'
  return `${value.toFixed(decimals)}x`
}
