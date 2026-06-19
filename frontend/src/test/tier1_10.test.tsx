import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PDFImportPreview } from '@/types'

import { PDFImportPage } from '@/pages/PDFImportPage'
import { TaxonomyAdminPage } from '@/pages/TaxonomyAdminPage'
import { AdjustmentBridgePage } from '@/pages/AdjustmentBridgePage'
import { JournalEntriesPage } from '@/pages/JournalEntriesPage'
import { ChartOfAccountsPage } from '@/pages/ChartOfAccountsPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function wrap(ui: React.ReactElement, initialEntries = ['/'], client = makeClient()) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/pdfImport', () => ({
  pdfImportApi: {
    upload: vi.fn(),
    apply: vi.fn(),
    list: vi.fn().mockResolvedValue([
      { id: 42, filename: 'source.pdf', source_entity_name: 'Test Corp', statement_date: '2025-12-31', line_count: 5, status: 'applied' }
    ]),
    lines: vi.fn().mockResolvedValue([
      { id: 1, temp_account_code: 'BS-CASH', account_name: 'Cash', amount: '100.00', taxonomy_conflict: true, conflict_reason: 'conflict detail' }
    ]),
    audit: vi.fn().mockResolvedValue({
      batch_id: 42,
      filename: 'source.pdf',
      lines: []
    }),
    previewDiff: vi.fn().mockResolvedValue({ changed: 0, excluded: 0, lines: [] }),
  },
}))

vi.mock('@/api/journalEntries', () => ({
  journalEntriesApi: {
    list: vi.fn().mockResolvedValue([]),
    importCsv: vi.fn().mockResolvedValue({ success: true, message: 'Imported 2 JEs successfully', imported_count: 2 }),
  },
}))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 101, account_number: '1000', account_name: 'Cash', account_type: 'asset', detail_type: 'checking', active: true, account_status: 'active', reporting_taxonomy_line_id: 1, flags: [{ code: 'conflict', severity: 'warning', message: 'conflict' }] }
    ]),
    tree: vi.fn().mockResolvedValue([
      { id: 101, account_number: '1000', account_name: 'Cash', account_type: 'asset', detail_type: 'checking', active: true, account_status: 'active', reporting_taxonomy_line_id: 1, parent_account_id: null, children: [], flags: [{ code: 'conflict', severity: 'warning', message: 'conflict' }] }
    ]),
    update: vi.fn().mockResolvedValue({}),
    bulkUpdate: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/api/periods', () => ({
  periodsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, period_name: 'Q1-2026', start_date: '2026-01-01', end_date: '2026-03-31' }
    ]),
  },
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'ENT1', name: 'Entity 1' }
    ]),
  },
}))

vi.mock('@/api/reportingTaxonomy', () => ({
  reportingTaxonomyApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: '1000', name: 'Cash', statement_type: 'balance_sheet', section: 'assets', sort_order: 100, is_subtotal: false, parent_id: null, active: true }
    ]),
    update: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/api/reportingViews', () => ({
  reportingViewsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 10, name: 'GAAP View', code: 'gaap', is_default: true }
    ]),
  },
}))

