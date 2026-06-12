import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FinancialImpactWorkspacePage } from '@/pages/FinancialImpactWorkspacePage'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: vi.fn(),
}))

vi.mock('@/api/reporting', () => ({
  reportingApi: {
    trialBalance: vi.fn(),
    taxonomyBalanceSheet: vi.fn(),
    taxonomyIncomeStatement: vi.fn(),
  },
}))

vi.mock('@/api/financialStatements', () => ({
  financialStatementsApi: {
    getDrilldown: vi.fn(),
    getCashFlow: vi.fn(),
  },
}))

vi.mock('@/api/overlay', () => ({
  overlayApi: {},
}))

vi.mock('@/api/periodGovernance', () => ({
  periodGovernanceApi: {
    buildComparativeReport: vi.fn(),
  },
}))

vi.mock('@/api/adjustmentWorkspace', () => ({
  adjustmentWorkspaceApi: {
    rollforward: vi.fn(),
  },
}))

vi.mock('@/components/ui/EntitySelect', () => ({
  EntitySelect: ({ value, onChange }: { value: number | ''; onChange: (v: number | '') => void }) => (
    <select
      data-testid="entity-select"
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
    >
      <option value="">Select entity…</option>
      <option value="1">Acme Corp</option>
    </select>
  ),
}))

vi.mock('@/components/ui/ScenarioSelect', () => ({
  ScenarioSelect: ({ value, onChange, placeholder }: { value: number | ''; onChange: (v: number | '') => void; placeholder: string }) => (
    <select
      data-testid={`scenario-select-${placeholder?.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-+$/, '')}`}
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
    >
      <option value="">{placeholder}</option>
      <option value="1">Book Scenario</option>
      <option value="2">Adj Scenario</option>
    </select>
  ),
}))

vi.mock('@/components/ui/PeriodSelect', () => ({
  PeriodSelect: ({ value, onChange }: { value: number | ''; onChange: (v: number | '') => void }) => (
    <select
      data-testid="period-select"
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
    >
      <option value="">Select period</option>
      <option value="1">Q1 2024</option>
    </select>
  ),
}))

