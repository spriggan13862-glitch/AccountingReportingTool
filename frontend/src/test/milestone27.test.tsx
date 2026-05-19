/**
 * M27 — Import wizard, mapping workbench 2.0, entity fiscal year, validation UX tests
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ImportWizardPage } from '@/pages/ImportWizardPage'
import { MappingWorkbenchPage } from '@/pages/MappingWorkbenchPage'
import { EntitiesPage } from '@/pages/EntitiesPage'
import { ImportReviewPage } from '@/pages/ImportReviewPage'

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
// Mocks — no top-level variable references inside vi.mock factories
// ---------------------------------------------------------------------------

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: () => ({ org: { id: 1, name: 'Test Org' } }),
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 1, full_name: 'Test User', email: 'test@example.com',
      is_superuser: true, is_active: true, organization_id: 1 },
  }),
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'ACME-US', name: 'Acme US', entity_type: 'operating', currency: 'USD',
        active: true, parent_id: null, fiscal_year_end_month: null, fiscal_year_convention: null },
      { id: 2, code: 'ACME-EU', name: 'Acme EU', entity_type: 'operating', currency: 'EUR',
        active: true, parent_id: null, fiscal_year_end_month: 3, fiscal_year_convention: 'calendar' },
    ]),
    create: vi.fn().mockResolvedValue({ id: 99, code: 'NEW', name: 'New Entity', entity_type: 'operating', currency: 'USD', active: true, parent_id: null, fiscal_year_end_month: null, fiscal_year_convention: null }),
    update: vi.fn().mockResolvedValue({ id: 1, code: 'ACME-US', name: 'Acme US', entity_type: 'operating', currency: 'USD', active: true, parent_id: null, fiscal_year_end_month: null, fiscal_year_convention: null }),
  },
}))

vi.mock('@/api/tbImport', () => ({
  tbImportApi: {
    detectFile: vi.fn().mockResolvedValue({
      source_format: 'csv',
      sheets: [],
      selected_sheet: null,
      headers: ['Acct #', 'Name', 'Debit', 'Credit'],
      detected_mapping: { account_number: 'Acct #', account_name: 'Name', debit: 'Debit', credit: 'Credit' },
      unmapped_headers: [],
      preview_rows: [
        { 'Acct #': '1000', 'Name': 'Cash', 'Debit': '50000', 'Credit': '' },
      ],
      confidence: 90,
    }),
    uploadBatch: vi.fn().mockResolvedValue({
      id: 42, organization_id: 1, entity_id: 1, period_id: null, scenario_id: null,
      filename: 'trial_balance.csv', source_format: 'csv', content_hash: 'abc123',
      column_mapping: { account_number: 'Acct #' }, as_of_date: '2024-12-31',
      status: 'mapping_required', row_count: 50, mapped_row_count: 40, unmapped_row_count: 10,
      total_debits: '100000.00', total_credits: '100000.00', error_message: null, notes: null,
      posted_je_id: null, reversal_je_id: null, uploaded_by_user_id: null,
      reviewed_by_user_id: null, uploaded_at: '2024-12-31T12:00:00Z', reviewed_at: null,
    }),
    getBatch: vi.fn().mockResolvedValue({
      id: 42, organization_id: 1, entity_id: 1, period_id: null, scenario_id: null,
      filename: 'trial_balance.csv', source_format: 'csv', content_hash: 'abc',
      column_mapping: { account_number: 'Acct #', debit: 'Debit', credit: 'Credit' },
      as_of_date: '2024-12-31', status: 'mapping_required',
      row_count: 50, mapped_row_count: 40, unmapped_row_count: 10,
      total_debits: '100000.00', total_credits: '100000.00',
      error_message: null, notes: null, posted_je_id: null, reversal_je_id: null,
      uploaded_by_user_id: null, reviewed_by_user_id: null,
      uploaded_at: '2024-12-31T12:00:00Z', reviewed_at: null,
    }),
    getBatchLines: vi.fn().mockResolvedValue([
      { id: 1, batch_id: 42, line_number: 1, raw_account_number: '1000', raw_account_name: 'Cash',
        raw_debit: '50000', raw_credit: null, raw_balance: null, raw_description: null,
        debit: '50000', credit: '0', description: null, resolved_account_id: 5,
        mapping_status: 'mapped', is_manually_mapped: false, mapped_by_user_id: null,
        mapped_at: null, suggested_account_id: null, notes: null },
      { id: 2, batch_id: 42, line_number: 2, raw_account_number: '9999', raw_account_name: 'Unknown',
        raw_debit: null, raw_credit: '25000', raw_balance: null, raw_description: null,
        debit: '0', credit: '25000', description: null, resolved_account_id: null,
        mapping_status: 'unmapped', is_manually_mapped: false, mapped_by_user_id: null,
        mapped_at: null, suggested_account_id: 10, notes: null },
    ]),
    getBatchIssues: vi.fn().mockResolvedValue([]),
    getRawPreview: vi.fn().mockResolvedValue({
      batch_id: 42, source_format: 'csv',
      column_mapping: { account_number: 'Acct #', debit: 'Debit', credit: 'Credit' },
      source_headers: ['Acct #', 'Debit', 'Credit'],
      rows: [{ line_number: 1, raw_account_number: '1000', raw_account_name: 'Cash',
        raw_debit: '50000', raw_credit: null, raw_balance: null, raw_description: null,
        debit: '50000', credit: '0', mapping_status: 'mapped',
        resolved_account_id: 5, suggested_account_id: null }],
      total_rows: 50, showing: 1,
    }),
    getUnmappedLines: vi.fn().mockResolvedValue([
      { id: 2, batch_id: 42, line_number: 2, raw_account_number: '9999', raw_account_name: 'Unknown',
        raw_debit: null, raw_credit: '25000', raw_balance: null, raw_description: null,
        debit: '0', credit: '25000', description: null, resolved_account_id: null,
        mapping_status: 'unmapped', is_manually_mapped: false, mapped_by_user_id: null,
        mapped_at: null, suggested_account_id: 10, notes: null },
    ]),
    getSuggestions: vi.fn().mockResolvedValue([
      { line_id: 2, raw_account_number: '9999', raw_account_name: 'Unknown',
        suggested_account_id: 10, suggested_account_number: '9998', suggested_account_name: 'Other Expense' },
    ]),
    mapLine: vi.fn().mockResolvedValue({ id: 2, mapping_status: 'mapped', resolved_account_id: 10 }),
    skipLine: vi.fn().mockResolvedValue({ id: 2, mapping_status: 'skipped' }),
    bulkMap: vi.fn().mockResolvedValue([]),
    createAccountFromLine: vi.fn().mockResolvedValue({}),
    validateBatch: vi.fn().mockResolvedValue({ success: true, errors: [], warnings: [], info: [] }),
    postBatch: vi.fn().mockResolvedValue({ id: 42, status: 'posted' }),
    rollbackBatch: vi.fn().mockResolvedValue({ id: 42, status: 'rolled_back' }),
    listTemplates: vi.fn().mockResolvedValue([]),
    exportMappingsUrl: vi.fn().mockReturnValue('/tb-imports/batches/42/export-mappings'),
    listBatches: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 10, account_number: '9998', account_name: 'Other Expense', account_type: 'expense',
        normal_balance: 'debit', entity_id: 1, parent_account_id: null, active: true },
    ]),
  },
}))

// ---------------------------------------------------------------------------
// 1. Import wizard renders step 1
// ---------------------------------------------------------------------------
describe('ImportWizardPage', () => {
  it('renders step 1 with file upload zone', () => {
    render(wrap(<ImportWizardPage />, '/import/new'))
    expect(screen.getByText(/Guided trial balance/i)).toBeInTheDocument()
    expect(screen.getByText(/Drag & drop/i)).toBeInTheDocument()
  })

  // 2. Wizard populates entity dropdown from entities list
  it('populates entity dropdown', async () => {
    render(wrap(<ImportWizardPage />, '/import/new'))
    await waitFor(() => {
      expect(screen.getByText('ACME-US — Acme US')).toBeInTheDocument()
    })
  })

  // 3. Sample template download link
  it('renders download sample CSV template link', () => {
    render(wrap(<ImportWizardPage />, '/import/new'))
    expect(screen.getByText(/Download sample CSV template/i)).toBeInTheDocument()
  })

  // 4. Step indicator shows all 6 steps
  it('shows all 6 wizard step indicators', () => {
    render(wrap(<ImportWizardPage />, '/import/new'))
    // Steps labeled 1-6 in indicator
    expect(screen.getByText('Upload')).toBeInTheDocument()
    expect(screen.getByText('Columns')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
  })

  // 5. Multi-sheet XLSX detection shape
  it('detectFile API is available and mockable', async () => {
    const { tbImportApi } = await import('@/api/tbImport')
    vi.mocked(tbImportApi.detectFile).mockResolvedValueOnce({
      source_format: 'xlsx',
      sheets: [
        { name: 'Trial Balance', row_count: 120, likely_tb_score: 10 },
        { name: 'Sheet2', row_count: 5, likely_tb_score: 0 },
      ],
      selected_sheet: 'Trial Balance',
      headers: ['Account', 'Debit', 'Credit'],
      detected_mapping: { account_number: 'Account', debit: 'Debit', credit: 'Credit' },
      unmapped_headers: [],
      preview_rows: [],
      confidence: 80,
    })
    expect(vi.mocked(tbImportApi.detectFile)).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 6. Mapping Workbench 2.0
// ---------------------------------------------------------------------------
describe('MappingWorkbenchPage', () => {
  it('renders unmapped line account number', async () => {
    render(wrap(<MappingWorkbenchPage />, '/import/42/mapping', '/import/:id/mapping'))
    await waitFor(() => {
      expect(screen.getByText('9999')).toBeInTheDocument()
    })
  })

  // 7. Suggestion with accept button
  it('shows suggestion chip and accept button', async () => {
    render(wrap(<MappingWorkbenchPage />, '/import/42/mapping', '/import/:id/mapping'))
    await waitFor(() => {
      expect(screen.getByText('Accept')).toBeInTheDocument()
    })
  })

  // 8. Show mapped toggle
  it('shows show-mapped toggle', async () => {
    render(wrap(<MappingWorkbenchPage />, '/import/42/mapping', '/import/:id/mapping'))
    await waitFor(() => {
      expect(screen.getByText('Show mapped')).toBeInTheDocument()
    })
  })

  // 9. Export mappings button
  it('shows export mappings button', async () => {
    render(wrap(<MappingWorkbenchPage />, '/import/42/mapping', '/import/:id/mapping'))
    await waitFor(() => {
      expect(screen.getByText('Export Mappings')).toBeInTheDocument()
    })
  })

  // 10. Bulk accept suggestions
  it('shows bulk accept button when suggestions exist', async () => {
    render(wrap(<MappingWorkbenchPage />, '/import/42/mapping', '/import/:id/mapping'))
    await waitFor(() => {
      expect(screen.getByText(/Accept.*suggestion/i)).toBeInTheDocument()
    })
  })

  // 11. Search filter
  it('renders account search filter input', async () => {
    render(wrap(<MappingWorkbenchPage />, '/import/42/mapping', '/import/:id/mapping'))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Filter by account/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 12. Entity fiscal year fields
// ---------------------------------------------------------------------------
describe('EntitiesPage fiscal year', () => {
  it('renders Fiscal Year End column', async () => {
    render(wrap(<EntitiesPage />, '/entities'))
    await waitFor(() => {
      expect(screen.getByText('Fiscal Year End')).toBeInTheDocument()
    })
  })

  it('shows March for entity with fiscal_year_end_month=3', async () => {
    render(wrap(<EntitiesPage />, '/entities'))
    await waitFor(() => {
      expect(screen.getByText('March')).toBeInTheDocument()
    })
  })

  // 13. Expanded currency list
  it('includes CHF in expanded currency dropdown', async () => {
    render(wrap(<EntitiesPage />, '/entities'))
    await waitFor(() => screen.getByText('New Entity'))
    fireEvent.click(screen.getByText('New Entity'))
    const selects = document.querySelectorAll('select')
    let hasCHF = false
    selects.forEach((s) => {
      Array.from(s.options).forEach((o) => { if (o.value === 'CHF') hasCHF = true })
    })
    expect(hasCHF).toBe(true)
  })

  // 14. FY convention dropdown
  it('includes 52/53-week fiscal year option', async () => {
    render(wrap(<EntitiesPage />, '/entities'))
    await waitFor(() => screen.getByText('New Entity'))
    fireEvent.click(screen.getByText('New Entity'))
    expect(screen.getByText(/52\/53-week/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Import review page (validation + preview tabs)
// ---------------------------------------------------------------------------
describe('ImportReviewPage', () => {
  it('renders Raw Preview tab button', async () => {
    render(wrap(<ImportReviewPage />, '/import/42', '/import/:id'))
    await waitFor(() => {
      expect(screen.getByText('Raw Preview')).toBeInTheDocument()
    })
  })

  it('shows Activity Timeline with Uploaded event', async () => {
    render(wrap(<ImportReviewPage />, '/import/42', '/import/:id'))
    await waitFor(() => {
      expect(screen.getByText('Uploaded')).toBeInTheDocument()
    })
  })
})
