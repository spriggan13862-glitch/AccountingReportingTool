import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { TaxonomyLibraryPage } from '@/pages/TaxonomyLibraryPage'
import type { Taxonomy, TaxonomyDetail, TaxonomyNodeTree } from '@/api/taxonomyLibrary'

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockTaxonomies: Taxonomy[] = [
  {
    id: 1,
    code: 'us-gaap',
    name: 'US GAAP Standard',
    description: 'Standard US GAAP taxonomy',
    industry: 'general',
    version: '1.0',
    is_system: true,
    parent_taxonomy_id: null,
    is_active: true,
  },
  {
    id: 2,
    code: 'ifrs',
    name: 'IFRS Standard',
    description: null,
    industry: null,
    version: '1.0',
    is_system: true,
    parent_taxonomy_id: null,
    is_active: true,
  },
  {
    id: 3,
    code: 'acme-custom',
    name: 'Acme Custom Taxonomy',
    description: 'Custom for Acme Co',
    industry: 'manufacturing',
    version: '1.0',
    is_system: false,
    parent_taxonomy_id: 1,
    is_active: true,
  },
]

const mockDetail: TaxonomyDetail = {
  ...mockTaxonomies[0],
  node_count: 42,
}

const mockCustomDetail: TaxonomyDetail = {
  ...mockTaxonomies[2],
  node_count: 10,
}

const mockTree: TaxonomyNodeTree[] = [
  {
    id: 100,
    taxonomy_id: 1,
    parent_id: null,
    code: '1000',
    name: 'Assets',
    description: null,
    statement_type: 'balance_sheet',
    financial_statement_section: 'assets',
    normal_balance: 'debit',
    sort_order: 1,
    level: 0,
    is_active: true,
    is_system: true,
    gaap_reference: null,
    ifrs_reference: null,
    xbrl_tag: null,
    cash_flow_classification: null,
    consolidation_treatment: null,
    kpi_eligible: false,
    industry: null,
    children: [
      {
        id: 101,
        taxonomy_id: 1,
        parent_id: 100,
        code: '1100',
        name: 'Current Assets',
        description: null,
        statement_type: 'balance_sheet',
        financial_statement_section: 'current_assets',
        normal_balance: 'debit',
        sort_order: 1,
        level: 1,
        is_active: true,
        is_system: true,
        gaap_reference: null,
        ifrs_reference: null,
        xbrl_tag: null,
        cash_flow_classification: null,
        consolidation_treatment: null,
        kpi_eligible: false,
        industry: null,
        children: [],
      },
    ],
  },
  {
    id: 200,
    taxonomy_id: 1,
    parent_id: null,
    code: '2000',
    name: 'Liabilities',
    description: null,
    statement_type: 'balance_sheet',
    financial_statement_section: 'liabilities',
    normal_balance: 'credit',
    sort_order: 2,
    level: 0,
    is_active: true,
    is_system: true,
    gaap_reference: null,
    ifrs_reference: null,
    xbrl_tag: null,
    cash_flow_classification: null,
    consolidation_treatment: null,
    kpi_eligible: false,
    industry: null,
    children: [],
  },
]

// ---------------------------------------------------------------------------
// API mock
// ---------------------------------------------------------------------------

const { mockList, mockGet, mockTree: mockTreeFn, mockClone, mockExportCsv, mockExportExcel, mockExportJson, mockToast } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockGet: vi.fn(),
  mockTree: vi.fn(),
  mockClone: vi.fn(),
  mockExportCsv: vi.fn(),
  mockExportExcel: vi.fn(),
  mockExportJson: vi.fn(),
  mockToast: vi.fn(),
}))

