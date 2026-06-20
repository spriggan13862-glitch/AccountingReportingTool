import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { AccountingWorkingView } from '@/components/financial/AccountingWorkingView'
import type { AccountingWorkingViewResponse } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ASSET_ACCOUNT = {
  account_id: 1,
  account_number: '1000',
  account_name: 'Cash - Operating',
  account_type: 'asset',
  normal_balance: 'debit',
  imported_balance: 45000,
  accounting_balance: 45000,
  awv_display_amount: 45000,
  posted_adj: 0,
  draft_adj: 0,
  adjusted_balance: 45000,
  journal_entries: [],
}

const REVENUE_ACCOUNT = {
  account_id: 2,
  account_number: '4000',
  account_name: 'Service Revenue',
  account_type: 'revenue',
  normal_balance: 'credit',
  imported_balance: 100000,
  accounting_balance: 100000,
  awv_display_amount: -100000,  // AWV: credit-normal shows negative
  posted_adj: 0,
  draft_adj: 0,
  adjusted_balance: 100000,
  journal_entries: [
    { je_id: 10, description: 'Revenue entry', amount: -100000 },
  ],
}

const MOCK_AWV_DATA: AccountingWorkingViewResponse = {
  entity_id: 1,
  period_id: null,
  view_id: null,
  as_of_date: '2024-12-31',
  net_income: 45000,
  sections: [
    {
      section: 'assets',
      label: 'Assets',
      statement_type: 'balance_sheet',
      taxonomy_lines: [
        {
          taxonomy_line_id: 1,
          line_name: 'Cash & Cash Equivalents',
          sort_order: 10,
          is_subtotal: false,
          accounting_balance: 45000,
          awv_display_amount: 45000,
          imported_balance: 45000,
          posted_adj: 0,
          draft_adj: 0,
          adjusted_balance: 45000,
          accounts: [ASSET_ACCOUNT],
        },
      ],
    },
    {
      section: 'revenue',
      label: 'Revenue',
      statement_type: 'income_statement',
      taxonomy_lines: [
        {
          taxonomy_line_id: 5,
          line_name: 'Service Revenue',
          sort_order: 100,
          is_subtotal: false,
          accounting_balance: 100000,
          awv_display_amount: -100000,
          imported_balance: 100000,
          posted_adj: 0,
          draft_adj: 0,
          adjusted_balance: 100000,
          accounts: [REVENUE_ACCOUNT],
        },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Accounting Working View', () => {
  it('renders AWV container', () => {
    render(wrap(
      <AccountingWorkingView data={MOCK_AWV_DATA} isLoading={false} />
    ))
    expect(screen.getByTestId('awv-container')).toBeDefined()
  })

  it('renders section headers', () => {
    render(wrap(
      <AccountingWorkingView data={MOCK_AWV_DATA} isLoading={false} />
    ))
    expect(screen.getByTestId('awv-section-assets')).toBeDefined()
    expect(screen.getByTestId('awv-section-revenue')).toBeDefined()
  })

  it('shows assets section', () => {
    render(wrap(
      <AccountingWorkingView data={MOCK_AWV_DATA} isLoading={false} />
    ))
    expect(screen.getAllByText('Assets').length).toBeGreaterThan(0)
  })

  it('shows revenue section', () => {
    render(wrap(
      <AccountingWorkingView data={MOCK_AWV_DATA} isLoading={false} />
    ))
    expect(screen.getAllByText('Revenue').length).toBeGreaterThan(0)
  })

  it('displays taxonomy rows collapsed by default', () => {
    render(wrap(
      <AccountingWorkingView data={MOCK_AWV_DATA} isLoading={false} />
    ))
    // Account rows should NOT be visible until expanded
    expect(screen.queryByTestId('awv-account-row-1')).toBeNull()
  })

  it('expands taxonomy line to show accounts', async () => {
    render(wrap(
      <AccountingWorkingView data={MOCK_AWV_DATA} isLoading={false} />
    ))
    // Click the taxonomy row to expand
    const taxonomyRow = screen.getByTestId('awv-taxonomy-row-1')
    fireEvent.click(taxonomyRow)

    await waitFor(() => {
      expect(screen.getByTestId('awv-account-row-1')).toBeDefined()
    })
  })

  it('shows Create AJE button per account on hover (element exists)', async () => {
    render(wrap(
      <AccountingWorkingView data={MOCK_AWV_DATA} isLoading={false} />
    ))
    // Expand to show account rows
    const taxonomyRow = screen.getByTestId('awv-taxonomy-row-1')
    fireEvent.click(taxonomyRow)

    await waitFor(() => {
      expect(screen.getByTestId('awv-create-aje-1')).toBeDefined()
    })
  })

  it('shows loading state', () => {
    render(wrap(
      <AccountingWorkingView
        data={{ sections: [], entity_id: 1, period_id: null, view_id: null, as_of_date: null, net_income: 0 }}
        isLoading={true}
      />
    ))
    expect(screen.getByText('Loading accounting view…')).toBeDefined()
  })

  it('shows empty state when no data', () => {
    render(wrap(
      <AccountingWorkingView
        data={{ sections: [], entity_id: 1, period_id: null, view_id: null, as_of_date: null, net_income: 0 }}
        isLoading={false}
      />
    ))
    expect(screen.getByText('No data available')).toBeDefined()
  })

  it('shows net income at bottom', () => {
    render(wrap(
      <AccountingWorkingView data={MOCK_AWV_DATA} isLoading={false} />
    ))
    expect(screen.getByText('Net Income')).toBeDefined()
  })

  it('shows AWV description banner', () => {
    render(wrap(
      <AccountingWorkingView data={MOCK_AWV_DATA} isLoading={false} />
    ))
    expect(screen.getAllByText('Accounting View').length).toBeGreaterThan(0)
  })
})
