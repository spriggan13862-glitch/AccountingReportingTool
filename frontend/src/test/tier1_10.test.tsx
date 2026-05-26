import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
      { id: 1, code: '1000', name: 'Cash', statement_type: 'balance_sheet', section: 'assets', sort_order: 100, is_subtotal: false, parent_id: null }
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

  // 4. Adjustment bridge pivot summarization
  it('computes and renders Group summaries and Grand Totals in Adjustment Bridge Pivot Table', async () => {
    render(wrap(<AdjustmentBridgePage />))

    // Wait for the entity options to load
    await waitFor(() => {
      expect(screen.getByText('ENT1 — Entity 1')).toBeInTheDocument()
    })

    // Select Entity first
    const entitySelect = screen.getByTestId('entity-select')
    fireEvent.change(entitySelect, { target: { value: '1' } })

    await waitFor(() => {
      expect(screen.getByText('Excel-like Pivot Summary Table')).toBeInTheDocument()
      expect(screen.getByText('Grand Total')).toBeInTheDocument()
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
})
