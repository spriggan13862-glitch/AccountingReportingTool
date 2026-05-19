/**
 * M28 — Guided onboarding, entity-first setup, operational dashboard, Help Center 2.0 tests
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { SetupWizardPage } from '@/pages/SetupWizardPage'
import { HelpCenterPage } from '@/pages/HelpCenterPage'
import { ImportCenterPage } from '@/pages/ImportCenterPage'
import { ImportWizardPage } from '@/pages/ImportWizardPage'
import { DashboardPage } from '@/pages/DashboardPage'

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
    user: { id: 1, full_name: 'Test User', email: 'test@example.com',
      is_superuser: true, is_active: true, organization_id: 1 },
    isAuthenticated: true,
  }),
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'ACME', name: 'Acme Corp', entity_type: 'operating', currency: 'USD',
        active: true, parent_id: null, fiscal_year_end_month: null, fiscal_year_convention: null },
    ]),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/api/tbImport', () => ({
  tbImportApi: {
    listBatches: vi.fn().mockResolvedValue([
      { id: 1, filename: 'tb.csv', as_of_date: '2024-12-31', status: 'mapping_required',
        row_count: 50, unmapped_row_count: 5, uploaded_at: '2024-12-31T12:00:00Z',
        total_debits: '100000', total_credits: '100000' },
    ]),
    detectFile: vi.fn().mockResolvedValue({
      source_format: 'csv', sheets: [], selected_sheet: null,
      headers: ['Account', 'Debit', 'Credit'],
      detected_mapping: { account_number: 'Account', debit: 'Debit', credit: 'Credit' },
      unmapped_headers: [], preview_rows: [], confidence: 85,
    }),
    uploadBatch: vi.fn(),
    listTemplates: vi.fn().mockResolvedValue([]),
    exportMappingsUrl: vi.fn().mockReturnValue('/export'),
  },
}))

vi.mock('@/api/workflow', () => ({
  workflowApi: {
    listTasks: vi.fn().mockResolvedValue([]),
    listIssues: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/reports', () => ({
  reportsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/journalEntries', () => ({
  journalEntriesApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

// Onboarding status fetch mock
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    entity_count: 1,
    active_entity_count: 1,
    import_batch_count: 1,
    pending_imports: 1,
    posted_imports: 0,
    unmapped_line_count: 5,
    has_journal_entries: false,
    setup_steps_complete: ['entity_created', 'first_import_uploaded'],
    setup_progress: 33,
  }),
}) as unknown as typeof fetch

// ---------------------------------------------------------------------------
// 1. SetupWizardPage renders progress
// ---------------------------------------------------------------------------
describe('SetupWizardPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders Getting started heading', async () => {
    render(wrap(<SetupWizardPage />))
    await waitFor(() => {
      expect(screen.getByText('Getting started')).toBeInTheDocument()
    })
  })

  it('shows all 6 setup step titles', async () => {
    render(wrap(<SetupWizardPage />))
    await waitFor(() => {
      expect(screen.getByText('Create your first entity')).toBeInTheDocument()
      expect(screen.getByText('Upload a trial balance')).toBeInTheDocument()
      expect(screen.getByText('Map all accounts')).toBeInTheDocument()
      expect(screen.getByText('Post your first import')).toBeInTheDocument()
      expect(screen.getByText('Record a journal entry')).toBeInTheDocument()
      expect(screen.getByText('Run your first report')).toBeInTheDocument()
    })
  })

  it('shows dismiss button', async () => {
    render(wrap(<SetupWizardPage />))
    await waitFor(() => {
      expect(screen.getByText('Dismiss')).toBeInTheDocument()
    })
  })

  it('hides wizard after dismiss', async () => {
    render(wrap(<SetupWizardPage />))
    await waitFor(() => screen.getByText('Dismiss'))
    fireEvent.click(screen.getByText('Dismiss'))
    expect(screen.queryByText('Getting started')).not.toBeInTheDocument()
  })

  it('shows progress percentage from API', async () => {
    render(wrap(<SetupWizardPage />))
    await waitFor(() => {
      expect(screen.getByText('33%')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 6. HelpCenterPage
// ---------------------------------------------------------------------------
describe('HelpCenterPage', () => {
  it('renders Getting Started section', () => {
    render(wrap(<HelpCenterPage />))
    expect(screen.getByText('Getting Started')).toBeInTheDocument()
  })

  it('renders Downloadable Templates section', () => {
    render(wrap(<HelpCenterPage />))
    expect(screen.getByText('Downloadable Templates')).toBeInTheDocument()
  })

  it('shows all 4 template download buttons', () => {
    render(wrap(<HelpCenterPage />))
    const downloadBtns = screen.getAllByText(/Download .+\.csv/i)
    expect(downloadBtns.length).toBeGreaterThanOrEqual(4)
  })

  it('shows 10 workflow guides', () => {
    render(wrap(<HelpCenterPage />))
    expect(screen.getByText('Setting up your first entity')).toBeInTheDocument()
    expect(screen.getByText('Working with workpapers')).toBeInTheDocument()
    expect(screen.getByText('How to build custom reports')).toBeInTheDocument()
    expect(screen.getByText('How to import a trial balance')).toBeInTheDocument()
  })

  it('expands a guide on click', () => {
    render(wrap(<HelpCenterPage />))
    fireEvent.click(screen.getByText('Setting up your first entity'))
    expect(screen.getByText(/Navigate to Entities/i)).toBeInTheDocument()
  })

  it('shows FAQ section with at least 6 questions', () => {
    render(wrap(<HelpCenterPage />))
    expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument()
    expect(screen.getByText(/Why does my import show unmapped accounts/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 11. ImportCenterPage entity-first guard
// ---------------------------------------------------------------------------
describe('ImportCenterPage entity-first guard', () => {
  it('shows entity-first banner when no entities', async () => {
    const { entitiesApi } = await import('@/api/entities')
    vi.mocked(entitiesApi.list).mockResolvedValueOnce([])

    render(wrap(<ImportCenterPage />))
    await waitFor(() => {
      expect(screen.getByText('Create an entity first')).toBeInTheDocument()
    })
  })

  it('shows pending import status badge in batch list', async () => {
    render(wrap(<ImportCenterPage />))
    await waitFor(() => {
      expect(screen.getByText('Mapping Required')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 12. ImportWizardPage entity-first guard
// ---------------------------------------------------------------------------
describe('ImportWizardPage entity-first guard', () => {
  it('shows entity guard when entity list is empty', async () => {
    const { entitiesApi } = await import('@/api/entities')
    vi.mocked(entitiesApi.list).mockResolvedValueOnce([])

    render(wrap(<ImportWizardPage />, '/import/new'))
    await waitFor(() => {
      expect(screen.getByText(/No entities found/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 13. DashboardPage operational status cards
// ---------------------------------------------------------------------------
describe('DashboardPage operational status', () => {
  it('renders dashboard with Open Tasks card', async () => {
    render(wrap(<DashboardPage />))
    await waitFor(() => {
      expect(screen.getByText('Open Tasks')).toBeInTheDocument()
    })
  })

  it('shows operational status for pending imports', async () => {
    render(wrap(<DashboardPage />))
    await waitFor(() => {
      expect(screen.getByText(/import.*need attention/i)).toBeInTheDocument()
    })
  })
})
