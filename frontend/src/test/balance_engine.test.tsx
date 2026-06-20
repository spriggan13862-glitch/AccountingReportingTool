import { describe, it, expect } from 'vitest'
import {
  getNormalBalance,
  getAccountingSignedBalance,
  getPresentationAmount,
  getAwvDisplayAmount,
  computeNetIncome,
  formatForView,
} from '@/lib/balanceEngine'

describe('Balance Engine', () => {
  // ---------------------------------------------------------------------------
  // Normal balance
  // ---------------------------------------------------------------------------

  it('asset normal balance is debit', () => {
    expect(getNormalBalance('asset')).toBe('debit')
  })

  it('expense normal balance is debit', () => {
    expect(getNormalBalance('expense')).toBe('debit')
  })

  it('revenue normal balance is credit', () => {
    expect(getNormalBalance('revenue')).toBe('credit')
  })

  it('liability normal balance is credit', () => {
    expect(getNormalBalance('liability')).toBe('credit')
  })

  it('equity normal balance is credit', () => {
    expect(getNormalBalance('equity')).toBe('credit')
  })

  it('unknown type defaults to debit', () => {
    expect(getNormalBalance('unknown')).toBe('debit')
  })

  // ---------------------------------------------------------------------------
  // Accounting signed balance
  // ---------------------------------------------------------------------------

  it('asset: debit 1000, credit 200 → 800', () => {
    expect(getAccountingSignedBalance('asset', 1000, 200)).toBe(800)
  })

  it('revenue: debit 0, credit 5000 → 5000 accounting', () => {
    expect(getAccountingSignedBalance('revenue', 0, 5000)).toBe(5000)
  })

  it('expense: debit 3000, credit 0 → 3000', () => {
    expect(getAccountingSignedBalance('expense', 3000, 0)).toBe(3000)
  })

  it('liability: debit 200, credit 10200 → 10000', () => {
    expect(getAccountingSignedBalance('liability', 200, 10200)).toBe(10000)
  })

  it('asset abnormal balance returns negative', () => {
    expect(getAccountingSignedBalance('asset', 0, 500)).toBe(-500)
  })

  // ---------------------------------------------------------------------------
  // Presentation amount
  // ---------------------------------------------------------------------------

  it('revenue presentation amount equals accounting balance (no flip at this layer)', () => {
    const accounting = getAccountingSignedBalance('revenue', 0, 5000)  // 5000
    const presentation = getPresentationAmount('revenue', accounting)
    expect(presentation).toBe(5000)
  })

  it('asset presentation amount equals accounting balance', () => {
    expect(getPresentationAmount('asset', 800)).toBe(800)
  })

  it('sign_behavior negative flips the sign', () => {
    expect(getPresentationAmount('asset', 800, 'negative')).toBe(-800)
  })

  it('sign_behavior contra flips the sign', () => {
    expect(getPresentationAmount('asset', 500, 'contra')).toBe(-500)
  })

  it('sign_behavior positive keeps sign', () => {
    expect(getPresentationAmount('revenue', 5000, 'positive')).toBe(5000)
  })

  // ---------------------------------------------------------------------------
  // AWV display amount
  // ---------------------------------------------------------------------------

  it('asset AWV display is positive', () => {
    expect(getAwvDisplayAmount('asset', 800)).toBe(800)
  })

  it('revenue AWV display is negative (credit-normal flipped in debit-dominant view)', () => {
    expect(getAwvDisplayAmount('revenue', 5000)).toBe(-5000)
  })

  it('liability AWV display is negative', () => {
    expect(getAwvDisplayAmount('liability', 10000)).toBe(-10000)
  })

  it('expense AWV display is positive', () => {
    expect(getAwvDisplayAmount('expense', 3000)).toBe(3000)
  })

  // ---------------------------------------------------------------------------
  // Net income
  // ---------------------------------------------------------------------------

  it('net income = revenue - cogs - expenses', () => {
    expect(computeNetIncome(50000, 20000, 15000)).toBe(15000)
  })

  it('net income loss scenario', () => {
    expect(computeNetIncome(10000, 8000, 5000)).toBe(-3000)
  })

  it('net income from JE data: revenue=1000, cogs=600, depr=100 → 300', () => {
    const rev = getAccountingSignedBalance('revenue', 0, 1000)   // 1000
    const cogs = getAccountingSignedBalance('expense', 600, 0)   // 600
    const depr = getAccountingSignedBalance('expense', 100, 0)   // 100
    expect(computeNetIncome(rev, cogs + depr, 0)).toBe(300)
  })

  // ---------------------------------------------------------------------------
  // Balance sheet equation
  // ---------------------------------------------------------------------------

  it('balance sheet equation: assets = liabilities + equity', () => {
    const assets = getAccountingSignedBalance('asset', 100000, 0)       // 100000
    const liabilities = getAccountingSignedBalance('liability', 0, 60000) // 60000
    const equity = getAccountingSignedBalance('equity', 0, 40000)        // 40000
    expect(assets).toBe(liabilities + equity)
  })

  it('double-entry: sum of net debits in a balanced JE is 0', () => {
    const cashNd = 1000 - 0
    const revNd = 0 - 1000
    expect(cashNd + revNd).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // formatForView
  // ---------------------------------------------------------------------------

  it('formatForView presentation returns presentation amount', () => {
    expect(formatForView(5000, 'revenue', 'presentation')).toBe(5000)
  })

  it('formatForView accounting flips credit-normal to negative', () => {
    expect(formatForView(5000, 'revenue', 'accounting')).toBe(-5000)
  })

  it('formatForView accounting keeps debit-normal positive', () => {
    expect(formatForView(3000, 'expense', 'accounting')).toBe(3000)
  })
})
