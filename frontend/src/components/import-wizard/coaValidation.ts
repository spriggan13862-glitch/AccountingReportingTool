import type { ValidationResult, ImportSummary } from './types'

export interface COAImportRow {
  account_number: string
  account_name: string
  account_type: string
  normal_balance?: string
  parent_account_number?: string | null
  detail_type?: string | null
}

const VALID_TYPES = new Set(['asset', 'liability', 'equity', 'revenue', 'expense'])
const VALID_NORMAL_BALANCES = new Set(['debit', 'credit'])

const TYPE_TO_NORMAL: Record<string, string> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
}

const ACCOUNT_NUMBER_RE = /^\d{3,8}$/

export function validateCOARows(rows: COAImportRow[]): { results: ValidationResult[]; summary: ImportSummary } {
  const results: ValidationResult[] = []
  const seenNumbers = new Map<string, number>()
  const allNumbers = new Set(rows.map((r) => r.account_number?.trim()).filter(Boolean))

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowErrors: ValidationResult[] = []
    const rowWarnings: ValidationResult[] = []

    // Required fields
    if (!row.account_number?.trim()) {
      rowErrors.push({ rowIndex: i, field: 'account_number', message: 'Account number is required', severity: 'error' })
    } else {
      const num = row.account_number.trim()
      if (!ACCOUNT_NUMBER_RE.test(num)) {
        rowWarnings.push({ rowIndex: i, field: 'account_number', message: `"${num}" is not a standard 3–8 digit number`, severity: 'warning' })
      }
      if (seenNumbers.has(num)) {
        rowErrors.push({
          rowIndex: i,
          field: 'account_number',
          message: `Duplicate account number "${num}" (first seen at row ${seenNumbers.get(num)! + 1})`,
          severity: 'error',
        })
      } else {
        seenNumbers.set(num, i)
      }
    }

    if (!row.account_name?.trim()) {
      rowErrors.push({ rowIndex: i, field: 'account_name', message: 'Account name is required', severity: 'error' })
    }

    if (!row.account_type?.trim()) {
      rowErrors.push({ rowIndex: i, field: 'account_type', message: 'Account type is required', severity: 'error' })
    } else if (!VALID_TYPES.has(row.account_type.toLowerCase())) {
      rowErrors.push({
        rowIndex: i,
        field: 'account_type',
        message: `Unknown type "${row.account_type}" — must be asset, liability, equity, revenue, or expense`,
        severity: 'error',
      })
    }

    if (row.normal_balance && !VALID_NORMAL_BALANCES.has(row.normal_balance.toLowerCase())) {
      rowWarnings.push({
        rowIndex: i,
        field: 'normal_balance',
        message: `"${row.normal_balance}" is not a valid normal balance — expected "debit" or "credit"`,
        severity: 'warning',
      })
    } else if (!row.normal_balance && row.account_type && VALID_TYPES.has(row.account_type.toLowerCase())) {
      const expected = TYPE_TO_NORMAL[row.account_type.toLowerCase()]
      if (expected) {
        rowWarnings.push({
          rowIndex: i,
          field: 'normal_balance',
          message: `Normal balance not set — will default to "${expected}" for ${row.account_type}`,
          severity: 'warning',
        })
      }
    }

    // Parent must exist if set
    const parentNum = row.parent_account_number?.trim()
    if (parentNum && !allNumbers.has(parentNum)) {
      rowWarnings.push({
        rowIndex: i,
        field: 'parent_account_number',
        message: `Parent account number "${parentNum}" not found in import — row will be created as root`,
        severity: 'warning',
      })
    }

    // Circular parent check (simple: parent can't be self)
    if (parentNum && parentNum === row.account_number?.trim()) {
      rowErrors.push({
        rowIndex: i,
        field: 'parent_account_number',
        message: 'Account cannot be its own parent',
        severity: 'error',
      })
    }

    results.push(...rowErrors, ...rowWarnings)
  }

  const errorRows = new Set(results.filter((r) => r.severity === 'error').map((r) => r.rowIndex)).size
  const warningRows = new Set(results.filter((r) => r.severity === 'warning').map((r) => r.rowIndex)).size
  const summary: ImportSummary = {
    totalRows: rows.length,
    validRows: rows.length - errorRows,
    errorRows,
    warningRows,
    skippedRows: 0,
  }

  return { results, summary }
}
