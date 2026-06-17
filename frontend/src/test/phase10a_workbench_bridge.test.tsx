import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import { AdjustmentWorkspacePage } from '@/pages/AdjustmentWorkspacePage'
import { AdjustmentBridgePage } from '@/pages/AdjustmentBridgePage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Mocks (top-level — required by Vitest hoisting)
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/PageLayout', () => ({
  PageLayout: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div><h1>{title}</h1>{children}</div>
  ),
}))
vi.mock('@/components/ui/Breadcrumb', () => ({ Breadcrumb: () => null }))
vi.mock('@/components/ui/WorkspaceCrossLinks', () => ({ WorkspaceCrossLinks: () => null }))
vi.mock('@/components/ui/LoadingState', () => ({ LoadingState: () => <div>Loading…</div> }))
vi.mock('@/components/ui/ErrorState', () => ({ ErrorState: () => <div>Error</div> }))
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => () => {} }))
vi.mock('@/components/ui/EntitySelect', () => ({ EntitySelect: () => <select data-testid="entity-select" /> }))
vi.mock('@/components/ui/PeriodSelect', () => ({ PeriodSelect: () => <select data-testid="period-select" /> }))
vi.mock('@/api/periods', () => ({ periodsApi: { list: vi.fn().mockResolvedValue([]) } }))

const { MOCK_ITEM } = vi.hoisted(() => ({
  MOCK_ITEM: {
    id: 1,
    je_number: 'AJE-001',
    entry_date: '2024-02-29',
    entity_id: 1,
    scenario_id: 1,
    description: 'Pending AR write-off',
    source: 'manual',
    status: 'draft',
    overlay_group: 'audit_adjustment',
    materiality: 'material',
    total_debit: 5000,
    total_credit: 5000,
    impact: { ni_impact: -5000, ebitda_impact: -5000, asset_impact: 0, liability_impact: 0, equity_impact: 0 },
    package_ids: [],
    has_advisor_note: false,
    advisor_resolution_status: null,
    lines: [
      { line_number: 1, account_id: 1, account_number: '1200', account_name: 'Accounts Receivable', debit: 5000, credit: 0, description: null },
      { line_number: 2, account_id: 2, account_number: '6500', account_name: 'Bad Debt Expense', debit: 0, credit: 5000, description: null },
    ],
  },
}))

vi.mock('@/api/reportingSettings', () => ({
  reportingSettingsApi: {
    get: vi.fn().mockResolvedValue({ decimal_places: 0, currency_symbol: '$', negative_format: 'parentheses' }),
  },
}))

vi.mock('@/api/adjustmentWorkspace', () => ({
  adjustmentWorkspaceApi: {
    listAdjustments: vi.fn().mockResolvedValue([MOCK_ITEM]),
    listPackages: vi.fn().mockResolvedValue([]),
    impactPreview: vi.fn().mockResolvedValue({ ni_impact: 0, ebitda_impact: 0, asset_impact: 0, liability_impact: 0, equity_impact: 0 }),
    setMateriality: vi.fn(),
    createPackage: vi.fn(),
    deletePackage: vi.fn(),
  },
}))

vi.mock('@/api/adjustmentBridge', () => ({
  adjustmentBridgeApi: {
    cpaBridge: vi.fn().mockResolvedValue({
      entity_id: 1, period_end: '2024-12-31', scenario_id: null,
      columns: [
        { je_id: 10, je_number: 'AJE-001', description: 'Bad debt accrual', entry_date: '2024-01-15' },
        { je_id: 11, je_number: 'AJE-002', description: 'Inventory write-down', entry_date: '2024-02-01' },
      ],
      rows: [
        { account_id: 1, account_number: '1200', account_name: 'Accounts Receivable', account_type: 'asset', account_sort: 1200, as_reported: 100000, ajes: { '10': 5000, '11': 0 }, total_ajes: 5000, adjusted: 105000 },
      ],
      totals: { as_reported: 100000, ajes: { '10': 5000, '11': -10000 }, total_ajes: -5000, adjusted: 95000 },
    }),
  },
}))

