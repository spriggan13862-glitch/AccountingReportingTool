import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatCurrencyCompact,
  formatNumber,
  formatPercent,
  formatRatio,
} from '@/lib/format'

describe('formatCurrency', () => {
  it('adds comma separator for thousands', () => {
    expect(formatCurrency(5000)).toBe('$5,000')
  })

  it('adds comma separators for millions', () => {
    expect(formatCurrency(1234567)).toBe('$1,234,567')
  })

  it('formats zero as $0', () => {
    expect(formatCurrency(0)).toBe('$0')
  })

  it('wraps negative in parentheses by default', () => {
    expect(formatCurrency(-5000)).toBe('($5,000)')
  })

  it('uses minus sign when negativeFormat is minus', () => {
    expect(formatCurrency(-5000, { negativeFormat: 'minus' })).toBe('-$5,000')
  })

  it('returns dash for null', () => {
    expect(formatCurrency(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatCurrency(undefined)).toBe('—')
  })

  it('respects decimal places', () => {
    expect(formatCurrency(1234567.89, { decimals: 2 })).toBe('$1,234,567.89')
  })

  it('returns dash for zero when dashForZero is true', () => {
    expect(formatCurrency(0, { dashForZero: true })).toBe('—')
  })

  it('uses custom symbol', () => {
    expect(formatCurrency(1000, { symbol: '€' })).toBe('€1,000')
  })
})

describe('formatCurrencyCompact', () => {
  it('formats millions with M suffix', () => {
    expect(formatCurrencyCompact(1_200_000)).toBe('$1.2M')
  })

  it('formats thousands with K suffix', () => {
    expect(formatCurrencyCompact(45_000)).toBe('$45K')
  })

  it('formats small amounts without suffix', () => {
    expect(formatCurrencyCompact(999)).toBe('$999')
  })

  it('handles negative millions', () => {
    expect(formatCurrencyCompact(-2_500_000)).toBe('-$2.5M')
  })
})

describe('formatNumber', () => {
  it('adds comma separator', () => {
    expect(formatNumber(12345)).toBe('12,345')
  })

  it('respects decimal places', () => {
    expect(formatNumber(12345.6, 1)).toBe('12,345.6')
  })

  it('returns dash for null', () => {
    expect(formatNumber(null)).toBe('—')
  })
})

describe('formatPercent', () => {
  it('formats with one decimal by default', () => {
    expect(formatPercent(12.345)).toBe('12.3%')
  })

  it('respects decimal places', () => {
    expect(formatPercent(12.0, 0)).toBe('12%')
  })

  it('returns dash for null', () => {
    expect(formatPercent(null)).toBe('—')
  })
})

describe('formatRatio', () => {
  it('appends x suffix', () => {
    expect(formatRatio(2.5)).toBe('2.50x')
  })

  it('returns dash for null', () => {
    expect(formatRatio(null)).toBe('—')
  })
})
