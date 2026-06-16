import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeliverablesWorkspacePage } from '@/pages/DeliverablesWorkspacePage'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/deliverableWorkspace', () => ({
  deliverableWorkspaceApi: {
    getDashboard: vi.fn(),
    listPackages: vi.fn(),
    createPackage: vi.fn(),
    updatePackage: vi.fn(),
    deletePackage: vi.fn(),
    clonePackage: vi.fn(),
    listItems: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    listMemos: vi.fn(),
    createMemo: vi.fn(),
    updateMemo: vi.fn(),
    deleteMemo: vi.fn(),
    exportPackageExcel: vi.fn(),
    exportAdjustmentListingExcel: vi.fn(),
  },
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

vi.mock('@/components/ui/WorkspaceCrossLinks', () => ({
  WorkspaceCrossLinks: () => null,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockDashboard = {
  total_packages: 5,
  draft_count: 2,
  internal_review_count: 1,
  client_review_count: 1,
  finalized_count: 1,
  archived_count: 0,
}

const mockPackages = [
  {
    id: 1,
    organization_id: 'acme',
    name: 'Q1 Audit Package',
    package_type: 'audit',
    status: 'draft',
    description: 'Quarterly audit deliverable',
    owner: 'Jane Advisor',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: null,
    item_count: 3,
    memo_count: 1,
  },
  {
    id: 2,
    organization_id: 'acme',
    name: 'Management Summary',
    package_type: 'management',
    status: 'finalized',
    description: null,
    owner: null,
    created_at: '2024-01-20T10:00:00Z',
    updated_at: null,
    item_count: 0,
    memo_count: 0,
  },
]

const mockItems = [
  { id: 10, package_id: 1, item_type: 'journal_entry', item_ref: 'JE-001', item_label: 'Accrue bonus', added_at: '2024-01-15T10:00:00Z' },
  { id: 11, package_id: 1, item_type: 'report', item_ref: 'RPT-42', item_label: 'Income Statement', added_at: '2024-01-15T11:00:00Z' },
]

const mockMemos = [
  {
    id: 20,
    package_id: 1,
    issue: 'Bonus accrual timing',
    observation: 'Expense should be Q1',
    recommendation: 'Adjust to Q1',
    client_response: null,
    status: 'open',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: null,
  },
]

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DeliverablesWorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupMocks() {
  const { deliverableWorkspaceApi } = await import('@/api/deliverableWorkspace')
  vi.mocked(deliverableWorkspaceApi.getDashboard).mockResolvedValue(mockDashboard)
  vi.mocked(deliverableWorkspaceApi.listPackages).mockResolvedValue(mockPackages)
  vi.mocked(deliverableWorkspaceApi.listItems).mockResolvedValue(mockItems)
  vi.mocked(deliverableWorkspaceApi.listMemos).mockResolvedValue(mockMemos)
  vi.mocked(deliverableWorkspaceApi.createPackage).mockResolvedValue({ ...mockPackages[0], id: 99 })
  vi.mocked(deliverableWorkspaceApi.updatePackage).mockResolvedValue(mockPackages[0])
  vi.mocked(deliverableWorkspaceApi.deletePackage).mockResolvedValue(undefined)
  vi.mocked(deliverableWorkspaceApi.clonePackage).mockResolvedValue({ ...mockPackages[0], id: 100, name: 'Q1 Audit Package (Copy)' })
  vi.mocked(deliverableWorkspaceApi.addItem).mockResolvedValue(mockItems[0])
  vi.mocked(deliverableWorkspaceApi.removeItem).mockResolvedValue(undefined)
  vi.mocked(deliverableWorkspaceApi.createMemo).mockResolvedValue(mockMemos[0])
  vi.mocked(deliverableWorkspaceApi.deleteMemo).mockResolvedValue(undefined)
  vi.mocked(deliverableWorkspaceApi.exportPackageExcel).mockReturnValue('/api/v1/deliverable-workspace/packages/1/export/excel')
  vi.mocked(deliverableWorkspaceApi.exportAdjustmentListingExcel).mockReturnValue('/api/v1/deliverable-workspace/exports/adjustment-listing/excel')
}

// ---------------------------------------------------------------------------
// Tests — structure
// ---------------------------------------------------------------------------

describe('DeliverablesWorkspacePage — page structure', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await setupMocks()
  })

  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Deliverables Workspace' })).toBeInTheDocument()
  })

  it('renders 3 workspace tabs', () => {
    renderPage()
    expect(screen.getByTestId('workspace-tabs')).toBeInTheDocument()
    expect(screen.getByTestId('tab-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('tab-packages')).toBeInTheDocument()
    expect(screen.getByTestId('tab-exports')).toBeInTheDocument()
  })

  it('dashboard tab is active by default', () => {
    renderPage()
    expect(screen.getByTestId('tab-dashboard').className).toContain('border-indigo-600')
  })

  it('renders dashboard tab content by default', () => {
    renderPage()
    expect(screen.getByTestId('dashboard-tab')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Tests — dashboard tab
// ---------------------------------------------------------------------------

describe('DeliverablesWorkspacePage — dashboard tab', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await setupMocks()
  })

  it('renders dashboard metrics cards', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('dashboard-metrics')).toBeInTheDocument())
    expect(screen.getByTestId('metric-total')).toBeInTheDocument()
    expect(screen.getByTestId('metric-draft')).toBeInTheDocument()
    expect(screen.getByTestId('metric-finalized')).toBeInTheDocument()
  })

  it('shows total packages count', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('metric-total').textContent).toContain('5'))
  })

  it('shows draft count', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('metric-draft').textContent).toContain('2'))
  })

  it('renders quick action buttons', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('quick-actions')).toBeInTheDocument())
    expect(screen.getByTestId('quick-create-advisor')).toBeInTheDocument()
    expect(screen.getByTestId('quick-create-audit')).toBeInTheDocument()
    expect(screen.getByTestId('quick-create-management')).toBeInTheDocument()
    expect(screen.getByTestId('quick-create-tax')).toBeInTheDocument()
  })

  it('clicking quick action switches to packages tab', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('quick-create-advisor'))
    fireEvent.click(screen.getByTestId('quick-create-advisor'))
    await waitFor(() => expect(screen.getByTestId('packages-tab')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Tests — packages tab
// ---------------------------------------------------------------------------

describe('DeliverablesWorkspacePage — packages tab', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await setupMocks()
  })

  function goToPackages() {
    fireEvent.click(screen.getByTestId('tab-packages'))
  }

  it('renders packages tab with package list', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => expect(screen.getByTestId('packages-tab')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('packages-list')).toBeInTheDocument())
  })

  it('renders package rows with name and type', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('package-row-1'))
    expect(screen.getAllByText('Q1 Audit Package').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Management Summary').length).toBeGreaterThan(0)
  })

  it('shows package item and memo counts', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('package-row-1'))
    const row1 = screen.getByTestId('package-row-1')
    expect(row1.textContent).toContain('3 items')
    expect(row1.textContent).toContain('1 memo')
  })

  it('renders search and filter controls', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('packages-tab'))
    expect(screen.getByTestId('pkg-search')).toBeInTheDocument()
    expect(screen.getByTestId('pkg-status-filter')).toBeInTheDocument()
    expect(screen.getByTestId('pkg-type-filter')).toBeInTheDocument()
  })

  it('renders create package button', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('create-package-btn'))
    expect(screen.getByTestId('create-package-btn')).toBeInTheDocument()
  })

  it('clicking create package shows the form', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('create-package-btn'))
    fireEvent.click(screen.getByTestId('create-package-btn'))
    await waitFor(() => expect(screen.getByTestId('package-form')).toBeInTheDocument())
    expect(screen.getByTestId('pkg-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('pkg-type-select')).toBeInTheDocument()
  })

  it('cancel hides the create form', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('create-package-btn'))
    fireEvent.click(screen.getByTestId('create-package-btn'))
    await waitFor(() => screen.getByTestId('pkg-cancel-btn'))
    fireEvent.click(screen.getByTestId('pkg-cancel-btn'))
    await waitFor(() => expect(screen.queryByTestId('package-form')).not.toBeInTheDocument())
  })

  it('shows edit, clone, delete buttons per row', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('package-row-1'))
    expect(screen.getByTestId('edit-pkg-1')).toBeInTheDocument()
    expect(screen.getByTestId('clone-pkg-1')).toBeInTheDocument()
    expect(screen.getByTestId('delete-pkg-1')).toBeInTheDocument()
  })

  it('clicking a package row opens the detail panel', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('package-row-1'))
    fireEvent.click(screen.getByTestId('package-row-1'))
    await waitFor(() => expect(screen.getByTestId('package-detail-panel')).toBeInTheDocument())
  })

  it('detail panel shows package name', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('package-row-1'))
    fireEvent.click(screen.getByTestId('package-row-1'))
    await waitFor(() => screen.getByTestId('package-detail-panel'))
    expect(screen.getByTestId('package-detail-panel').textContent).toContain('Q1 Audit Package')
  })

  it('detail panel has contents and memos sections', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('package-row-1'))
    fireEvent.click(screen.getByTestId('package-row-1'))
    await waitFor(() => screen.getByTestId('package-detail-panel'))
    expect(screen.getByTestId('detail-section-contents')).toBeInTheDocument()
    expect(screen.getByTestId('detail-section-memos')).toBeInTheDocument()
  })

  it('contents section loads and shows add-item button', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('package-row-1'))
    fireEvent.click(screen.getByTestId('package-row-1'))
    await waitFor(() => expect(screen.getByTestId('contents-section')).toBeInTheDocument(), { timeout: 5000 })
    // The "Add Item" button is always present in the contents section
    await waitFor(() => expect(screen.getByTestId('add-item-btn')).toBeInTheDocument())
  })

  it('switching to memos section shows advisor memos', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('package-row-1'))
    fireEvent.click(screen.getByTestId('package-row-1'))
    await waitFor(() => screen.getByTestId('detail-section-memos'))
    fireEvent.click(screen.getByTestId('detail-section-memos'))
    await waitFor(() => expect(screen.getByTestId('memos-section')).toBeInTheDocument())
    expect(screen.getAllByText(/Bonus accrual timing/).length).toBeGreaterThan(0)
  })

  it('detail panel has export button', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('package-row-1'))
    fireEvent.click(screen.getByTestId('package-row-1'))
    await waitFor(() => screen.getByTestId('export-package-btn'))
    expect(screen.getByTestId('export-package-btn')).toBeInTheDocument()
  })

  it('closing detail panel removes it', async () => {
    renderPage()
    goToPackages()
    await waitFor(() => screen.getByTestId('package-row-1'))
    fireEvent.click(screen.getByTestId('package-row-1'))
    await waitFor(() => screen.getByTestId('package-detail-panel'))
    const closeBtn = screen.getByTestId('package-detail-panel').querySelector('button[class*="rounded"]')
    if (closeBtn) fireEvent.click(closeBtn)
    await waitFor(() => expect(screen.queryByTestId('package-detail-panel')).not.toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Tests — export center tab
// ---------------------------------------------------------------------------

describe('DeliverablesWorkspacePage — export center tab', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await setupMocks()
  })

  it('renders export center tab', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('tab-exports'))
    await waitFor(() => expect(screen.getByTestId('export-center-tab')).toBeInTheDocument())
  })

  it('renders all export templates', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('tab-exports'))
    await waitFor(() => screen.getByTestId('export-center-tab'))
    expect(screen.getByTestId('export-template-adj-listing')).toBeInTheDocument()
    expect(screen.getByTestId('export-template-adj-rollforward')).toBeInTheDocument()
    expect(screen.getByTestId('export-template-financial-statements')).toBeInTheDocument()
    expect(screen.getByTestId('export-template-workpaper-package')).toBeInTheDocument()
  })

  it('adjustment listing export has a download link', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('tab-exports'))
    await waitFor(() => screen.getByTestId('download-adj-listing'))
    expect(screen.getByTestId('download-adj-listing')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Tests — nav config
// ---------------------------------------------------------------------------

describe('DeliverablesWorkspacePage — nav config', () => {
  it('deliverables-workspace item is in deliverables group', async () => {
    const { NAV_GROUPS } = await import('@/config/nav')
    const delivGroup = NAV_GROUPS.find((g) => g.id === 'deliverables')!
    expect(delivGroup).toBeDefined()
    const wsItem = delivGroup.items.find((i) => i.id === 'deliverables')
    expect(wsItem).toBeDefined()
    expect(wsItem?.to).toBe('/deliverables')
  })

  it('deliverables group has 2 items', async () => {
    const { NAV_GROUPS } = await import('@/config/nav')
    const delivGroup = NAV_GROUPS.find((g) => g.id === 'deliverables')!
    expect(delivGroup.items.length).toBe(2)
  })
})
