import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReportingViewWorkspacePage } from '@/pages/ReportingViewWorkspacePage'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/reportingViews', () => ({
  reportingViewsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    clone: vi.fn(),
    listOverrides: vi.fn(),
    setOverride: vi.fn(),
    deleteOverride: vi.fn(),
    compare: vi.fn(),
    impact: vi.fn(),
  },
}))

vi.mock('@/api/reportingTaxonomy', () => ({
  reportingTaxonomyApi: {
    list: vi.fn(),
  },
}))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: vi.fn(),
  },
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockViews = [
  {
    id: 1,
    code: 'GAAP',
    name: 'GAAP',
    description: 'Standard GAAP presentation',
    is_default: true,
    is_system_defined: true,
    active: true,
  },
  {
    id: 2,
    code: 'QOE',
    name: 'Quality of Earnings',
    description: null,
    is_default: false,
    is_system_defined: false,
    active: true,
  },
]

const mockTaxLines = [
  { id: 10, code: 'REV', name: 'Revenue', section: 'revenue', statement_type: 'income_statement', is_subtotal: false, sort_order: 1, hierarchy_depth: 1 },
  { id: 11, code: 'COGS', name: 'Cost of Goods Sold', section: 'cogs', statement_type: 'income_statement', is_subtotal: false, sort_order: 2, hierarchy_depth: 1 },
]

const mockAccounts = [
  { id: 100, account_number: '4000', account_name: 'Sales Revenue', account_type: 'revenue', reporting_taxonomy_line_id: 10 },
  { id: 101, account_number: '5000', account_name: 'COGS', account_type: 'cogs', reporting_taxonomy_line_id: 11 },
]

const mockEntities = [
  { id: 1, name: 'Acme Corp', organization_id: 'acme' },
]

const mockOverrides = [
  { id: 1, view_id: 2, account_id: 100, taxonomy_line_id: 11, display_label: null, created_by: null, created_at: '2026-01-01T00:00:00' },
]

