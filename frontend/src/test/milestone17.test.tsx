import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JournalEntryCreatePage } from '@/pages/JournalEntryCreatePage'
import { TrialBalanceImportPage } from '@/pages/TrialBalanceImportPage'
import { WorkflowPage } from '@/pages/WorkflowPage'
import { PeriodDetailPage } from '@/pages/PeriodDetailPage'
import { ValidationAlert } from '@/components/ui/ValidationAlert'
import type { ValidationResponse } from '@/types'

// ---- helpers ----------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrap(element: React.ReactNode, path = '/') {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ---- module mocks -----------------------------------------------------------

// Declare mock fns via vi.hoisted so they exist before vi.mock factories run
const { mockPost, mockGet } = vi.hoisted(() => ({
  mockPost: vi.fn().mockResolvedValue({ data: { success: true, errors: [], warnings: [], info: [] } }),
  mockGet: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('@/api/client', () => ({
  default: {
    post: mockPost,
    get: mockGet,
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  setOrganizationId: vi.fn(),
  setUserId: vi.fn(),
  getOrganizationId: vi.fn().mockReturnValue(1),
}))

vi.mock('@/api/journalEntries', () => ({
  journalEntriesApi: {
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 }),
    createDraft: vi.fn(),
    createAndPost: vi.fn(),
  },
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/api/tbImport', async () => {
  // re-use the real implementation so test 7 exercises actual FormData building
  const real = await vi.importActual<typeof import('@/api/tbImport')>('@/api/tbImport')
  return real
})

vi.mock('@/api/workflow', () => ({
  workflowApi: {
    listTasks: vi.fn().mockResolvedValue([
      {
        id: 42,
        title: 'Review Q1 close',
        task_type: 'review',
        status: 'open',
        priority: 'high',
        due_date: null,
        assigned_to_user_id: null,
      },
    ]),
    listSignoffs: vi.fn().mockResolvedValue([]),
    completeTask: vi.fn(),
    rejectTask: vi.fn(),
    createTask: vi.fn(),
    listIssues: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/periods', () => ({
  periodsApi: {
    get: vi.fn().mockResolvedValue({
      id: 1,
      period_name: 'March 2024',
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      fiscal_year: 2024,
      fiscal_period: 3,
      period_type: 'monthly',
      entity_id: 1,
      is_closed: false,
      closed_at: null,
      closed_by: null,
      created_at: '2024-01-01T00:00:00',
    }),
    close: vi.fn(),
    reopen: vi.fn(),
  },
}))

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: () => ({ org: { id: 1, name: 'Acme Corp' }, setOrg: vi.fn() }),
  OrgProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// ---- tests ------------------------------------------------------------------

describe('M17 proof points', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // restore default resolved value for mockPost after clearAllMocks resets it
    mockPost.mockResolvedValue({ data: { success: true, errors: [], warnings: [], info: [] } })
    mockGet.mockResolvedValue({ data: {} })
  })

  // 1. JE form renders
  it('JE create form renders header fields and line table', () => {
    render(wrap(<JournalEntryCreatePage />))
    expect(screen.getByLabelText(/JE Number/i)).toBeInTheDocument()
    expect(screen.getByTestId('je-lines-table')).toBeInTheDocument()
  })

  // 2. Debit/credit totals display
  it('totals section shows 0.00 by default for balanced empty lines', () => {
    render(wrap(<JournalEntryCreatePage />))
    const totals = screen.getByTestId('je-totals')
    // Both debits and credits start at 0.00
    expect(totals.textContent).toContain('0.00')
  })

  // 3. Validation errors display via ValidationAlert
  it('ValidationAlert renders grouped errors and warnings', () => {
    const result: ValidationResponse = {
      success: false,
      errors: [{ code: 'E001', severity: 'error', message: 'Missing account', source_type: 'line', source_id: 1, field_name: null, suggested_resolution: null }],
      warnings: [{ code: 'W001', severity: 'warning', message: 'Unusual amount', source_type: 'line', source_id: 1, field_name: null, suggested_resolution: null }],
      info: [],
    }
    render(<ValidationAlert result={result} />)
    expect(screen.getByTestId('validation-alert')).toBeInTheDocument()
    expect(screen.getByText('Missing account')).toBeInTheDocument()
    expect(screen.getByText('Unusual amount')).toBeInTheDocument()
  })

  // 4. TB upload form renders with file upload
  it('TB import form renders and contains CSV file input', () => {
    render(wrap(<TrialBalanceImportPage />))
    expect(screen.getByTestId('tb-import-form')).toBeInTheDocument()
    // FileUpload renders a hidden <input type="file">
    expect(document.querySelector('input[type="file"]')).toBeTruthy()
  })

  // 5. Workflow action buttons render for open tasks
  it('WorkflowPage renders Complete and Reject buttons for open tasks', async () => {
    render(wrap(<WorkflowPage />))
    const completeBtn = await screen.findByTestId('complete-task-42')
    const rejectBtn = await screen.findByTestId('reject-task-42')
    expect(completeBtn).toBeInTheDocument()
    expect(rejectBtn).toBeInTheDocument()
  })

  // 6. Period close handles blocking 409 error
  it('PeriodDetailPage shows ErrorBanner when close mutation rejects', async () => {
    const { periodsApi } = await import('@/api/periods')
    vi.mocked(periodsApi.close).mockRejectedValueOnce(
      new Error('Period has unresolved critical issues')
    )

    // PeriodDetailPage uses useParams — needs a real :id route param
    render(
      <QueryClientProvider client={makeClient()}>
        <MemoryRouter initialEntries={['/periods/1']}>
          <Routes>
            <Route path="/periods/:id" element={<PeriodDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // wait for the period to load
    const closeBtn = await screen.findByTestId('close-period-btn')
    fireEvent.click(closeBtn)

    // ConfirmDialog appears — find the alertdialog role, click confirm inside it
    const dialog = await screen.findByRole('alertdialog')
    const confirmBtn = within(dialog).getByRole('button', { name: /Close Period/i })
    fireEvent.click(confirmBtn)

    // ErrorBanner renders with data-testid="error-banner" (hardcoded in ErrorBanner component)
    const banner = await screen.findByTestId('error-banner')
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveTextContent('critical issues')
  })

  // 7. API client sends expected FormData payload
  it('tbImportApi.validate posts FormData to /tb-imports/validate', async () => {
    const { tbImportApi } = await import('@/api/tbImport')
    const file = new File(['account_id,balance\n1,1000'], 'tb.csv', { type: 'text/csv' })

    await tbImportApi.validate({ entity_id: 5, scenario_id: 2, as_of_date: '2024-03-31', file })

    expect(mockPost).toHaveBeenCalledOnce()
    const [url, body] = mockPost.mock.calls[0]
    expect(url).toBe('/tb-imports/validate')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('entity_id')).toBe('5')
    expect((body as FormData).get('as_of_date')).toBe('2024-03-31')
  })
})