vi.mock('@/api/taxonomyLibrary', () => ({
  taxonomyLibraryApi: {
    list: mockList,
    get: mockGet,
    tree: mockTreeFn,
    nodes: vi.fn(),
    clone: mockClone,
    createNode: vi.fn(),
    updateNode: vi.fn(),
    deactivateNode: vi.fn(),
    exportCsv: mockExportCsv,
    exportExcel: mockExportExcel,
    exportJson: mockExportJson,
    mapAccount: vi.fn(),
    getAccountMappings: vi.fn(),
    deleteMapping: vi.fn(),
  },
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => mockToast,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={['/taxonomy/library']}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaxonomyLibraryPage — Sprint O5', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue(mockTaxonomies)
    mockGet.mockResolvedValue(mockDetail)
    mockTreeFn.mockResolvedValue(mockTree)
    mockClone.mockResolvedValue({ ...mockTaxonomies[2], id: 4, name: 'US GAAP Standard - Custom' })
    mockExportCsv.mockResolvedValue(new Blob(['csv'], { type: 'text/csv' }))
    mockExportExcel.mockResolvedValue(new Blob(['xlsx'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    mockExportJson.mockResolvedValue(new Blob(['{}'], { type: 'application/json' }))
  })

  it('renders system and custom taxonomy sections', async () => {
    render(wrap(<TaxonomyLibraryPage />))
    await waitFor(() => {
      expect(screen.getByTestId('system-taxonomies-section')).toBeInTheDocument()
      expect(screen.getByTestId('custom-taxonomies-section')).toBeInTheDocument()
    })
    expect(screen.getByTestId('taxonomy-row-1')).toBeInTheDocument()
    expect(screen.getByTestId('taxonomy-row-2')).toBeInTheDocument()
    expect(screen.getByTestId('taxonomy-row-3')).toBeInTheDocument()
  })

  it('selecting a taxonomy loads tree', async () => {
    render(wrap(<TaxonomyLibraryPage />))
    await waitFor(() => expect(screen.getByTestId('taxonomy-row-1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('taxonomy-row-1'))
    await waitFor(() => expect(mockTreeFn).toHaveBeenCalledWith(1))
    await waitFor(() => {
      expect(screen.getByTestId('node-row-100')).toBeInTheDocument()
      expect(screen.getByTestId('node-row-200')).toBeInTheDocument()
    })
  })

  it('download CSV triggers export call', async () => {
    const createObjectURLSpy = vi.fn(() => 'blob:mock-url')
    const revokeObjectURLSpy = vi.fn()
    Object.defineProperty(window.URL, 'createObjectURL', { value: createObjectURLSpy, writable: true })
    Object.defineProperty(window.URL, 'revokeObjectURL', { value: revokeObjectURLSpy, writable: true })

    const originalCreateElement = document.createElement.bind(document)
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag) as HTMLElement
      if (tag === 'a') {
        ;(el as HTMLAnchorElement).click = clickSpy
      }
      return el as never
    })

    render(wrap(<TaxonomyLibraryPage />))
    await waitFor(() => expect(screen.getByTestId('taxonomy-row-1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('taxonomy-row-1'))
    await waitFor(() => expect(screen.getByTestId('download-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('download-button'))
    await waitFor(() => expect(screen.getByTestId('download-csv')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('download-csv'))
    await waitFor(() => expect(mockExportCsv).toHaveBeenCalledWith(1))
    await waitFor(() => expect(clickSpy).toHaveBeenCalled())

    vi.restoreAllMocks()
  })

  it('clone modal opens and submits', async () => {
    render(wrap(<TaxonomyLibraryPage />))
    await waitFor(() => expect(screen.getByTestId('taxonomy-row-1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('taxonomy-row-1'))
    await waitFor(() => expect(screen.getByTestId('clone-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('clone-button'))
    expect(screen.getByTestId('clone-modal')).toBeInTheDocument()
    const nameInput = screen.getByTestId('clone-name-input') as HTMLInputElement
    expect(nameInput.value).toBe('US GAAP Standard - Custom')
    fireEvent.change(nameInput, { target: { value: 'My Custom Taxonomy' } })
    fireEvent.click(screen.getByTestId('clone-submit'))
    await waitFor(() =>
      expect(mockClone).toHaveBeenCalledWith(1, { name: 'My Custom Taxonomy', code: undefined }),
    )
  })

  it('edit buttons hidden for system taxonomies', async () => {
    render(wrap(<TaxonomyLibraryPage />))
    await waitFor(() => expect(screen.getByTestId('taxonomy-row-1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('taxonomy-row-1'))
    await waitFor(() => expect(screen.getByTestId('node-row-100')).toBeInTheDocument())
    expect(screen.queryByTestId('node-edit-100')).not.toBeInTheDocument()
    expect(screen.queryByTestId('node-deactivate-100')).not.toBeInTheDocument()

    mockGet.mockResolvedValue(mockCustomDetail)
    mockTreeFn.mockResolvedValue(mockTree)
    fireEvent.click(screen.getByTestId('taxonomy-row-3'))
    await waitFor(() => expect(mockTreeFn).toHaveBeenLastCalledWith(3))
    await waitFor(() => expect(screen.getByTestId('node-edit-100')).toBeInTheDocument())
    expect(screen.getByTestId('node-deactivate-100')).toBeInTheDocument()
  })
})
