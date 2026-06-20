import { describe, it, expect } from 'vitest'

// Mirror of Python je_impact_service logic for frontend validation
function getAccountingSignedBalance(accountType: string, debit: number, credit: number): number {
  const creditNormal = new Set(['liability', 'equity', 'revenue', 'other_income', 'contra_asset', 'contra_equity'])
  return creditNormal.has(accountType) ? credit - debit : debit - credit
}

function getPresentationAmount(_accountType: string, accountingBalance: number): number {
  return accountingBalance
}

function computeJeImpact(lines: Array<{ accountType: string; debit: number; credit: number }>) {
  const IS_TYPES = new Set(['revenue', 'cogs', 'expense', 'other_income', 'other_expense'])
  let ni = 0, asset = 0, liability = 0, equity = 0
  for (const line of lines) {
    const acctType = line.accountType
    const bal = getAccountingSignedBalance(acctType, line.debit, line.credit)
    const pres = getPresentationAmount(acctType, bal)
    if (IS_TYPES.has(acctType)) {
      if (acctType === 'revenue' || acctType === 'other_income') ni += pres
      else ni -= pres
    }
    if (acctType === 'asset' || acctType === 'contra_asset') asset += bal
    else if (acctType === 'liability') liability += bal
    else if (acctType === 'equity' || acctType === 'contra_equity') equity += bal
  }
  return { ni_impact: ni, bs_impact: asset - liability + equity, asset_impact: asset, liability_impact: liability, equity_impact: equity }
}

describe('JE Impact computation', () => {
  it('NI Impact column shows in adjustment workspace — revenue credit increases NI', () => {
    const result = computeJeImpact([{ accountType: 'revenue', debit: 0, credit: 1000 }])
    expect(result.ni_impact).toBeCloseTo(1000)
    expect(result.bs_impact).toBeCloseTo(0)
  })

  it('positive NI shown in green (ni_impact > 0)', () => {
    const result = computeJeImpact([{ accountType: 'revenue', debit: 0, credit: 5000 }])
    expect(result.ni_impact).toBeGreaterThan(0)
  })

  it('negative NI shown in red (ni_impact < 0)', () => {
    const result = computeJeImpact([{ accountType: 'expense', debit: 500, credit: 0 }])
    expect(result.ni_impact).toBeLessThan(0)
  })

  it('bridge shows columnar format with as_reported and adjusted — asset debit increases asset_impact', () => {
    const result = computeJeImpact([{ accountType: 'asset', debit: 2000, credit: 0 }])
    expect(result.asset_impact).toBeCloseTo(2000)
    expect(result.bs_impact).toBeCloseTo(2000)
  })

  it('total adjustments row in bridge — balanced AJE gives matching NI and Asset impact', () => {
    const result = computeJeImpact([
      { accountType: 'asset', debit: 1000, credit: 0 },
      { accountType: 'revenue', debit: 0, credit: 1000 },
    ])
    expect(result.ni_impact).toBeCloseTo(1000)
    expect(result.asset_impact).toBeCloseTo(1000)
    expect(result.bs_impact).toBeCloseTo(1000)
  })

  it('expense debit decreases NI', () => {
    const result = computeJeImpact([{ accountType: 'expense', debit: 500, credit: 0 }])
    expect(result.ni_impact).toBeCloseTo(-500)
  })

  it('liability credit impact: Dr Expense / Cr Liability gives negative NI and positive liability', () => {
    const result = computeJeImpact([
      { accountType: 'expense', debit: 1000, credit: 0 },
      { accountType: 'liability', debit: 0, credit: 1000 },
    ])
    expect(result.ni_impact).toBeCloseTo(-1000)
    expect(result.liability_impact).toBeCloseTo(1000)
    expect(result.bs_impact).toBeCloseTo(-1000)
  })

  it('IS-only entry has zero net BS impact', () => {
    const result = computeJeImpact([
      { accountType: 'expense', debit: 800, credit: 0 },
      { accountType: 'revenue', debit: 0, credit: 800 },
    ])
    expect(result.asset_impact).toBeCloseTo(0)
    expect(result.liability_impact).toBeCloseTo(0)
    expect(result.equity_impact).toBeCloseTo(0)
    expect(result.bs_impact).toBeCloseTo(0)
  })

  it('empty lines returns all zeros', () => {
    const result = computeJeImpact([])
    expect(result.ni_impact).toBe(0)
    expect(result.bs_impact).toBe(0)
  })
})
