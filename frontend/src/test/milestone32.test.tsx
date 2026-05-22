/**
 * M32 — COA-first onboarding, Chart of Accounts page, COA Import page
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { COAImportPage } from '@/pages/COAImportPage'
import { ChartOfAccountsPage } from '@/pages/ChartOfAccountsPage'
import { SetupWizardPage } from '@/pages/SetupWizardPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrap(element: React.ReactNode, path = '/', routePath = '*') {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Mocks — all data inlined in factories (vi.mock hoisting requirement)
// ---------------------------------------------------------------------------

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: () => ({ org: { id: 1, name: 'Acme Corp' } }),
}))

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 1, full_name: 'Test User', email: 'test@example.com',
      is_superuser: true, is_active: true, organization_id: 1 },
    logout: vi.fn(),
  }),
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'ACME', name: 'Acme Corp', entity_type: 'operating', active: true,
        currency: 'USD', fiscal_year_end_month: 12, fiscal_year_convention: 'calendar' },
    ]),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/api/coaImport', () => ({
  coaImportApi: {
    upload: vi.fn().mockResolvedValue({
      batch_id: 10,
      entity_id: 1,
      filename: 'qb_coa.csv',
      source_system: 'quickbooks_full',
      detected_columns: { account_name: 'Account Name', account_type: 'Type', detail_type: 'Detail Type', account_number: 'Account #' },
      row_count: 3,
      warnings: [],
      rows: [
        { row_index: 0, account_number: '1000', account_name: 'Cash', raw_type: 'Bank', account_type: 'asset',
          normal_balance: 'debit', detail_type: 'Checking', description: null, tax_line: null, indent: 0, parent_row_idx: null },
        { row_index: 1, account_number: '4000', account_name: 'Revenue', raw_type: 'Income', account_type: 'revenue',
          normal_balance: 'credit', detail_type: 'Service/Fee Income', description: null, tax_line: null, indent: 0, parent_row_idx: null },
        { row_index: 2, account_number: '6000', account_name: 'Office Expenses', raw_type: 'Expenses', account_type: 'expense',
          normal_balance: 'debit', detail_type: 'Office Expenses', description: null, tax_line: null, indent: 0, parent_row_idx: null },
      ],
    }),
    apply: vi.fn().mockResolvedValue({ id: 10, accounts_created: 3, accounts_updated: 0, status: 'applied' }),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    preview: vi.fn(),
  },
}))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: vi.fn().mockResolvedValue([]),
    listPaged: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100, pages: 1 }),
    tree: vi.fn().mockResolvedValue([
      {
        id: 1, entity_id: 1, account_number: '1000', account_name: 'Cash',
        account_type: 'asset', normal_balance: 'debit', parent_account_id: null,
        active: true, detail_type: 'Checking', account_status: 'active',
        description: null, tax_line: null, source_system: 'quickbooks_full',
        reporting_taxonomy_line_id: 1,
        children: [
          {
            id: 2, entity_id: 1, account_number: '1010', account_name: 'Petty Cash',
            account_type: 'asset', normal_balance: 'debit', parent_account_id: 1,
            active: true, detail_type: 'Cash On Hand', account_status: 'active',
            description: null, tax_line: null, source_system: 'quickbooks_full',
            reporting_taxonomy_line_id: 1,
            children: [],
          },
        ],
      },
      {
        id: 3, entity_id: 1, account_number: '4000', account_name: 'Revenue',
        account_type: 'revenue', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: 'Service/Fee Income', account_status: 'active',
        description: null, tax_line: null, source_system: 'quickbooks_full',
        reporting_taxonomy_line_id: 2,
        children: [],
      },
    ]),
    get: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/api/reportingTaxonomy', () => ({
  reportingTaxonomyApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'cash_equivalents', name: 'Cash & Equivalents', section: 'assets', sort_order: 10, is_subtotal: false, parent_id: null },
      { id: 2, code: 'service_revenue', name: 'Service Revenue', section: 'revenue', sort_order: 100, is_subtotal: false, parent_id: null },
    ]),
  },
}))

// ---------------------------------------------------------------------------
// COAImportPage tests
// ---------------------------------------------------------------------------

describe('COAImportPage — M32', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title', () => {
    render(wrap(<COAImportPage />))
    expect(screen.getByText(/Import Chart of Accounts/i)).toBeTruthy()
  })

  it('renders the "Why COA first?" explanation banner', () => {
    render(wrap(<COAImportPage />))
    expect(screen.getByText(/Why import your COA first/i)).toBeTruthy()
  })

  it('shows entity selector (not a number input)', async () => {
    render(wrap(<COAImportPage />))
    await waitFor(() => {
      expect(screen.getByText(/Acme Corp/i)).toBeTruthy()
    })
    expect(screen.queryByPlaceholderText('e.g. 1')).toBeNull()
  })

  it('shows starter template toggle and expands templates', () => {
    render(wrap(<COAImportPage />))
    const btn = screen.getByText(/Download starter templates/i)
    fireEvent.click(btn)
    expect(screen.getByText(/QuickBooks Full Export/i)).toBeTruthy()
    expect(screen.getByText(/QuickBooks Simplified/i)).toBeTruthy()
    expect(screen.getByText(/Generic with Account Numbers/i)).toBeTruthy()
  })

  it('shows flow chain: Source Account → Entity COA → Reporting/FSLI Line → Financial Statements', () => {
    render(wrap(<COAImportPage />))
    expect(screen.getByText('Source Account')).toBeTruthy()
    expect(screen.getByText('Entity COA')).toBeTruthy()
    expect(screen.getAllByText(/Reporting \/ FSLI Line/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Financial Statements')).toBeTruthy()
  })

  it('disables Parse & Preview button when no entity or file selected', () => {
    render(wrap(<COAImportPage />))
    const btn = screen.getByText(/Parse & Preview/i)
    expect(btn.closest('button')).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// ChartOfAccountsPage tests
// ---------------------------------------------------------------------------

describe('ChartOfAccountsPage — M32', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title', () => {
    render(wrap(<ChartOfAccountsPage />, '/accounts?entity=1'))
    expect(screen.getByText(/Chart of Accounts/i)).toBeTruthy()
  })

  it('shows "Select an entity" prompt when no entity is selected', () => {
    render(wrap(<ChartOfAccountsPage />, '/accounts'))
    expect(screen.getByText(/Select an entity to view/i)).toBeTruthy()
  })

  it('shows account tree with parent and child rows when entity selected', async () => {
    render(wrap(<ChartOfAccountsPage />, '/accounts?entity=1'))
    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeTruthy()
      expect(screen.getByText('Petty Cash')).toBeTruthy()
      expect(screen.getByText('Revenue')).toBeTruthy()
    })
  })

  it('shows type filter chips (asset, revenue)', async () => {
    render(wrap(<ChartOfAccountsPage />, '/accounts?entity=1'))
    await waitFor(() => {
      // filter chip text is "asset · 2" — getAllByText handles multiple matches (chip + table badge)
      expect(screen.getAllByText(/asset/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/revenue/i).length).toBeGreaterThanOrEqual(1)
      // Verify the filter chip specifically (contains · count)
      expect(screen.getByText(/asset · \d/i)).toBeTruthy()
      expect(screen.getByText(/revenue · \d/i)).toBeTruthy()
    })
  })

  it('shows reporting taxonomy name for accounts', async () => {
    render(wrap(<ChartOfAccountsPage />, '/accounts?entity=1'))
    await waitFor(() => {
      // Multiple rows may share the same taxonomy line — getAllByText is correct
      expect(screen.getAllByText('Cash & Equivalents').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Service Revenue')).toBeTruthy()
    })
  })

  it('shows edit button for each account row', async () => {
    render(wrap(<ChartOfAccountsPage />, '/accounts?entity=1'))
    await waitFor(() => {
      const editBtns = screen.getAllByTitle('Edit')
      expect(editBtns.length).toBeGreaterThanOrEqual(2)
    })
  })
})

// ---------------------------------------------------------------------------
// SetupWizardPage tests
// ---------------------------------------------------------------------------

describe('SetupWizardPage — M32 COA-first workflow', () => {
  beforeEach(() => {
    localStorage.removeItem('setup_wizard_dismissed')
    vi.clearAllMocks()

    ;(globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        entity_count: 1,
        active_entity_count: 1,
        import_batch_count: 0,
        pending_imports: 0,
        posted_imports: 0,
        unmapped_line_count: 0,
        has_journal_entries: false,
        coa_batch_count: 0,
        coa_applied_count: 0,
        setup_steps_complete: ['entity_created'],
        setup_progress: 17,
      }),
    }) as unknown as typeof fetch
  })

  it('shows COA upload step in setup wizard', async () => {
    render(wrap(<SetupWizardPage />))
    await waitFor(() => {
      expect(screen.getByText(/Upload your Chart of Accounts/i)).toBeTruthy()
    })
  })

  it('shows review auto-classification step', async () => {
    render(wrap(<SetupWizardPage />))
    await waitFor(() => {
      expect(screen.getByText(/Review auto-classification/i)).toBeTruthy()
    })
  })

  it('shows mapping exceptions step', async () => {
    render(wrap(<SetupWizardPage />))
    await waitFor(() => {
      expect(screen.getByText(/Resolve mapping exceptions/i)).toBeTruthy()
    })
  })

  it('marks entity_created step as complete', async () => {
    render(wrap(<SetupWizardPage />))
    await waitFor(() => {
      expect(screen.getByText(/Upload your Chart of Accounts/i)).toBeTruthy()
      // First step should be complete (line-through or "Complete" label)
      expect(screen.getByText('Complete')).toBeTruthy()
    })
  })
})
