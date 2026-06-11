import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClientDataPage } from '@/pages/ClientDataPage'

vi.mock('@/providers/OrgProvider', () => ({ useOrg: vi.fn(() => ({ org: { id: 1 } })) }))
vi.mock('@/providers/AuthProvider', () => ({
  useAuth: vi.fn(() => ({ user: null, isAuthenticated: false, isLoading: false, login: vi.fn(), logout: vi.fn(), token: null })),
}))
vi.mock('@/api/tbImport', () => ({ tbImportApi: { listBatches: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/api/pdfImport', () => ({ pdfImportApi: { list: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/api/coaImport', () => ({ coaImportApi: { list: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/api/importRegistry', () => ({ importRegistryApi: { list: vi.fn().mockResolvedValue([]) } }))

import { tbImportApi } from '@/api/tbImport'
import { pdfImportApi } from '@/api/pdfImport'
import { coaImportApi } from '@/api/coaImport'
import { importRegistryApi } from '@/api/importRegistry'

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const appliedCOA = { id: 1, entity_id: 1, filename: 'coa.csv', source_system: null, row_count: 10, accounts_created: 5, accounts_updated: 0, status: 'applied', error_message: null }
const postedTB = { id: 1, organization_id: 1, entity_id: 1, period_id: 1, scenario_id: null, filename: 'tb.csv', source_format: 'csv', content_hash: '', column_mapping: {}, as_of_date: '2025-12-31', status: 'posted' as const, row_count: 100, mapped_row_count: 100, unmapped_row_count: 0, total_debits: '1000.00', total_credits: '1000.00', error_message: null, notes: null, posted_je_id: null, reversal_je_id: null, uploaded_by_user_id: null, reviewed_by_user_id: null, uploaded_at: '2025-01-01', reviewed_at: null }

beforeEach(() => {
  vi.mocked(tbImportApi.listBatches).mockResolvedValue([])
  vi.mocked(pdfImportApi.list).mockResolvedValue([])
  vi.mocked(coaImportApi.list).mockResolvedValue([])
  vi.mocked(importRegistryApi.list).mockResolvedValue([])
})

describe('ClientDataPage — readiness grid', () => {
  it('renders the readiness grid with correct testids', async () => {
    wrap(<ClientDataPage />)
    await waitFor(() => expect(screen.getByTestId('readiness-grid')).toBeInTheDocument())
    expect(screen.getByTestId('readiness-card-coa')).toBeInTheDocument()
    expect(screen.getByTestId('readiness-card-tb')).toBeInTheDocument()
    expect(screen.getByTestId('readiness-card-pdf')).toBeInTheDocument()
    expect(screen.getByTestId('readiness-card-gl')).toBeInTheDocument()
    expect(screen.getByTestId('readiness-card-taxonomy')).toBeInTheDocument()
    expect(screen.getByTestId('readiness-card-documents')).toBeInTheDocument()
  })

  it('shows Ready when COA has an applied batch', async () => {
    vi.mocked(coaImportApi.list).mockResolvedValue([appliedCOA])
    wrap(<ClientDataPage />)
    await waitFor(() => expect(screen.getByTestId('readiness-card-coa')).toHaveTextContent('Ready'))
  })

  it('shows Setup Required when no COA batches exist', async () => {
    wrap(<ClientDataPage />)
    await waitFor(() => expect(screen.getByTestId('readiness-card-coa')).toHaveTextContent('Setup Required'))
  })

  it('shows Missing for Trial Balance when no TB batches', async () => {
    wrap(<ClientDataPage />)
    await waitFor(() => expect(screen.getByTestId('readiness-card-tb')).toHaveTextContent('Missing'))
  })

  it('shows Imported for Trial Balance when a posted TB exists', async () => {
    vi.mocked(tbImportApi.listBatches).mockResolvedValue([postedTB])
    wrap(<ClientDataPage />)
    await waitFor(() => expect(screen.getByTestId('readiness-card-tb')).toHaveTextContent('Imported'))
  })
})

describe('ClientDataPage — issue cards', () => {
  it('renders all 5 issue cards with correct testids', async () => {
    wrap(<ClientDataPage />)
    await waitFor(() => expect(screen.getByTestId('readiness-issues')).toBeInTheDocument())
    expect(screen.getByTestId('issue-card-unmapped')).toBeInTheDocument()
    expect(screen.getByTestId('issue-card-oof')).toBeInTheDocument()
    expect(screen.getByTestId('issue-card-validation')).toBeInTheDocument()
    expect(screen.getByTestId('issue-card-mapping')).toBeInTheDocument()
    expect(screen.getByTestId('issue-card-period')).toBeInTheDocument()
  })

  it('shows zero counts when no batches', async () => {
    wrap(<ClientDataPage />)
    await waitFor(() => {
      expect(screen.getByTestId('issue-card-unmapped')).toHaveTextContent('0')
      expect(screen.getByTestId('issue-card-oof')).toHaveTextContent('0')
      expect(screen.getByTestId('issue-card-validation')).toHaveTextContent('0')
    })
  })

  it('shows non-zero unmapped count when TB has unmapped rows', async () => {
    vi.mocked(tbImportApi.listBatches).mockResolvedValue([
      { ...postedTB, unmapped_row_count: 7, status: 'mapping_required' as const },
    ])
    wrap(<ClientDataPage />)
    await waitFor(() => expect(screen.getByTestId('issue-card-unmapped')).toHaveTextContent('7'))
  })
})

describe('ClientDataPage — workbench launch', () => {
  it('renders the launch workbench button', async () => {
    wrap(<ClientDataPage />)
    await waitFor(() => expect(screen.getByTestId('launch-workbench-btn')).toBeInTheDocument())
  })

  it('button is disabled when not ready', async () => {
    wrap(<ClientDataPage />)
    await waitFor(() => expect(screen.getByTestId('launch-workbench-btn')).toBeDisabled())
  })

  it('workbench readiness status shows Issues Found when not ready', async () => {
    wrap(<ClientDataPage />)
    await waitFor(() => expect(screen.getByTestId('workbench-readiness-status')).toHaveTextContent('Issues Found'))
  })

  it('button is enabled when isReady (hasCOA, hasTB, balanced, no errors, no unmapped)', async () => {
    vi.mocked(coaImportApi.list).mockResolvedValue([appliedCOA])
    vi.mocked(tbImportApi.listBatches).mockResolvedValue([postedTB])
    wrap(<ClientDataPage />)
    await waitFor(() => expect(screen.getByTestId('launch-workbench-btn')).not.toBeDisabled())
    expect(screen.getByTestId('workbench-readiness-status')).toHaveTextContent('Ready')
  })
})
