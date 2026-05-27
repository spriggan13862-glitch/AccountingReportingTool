import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PDFImportPage } from '@/pages/PDFImportPage'
import { ImportReviewPage } from '@/pages/ImportReviewPage'
import { MappingWorkbenchPage } from '@/pages/MappingWorkbenchPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { ChartOfAccountsPage } from '@/pages/ChartOfAccountsPage'

import type { ImportBatch, ImportLine, Document, Account, ReportingTaxonomyLine, ImportSuggestion } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
      { id: 1, filename: 'batch1.pdf', source_entity_name: 'Entity 1', statement_date: '2026-01-01', line_count: 5, status: 'applied' }
    ]),
    lines: vi.fn().mockResolvedValue([]),
    audit: vi.fn().mockResolvedValue({
      batch_id: 1,
      filename: 'batch1.pdf',
      lines: [
        { line_id: 1, temp_account_code: 'BS-CASH', account_name: 'Cash', amount: '100.00', is_subtotal: false, page_number: 1, source_line_text: 'Cash 100.00', mapping: { taxonomy_code: 'cash', taxonomy_source: 'auto', taxonomy_locked: true } }
      ]
    }),
    updateLine: vi.fn(),
    patchPreviewLine: vi.fn(),
  },
}))

vi.mock('@/api/tbImport', () => ({
  tbImportApi: {
    getBatch: vi.fn().mockResolvedValue({
      id: 10,
      filename: 'tb.csv',
      as_of_date: '2026-01-01',
      row_count: 3,
      mapped_row_count: 1,
      unmapped_row_count: 2,
      status: 'mapping_required',
      entity_id: 1,
    }),
    getBatchLines: vi.fn().mockResolvedValue([
      { id: 101, line_number: 1, raw_account_number: '1010', raw_account_name: 'Cash', debit: '100.00', credit: '0.00', mapping_status: 'unmapped' },
      { id: 102, line_number: 2, raw_account_number: '2010', raw_account_name: 'AP', debit: '0.00', credit: '100.00', mapping_status: 'unmapped' },
    ]),
    getBatchIssues: vi.fn().mockResolvedValue([]),
    getRawPreview: vi.fn().mockResolvedValue({
      total_rows: 2,
      showing: 2,
      source_format: 'csv',
      source_headers: ['Acct #', 'Name', 'DR', 'CR'],
      column_mapping: { account_number: 'Acct #', account_name: 'Name', debit: 'DR', credit: 'CR' },
      rows: [
        { line_number: 1, raw_account_number: '1010', raw_account_name: 'Cash', raw_debit: '100.00', raw_credit: '', mapping_status: 'unmapped' }
      ]
    }),
    getSuggestions: vi.fn().mockResolvedValue([
      { line_id: 101, suggested_account_id: 501, suggested_account_number: '1010-00', suggested_account_name: 'Cash Sub' }
    ]),
    bulkMap: vi.fn().mockResolvedValue({}),
    skipLine: vi.fn(),
    createAccountFromLine: vi.fn(),
    exportMappingsUrl: () => '/mock-export-mappings-url',
  },
}))

vi.mock('@/api/documents', () => ({
  documentsApi: {
    download: vi.fn(),
  },
}))

vi.mock('@/api/importRegistry', () => ({
  importRegistryApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, source_module: 'pdf_import', filename: 'source.pdf', source_entity_name: 'Entity A', source_id: 101, line_count: 10, status: 'applied', document_id: 99, created_at: '2026-05-01T00:00:00' }
    ]),
  },
}))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: vi.fn().mockResolvedValue([]),
    tree: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn().mockResolvedValue([{ id: 1, code: 'ENT1', name: 'Entity 1' }]),
  },
}))