vi.mock('@/components/ui/PageLayout', () => ({
  PageLayout: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))

vi.mock('@/components/ui/Breadcrumb', () => ({
  Breadcrumb: () => <nav />,
}))

vi.mock('@/components/reports/DrilldownPanel', () => ({
  DrilldownPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="drilldown-panel">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}))

vi.mock('@/pages/FinancialStatementsPage', () => ({
  TaxonomyTable: ({ rows, isLoading }: { rows: unknown[]; isLoading: boolean }) => (
    <div data-testid="taxonomy-table">
      {isLoading ? 'Loading…' : `${rows.length} rows`}
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockTbRows = [
  { account_id: 1, account_number: '1000', account_name: 'Cash', account_type: 'asset', signed_balance: '50000' },
  { account_id: 2, account_number: '4000', account_name: 'Revenue', account_type: 'revenue', signed_balance: '100000' },
  { account_id: 3, account_number: '5000', account_name: 'COGS', account_type: 'expense', signed_balance: '60000' },
  { account_id: 4, account_number: '2000', account_name: 'Accounts Payable', account_type: 'liability', signed_balance: '20000' },
  { account_id: 5, account_number: '3000', account_name: 'Retained Earnings', account_type: 'equity', signed_balance: '30000' },
]

const mockTaxonomyRows = [
  { taxonomy_id: 1, name: 'Revenue', display_balance: '100000', account_count: 1, is_subtotal: false, hierarchy_depth: 1, section: 'IS' },
  { taxonomy_id: 2, name: 'COGS', display_balance: '60000', account_count: 1, is_subtotal: false, hierarchy_depth: 1, section: 'IS' },
]

const mockRollforwardRows = [
  { account_id: 1, account_number: '4000', account_name: 'Revenue', account_type: 'revenue', as_reported: 100000, adjustments: 5000, adjusted: 105000 },
  { account_id: 2, account_number: '5000', account_name: 'COGS', account_type: 'expense', as_reported: 60000, adjustments: -2000, adjusted: 58000 },
  { account_id: 3, account_number: '1000', account_name: 'Cash', account_type: 'asset', as_reported: 50000, adjustments: 0, adjusted: 50000 },
]

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FinancialImpactWorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FinancialImpactWorkspacePage — structure', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useOrg } = await import('@/providers/OrgProvider')
    vi.mocked(useOrg).mockReturnValue({ org: { id: 'acme', name: 'Acme' } } as ReturnType<typeof useOrg>)
    const { reportingApi } = await import('@/api/reporting')
    vi.mocked(reportingApi.trialBalance).mockResolvedValue(mockTbRows as never)
    vi.mocked(reportingApi.taxonomyBalanceSheet).mockResolvedValue(mockTaxonomyRows as never)
    vi.mocked(reportingApi.taxonomyIncomeStatement).mockResolvedValue(mockTaxonomyRows as never)
    const { adjustmentWorkspaceApi } = await import('@/api/adjustmentWorkspace')
    vi.mocked(adjustmentWorkspaceApi.rollforward).mockResolvedValue(mockRollforwardRows as never)
  })

  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Financial Impact Workspace' })).toBeInTheDocument()
  })

  it('renders context bar with entity, date, and scenario controls', () => {
    renderPage()
    expect(screen.getByTestId('workspace-context-bar')).toBeInTheDocument()
    expect(screen.getByTestId('entity-select')).toBeInTheDocument()
    expect(screen.getByTestId('as-of-date-input')).toBeInTheDocument()
  })

  it('renders KPI strip', () => {
    renderPage()
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument()
  })

  it('renders all 5 KPI cards', () => {
    renderPage()
    expect(screen.getByTestId('kpi-card-net-income')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-card-ebitda')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-card-total-assets')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-card-total-liabilities')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-card-total-equity')).toBeInTheDocument()
  })

  it('renders 4 workspace tabs', () => {
    renderPage()
    expect(screen.getByTestId('workspace-tabs')).toBeInTheDocument()
    expect(screen.getByTestId('tab-statements')).toBeInTheDocument()
    expect(screen.getByTestId('tab-trial-balance')).toBeInTheDocument()
    expect(screen.getByTestId('tab-comparatives')).toBeInTheDocument()
    expect(screen.getByTestId('tab-variance')).toBeInTheDocument()
  })

  it('shows empty state before entity is selected', () => {
    renderPage()
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('renders scenario mode toggle', () => {
    renderPage()
    expect(screen.getByTestId('scenario-mode-toggle')).toBeInTheDocument()
  })

  it('renders all 4 scenario mode buttons', () => {
    renderPage()
    expect(screen.getByTestId('scenario-mode-as_reported')).toBeInTheDocument()
    expect(screen.getByTestId('scenario-mode-draft_adjusted')).toBeInTheDocument()
    expect(screen.getByTestId('scenario-mode-posted_adjusted')).toBeInTheDocument()
    expect(screen.getByTestId('scenario-mode-pro_forma')).toBeInTheDocument()
  })

  it('as_reported is the default active mode', () => {
    renderPage()
    const btn = screen.getByTestId('scenario-mode-as_reported')
    expect(btn.className).toContain('bg-indigo-600')
  })
})

