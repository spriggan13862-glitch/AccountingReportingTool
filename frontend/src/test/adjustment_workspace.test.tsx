import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { AdjustmentWorkspacePage } from '@/pages/AdjustmentWorkspacePage'
import type { AdjustmentListItem, AdjustmentPackage, AdjustmentImpact } from '@/api/adjustmentWorkspace'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={['/workbench/adjustment-workspace']}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockImpact: AdjustmentImpact = {
  ni_impact: 50000,
  ebitda_impact: 50000,
  asset_impact: 0,
  liability_impact: -50000,
  equity_impact: 50000,
}

const mockItems: AdjustmentListItem[] = [
  {
    id: 1,
    je_number: 'JE-001',
    entry_date: '2026-01-15',
    entity_id: 1,
    scenario_id: 1,
    description: 'Accrue bonus liability',
    source: 'manual',
    status: 'draft',
    overlay_group: 'accrual',
    materiality: 'material',
    total_debit: 50000,
    impact: mockImpact,
    package_ids: [10],
    has_advisor_note: true,
    advisor_resolution_status: 'open',
    lines: [
      { line_number: 1, account_id: 101, account_number: '6100', account_name: 'Bonus Expense', debit: 50000, credit: 0, description: null },
      { line_number: 2, account_id: 102, account_number: '2100', account_name: 'Accrued Liabilities', debit: 0, credit: 50000, description: null },
    ],
  },
  {
    id: 2,
    je_number: 'JE-002',
    entry_date: '2026-01-20',
    entity_id: 1,
    scenario_id: 1,
    description: 'Eliminate intercompany revenue',
    source: 'manual',
    status: 'posted',
    overlay_group: 'elimination',
    materiality: 'critical',
    total_debit: 120000,
    impact: { ni_impact: -120000, ebitda_impact: -120000, asset_impact: 0, liability_impact: 0, equity_impact: -120000 },
    package_ids: [],
    has_advisor_note: false,
    advisor_resolution_status: null,
    lines: [
      { line_number: 1, account_id: 103, account_number: '4000', account_name: 'Revenue', debit: 120000, credit: 0, description: null },
      { line_number: 2, account_id: 104, account_number: '1300', account_name: 'Intercompany AR', debit: 0, credit: 120000, description: null },
    ],
  },
  {
    id: 3,
    je_number: 'JE-003',
    entry_date: '2026-02-01',
    entity_id: 1,
    scenario_id: 1,
    description: 'Tax provision adjustment',
    source: 'manual',
    status: 'posted',
    overlay_group: 'tax',
    materiality: null,
    total_debit: 8000,
    impact: { ni_impact: 0, ebitda_impact: 0, asset_impact: 0, liability_impact: 0, equity_impact: 0 },
    package_ids: [],
    has_advisor_note: false,
    advisor_resolution_status: null,
    lines: [],
  },
]

const mockPackages: AdjustmentPackage[] = [
  {
    id: 10,
    organization_id: 'default-org',
    name: 'Q1 Audit Pack',
    package_type: 'audit',
    status: 'open',
    description: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: null,
    member_count: 1,
  },
]

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/adjustmentWorkspace', () => ({
  adjustmentWorkspaceApi: {
    listAdjustments: vi.fn(),
    setMateriality: vi.fn(),
    listPackages: vi.fn(),
    createPackage: vi.fn(),
    deletePackage: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    getNotes: vi.fn(),
    upsertNotes: vi.fn(),
    impactPreview: vi.fn(),
    rollforward: vi.fn(),
  },
}))

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, email: 'test@test.com', is_superuser: false, organization_id: 'default-org' },
    token: 'tok',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  })),
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}))

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: vi.fn(() => ({ org: { id: 'default-org', name: 'Default Org' } })),
}))

