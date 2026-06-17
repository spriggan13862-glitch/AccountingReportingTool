import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
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
// Hoisted mock data
// ---------------------------------------------------------------------------

const { MOCK_BRIDGE } = vi.hoisted(() => ({
  MOCK_BRIDGE: {
    entity_id: 1,
    period_end: '2026-03-31',
    scenario_id: null,
    reporting_basis: 'adjusted',
    adjustments: [
      {
        id: 10,
        je_number: 'AJE-001',
        sequence: 1,
        entry_date: '2026-01-15',
        description: 'Bad debt accrual',
        status: 'posted',
        total_debit: 5000,
        total_credit: 5000,
      },
      {
        id: 11,
        je_number: 'AJE-002',
        sequence: 2,
        entry_date: '2026-02-01',
        description: 'Inventory write-down',
        status: 'posted',
        total_debit: 10000,
        total_credit: 10000,
      },
    ],
    rows: [
      {
        row_type: 'section',
        level: 0,
        label: 'Assets',
        account_id: null,
        account_number: null,
        account_name: null,
        account_type: 'asset',
        as_reported: 100000,
        adjustment_impacts: { '10': 5000, '11': 0 },
        total_ajes: 5000,
        adjusted_balance: 105000,
      },
      {
        row_type: 'account',
        level: 1,
        label: 'Accounts Receivable',
        account_id: 1,
        account_number: '1200',
        account_name: 'Accounts Receivable',
        account_type: 'asset',
        as_reported: 100000,
        adjustment_impacts: { '10': 5000, '11': 0 },
        total_ajes: 5000,
        adjusted_balance: 105000,
      },
      {
        row_type: 'section',
        level: 0,
        label: 'Expenses',
        account_id: null,
        account_number: null,
        account_name: null,
        account_type: 'expense',
        as_reported: 0,
        adjustment_impacts: { '10': 0, '11': 10000 },
        total_ajes: 10000,
        adjusted_balance: 10000,
      },
      {
        row_type: 'account',
        level: 1,
        label: 'Bad Debt Expense',
        account_id: 2,
        account_number: '6500',
        account_name: 'Bad Debt Expense',
        account_type: 'expense',
        as_reported: 0,
        adjustment_impacts: { '10': 0, '11': 10000 },
        total_ajes: 10000,
        adjusted_balance: 10000,
      },
    ],
    totals: {
      as_reported: 100000,
      adjustment_impacts: { '10': 5000, '11': 10000 },
      total_ajes: 15000,
      adjusted_balance: 115000,
    },
  },
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/PageLayout', () => ({
  PageLayout: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div><h1>{title}</h1>{children}</div>
  ),
}))
vi.mock('@/components/ui/Breadcrumb', () => ({ Breadcrumb: () => null }))
vi.mock('@/components/ui/LoadingState', () => ({ LoadingState: () => <div>Loading…</div> }))

vi.mock('@/components/ui/EntitySelect', () => ({
  EntitySelect: ({ onChange }: { onChange: (v: number) => void }) => (
    <select data-testid="entity-select" onChange={(e) => onChange(Number(e.target.value))}>
      <option value="">--</option>
      <option value="1">Entity 1</option>
    </select>
  ),
}))

// PeriodSelect is NOT mocked — the real component uses useQuery(['periods-list', entityId])
// with the same cache key as the page's own `periods` query. Waiting for the period
// option to appear in the DOM guarantees both the component and the page's `periods`
// array are populated before we fire the change event.

vi.mock('@/api/periods', () => ({
  periodsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, period_name: 'Q1-2026', start_date: '2026-01-01', end_date: '2026-03-31' },
    ]),
  },
}))

vi.mock('@/api/reportingSettings', () => ({
  reportingSettingsApi: {
    get: vi.fn().mockResolvedValue({ decimal_places: 0, currency_symbol: '$', negative_format: 'parentheses' }),
  },
}))

vi.mock('@/providers/ToastProvider', () => ({ useToast: () => () => {} }))

