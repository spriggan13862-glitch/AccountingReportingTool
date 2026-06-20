import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ImportWizardPage } from '@/pages/ImportWizardPage'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: () => ({ org: { id: 1, name: 'Test Org' } }),
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 1, full_name: 'Test User', email: 'test@example.com', is_superuser: true, is_active: true, organization_id: 1 },
  }),
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'ACME-US', name: 'Acme US', entity_type: 'operating', currency: 'USD', active: true, parent_id: null, fiscal_year_end_month: null, fiscal_year_convention: null },
    ]),
  },
}))

vi.mock('@/api/periods', () => ({
  periodsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/reportingSettings', () => ({
  reportingSettingsApi: {
    get: vi.fn().mockResolvedValue({
      decimal_places: 0,
      currency_symbol: '$',
      negative_format: 'parentheses',
    }),
  },
}))

vi.mock('@/api/reportingTaxonomy', () => ({
  reportingTaxonomyApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/tbImport', () => ({
  tbImportApi: {
    detectFile: vi.fn().mockResolvedValue({
      source_format: 'csv',
      sheets: [],
      selected_sheet: null,
      headers: ['Account', 'Debit', 'Credit'],
      detected_mapping: { account_number: 'Account', debit: 'Debit', credit: 'Credit' },
      unmapped_headers: [],
      preview_rows: [{ Account: '1000', Debit: '500', Credit: '' }],
      confidence: 95,
    }),
    uploadBatch: vi.fn().mockResolvedValue({
      id: 99, organization_id: 1, entity_id: 1, period_id: null, scenario_id: null,
      filename: 'tb.csv', source_format: 'csv', content_hash: 'h',
      column_mapping: {}, as_of_date: '2026-06-30', status: 'mapping_required',
      row_count: 1, mapped_row_count: 0, unmapped_row_count: 1,
      total_debits: null, total_credits: null, error_message: null, notes: null,
      posted_je_id: null, reversal_je_id: null, uploaded_by_user_id: null,
      reviewed_by_user_id: null, uploaded_at: '2026-06-01T00:00:00Z', reviewed_at: null,
    }),
  },
}))

const mockTaxonomyList = vi.fn()

vi.mock('@/api/taxonomyLibrary', () => ({
  taxonomyLibraryApi: {
    list: (...args: unknown[]) => mockTaxonomyList(...args),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function wrap(element: React.ReactNode, path = '/import/new', routePath = '*') {
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

const systemTaxonomies = [
  { id: 1, code: 'us-gaap', name: 'US GAAP', description: 'US GAAP standard', industry: null, version: '1.0', is_system: true, parent_taxonomy_id: null, is_active: true },
  { id: 2, code: 'ifrs', name: 'IFRS', description: 'IFRS standard', industry: null, version: '1.0', is_system: true, parent_taxonomy_id: null, is_active: true },
  { id: 3, code: 'management', name: 'Management', description: 'Mgmt reporting', industry: null, version: '1.0', is_system: true, parent_taxonomy_id: null, is_active: true },
  { id: 4, code: 'acme-custom', name: 'Custom Co', description: null, industry: null, version: '1.0', is_system: false, parent_taxonomy_id: null, is_active: true },
]

async function advanceToMappingBasisStep() {
  await waitFor(() => expect(screen.getByText('ACME-US — Acme US')).toBeInTheDocument())
  fireEvent.change(screen.getByLabelText('Entity *'), { target: { value: '1' } })
  const dateInput = document.querySelector('input[type="date"]')
  fireEvent.change(dateInput!, { target: { value: '2026-06-30' } })
  const file = new File(['x'], 'tb.csv', { type: 'text/csv' })
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
  fireEvent.click(screen.getByText(/Analyze File/i))
  await waitFor(() => expect(screen.getByText(/Confirm column mapping/i)).toBeInTheDocument())
  fireEvent.click(screen.getByTestId('continue-to-mapping-basis-btn'))
  await waitFor(() => expect(screen.getByTestId('mapping-basis-step')).toBeInTheDocument())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImportWizard — Mapping Basis step (issue 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mockTaxonomyList.mockResolvedValue(systemTaxonomies)
  })

  it('renders system taxonomies fetched from the API', async () => {
    render(wrap(<ImportWizardPage />))
    await advanceToMappingBasisStep()

    expect(screen.getByText('US GAAP')).toBeInTheDocument()
    expect(screen.getByText('IFRS')).toBeInTheDocument()
    expect(screen.getByText('Management')).toBeInTheDocument()
    // Non-system taxonomy should not appear
    expect(screen.queryByText('Custom Co')).not.toBeInTheDocument()
  })

  it('defaults US GAAP and Management to checked', async () => {
    render(wrap(<ImportWizardPage />))
    await advanceToMappingBasisStep()

    const usGaap = screen.getByTestId('taxonomy-checkbox-1') as HTMLInputElement
    const ifrs = screen.getByTestId('taxonomy-checkbox-2') as HTMLInputElement
    const mgmt = screen.getByTestId('taxonomy-checkbox-3') as HTMLInputElement

    expect(usGaap.checked).toBe(true)
    expect(mgmt.checked).toBe(true)
    expect(ifrs.checked).toBe(false)
  })

  it('Skip button advances without selection', async () => {
    render(wrap(<ImportWizardPage />))
    await advanceToMappingBasisStep()

    fireEvent.click(screen.getByTestId('skip-taxonomy-btn'))

    await waitFor(() => expect(screen.getByText(/Step 5 — Data preview/i)).toBeInTheDocument())
  })

  it('selected taxonomy IDs land in localStorage under the wizard key', async () => {
    render(wrap(<ImportWizardPage />))
    await advanceToMappingBasisStep()

    // Toggle IFRS on (US GAAP + Management already default-checked)
    fireEvent.click(screen.getByTestId('taxonomy-checkbox-2'))

    // Continue through to confirm step
    fireEvent.click(screen.getByTestId('continue-taxonomy-btn'))
    await waitFor(() => expect(screen.getByText(/Step 5 — Data preview/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Continue/i))
    await waitFor(() => expect(screen.getByText(/Account mapping summary/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Review & Confirm/i))
    await waitFor(() => expect(screen.getByText(/Confirm and upload/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Upload & Begin Import/i))

    await waitFor(() => {
      const stored = window.localStorage.getItem('import-wizard-taxonomy-ids')
      expect(stored).not.toBeNull()
      const ids = JSON.parse(stored!) as number[]
      expect(ids.sort()).toEqual([1, 2, 3])
    })
  })

  it('renders the seed instruction message when no system taxonomies are returned', async () => {
    mockTaxonomyList.mockResolvedValueOnce([
      { id: 4, code: 'acme-custom', name: 'Custom Co', description: null, industry: null, version: '1.0', is_system: false, parent_taxonomy_id: null, is_active: true },
    ])

    render(wrap(<ImportWizardPage />))
    await advanceToMappingBasisStep()

    expect(screen.getByTestId('no-system-taxonomies-warning')).toBeInTheDocument()
    expect(screen.getByText(/seed_taxonomies\.py/)).toBeInTheDocument()
    // Skip still works
    fireEvent.click(screen.getByTestId('skip-taxonomy-btn'))
    await waitFor(() => expect(screen.getByText(/Step 5 — Data preview/i)).toBeInTheDocument())
  })
})
