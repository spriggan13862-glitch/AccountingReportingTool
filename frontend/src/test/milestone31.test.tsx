/**
 * M31 — Entity UX, Import Center entity selector, Mapping Workbench fixes
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ImportCenterPage } from '@/pages/ImportCenterPage'
import { ImportReviewPage } from '@/pages/ImportReviewPage'
import { MappingWorkbenchPage } from '@/pages/MappingWorkbenchPage'

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
      { id: 2, code: 'LM', name: 'Live Marketing', entity_type: 'operating', active: true,
        currency: 'USD', fiscal_year_end_month: 12, fiscal_year_convention: 'calendar' },
    ]),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/api/tbImport', () => ({
  tbImportApi: {
    listBatches: vi.fn().mockResolvedValue([]),
    getBatch: vi.fn().mockResolvedValue({
      id: 42, filename: 'tb_2024.csv', as_of_date: '2024-12-31',
      status: 'mapping_required', row_count: 10, unmapped_row_count: 3,
      mapped_row_count: 7, entity_id: 1, total_debits: '100000', total_credits: '100000',
      uploaded_at: '2024-12-01T10:00:00Z',
    }),
    getBatchLines: vi.fn().mockResolvedValue([
      { id: 1, line_number: 1, raw_account_number: '1000', raw_account_name: 'Cash',
        mapping_status: 'mapped', debit: '50000', credit: '0', raw_debit: '50000', raw_credit: '0', raw_balance: null },
      { id: 2, line_number: 2, raw_account_number: '4000', raw_account_name: 'Revenue',
        mapping_status: 'unmapped', debit: '0', credit: '50000', raw_debit: '0', raw_credit: '50000', raw_balance: null },
    ]),
    getBatchIssues: vi.fn().mockResolvedValue([]),
    getSuggestions: vi.fn().mockResolvedValue([]),
    exportMappingsUrl: vi.fn().mockReturnValue('/api/v1/tb-imports/batches/42/export-mappings'),
  },
}))

// ---------------------------------------------------------------------------
// ImportCenterPage tests
// ---------------------------------------------------------------------------

describe('ImportCenterPage — M31 entity selector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Entity select (not a number input)', async () => {
    render(wrap(<ImportCenterPage />))
    // EntitySelect renders a <select> or combobox — no "Entity ID" number input
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('e.g. 1')).toBeNull()
    })
  })

  it('shows entity options in the select dropdown', async () => {
    render(wrap(<ImportCenterPage />))
    await waitFor(() => {
      // EntitySelect should show entity names
      expect(screen.getByText(/Acme Corp|ACME/)).toBeTruthy()
    })
  })

  it('renders format guidance toggle', () => {
    render(wrap(<ImportCenterPage />))
    expect(screen.getByText(/Show accepted formats/i)).toBeTruthy()
  })

  it('expands format guidance with download buttons when clicked', async () => {
    render(wrap(<ImportCenterPage />))
    const btn = screen.getByText(/Show accepted formats/i)
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByText(/Format A/i)).toBeTruthy()
      expect(screen.getByText(/Format B/i)).toBeTruthy()
      expect(screen.getByText(/Format C/i)).toBeTruthy()
      expect(screen.getByText(/Format D/i)).toBeTruthy()
    })
  })

  it('shows entity-first prompt when no entities exist', async () => {
    const { entitiesApi } = await import('@/api/entities')
    ;(entitiesApi.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    render(wrap(<ImportCenterPage />))
    await waitFor(() => {
      expect(screen.getByText(/Create an entity first/i)).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// ImportReviewPage tests
// ---------------------------------------------------------------------------

describe('ImportReviewPage — M31 split account columns', () => {
  it('shows separate Source Acct # and Source Acct Name columns', async () => {
    render(wrap(<ImportReviewPage />, '/import/42', '/import/:id'))
    await waitFor(() => {
      expect(screen.getByText(/Source Acct #/i)).toBeTruthy()
      expect(screen.getByText(/Source Acct Name/i)).toBeTruthy()
    })
  })

  it('shows account number and name in separate cells', async () => {
    render(wrap(<ImportReviewPage />, '/import/42', '/import/:id'))
    await waitFor(() => {
      // After data loads, '1000' and 'Cash' should be in separate cells
      expect(screen.getByText('1000')).toBeTruthy()
      expect(screen.getByText('Cash')).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// MappingWorkbenchPage tests
// ---------------------------------------------------------------------------

describe('MappingWorkbenchPage — M31 fixes', () => {
  it('renders the mapping explanation banner', async () => {
    render(wrap(<MappingWorkbenchPage />, '/import/42/mapping', '/import/:id/mapping'))
    await waitFor(() => {
      expect(screen.getByText(/How mapping works/i)).toBeTruthy()
      // banner uses exact text "Entity COA Account" which only appears there
      expect(screen.getAllByText(/Source Account/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Entity COA Account')).toBeTruthy()
      expect(screen.getByText('Reporting Line')).toBeTruthy()
    })
  })

  it('shows "Show all (including mapped)" toggle label', async () => {
    render(wrap(<MappingWorkbenchPage />, '/import/42/mapping', '/import/:id/mapping'))
    await waitFor(() => {
      expect(screen.getByText(/Show all \(including mapped\)/i)).toBeTruthy()
    })
  })

  it('renders export mappings button', async () => {
    render(wrap(<MappingWorkbenchPage />, '/import/42/mapping', '/import/:id/mapping'))
    await waitFor(() => {
      expect(screen.getByText(/Export Mappings/i)).toBeTruthy()
    })
  })

  it('shows unmapped lines by default', async () => {
    render(wrap(<MappingWorkbenchPage />, '/import/42/mapping', '/import/:id/mapping'))
    await waitFor(() => {
      // Line 2 is unmapped (Revenue/4000), Line 1 is mapped (Cash/1000) — only 4000 visible by default
      expect(screen.getByText('4000')).toBeTruthy()
    })
  })
})
