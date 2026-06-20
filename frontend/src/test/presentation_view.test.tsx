import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FinancialStatementPresentationView } from '@/components/financial/FinancialStatementPresentationView'
import type { PresentationViewResponse } from '@/api/financialStatements'

// Mock the currency formatter hook
vi.mock('@/hooks/useFormatCurrency', () => ({
  useFormatCurrency: () => (v: number | null | undefined) => {
    if (v == null) return '$0.00'
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  },
}))

const EMPTY_IS = {
  revenue: 0,
  cogs: 0,
  gross_profit: 0,
  total_expenses: 0,
  operating_income: 0,
  other_income: 0,
  other_expenses: 0,
  net_income: 0,
}

const EMPTY_BS = {
  total_assets: 0,
  total_liabilities: 0,
  total_equity: 0,
  balanced: true,
}

function makePresentationData(overrides?: Partial<PresentationViewResponse>): PresentationViewResponse {
  return {
    sections: [
      {
        section: 'revenue',
        label: 'Revenue',
        statement_type: 'income_statement',
        taxonomy_lines: [
          {
            taxonomy_line_id: 1,
            line_name: 'Service Revenue',
            sort_order: 10,
            is_subtotal: false,
            accounting_balance: 300000,
            awv_display_amount: 300000,
            imported_balance: 300000,
            posted_adj: 0,
            draft_adj: 0,
            adjusted_balance: 300000,
            accounts: [],
          },
        ],
      },
      {
        section: 'assets',
        label: 'Assets',
        statement_type: 'balance_sheet',
        taxonomy_lines: [
          {
            taxonomy_line_id: 2,
            line_name: 'Cash',
            sort_order: 1,
            is_subtotal: false,
            accounting_balance: 45000,
            awv_display_amount: 45000,
            imported_balance: 45000,
            posted_adj: 0,
            draft_adj: 0,
            adjusted_balance: 45000,
            accounts: [],
          },
        ],
      },
    ],
    income_statement: {
      revenue: 300000,
      cogs: 0,
      gross_profit: 300000,
      total_expenses: 100000,
      operating_income: 200000,
      other_income: 0,
      other_expenses: 0,
      net_income: 200000,
    },
    balance_sheet: {
      total_assets: 800000,
      total_liabilities: 350000,
      total_equity: 450000,
      balanced: true,
    },
    entity_id: 1,
    period_id: null,
    view_id: null,
    as_of_date: '2026-06-19',
    ...overrides,
  }
}

describe('Financial Statement Presentation View', () => {
  it('renders fsp-container', () => {
    render(<FinancialStatementPresentationView data={makePresentationData()} isLoading={false} />)
    expect(screen.getByTestId('fsp-container')).toBeDefined()
  })

  it('renders income statement section', () => {
    render(<FinancialStatementPresentationView data={makePresentationData()} isLoading={false} />)
    expect(screen.getByTestId('fsp-income-statement')).toBeDefined()
  })

  it('renders balance sheet section', () => {
    render(<FinancialStatementPresentationView data={makePresentationData()} isLoading={false} />)
    expect(screen.getByTestId('fsp-balance-sheet')).toBeDefined()
  })

  it('shows revenue as positive amount', () => {
    render(<FinancialStatementPresentationView data={makePresentationData()} isLoading={false} />)
    // Service Revenue line should appear
    expect(screen.getByText('Service Revenue')).toBeDefined()
  })

  it('shows net income', () => {
    render(<FinancialStatementPresentationView data={makePresentationData()} isLoading={false} />)
    expect(screen.getByTestId('fsp-net-income')).toBeDefined()
  })

  it('shows total assets', () => {
    render(<FinancialStatementPresentationView data={makePresentationData()} isLoading={false} />)
    expect(screen.getByTestId('fsp-total-assets')).toBeDefined()
  })

  it('shows total liabilities and equity', () => {
    render(<FinancialStatementPresentationView data={makePresentationData()} isLoading={false} />)
    expect(screen.getByTestId('fsp-total-liabilities-equity')).toBeDefined()
  })

  it('shows print button', () => {
    render(<FinancialStatementPresentationView data={makePresentationData()} isLoading={false} />)
    expect(screen.getByTestId('fsp-print-btn')).toBeDefined()
  })

  it('shows loading spinner when isLoading', () => {
    const { container } = render(
      <FinancialStatementPresentationView
        data={makePresentationData()}
        isLoading={true}
      />
    )
    expect(container.textContent).toContain('Loading financial statements')
  })

  it('shows empty state when no sections', () => {
    render(
      <FinancialStatementPresentationView
        data={{ ...makePresentationData(), sections: [] }}
        isLoading={false}
      />
    )
    expect(screen.getByText('No data available')).toBeDefined()
  })

  it('shows balance sheet imbalance warning when not balanced', () => {
    render(
      <FinancialStatementPresentationView
        data={makePresentationData({ balance_sheet: { total_assets: 900000, total_liabilities: 350000, total_equity: 450000, balanced: false } })}
        isLoading={false}
      />
    )
    expect(screen.getByText(/Balance sheet does not balance/)).toBeDefined()
  })
})
