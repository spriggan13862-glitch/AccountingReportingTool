import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaxonomyMappingWorkbenchPage } from '@/pages/TaxonomyMappingWorkbenchPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/reportingViews', () => ({
  reportingViewsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'gaap', name: 'GAAP', is_default: true, is_system_defined: true, active: true, description: null },
      { id: 2, code: 'tax', name: 'Tax', is_default: false, is_system_defined: false, active: true, description: null },
    ]),
  },
}))

vi.mock('@/api/reportingTaxonomy', () => ({
  reportingTaxonomyApi: {
    list: vi.fn().mockResolvedValue([
      { id: 101, code: 'cash', name: 'Cash & Equivalents', section: 'asset', sort_order: 1, is_subtotal: false, hierarchy_depth: 0, active: true, editable: true, system_defined: false, sec_xbrl_tag: null, parent_id: null, reporting_view_id: null, description: null, normal_balance: 'debit', sign_behavior: 'positive', short_name: null, statement_type: null },
    ]),
  },
}))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, entity_id: 1, account_number: '1000', account_name: 'Cash', account_type: 'asset', normal_balance: 'debit', parent_account_id: null, active: true, detail_type: null, account_status: 'active', description: null, tax_line: null, source_system: null, reporting_taxonomy_line_id: 101, is_header: false, is_postable: true, fs_sign_convention: null, cfs_section: null, fs_statement: null, fs_section: null, fs_line_label: null, fs_line_order: null, account_path: null, depth_level: null, sort_order: null },
      { id: 2, entity_id: 1, account_number: '1100', account_name: 'Accounts Receivable', account_type: 'asset', normal_balance: 'debit', parent_account_id: null, active: true, detail_type: null, account_status: 'active', description: null, tax_line: null, source_system: null, reporting_taxonomy_line_id: null, is_header: false, is_postable: true, fs_sign_convention: null, cfs_section: null, fs_statement: null, fs_section: null, fs_line_label: null, fs_line_order: null, account_path: null, depth_level: null, sort_order: null },
    ]),
  },
}))

vi.mock('@/api/fsliMappings', () => ({
  fsliMappingsApi: {
    listWithInheritance: vi.fn().mockResolvedValue([
      { account_id: 1, account_number: '1000', account_name: 'Cash', taxonomy_line_id: 101, taxonomy_line_name: 'Cash & Equivalents', mapping_source: 'explicit', inherited_from_account_id: null, inherited_from_account_number: null, locked: false },
      { account_id: 2, account_number: '1100', account_name: 'Accounts Receivable', taxonomy_line_id: null, taxonomy_line_name: null, mapping_source: 'none', inherited_from_account_id: null, inherited_from_account_number: null, locked: false },
    ]),
    upsert: vi.fn().mockResolvedValue({}),
    toggleLock: vi.fn().mockResolvedValue({}),
    copyFromView: vi.fn().mockResolvedValue({ copied: 3 }),
    bulkAssign: vi.fn().mockResolvedValue({ updated: 2 }),
  },
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/providers/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    activeEntity: { id: 1, name: 'Test Entity', code: 'TEST' },
  }),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Taxonomy Mapping Workbench', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders workbench container', () => {
    render(wrap(<TaxonomyMappingWorkbenchPage />))
    expect(screen.getByTestId('taxonomy-mapping-workbench')).toBeTruthy()
  })

  it('shows reporting view selector', () => {
    render(wrap(<TaxonomyMappingWorkbenchPage />))
    expect(screen.getByTestId('tmw-view-selector')).toBeTruthy()
  })

  it('shows account count badge', () => {
    render(wrap(<TaxonomyMappingWorkbenchPage />))
    expect(screen.getByTestId('tmw-account-count')).toBeTruthy()
  })

  it('shows search input', () => {
    render(wrap(<TaxonomyMappingWorkbenchPage />))
    expect(screen.getByTestId('tmw-search')).toBeTruthy()
  })

  it('shows bulk assign selector', () => {
    render(wrap(<TaxonomyMappingWorkbenchPage />))
    expect(screen.getByTestId('tmw-bulk-assign')).toBeTruthy()
  })

  it('shows save and copy-from-view buttons', () => {
    render(wrap(<TaxonomyMappingWorkbenchPage />))
    expect(screen.getByTestId('tmw-save-btn')).toBeTruthy()
    expect(screen.getByTestId('tmw-copy-from-view')).toBeTruthy()
  })

  it('renders data grid', () => {
    render(wrap(<TaxonomyMappingWorkbenchPage />))
    expect(screen.getByTestId('tmw-grid')).toBeTruthy()
  })
})
