import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AccountTaxonomyMappingsPanel } from '@/components/taxonomy/AccountTaxonomyMappingsPanel'

vi.mock('@/api/taxonomyLibrary', () => ({
  taxonomyLibraryApi: {
    list: vi.fn(),
    getAccountMappings: vi.fn(),
    nodes: vi.fn(),
    mapAccount: vi.fn(),
    deleteMapping: vi.fn(),
  },
}))

import { taxonomyLibraryApi } from '@/api/taxonomyLibrary'

const mockTaxonomies = [
  { id: 1, code: 'US_GAAP', name: 'US GAAP', description: null, industry: null, version: '1.0', is_system: true, parent_taxonomy_id: null, is_active: true },
  { id: 2, code: 'IFRS', name: 'IFRS', description: null, industry: null, version: '1.0', is_system: true, parent_taxonomy_id: null, is_active: true },
  { id: 3, code: 'MGMT', name: 'Management', description: null, industry: null, version: '1.0', is_system: false, parent_taxonomy_id: null, is_active: true },
]

const mockNodes = [
  { id: 100, taxonomy_id: 1, parent_id: null, code: '1100', name: 'Cash', description: null, statement_type: 'balance_sheet', financial_statement_section: null, normal_balance: 'debit', sort_order: 0, level: 1, is_active: true, is_system: true, gaap_reference: null, ifrs_reference: null, xbrl_tag: null, cash_flow_classification: null, consolidation_treatment: null, kpi_eligible: false, industry: null },
  { id: 101, taxonomy_id: 1, parent_id: null, code: '1200', name: 'Accounts Receivable', description: null, statement_type: 'balance_sheet', financial_statement_section: null, normal_balance: 'debit', sort_order: 1, level: 1, is_active: true, is_system: true, gaap_reference: null, ifrs_reference: null, xbrl_tag: null, cash_flow_classification: null, consolidation_treatment: null, kpi_eligible: false, industry: null },
]

function renderPanel(accountId = 42) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AccountTaxonomyMappingsPanel accountId={accountId} />
    </QueryClientProvider>
  )
}

describe('AccountTaxonomyMappingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(taxonomyLibraryApi.list as any).mockResolvedValue(mockTaxonomies)
    ;(taxonomyLibraryApi.getAccountMappings as any).mockResolvedValue([])
    ;(taxonomyLibraryApi.nodes as any).mockResolvedValue(mockNodes)
    ;(taxonomyLibraryApi.mapAccount as any).mockResolvedValue({})
    ;(taxonomyLibraryApi.deleteMapping as any).mockResolvedValue(undefined)
  })

  it('renders one card per taxonomy', async () => {
    renderPanel()
    await waitFor(() => {
      expect(screen.getByTestId('taxonomy-card-1')).toBeInTheDocument()
      expect(screen.getByTestId('taxonomy-card-2')).toBeInTheDocument()
      expect(screen.getByTestId('taxonomy-card-3')).toBeInTheDocument()
    })
    expect(screen.getByText('US GAAP')).toBeInTheDocument()
    expect(screen.getByText('IFRS')).toBeInTheDocument()
    expect(screen.getByText('Management')).toBeInTheDocument()
  })

  it('shows existing mapping with node code and name', async () => {
    ;(taxonomyLibraryApi.getAccountMappings as any).mockResolvedValue([
      { id: 500, account_id: 42, taxonomy_id: 1, taxonomy_node_id: 100, mapping_type: 'primary', confidence_score: 0.92, mapping_source: 'user_selected', is_primary: true },
    ])
    renderPanel()
    // Open picker for taxonomy 1 so nodes are loaded and resolved
    await waitFor(() => screen.getByTestId('taxonomy-card-1'))
    fireEvent.click(screen.getByTestId('picker-toggle-1'))
    await waitFor(() => {
      expect(screen.getByText('1100')).toBeInTheDocument()
      expect(screen.getAllByText('Cash').length).toBeGreaterThan(0)
    })
  })

  it('confidence chip color matches score (green/yellow/red)', async () => {
    ;(taxonomyLibraryApi.getAccountMappings as any).mockResolvedValue([
      { id: 501, account_id: 42, taxonomy_id: 1, taxonomy_node_id: 100, mapping_type: 'primary', confidence_score: 0.95, mapping_source: 'user_selected', is_primary: true },
      { id: 502, account_id: 42, taxonomy_id: 2, taxonomy_node_id: 100, mapping_type: 'primary', confidence_score: 0.6, mapping_source: 'ai_suggested', is_primary: false },
      { id: 503, account_id: 42, taxonomy_id: 3, taxonomy_node_id: 100, mapping_type: 'primary', confidence_score: 0.3, mapping_source: 'ai_suggested', is_primary: false },
    ])
    renderPanel()
    await waitFor(() => {
      expect(screen.getByTestId('confidence-chip-1').className).toContain('emerald')
      expect(screen.getByTestId('confidence-chip-2').className).toContain('yellow')
      expect(screen.getByTestId('confidence-chip-3').className).toContain('rose')
    })
  })

  it('selecting a node and clicking Save calls mapAccount', async () => {
    renderPanel(42)
    await waitFor(() => screen.getByTestId('taxonomy-card-1'))
    fireEvent.click(screen.getByTestId('picker-toggle-1'))
    await waitFor(() => screen.getByTestId('node-select-1'))
    fireEvent.change(screen.getByTestId('node-select-1'), { target: { value: '101' } })
    fireEvent.click(screen.getByTestId('save-mapping-1'))
    await waitFor(() => {
      expect(taxonomyLibraryApi.mapAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 42,
          taxonomy_id: 1,
          taxonomy_node_id: 101,
        })
      )
    })
  })

  it('Clear button is hidden when no mapping exists', async () => {
    renderPanel()
    await waitFor(() => screen.getByTestId('taxonomy-card-1'))
    expect(screen.queryByTestId('clear-mapping-1')).toBeNull()
    expect(screen.queryByTestId('clear-mapping-2')).toBeNull()
    expect(screen.queryByTestId('clear-mapping-3')).toBeNull()
  })

  it('Clear button calls deleteMapping for existing mapping', async () => {
    ;(taxonomyLibraryApi.getAccountMappings as any).mockResolvedValue([
      { id: 777, account_id: 42, taxonomy_id: 2, taxonomy_node_id: 100, mapping_type: 'primary', confidence_score: null, mapping_source: 'user_selected', is_primary: true },
    ])
    renderPanel()
    await waitFor(() => screen.getByTestId('clear-mapping-2'))
    fireEvent.click(screen.getByTestId('clear-mapping-2'))
    await waitFor(() => {
      expect(taxonomyLibraryApi.deleteMapping).toHaveBeenCalledWith(777)
    })
  })
})
