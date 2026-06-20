import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ImportReviewPage } from '@/pages/ImportReviewPage'
import type { ImportBatch, ImportLine, ImportIssue, DetectedTotalRow } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrap(ui: React.ReactElement, path = '/import/1', client = makeClient()) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBatch: ImportBatch = {
  id: 1,
  organization_id: 1,
  entity_id: 1,
  period_id: null,
  scenario_id: null,
  filename: 'test_tb.csv',
  source_format: 'csv',
  content_hash: 'abc123',
  column_mapping: {},
  as_of_date: '2024-12-31',
  status: 'mapping_required',
  row_count: 5,
  mapped_row_count: 3,
  unmapped_row_count: 2,
  total_debits: '150000',
  total_credits: '150000',
  error_message: null,
  notes: null,
  posted_je_id: null,
  reversal_je_id: null,
  uploaded_by_user_id: 1,
  reviewed_by_user_id: null,
  uploaded_at: '2024-12-31T00:00:00',
  reviewed_at: null,
}

const mockLines: ImportLine[] = [
  {
    id: 1,
    batch_id: 1,
    line_number: 1,
    raw_account_number: '1000',
    raw_account_name: 'Cash',
    raw_debit: '50000',
    raw_credit: null,
    raw_balance: null,
    raw_description: null,
    debit: '50000',
    credit: '0',
    description: null,
    resolved_account_id: 10,
    mapping_status: 'mapped',
    is_manually_mapped: false,
    mapped_by_user_id: null,
    mapped_at: null,
    suggested_account_id: null,
    notes: null,
  },
  {
    id: 2,
    batch_id: 1,
    line_number: 2,
    raw_account_number: '',
    raw_account_name: 'Total Assets',
    raw_debit: '100000',
    raw_credit: null,
    raw_balance: null,
    raw_description: null,
    debit: '100000',
    credit: '0',
    description: null,
    resolved_account_id: null,
    mapping_status: 'unmapped',
    is_manually_mapped: false,
    mapped_by_user_id: null,
    mapped_at: null,
    suggested_account_id: null,
    notes: null,
  },
]

const mockIssuesWithBlocking: ImportIssue[] = [
  {
    id: 1,
    batch_id: 1,
    import_line_id: null,
    severity: 'ERROR',
    code: 'OUT_OF_BALANCE',
    message: 'Import does not balance: total debits=100000, total credits=80000.',
    field_name: null,
    suggested_resolution: 'Check for missing or mis-mapped accounts.',
    resolved: false,
    created_at: '2024-12-31T00:00:00',
  },
  {
    id: 2,
    batch_id: 1,
    import_line_id: 2,
    severity: 'WARNING',
    code: 'MISSING_FSLI',
    message: 'Account Cash has no FSLI taxonomy line assigned.',
    field_name: null,
    suggested_resolution: 'Assign a taxonomy line in the Mapping Workbench.',
    resolved: false,
    created_at: '2024-12-31T00:00:00',
  },
]

const mockDetectedTotals: DetectedTotalRow[] = [
  { line_id: 2, reason: 'total_row', confidence: 0.95 },
]

vi.mock('@/api/tbImport', () => ({
  tbImportApi: {
    getBatch: vi.fn().mockResolvedValue(mockBatch),
    getBatchLines: vi.fn().mockResolvedValue(mockLines),
    getBatchIssues: vi.fn().mockResolvedValue(mockIssuesWithBlocking),
    getRawPreview: vi.fn().mockResolvedValue({ rows: [], source_headers: [], column_mapping: {}, total_rows: 0, showing: 0, source_format: 'csv' }),
    validateBatch: vi.fn().mockResolvedValue({ success: false, errors: mockIssuesWithBlocking.filter(i => i.severity === 'ERROR'), warnings: [], info: [] }),
    postBatch: vi.fn(),
    rollbackBatch: vi.fn(),
    detectTotalRows: vi.fn().mockResolvedValue(mockDetectedTotals),
    excludeLines: vi.fn().mockResolvedValue(undefined),
    exportMappingsUrl: vi.fn().mockReturnValue('/api/v1/tb-imports/batches/1/export-mappings'),
  },
}))

vi.mock('@/hooks/useFormatCurrency', () => ({
  useFormatCurrencyCompact: () => (n: number) => `$${n.toLocaleString()}`,
}))

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: () => ({ org: { id: 1, name: 'Test Org' } }),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Import Review Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders issues panel with severity grouping', async () => {
    const { tbImportApi } = await import('@/api/tbImport')
    ;(tbImportApi.getBatchIssues as ReturnType<typeof vi.fn>).mockResolvedValue(mockIssuesWithBlocking)

    render(wrap(
      <MemoryRouter initialEntries={['/import/1']}>
        <ImportReviewPage />
      </MemoryRouter>
    ))

    const issuesTab = await screen.findByText(/Validation Issues/i)
    fireEvent.click(issuesTab)

    await waitFor(() => {
      expect(screen.getByText(/Error/i)).toBeInTheDocument()
    })
  })

  it('shows blocking badge on blocking error codes', async () => {
    const { tbImportApi } = await import('@/api/tbImport')
    ;(tbImportApi.getBatchIssues as ReturnType<typeof vi.fn>).mockResolvedValue(mockIssuesWithBlocking)

    render(wrap(
      <MemoryRouter initialEntries={['/import/1']}>
        <ImportReviewPage />
      </MemoryRouter>
    ))

    const issuesTab = await screen.findByText(/Validation Issues/i)
    fireEvent.click(issuesTab)

    await waitFor(() => {
      expect(screen.getByText(/Blocks posting/i)).toBeInTheDocument()
    })
  })

  it('shows detect total rows button', async () => {
    render(wrap(
      <MemoryRouter initialEntries={['/import/1']}>
        <ImportReviewPage />
      </MemoryRouter>
    ))

    await waitFor(() => {
      expect(screen.getByTestId('detect-total-rows-btn')).toBeInTheDocument()
    })
  })

  it('table has sticky header', async () => {
    render(wrap(
      <MemoryRouter initialEntries={['/import/1']}>
        <ImportReviewPage />
      </MemoryRouter>
    ))

    await waitFor(() => {
      const thead = document.querySelector('thead.sticky')
      expect(thead).not.toBeNull()
    })
  })

  it('shows batch action toolbar after detecting total rows', async () => {
    const { tbImportApi } = await import('@/api/tbImport')
    ;(tbImportApi.detectTotalRows as ReturnType<typeof vi.fn>).mockResolvedValue(mockDetectedTotals)

    render(wrap(
      <MemoryRouter initialEntries={['/import/1']}>
        <ImportReviewPage />
      </MemoryRouter>
    ))

    const detectBtn = await screen.findByTestId('detect-total-rows-btn')
    fireEvent.click(detectBtn)

    await waitFor(() => {
      expect(screen.getByText(/Exclude.*detected row/i)).toBeInTheDocument()
    })
  })
})