describe('FinancialImpactWorkspacePage — entity selection activates content', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useOrg } = await import('@/providers/OrgProvider')
    vi.mocked(useOrg).mockReturnValue({ org: { id: 'acme', name: 'Acme' } } as ReturnType<typeof useOrg>)
    const { reportingApi } = await import('@/api/reporting')
    vi.mocked(reportingApi.trialBalance).mockResolvedValue(mockTbRows as never)
    vi.mocked(reportingApi.taxonomyBalanceSheet).mockResolvedValue(mockTaxonomyRows as never)
    vi.mocked(reportingApi.taxonomyIncomeStatement).mockResolvedValue(mockTaxonomyRows as never)
    const { adjustmentWorkspaceApi } = await import('@/api/adjustmentWorkspace')
    vi.mocked(adjustmentWorkspaceApi.rollforward).mockResolvedValue(mockRollforwardRows as never)
  })

  function selectEntity() {
    const sel = screen.getByTestId('entity-select')
    fireEvent.change(sel, { target: { value: '1' } })
  }

  it('hides empty state after entity selected', async () => {
    renderPage()
    selectEntity()
    await waitFor(() => expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument())
  })

  it('shows statements tab content after entity selected', async () => {
    renderPage()
    selectEntity()
    await waitFor(() => expect(screen.getByTestId('statements-tab')).toBeInTheDocument())
  })

  it('statements tab renders IS/BS/CF sub-tabs', async () => {
    renderPage()
    selectEntity()
    await waitFor(() => expect(screen.getByTestId('stmt-tab-IS')).toBeInTheDocument())
    expect(screen.getByTestId('stmt-tab-BS')).toBeInTheDocument()
    expect(screen.getByTestId('stmt-tab-CF')).toBeInTheDocument()
  })

  it('can switch to trial balance tab', async () => {
    renderPage()
    selectEntity()
    await waitFor(() => screen.getByTestId('tab-trial-balance'))
    fireEvent.click(screen.getByTestId('tab-trial-balance'))
    await waitFor(() => expect(screen.getByTestId('trial-balance-tab')).toBeInTheDocument())
  })

  it('trial balance tab renders type filter and grid', async () => {
    renderPage()
    selectEntity()
    await waitFor(() => screen.getByTestId('tab-trial-balance'))
    fireEvent.click(screen.getByTestId('tab-trial-balance'))
    await waitFor(() => expect(screen.getByTestId('tb-grid')).toBeInTheDocument())
    expect(screen.getByTestId('tb-type-filter')).toBeInTheDocument()
  })

  it('can switch to comparatives tab', async () => {
    renderPage()
    selectEntity()
    await waitFor(() => screen.getByTestId('tab-comparatives'))
    fireEvent.click(screen.getByTestId('tab-comparatives'))
    await waitFor(() => expect(screen.getByTestId('comparatives-tab')).toBeInTheDocument())
  })

  it('can switch to variance tab', async () => {
    renderPage()
    selectEntity()
    await waitFor(() => screen.getByTestId('tab-variance'))
    fireEvent.click(screen.getByTestId('tab-variance'))
    await waitFor(() => expect(screen.getByTestId('variance-tab')).toBeInTheDocument())
  })

  it('variance tab renders grid', async () => {
    renderPage()
    selectEntity()
    await waitFor(() => screen.getByTestId('tab-variance'))
    fireEvent.click(screen.getByTestId('tab-variance'))
    await waitFor(() => expect(screen.getByTestId('variance-grid')).toBeInTheDocument(), { timeout: 3000 })
  })

  it('variance tab shows accounts with non-zero adjustments', async () => {
    renderPage()
    selectEntity()
    await waitFor(() => screen.getByTestId('tab-variance'))
    fireEvent.click(screen.getByTestId('tab-variance'))
    await waitFor(() => screen.getByTestId('variance-grid'), { timeout: 3000 })
    expect(screen.getAllByText('Revenue').length).toBeGreaterThan(0)
    expect(screen.getAllByText('COGS').length).toBeGreaterThan(0)
    // Cash has 0 adjustments — should not appear
    expect(screen.queryByText('Cash')).not.toBeInTheDocument()
  })
})