const mockImpact = {
  view_id: 2,
  entity_id: 1,
  override_count: 1,
  accounts: [
    {
      account_id: 100,
      account_code: '4000',
      account_name: 'Sales Revenue',
      default_taxonomy_id: 10,
      default_taxonomy_name: 'Revenue',
      override_taxonomy_id: 11,
      override_taxonomy_name: 'Cost of Goods Sold',
      display_label: null,
    },
  ],
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

function makeQc() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function renderPage() {
  const qc = makeQc()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReportingViewWorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReportingViewWorkspacePage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { reportingViewsApi } = await import('@/api/reportingViews')
    const { reportingTaxonomyApi } = await import('@/api/reportingTaxonomy')
    const { accountsApi } = await import('@/api/accounts')
    const { entitiesApi } = await import('@/api/entities')

    vi.mocked(reportingViewsApi.list).mockResolvedValue(mockViews as any)
    vi.mocked(reportingViewsApi.listOverrides).mockResolvedValue(mockOverrides as any)
    vi.mocked(reportingViewsApi.impact).mockResolvedValue(mockImpact as any)
    vi.mocked(reportingViewsApi.compare).mockResolvedValue({
      view1_id: 1, view2_id: 2, entity_id: 1, as_of_date: '2026-01-31', statement_type: 'income_statement', rows: [],
    })
    vi.mocked(reportingTaxonomyApi.list).mockResolvedValue(mockTaxLines as any)
    vi.mocked(accountsApi.list).mockResolvedValue(mockAccounts as any)
    vi.mocked(entitiesApi.list).mockResolvedValue(mockEntities as any)
  })

  // ── Structure ──────────────────────────────────────────────────────────────

  it('renders the workspace container', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('reporting-view-workspace')).toBeInTheDocument()
    )
  })

  it('renders the view sidebar', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('view-sidebar')).toBeInTheDocument()
    )
  })

  it('renders create view button', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('create-view-btn')).toBeInTheDocument()
    )
  })

  it('renders entity and date context bar', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('context-bar')).toBeInTheDocument()
      expect(screen.getByTestId('entity-select')).toBeInTheDocument()
      expect(screen.getByTestId('as-of-date')).toBeInTheDocument()
    })
  })

  // ── View list ─────────────────────────────────────────────────────────────

  it('shows no-view-selected state initially', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('no-view-selected')).toBeInTheDocument()
    )
  })

  it('lists views in sidebar', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('view-item-1')).toBeInTheDocument()
      expect(screen.getByTestId('view-item-2')).toBeInTheDocument()
    })
  })

  it('shows view names from API', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText('GAAP').length).toBeGreaterThan(0)
      expect(screen.getByText('Quality of Earnings')).toBeInTheDocument()
    })
  })

  // ── View selection ────────────────────────────────────────────────────────

  it('selects a view and shows header', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('view-item-2'))
    fireEvent.click(screen.getByTestId('view-item-2'))
    await waitFor(() => {
      expect(screen.getByTestId('view-header')).toBeInTheDocument()
      // view name appears in sidebar + header (>=2 times is fine)
      expect(screen.getAllByText('Quality of Earnings').length).toBeGreaterThan(0)
    })
  })

  it('shows tab bar after selecting a view', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('view-item-1'))
    fireEvent.click(screen.getByTestId('view-item-1'))
    await waitFor(() => {
      expect(screen.getByTestId('view-tabs')).toBeInTheDocument()
      expect(screen.getByTestId('tab-overrides')).toBeInTheDocument()
      expect(screen.getByTestId('tab-impact')).toBeInTheDocument()
      expect(screen.getByTestId('tab-compare')).toBeInTheDocument()
    })
  })

  it('shows overrides tab by default', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('view-item-1'))
    fireEvent.click(screen.getByTestId('view-item-1'))
    await waitFor(() =>
      expect(screen.getByTestId('overrides-tab')).toBeInTheDocument()
    )
  })

  // ── Overrides tab ─────────────────────────────────────────────────────────

  it('overrides tab shows entity prompt when no entity selected', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('view-item-1'))
    fireEvent.click(screen.getByTestId('view-item-1'))
    await waitFor(() =>
      expect(screen.getByTestId('overrides-no-entity')).toBeInTheDocument()
    )
  })

  it('shows override editor when entity is selected', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('view-item-1'))
    fireEvent.click(screen.getByTestId('view-item-1'))
    await waitFor(() => screen.getByTestId('entity-select'))
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    await waitFor(() =>
      expect(screen.getByTestId('override-editor')).toBeInTheDocument()
    )
  })

  it('shows override table with accounts', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('view-item-1'))
    fireEvent.click(screen.getByTestId('view-item-1'))
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    await waitFor(() =>
      expect(screen.getByTestId('override-table')).toBeInTheDocument()
    )
    await waitFor(() => {
      expect(screen.getByTestId('override-row-100')).toBeInTheDocument()
      expect(screen.getByTestId('override-row-101')).toBeInTheDocument()
    })
  })

  // ── Impact tab ────────────────────────────────────────────────────────────

  it('switches to impact tab', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('view-item-2'))
    fireEvent.click(screen.getByTestId('view-item-2'))
    await waitFor(() => screen.getByTestId('tab-impact'))
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.click(screen.getByTestId('tab-impact'))
    await waitFor(() =>
      expect(screen.getByTestId('impact-tab')).toBeInTheDocument()
    )
  })

  it('shows impact rows when entity selected and view has overrides', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('view-item-2'))
    fireEvent.click(screen.getByTestId('view-item-2'))
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.click(await screen.findByTestId('tab-impact'))
    await waitFor(() =>
      expect(screen.getByTestId('impact-row-100')).toBeInTheDocument()
    )
  })

  // ── Compare tab ───────────────────────────────────────────────────────────

  it('switches to compare tab', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('view-item-1'))
    fireEvent.click(screen.getByTestId('view-item-1'))
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.click(await screen.findByTestId('tab-compare'))
    await waitFor(() =>
      expect(screen.getByTestId('compare-tab')).toBeInTheDocument()
    )
  })

  it('compare tab shows view selectors', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('view-item-1'))
    fireEvent.click(screen.getByTestId('view-item-1'))
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.click(await screen.findByTestId('tab-compare'))
    await waitFor(() => {
      expect(screen.getByTestId('compare-view1')).toBeInTheDocument()
      expect(screen.getByTestId('compare-view2')).toBeInTheDocument()
      expect(screen.getByTestId('compare-run-btn')).toBeInTheDocument()
    })
  })

  // ── Create view form ──────────────────────────────────────────────────────

  it('shows clone form when copy button is clicked', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('create-view-btn'))
    fireEvent.click(screen.getByTestId('create-view-btn'))
    await waitFor(() =>
      expect(screen.getByTestId('clone-form')).toBeInTheDocument()
    )
  })

  it('has save and cancel buttons in clone form', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('create-view-btn'))
    fireEvent.click(screen.getByTestId('create-view-btn'))
    await waitFor(() => {
      expect(screen.getByTestId('clone-form-save')).toBeInTheDocument()
      expect(screen.getByTestId('clone-form-cancel')).toBeInTheDocument()
    })
  })

  it('closes clone form when cancel is clicked', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('create-view-btn'))
    fireEvent.click(screen.getByTestId('create-view-btn'))
    await waitFor(() => screen.getByTestId('clone-form-cancel'))
    fireEvent.click(screen.getByTestId('clone-form-cancel'))
    await waitFor(() =>
      expect(screen.queryByTestId('clone-form')).not.toBeInTheDocument()
    )
  })

  // ── Clone/delete buttons ──────────────────────────────────────────────────

  it('shows clone button when a view is selected', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('view-item-2'))
    fireEvent.click(screen.getByTestId('view-item-2'))
    await waitFor(() =>
      expect(screen.getByTestId('clone-view-btn')).toBeInTheDocument()
    )
  })

  it('shows delete button only for non-system views', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('view-item-2'))
    fireEvent.click(screen.getByTestId('view-item-2'))
    await waitFor(() =>
      expect(screen.getByTestId('delete-view-btn')).toBeInTheDocument()
    )
    // System view (GAAP) should NOT show delete
    fireEvent.click(screen.getByTestId('view-item-1'))
    await waitFor(() =>
      expect(screen.queryByTestId('delete-view-btn')).not.toBeInTheDocument()
    )
  })
})