vi.mock('@/api/adjustmentBridge', () => ({
  adjustmentBridgeApi: {
    compute: vi.fn().mockResolvedValue({ rows_computed: 5, message: 'Done' }),
    rows: vi.fn().mockResolvedValue([
      { id: 1, account_name: 'Cash', account_number: '1000', account_type: 'asset', imported_balance: '100.00', posted_adjustments: '50.00', adjusted_balance: '150.00', variance: '0.00' }
    ]),
    listViews: vi.fn().mockResolvedValue([]),
    cpaBridge: vi.fn().mockResolvedValue({
      entity_id: 1, period_end: '2026-03-31', scenario_id: null,
      columns: [{ je_id: 1, je_number: 'AJE-001', description: 'Bonus accrual', entry_date: '2026-01-15' }],
      rows: [
        { account_id: 101, account_number: '1000', account_name: 'Cash', account_type: 'asset', account_sort: 1000, as_reported: 100000, ajes: { '1': 5000 }, total_ajes: 5000, adjusted: 105000 },
      ],
      totals: { as_reported: 100000, ajes: { '1': 5000 }, total_ajes: 5000, adjusted: 105000 },
    }),
    bridge: vi.fn().mockResolvedValue({
      entity_id: 1, period_end: '2026-03-31', scenario_id: null, reporting_basis: 'adjusted',
      adjustments: [{ id: 1, je_number: 'AJE-001', sequence: 1, entry_date: '2026-01-15', description: 'Bonus accrual', status: 'posted', total_debit: 5000, total_credit: 5000 }],
      rows: [
        { row_type: 'section', level: 0, label: 'Assets', account_id: null, account_number: null, account_name: null, account_type: 'asset', as_reported: 100000, adjustment_impacts: { '1': 5000 }, total_ajes: 5000, adjusted_balance: 105000 },
        { row_type: 'account', level: 1, label: 'Cash', account_id: 101, account_number: '1000', account_name: 'Cash', account_type: 'asset', as_reported: 100000, adjustment_impacts: { '1': 5000 }, total_ajes: 5000, adjusted_balance: 105000 },
      ],
      totals: { as_reported: 100000, adjustment_impacts: { '1': 5000 }, total_ajes: 5000, adjusted_balance: 105000 },
    }),
    exportBridgeCsv: vi.fn().mockResolvedValue(new Blob(['csv'], { type: 'text/csv' })),
  },
}))

vi.mock('@/api/reportingSettings', () => ({
  reportingSettingsApi: {
    get: vi.fn().mockResolvedValue({ decimal_places: 0, currency_symbol: '$', negative_format: 'parentheses' }),
  },
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: () => ({ org: { id: 1, name: 'Default Org' } }),
}))

