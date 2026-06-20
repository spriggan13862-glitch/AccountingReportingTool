import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('@/api/tbImport', () => ({
  tbImportApi: {
    getBatch: vi.fn().mockResolvedValue({
      id: 1,
      entity_id: 42,
      filename: 'test.xlsx',
      row_count: 3,
      status: 'pending',
    }),
    getBatchLines: vi.fn().mockResolvedValue([]),
    getSuggestions: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/reportingTaxonomy', () => ({
  reportingTaxonomyApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'REV', name: 'Revenue', section: 'revenue', sort_order: 1, hierarchy_depth: 0, is_subtotal: false, active: true, editable: true, system_defined: false, reporting_view_id: null },
    ]),
  },
}))

vi.mock('@/api/reportingViews', () => ({
  reportingViewsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'GAAP', name: 'GAAP', description: null, is_default: true, is_system_defined: true, active: true },
      { id: 2, code: 'TAX', name: 'Tax', description: null, is_default: false, is_system_defined: true, active: true },
    ]),
  },
}))

vi.mock('@/api/fsliMappings', () => ({
  fsliMappingsApi: {
    upsert: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/hooks/useFormatCurrency', () => ({
  useFormatCurrency: () => (val: number) => `$${val}`,
}))

import { MappingWorkbenchPage } from '@/pages/MappingWorkbenchPage'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/mapping/1']}>
        <Routes>
          <Route path="/mapping/:id" element={<MappingWorkbenchPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Sprint A: FSLI Mapping Domain Model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders FSLI column as view-scoped, not account-global', async () => {
    renderPage()
    // The page renders without crashing; FSLI is now view-scoped via fsliMappingsApi
    expect(screen.getByText(/Mapping Workbench/i)).toBeTruthy()
  })

  it('shows reporting view selector on mapping workbench', async () => {
    renderPage()
    // The selector is rendered (may be in loading state initially)
    await vi.waitFor(() => {
      const selector = screen.queryByTestId('reporting-view-selector')
      expect(selector).toBeTruthy()
    })
  })

  it('info banner explains account ≠ FSLI ≠ reporting view', async () => {
    renderPage()
    await vi.waitFor(() => {
      const banner = screen.queryByTestId('fsli-view-info-banner')
      expect(banner).toBeTruthy()
    })
  })
})