vi.mock('@/components/ui/WorkspaceCrossLinks', () => ({
  WorkspaceCrossLinks: () => null,
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: { list: vi.fn().mockResolvedValue([{ id: 1, name: 'Test Entity' }]) },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdjustmentWorkspacePage — Sprint 3.6', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { adjustmentWorkspaceApi } = await import('@/api/adjustmentWorkspace')
    vi.mocked(adjustmentWorkspaceApi.listAdjustments).mockResolvedValue(mockItems)
    vi.mocked(adjustmentWorkspaceApi.listPackages).mockResolvedValue(mockPackages)
    vi.mocked(adjustmentWorkspaceApi.setMateriality).mockResolvedValue({ id: 1, materiality: 'critical' })
    vi.mocked(adjustmentWorkspaceApi.createPackage).mockResolvedValue({ ...mockPackages[0], id: 11, name: 'New Package' })
    vi.mocked(adjustmentWorkspaceApi.deletePackage).mockResolvedValue(undefined)
    vi.mocked(adjustmentWorkspaceApi.addMember).mockResolvedValue({ package_id: 10, journal_entry_id: 2, added: true })
    vi.mocked(adjustmentWorkspaceApi.removeMember).mockResolvedValue(undefined)
    vi.mocked(adjustmentWorkspaceApi.getNotes).mockResolvedValue(null)
    vi.mocked(adjustmentWorkspaceApi.upsertNotes).mockResolvedValue({ id: 1, journal_entry_id: 1, issue: 'Test issue', recommendation: null, client_response: null, resolution_status: 'open', updated_at: null, created_at: '2026-01-01T00:00:00' })
    vi.mocked(adjustmentWorkspaceApi.impactPreview).mockResolvedValue(mockImpact)
    vi.mocked(adjustmentWorkspaceApi.rollforward).mockResolvedValue([
      { account_id: 101, account_number: '1000', account_name: 'Cash', account_type: 'asset', as_reported: 500000, adjustments: 50000, adjusted: 550000 },
    ])
  })

  it('renders the page title', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    expect(await screen.findByRole('heading', { name: 'Adjustment Workbench' })).toBeInTheDocument()
  })

  it('renders the adjustment grid with rows', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    expect(await screen.findByTestId('adjustment-grid')).toBeInTheDocument()
    expect(await screen.findByText('JE-001')).toBeInTheDocument()
    expect(await screen.findByText('JE-002')).toBeInTheDocument()
    expect(await screen.findByText('JE-003')).toBeInTheDocument()
  })

  it('shows KPI strip with correct counts', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    const strip = await screen.findByTestId('workspace-kpi-strip')
    expect(strip).toBeInTheDocument()
    expect(screen.getByText('Total Adjustments')).toBeInTheDocument()
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0)
    expect(screen.getByText('Material / Critical')).toBeInTheDocument()
  })

  it('renders filters bar', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    expect(await screen.findByTestId('workspace-filters')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-search')).toBeInTheDocument()
    expect(screen.getByTestId('filter-status')).toBeInTheDocument()
    expect(screen.getByTestId('filter-materiality')).toBeInTheDocument()
    expect(screen.getByTestId('filter-overlay')).toBeInTheDocument()
  })

  it('shows materiality badges for material and critical items', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await screen.findByTestId('adjustment-grid')
    expect(screen.getAllByText('Material').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Critical').length).toBeGreaterThan(0)
  })

  it('shows status dots (draft row)', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await screen.findByText('JE-001')
    // status column shows 'draft' text
    const draftTexts = screen.getAllByText('draft')
    expect(draftTexts.length).toBeGreaterThan(0)
  })

  it('opens the packages panel when toggle button clicked', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await screen.findByTestId('toggle-packages-btn')
    fireEvent.click(screen.getByTestId('toggle-packages-btn'))
    expect(await screen.findByTestId('package-panel')).toBeInTheDocument()
    expect(screen.getAllByText('Q1 Audit Pack').length).toBeGreaterThan(0)
  })

  it('shows package count badge on packages button', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    // wait for packages to load — the badge renders once data is available
    await waitFor(() => {
      const btn = screen.getByTestId('toggle-packages-btn')
      expect(btn.textContent).toContain('1')
    })
  })

  it('can create a new package', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await screen.findByTestId('toggle-packages-btn')
    fireEvent.click(screen.getByTestId('toggle-packages-btn'))
    await screen.findByTestId('package-name-input')
    fireEvent.change(screen.getByTestId('package-name-input'), { target: { value: 'New Audit Package' } })
    fireEvent.click(screen.getByTestId('create-package-btn'))
    const { adjustmentWorkspaceApi } = await import('@/api/adjustmentWorkspace')
    await waitFor(() => {
      expect(adjustmentWorkspaceApi.createPackage).toHaveBeenCalledWith({
        name: 'New Audit Package',
        package_type: 'audit',
      })
    })
  })

  it('JE lines are expanded inline by default', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await screen.findByTestId('adjustment-grid')
    // JE-001 has 2 lines with account numbers 6100 and 2100
    expect(await screen.findByText('6100')).toBeInTheDocument()
    expect(await screen.findByText('2100')).toBeInTheDocument()
    expect(await screen.findByText('Bonus Expense')).toBeInTheDocument()
    expect(await screen.findByText('Accrued Liabilities')).toBeInTheDocument()
  })

  it('JE lines collapse when chevron clicked', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await screen.findByTestId('adjustment-grid')
    // Verify lines are visible
    expect(await screen.findByText('6100')).toBeInTheDocument()
    // Click the collapse chevron on the first JE row (JE-001)
    const collapseButtons = await screen.findAllByLabelText('Collapse lines')
    fireEvent.click(collapseButtons[0])
    await waitFor(() => {
      expect(screen.queryByText('6100')).not.toBeInTheDocument()
    })
  })

  it('multi-select bar appears when rows selected', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await screen.findByTestId('adjustment-grid')
    const checkboxes = screen.getAllByRole('checkbox')
    // first is select-all, rest are row checkboxes
    fireEvent.click(checkboxes[1])
    expect(await screen.findByTestId('multi-impact-bar')).toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('select-all selects all rows', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await screen.findByTestId('adjustment-grid')
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // select-all
    expect(await screen.findByTestId('multi-impact-bar')).toBeInTheDocument()
    expect(screen.getByText('3 selected')).toBeInTheDocument()
  })

  it('shows Source column with manual value', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    await screen.findByTestId('adjustment-grid')
    expect((await screen.findAllByText('manual')).length).toBeGreaterThan(0)
  })

  it('packages button opens package panel', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    fireEvent.click(await screen.findByTestId('toggle-packages-btn'))
    expect(await screen.findByTestId('package-panel')).toBeInTheDocument()
  })

  it('New Adjustment button is present', async () => {
    render(wrap(<AdjustmentWorkspacePage />))
    expect(await screen.findByText('New Adjustment')).toBeInTheDocument()
  })

  it('adjustments group nav has adjustments item', async () => {
    const { NAV_GROUPS } = await import('@/config/nav')
    const g = NAV_GROUPS.find((g) => g.id === 'review-adjust')
    expect(g).toBeDefined()
    expect(g!.items.find((i) => i.id === 'adjustments')).toBeDefined()
  })

  it('adjustments nav item points to /adjustments', async () => {
    const { NAV_GROUPS } = await import('@/config/nav')
    const g = NAV_GROUPS.find((g) => g.id === 'review-adjust')
    const item = g!.items.find((i) => i.id === 'adjustments')
    expect(item!.to).toBe('/adjustments')
  })

  it('adjustments group has 5 items', async () => {
    const { NAV_GROUPS } = await import('@/config/nav')
    const g = NAV_GROUPS.find((g) => g.id === 'review-adjust')
    expect(g!.items.length).toBe(5)
  })
})