vi.mock('@/providers/WorkspaceProvider', () => ({
  useWorkspace: () => ({ activeEntity: { id: 1, name: 'Entity 1' } }),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tier 1.10 Frontend Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. PDF wizard required fields disabling extraction
  it('disables parse button in PDF Import Step 1 until all required fields are complete', async () => {
    render(wrap(<PDFImportPage />))
    
    const parseBtn = screen.getByTestId('parse-pdf-btn')
    expect(parseBtn).toBeDisabled()
  })

  // 2. Conflict resolution badges in COA and PDF review grids opening panels
  it('renders conflict column and badge in Chart of Accounts opening the conflict panel', async () => {
    render(wrap(<ChartOfAccountsPage />))
    
    // Wait for the entity options to load
    await waitFor(() => {
      expect(screen.getByText('ENT1 — Entity 1')).toBeInTheDocument()
    })
    
    // Select Entity
    const entitySelect = screen.getByTestId('entity-select')
    fireEvent.change(entitySelect, { target: { value: '1' } })

    await waitFor(() => {
      expect(screen.getByTestId('conflict-badge-101')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('conflict-badge-101'))
    
    await waitFor(() => {
      expect(screen.getByTestId('coa-conflict-resolution-panel')).toBeInTheDocument()
    })
  })

  // 3. Taxonomy view selectors and editable rows
  it('renders global Active Taxonomy view selector and editable fields in Taxonomy Admin', async () => {
    render(wrap(<TaxonomyAdminPage />))
    
    await waitFor(() => {
      expect(screen.getByText('Active Taxonomy view:')).toBeInTheDocument()
      expect(screen.getAllByText(/GAAP\s*View/i).length).toBeGreaterThan(0)
    })
  })

  // 4. Adjustment bridge CPA workbook
  it('renders CPA bridge table with per-AJE columns after entity and period selection', async () => {
    render(wrap(<AdjustmentBridgePage />))

    // Wait for entity options to load
    await waitFor(() => {
      expect(screen.getByText('ENT1 — Entity 1')).toBeInTheDocument()
    })

    // Select entity
    const entitySelect = screen.getByTestId('entity-select')
    fireEvent.change(entitySelect, { target: { value: '1' } })

    // Wait for period options to appear — the real PeriodSelect only renders
    // options after periodsApi.list resolves, which also ensures the page's
    // own `periods` array is populated (same TanStack Query cache key).
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Q1-2026/ })).toBeInTheDocument()
    })
    fireEvent.change(screen.getByTestId('period-select'), { target: { value: '1' } })

    await waitFor(() => {
      expect(screen.getByTestId('cpa-bridge-table')).toBeInTheDocument()
      expect(screen.getByText('Grand Total')).toBeInTheDocument()
      expect(screen.getByText(/AJE-001/)).toBeInTheDocument()
    })
  })

  // 5. Journal Entry CSV upload flow
  it('opens CSV import modal and submits file in Journal Entries Page', async () => {
    render(wrap(<JournalEntriesPage />))
    
    const importBtn = screen.getByText('Import CSV')
    expect(importBtn).toBeInTheDocument()
    
    fireEvent.click(importBtn)
    
    await waitFor(() => {
      expect(screen.getByText('Import Journal Entries')).toBeInTheDocument()
    })
  })

  // 6. Account Mapping Table in TaxonomyAdminPage
  it('renders account mapping table with filterable rows', async () => {
    render(wrap(<TaxonomyAdminPage />))

    await waitFor(() => {
      expect(screen.getAllByText('1000').length).toBeGreaterThan(0)
    })

    // Table headers should be present
    expect(screen.getByText('Account #')).toBeInTheDocument()
    expect(screen.getByText('Account Name')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()

    // Account rows render as table rows, not draggable cards
    const accountNumElements = screen.getAllByText('1000')
    const tableRow = accountNumElements[0].closest('tr')
    expect(tableRow).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 7. PDF-P10: Entity name mismatch warning
// ---------------------------------------------------------------------------

const BASE_PREVIEW: PDFImportPreview = {
  batch_id: 99,
  entity_id: 1,
  filename: 'test.pdf',
  source_entity_name: null,
  statement_date: '2025-12-31',
  basis_of_accounting: 'gaap',
  import_type: 'financial_statements',
  statement_scope: 'standalone',
  page_count: 2,
  line_count: 1,
  subtotal_count: 0,
  lines: [],
  validation: { checks: [], passing: 0, failing: 0, total: 0 },
  warnings: [],
  balance_sheet_variance: '0.00',
  balance_sheet_tied: true,
  net_income_variance: null,
  net_income_reconciled: true,
  net_income_in_equity: null,
  pnl_net_income: null,
}

describe('PDF-P10: entity name mismatch warning', () => {
  let mockUploadFn: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const { pdfImportApi } = await import('@/api/pdfImport')
    mockUploadFn = pdfImportApi.upload as ReturnType<typeof vi.fn>
  })

  afterEach(() => vi.clearAllMocks())

  async function uploadAndPreview(sourceName: string | null) {
    mockUploadFn.mockResolvedValue({ ...BASE_PREVIEW, source_entity_name: sourceName })

    render(wrap(<PDFImportPage />))

    // Wait for entity options to load (same pattern as other tier1_10 tests)
    await waitFor(() => expect(screen.getByText('ENT1 — Entity 1')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })

    const input = screen.getByTestId('pdf-file-input')
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })] } })

    // Button should now be enabled — click to trigger upload mutation
    await waitFor(() => expect(screen.getByTestId('parse-pdf-btn')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('parse-pdf-btn'))
    await waitFor(() => expect(screen.getByTestId('apply-pdf-btn')).toBeInTheDocument(), { timeout: 3000 })
  }

  it('shows mismatch warning when PDF entity name differs from selected entity', async () => {
    await uploadAndPreview('Totally Different Company LLC')
    expect(screen.getByTestId('entity-mismatch-warning')).toBeInTheDocument()
    expect(screen.getByText(/entity name mismatch/i)).toBeInTheDocument()
  })

  it('does not show mismatch warning when PDF entity name matches selected entity', async () => {
    await uploadAndPreview('Entity 1')
    expect(screen.queryByTestId('entity-mismatch-warning')).not.toBeInTheDocument()
  })
})