vi.mock('@/api/reportingTaxonomy', () => ({
  reportingTaxonomyApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: '1000', name: 'Cash', statement_type: 'balance_sheet', section: 'assets', sort_order: 1, hierarchy_depth: 1, is_subtotal: false, parent_id: null },
      { id: 2, code: '1100', name: 'Petty Cash', statement_type: 'balance_sheet', section: 'assets', sort_order: 2, hierarchy_depth: 2, is_subtotal: false, parent_id: 1 },
    ]),
  },
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: () => ({ org: { id: 1, name: 'Default Org' } }),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tier 1.8 Frontend Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. PDFImportPage Grid rendering
  it('renders Recent Imports grid under history in PDFImportPage', async () => {
    render(wrap(<PDFImportPage />))
    await waitFor(() => {
      expect(screen.getByTestId('batch-history')).toBeInTheDocument()
      expect(screen.getByText('batch1.pdf')).toBeInTheDocument()
    })
  })

  // 2. ImportReviewPage Grids
  it('renders Lines grid and Raw Preview grid inside ImportReviewPage', async () => {
    render(
      wrap(
        <Routes>
          <Route path="/import/:id" element={<ImportReviewPage />} />
        </Routes>,
        ['/import/10']
      )
    )

    // Lines tab should show standard grid
    await waitFor(() => {
      expect(screen.getByTestId('lines-grid')).toBeInTheDocument()
      expect(screen.getByText('1010')).toBeInTheDocument()
    })

    // Click Raw Preview tab
    fireEvent.click(screen.getByText('Raw Preview'))
    await waitFor(() => {
      expect(screen.getByTestId('raw-preview-grid')).toBeInTheDocument()
    })
  })

  // 3. MappingWorkbenchPage features
  it('renders MappingWorkbenchPage with CSV Export and direct taxonomy options', async () => {
    render(
      wrap(
        <Routes>
          <Route path="/import/:id/mapping" element={<MappingWorkbenchPage />} />
        </Routes>,
        ['/import/10/mapping']
      )
    )

    await waitFor(() => {
      expect(screen.getByTestId('mapping-workbench-grid')).toBeInTheDocument()
      expect(screen.getByTestId('export-mapping-issues-btn')).toBeInTheDocument()
      expect(screen.getByTestId('direct-taxonomy-select-101')).toBeInTheDocument()
    })
  })

  // 4. DocumentsPage registry grid
  it('renders DocumentsPage registry grid with Lifecycle status, linked batch, and PDF preview actions', async () => {
    render(wrap(<DocumentsPage />))
    await waitFor(() => {
      expect(screen.getByTestId('document-registry-grid')).toBeInTheDocument()
      expect(screen.getByText('Batch #101')).toBeInTheDocument()
      expect(screen.getByTitle('Preview PDF')).toBeInTheDocument()
    })
  })

  // 5. ChartOfAccountsPage inheritance path and badges
  it('renders COA Preview slide-over with hierarchy path, sibling accounts, and inherited badges', async () => {
    const mockAccounts: Account[] = [
      { id: 10, entity_id: 1, account_number: '1000', account_name: 'Cash Parent', account_type: 'asset', account_status: 'active', normal_balance: 'debit', reporting_taxonomy_line_id: 2, parent_account_id: null, created_at: '', updated_at: '' },
      { id: 11, entity_id: 1, account_number: '1010', account_name: 'Cash Child', account_type: 'asset', account_status: 'active', normal_balance: 'debit', reporting_taxonomy_line_id: null, parent_account_id: 10, created_at: '', updated_at: '' },
      { id: 12, entity_id: 1, account_number: '1020', account_name: 'Cash Child 2', account_type: 'asset', account_status: 'active', normal_balance: 'debit', reporting_taxonomy_line_id: null, parent_account_id: 10, created_at: '', updated_at: '' },
    ]

    const mockTree = [
      {
        id: 10,
        account_number: '1000',
        account_name: 'Cash Parent',
        account_type: 'asset',
        account_status: 'active',
        normal_balance: 'debit',
        reporting_taxonomy_line_id: 2,
        parent_account_id: null,
        children: [
          { id: 11, account_number: '1010', account_name: 'Cash Child', account_type: 'asset', account_status: 'active', normal_balance: 'debit', reporting_taxonomy_line_id: null, parent_account_id: 10, children: [] },
          { id: 12, account_number: '1020', account_name: 'Cash Child 2', account_type: 'asset', account_status: 'active', normal_balance: 'debit', reporting_taxonomy_line_id: null, parent_account_id: 10, children: [] },
        ]
      }
    ]

    const { accountsApi } = await import('@/api/accounts')
    ;(accountsApi.list as any).mockResolvedValue(mockAccounts)
    ;(accountsApi.tree as any).mockResolvedValue(mockTree)

    // Render ChartOfAccountsPage with search param pointing to Entity 1
    render(
      wrap(
        <Routes>
          <Route path="/accounts" element={<ChartOfAccountsPage />} />
        </Routes>,
        ['/accounts?entity=1']
      )
    )

    // Wait for the tree to load and click on child account to open drawer
    await waitFor(() => {
      expect(screen.getByText('Cash Child')).toBeInTheDocument()
    })
    
    // Open preview drawer for Cash Child
    fireEvent.click(screen.getByText('Cash Child'))

    await waitFor(() => {
      expect(screen.getByTestId('mapping-source-badge')).toHaveTextContent('Inherited')
      expect(screen.getByTestId('fs-hierarchy-path')).toHaveTextContent('Balance Sheet')
      expect(screen.getAllByText('Cash Child 2')[0]).toBeInTheDocument() // Sibling listed
    })
  })
})