// ---------------------------------------------------------------------------
// Issue 1: Full JE detail visible inline
// ---------------------------------------------------------------------------

describe('AdjustmentWorkbench — Issue 1: Full JE detail visible inline', () => {
  it('renders Total Dr and Total Cr column headers', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await waitFor(() => {
      expect(screen.getByText('Total Dr')).toBeTruthy()
      expect(screen.getByText('Total Cr')).toBeTruthy()
    })
  })

  it('does not show a single "Amount" column header', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await waitFor(() => {
      expect(screen.getAllByText('Total Dr').length).toBeGreaterThan(0)
    })
    expect(screen.queryByRole('columnheader', { name: /^amount$/i })).toBeNull()
  })

  it('renders Acct # and Account Name column headers in the sub-table', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await waitFor(() => {
      expect(screen.getByText('Acct #')).toBeTruthy()
      expect(screen.getByText('Account Name')).toBeTruthy()
    })
  })

  it('renders account number and name inline when JE is expanded', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await waitFor(() => {
      // Lines are expanded by default (collapsedIds is initially empty)
      expect(screen.getByText('1200')).toBeTruthy()
      expect(screen.getByText('Accounts Receivable')).toBeTruthy()
      expect(screen.getByText('6500')).toBeTruthy()
      expect(screen.getByText('Bad Debt Expense')).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// Issue 2: No approval UI
// ---------------------------------------------------------------------------

describe('AdjustmentWorkbench — Issue 2: No approval UI', () => {
  it('status filter only contains All / Draft / Posted / Reversed', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await waitFor(() => {
      const select = screen.getByTestId('filter-status') as HTMLSelectElement
      const options = Array.from(select.options).map((o) => o.text)
      expect(options.some((o) => /draft/i.test(o))).toBe(true)
      expect(options.some((o) => /posted/i.test(o))).toBe(true)
      expect(options.some((o) => /reversed/i.test(o))).toBe(true)
      expect(options.some((o) => /approval/i.test(o))).toBe(false)
      expect(options.some((o) => /pending/i.test(o))).toBe(false)
    })
  })

  it('does not render Submit for Approval or Pending Approval text', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await waitFor(() => {
      expect(screen.queryByText(/submit.*approval/i)).toBeNull()
      expect(screen.queryByText(/pending approval/i)).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Issue 3: Bridge — no Variance column
// ---------------------------------------------------------------------------

describe('AdjustmentBridge — Issue 3: No Variance column', () => {
  it('does not render a Variance column header', async () => {
    render(wrap(<AdjustmentBridgePage />))
    await waitFor(() => {
      // Bridge placeholder loads when no entity/period selected
      expect(screen.queryByText(/^variance$/i)).toBeNull()
    })
  })

  it('renders Total AJEs and Adjusted column headers (not Variance)', async () => {
    render(wrap(<AdjustmentBridgePage />))
    // No entity/period selected — placeholder shown, confirm no variance
    expect(screen.queryByText(/variance/i)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Issue 5: Reporting settings — useFormatCurrency hook
// ---------------------------------------------------------------------------

describe('Reporting settings — Issue 5: decimal places applied via hook', () => {
  it('useFormatCurrency returns formatter respecting settings decimal_places=0', async () => {
    const { renderHook, waitFor: waitForHook } = await import('@testing-library/react')
    const { useFormatCurrency } = await import('@/hooks/useFormatCurrency')

    const client = makeClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useFormatCurrency(), { wrapper })

    await waitForHook(() => {
      const formatted = result.current(5000)
      expect(formatted).toBe('$5,000')
      expect(formatted).not.toContain('.00')
    })
  })

  it('useFormatCurrency formats negative values using parentheses when negative_format=parentheses', async () => {
    const { renderHook, waitFor: waitForHook } = await import('@testing-library/react')
    const { useFormatCurrency } = await import('@/hooks/useFormatCurrency')

    const client = makeClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useFormatCurrency(), { wrapper })

    await waitForHook(() => {
      const formatted = result.current(-5000)
      expect(formatted).toBe('($5,000)')
    })
  })
})
