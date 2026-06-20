export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'cogs'
  | 'expense'
  | 'other_income'
  | 'other_expense'
  | 'contra_asset'
  | 'contra_revenue'
  | 'contra_equity'
  | 'tax'
  | 'intercompany'

export type BalanceView = 'accounting' | 'presentation'

const NORMAL_BALANCE: Record<string, 'debit' | 'credit'> = {
  asset: 'debit',
  expense: 'debit',
  cogs: 'debit',
  other_expense: 'debit',
  contra_revenue: 'debit',
  contra_equity: 'debit',
  tax: 'debit',
  intercompany: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
  other_income: 'credit',
  contra_asset: 'credit',
}

// Account types whose accounting balance shows NEGATIVE in AWV (debit-dominant view).
// Revenue accounting_balance is positive (credit > debit = healthy).
// In AWV, credit-normal accounts are displayed negative because the world is debit-dominant.
const AWV_FLIP_TYPES = new Set(['revenue', 'other_income', 'liability', 'equity', 'contra_asset', 'contra_equity'])

export function getNormalBalance(accountType: string): 'debit' | 'credit' {
  return NORMAL_BALANCE[accountType.toLowerCase()] ?? 'debit'
}

export function getAccountingSignedBalance(accountType: string, debit: number, credit: number): number {
  const normal = getNormalBalance(accountType)
  return normal === 'debit' ? debit - credit : credit - debit
}

/**
 * Convert accounting signed balance to financial statement presentation amount.
 *
 * The accounting_balance for credit-normal accounts is already positive when
 * the account has a normal credit position (revenue credit=5000 → balance=5000).
 * In FSP, revenue is also shown positive, so NO flip is needed at this layer.
 *
 * Flip only occurs if sign_behavior override says 'negative' or 'contra'.
 */
export function getPresentationAmount(
  accountType: string,
  accountingBalance: number,
  signBehavior?: string | null,
): number {
  if (signBehavior === 'negative' || signBehavior === 'contra') return -accountingBalance
  if (signBehavior === 'positive') return accountingBalance
  return accountingBalance
}

/**
 * Return the amount for Accounting Working View (AWV) display.
 *
 * In AWV, we are in a debit-dominant world. Credit-normal accounts
 * (revenue, liability, equity) show as NEGATIVE because they carry
 * credit balances against the debit-normal axis.
 *
 * Examples:
 * - Asset accounting_balance=800   → AWV: +800
 * - Revenue accounting_balance=5000 → AWV: -5000
 * - Expense accounting_balance=3000 → AWV: +3000
 */
export function getAwvDisplayAmount(accountType: string, accountingBalance: number): number {
  return AWV_FLIP_TYPES.has(accountType.toLowerCase()) ? -accountingBalance : accountingBalance
}

/**
 * Net Income = Revenue - COGS - Expenses (all accounting_balances, all positive when healthy).
 */
export function computeNetIncome(
  revenueBalance: number,
  cogsBalance: number,
  expenseBalance: number,
): number {
  return revenueBalance - cogsBalance - expenseBalance
}

/**
 * Format a balance for the given view.
 *
 * - 'presentation': return the presentation amount (accounting_balance as-is for
 *   most types; override via signBehavior for inverted taxonomy lines)
 * - 'accounting': return the AWV display amount (flips credit-normal accounts negative)
 */
export function formatForView(
  amount: number,
  accountType: string,
  view: BalanceView,
  signBehavior?: string | null,
): number {
  if (view === 'presentation') {
    return getPresentationAmount(accountType, amount, signBehavior)
  }
  return getAwvDisplayAmount(accountType, amount)
}