vi.mock('@/api/adjustmentBridge', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/adjustmentBridge')>()
  return {
    ...original,
    adjustmentBridgeApi: {
      ...original.adjustmentBridgeApi,
      bridge: vi.fn().mockResolvedValue(MOCK_BRIDGE),
      exportBridgeCsv: vi.fn().mockResolvedValue(new Blob(['csv'], { type: 'text/csv' })),
      cpaBridge: vi.fn().mockResolvedValue({ entity_id: 1, period_end: '2026-03-31', scenario_id: null, columns: [], rows: [], totals: { as_reported: 0, ajes: {}, total_ajes: 0, adjusted: 0 } }),
    },
  }
})

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function renderAndSelect() {
  render(wrap(<AdjustmentBridgePage />))
  fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
  // Wait for the real PeriodSelect to show period options (requires periodsApi.list to
  // resolve). Since the page's own `periods` useQuery uses the same cache key
  // ['periods-list', entityId], when these options appear both the PeriodSelect and
  // the page have the period data — so the onChange handler can call periods.find().
  await waitFor(
    () => expect(screen.getByRole('option', { name: /Q1-2026/ })).toBeInTheDocument(),
    { timeout: 3000 },
  )
  fireEvent.change(screen.getByTestId('period-select'), { target: { value: '1' } })
  await waitFor(() => expect(screen.getByTestId('cpa-bridge-table')).toBeInTheDocument(), { timeout: 5000 })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 11: Bridge — section hierarchy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders section header rows for Assets and Expenses', async () => {
    await renderAndSelect()
    expect(screen.getByTestId('section-row-assets')).toBeInTheDocument()
    expect(screen.getByTestId('section-row-expenses')).toBeInTheDocument()
  })

  it('renders account rows with number and name', async () => {
    await renderAndSelect()
    expect(screen.getByText('1200')).toBeInTheDocument()
    expect(screen.getByText('Accounts Receivable')).toBeInTheDocument()
    expect(screen.getByText('6500')).toBeInTheDocument()
    expect(screen.getByText('Bad Debt Expense')).toBeInTheDocument()
  })

  it('renders AJE column headers with sequence prefix', async () => {
    await renderAndSelect()
    expect(screen.getByTestId('aje-col-10')).toBeInTheDocument()
    expect(screen.getByTestId('aje-col-11')).toBeInTheDocument()
    expect(screen.getByText('1 AJE-001')).toBeInTheDocument()
    expect(screen.getByText('2 AJE-002')).toBeInTheDocument()
  })

  it('renders Grand Total row', async () => {
    await renderAndSelect()
    expect(screen.getByText('Grand Total')).toBeInTheDocument()
  })

  it('collapses account rows when section header is clicked', async () => {
    await renderAndSelect()
    expect(screen.getByTestId('account-row-1')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('section-row-assets'))

    await waitFor(() => {
      expect(screen.queryByTestId('account-row-1')).not.toBeInTheDocument()
    })
  })

  it('re-expands section when clicked again', async () => {
    await renderAndSelect()
    fireEvent.click(screen.getByTestId('section-row-assets'))
    await waitFor(() => expect(screen.queryByTestId('account-row-1')).not.toBeInTheDocument())

    fireEvent.click(screen.getByTestId('section-row-assets'))
    await waitFor(() => expect(screen.getByTestId('account-row-1')).toBeInTheDocument())
  })
})

describe('Phase 11: Bridge — AJE column header click opens summary panel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens AJE summary panel when column header is clicked', async () => {
    await renderAndSelect()
    fireEvent.click(screen.getByTestId('aje-col-10'))
    await waitFor(() => expect(screen.getByTestId('aje-summary-panel')).toBeInTheDocument())
    expect(screen.getByText('Bad debt accrual')).toBeInTheDocument()
  })
})

describe('Phase 11: Bridge — account row click opens drilldown panel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens account drilldown panel when account row is clicked', async () => {
    await renderAndSelect()
    fireEvent.click(screen.getByTestId('account-row-1'))
    await waitFor(() => expect(screen.getByTestId('account-drilldown-panel')).toBeInTheDocument())
  })
})

describe('Phase 11: Bridge — search filter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters account rows by account name', async () => {
    await renderAndSelect()
    const search = screen.getByTestId('bridge-search')
    fireEvent.change(search, { target: { value: 'receivable' } })

    await waitFor(() => {
      expect(screen.queryByText('Bad Debt Expense')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Accounts Receivable')).toBeInTheDocument()
  })
})

describe('Phase 11: Bridge — basis selector', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the reporting basis selector', async () => {
    await renderAndSelect()
    expect(screen.getByTestId('basis-select')).toBeInTheDocument()
  })

  it('changes basis to pro_forma and re-fetches', async () => {
    await renderAndSelect()
    const { adjustmentBridgeApi } = await import('@/api/adjustmentBridge')
    const basisSelect = screen.getByTestId('basis-select') as HTMLSelectElement
    fireEvent.change(basisSelect, { target: { value: 'pro_forma' } })

    await waitFor(() => {
      expect(adjustmentBridgeApi.bridge).toHaveBeenCalledWith(
        expect.objectContaining({ reporting_basis: 'pro_forma' }),
      )
    })
  })
})

describe('Phase 11: Bridge — export CSV button', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders export CSV button when entity/period selected', async () => {
    await renderAndSelect()
    expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument()
  })
})