describe('FinancialImpactWorkspacePage — scenario mode toggle', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useOrg } = await import('@/providers/OrgProvider')
    vi.mocked(useOrg).mockReturnValue({ org: { id: 'acme', name: 'Acme' } } as ReturnType<typeof useOrg>)
    const { reportingApi } = await import('@/api/reporting')
    vi.mocked(reportingApi.trialBalance).mockResolvedValue(mockTbRows as never)
    vi.mocked(reportingApi.taxonomyBalanceSheet).mockResolvedValue(mockTaxonomyRows as never)
    vi.mocked(reportingApi.taxonomyIncomeStatement).mockResolvedValue(mockTaxonomyRows as never)
    const { adjustmentWorkspaceApi } = await import('@/api/adjustmentWorkspace')
    vi.mocked(adjustmentWorkspaceApi.rollforward).mockResolvedValue(mockRollforwardRows as never)
  })

  it('clicking draft_adjusted mode highlights that button', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('scenario-mode-draft_adjusted'))
    expect(screen.getByTestId('scenario-mode-draft_adjusted').className).toContain('bg-indigo-600')
    expect(screen.getByTestId('scenario-mode-as_reported').className).not.toContain('bg-indigo-600')
  })

  it('clicking posted_adjusted mode highlights that button', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('scenario-mode-posted_adjusted'))
    expect(screen.getByTestId('scenario-mode-posted_adjusted').className).toContain('bg-indigo-600')
  })

  it('clicking pro_forma mode highlights that button', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('scenario-mode-pro_forma'))
    expect(screen.getByTestId('scenario-mode-pro_forma').className).toContain('bg-indigo-600')
  })

  it('can cycle back to as_reported', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('scenario-mode-draft_adjusted'))
    fireEvent.click(screen.getByTestId('scenario-mode-as_reported'))
    expect(screen.getByTestId('scenario-mode-as_reported').className).toContain('bg-indigo-600')
  })
})

describe('FinancialImpactWorkspacePage — KPI computation', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useOrg } = await import('@/providers/OrgProvider')
    vi.mocked(useOrg).mockReturnValue({ org: { id: 'acme', name: 'Acme' } } as ReturnType<typeof useOrg>)
    const { reportingApi } = await import('@/api/reporting')
    vi.mocked(reportingApi.trialBalance).mockResolvedValue(mockTbRows as never)
    vi.mocked(reportingApi.taxonomyBalanceSheet).mockResolvedValue(mockTaxonomyRows as never)
    vi.mocked(reportingApi.taxonomyIncomeStatement).mockResolvedValue(mockTaxonomyRows as never)
    const { adjustmentWorkspaceApi } = await import('@/api/adjustmentWorkspace')
    vi.mocked(adjustmentWorkspaceApi.rollforward).mockResolvedValue(mockRollforwardRows as never)
  })

  it('KPI card headers are present', async () => {
    renderPage()
    const entitySel = screen.getByTestId('entity-select')
    fireEvent.change(entitySel, { target: { value: '1' } })
    await waitFor(() => {
      expect(screen.getByTestId('kpi-card-net-income')).toBeInTheDocument()
    })
    // Verify label text appears in the card
    expect(screen.getByTestId('kpi-card-net-income').textContent).toContain('Net Income')
    expect(screen.getByTestId('kpi-card-ebitda').textContent).toContain('EBITDA')
    expect(screen.getByTestId('kpi-card-total-assets').textContent).toContain('Total Assets')
  })

  it('KPI cards each show Book / Adjusted / Variance columns', async () => {
    renderPage()
    const entitySel = screen.getByTestId('entity-select')
    fireEvent.change(entitySel, { target: { value: '1' } })
    await waitFor(() => screen.getByTestId('kpi-card-net-income'))
    const niCard = screen.getByTestId('kpi-card-net-income')
    expect(niCard.textContent).toContain('Book')
    expect(niCard.textContent).toContain('Adjusted')
    expect(niCard.textContent).toContain('Variance')
  })
})
