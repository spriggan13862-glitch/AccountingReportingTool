/**
 * Centralized accounting sign convention.
 * Applied consistently across import, trial balance, bridge, and financial statements.
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export type NormalBalance = 'debit' | 'credit'

export function getNormalBalance(accountType: AccountType): NormalBalance {
  switch (accountType) {
    case 'liability':
    case 'equity':
    case 'revenue':
      return 'credit'
    default:
      return 'debit'
  }
}

/**
 * Returns the accounting balance with sign matching the normal balance convention.
 * Debit-normal (asset, expense): positive when debit > credit.
 * Credit-normal (liability, equity, revenue): positive when credit > debit.
 */
export function getAccountingSignedBalance(
  normalBalance: NormalBalance,
  debit: number,
  credit: number,
): number {
  return normalBalance === 'debit' ? debit - credit : credit - debit
}

/**
 * Returns the financial statement presentation amount.
 * Credit-normal accounts (revenue, liability, equity) are negated so that
 * a credit balance (normal) appears as a positive number in the statement.
 * Debit-normal accounts (asset, expense) are shown as-is.
 */
export function getFinancialStatementAmount(
  accountType: AccountType,
  accountingBalance: number,
): number {
  const normal = getNormalBalance(accountType)
  return normal === 'credit' ? -accountingBalance : accountingBalance
}
