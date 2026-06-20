import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { AccountMatchResult, ImportLine } from '@/types'

// ---------------------------------------------------------------------------
// Minimal stubs so MappingWorkbenchPage can render in isolation
// ---------------------------------------------------------------------------

const mockMatchResults: AccountMatchResult[] = [
  {
    line_id: 1,
    raw: '1200 Accounts Receivable',
    parsed_number: '1200',
    parsed_name: 'Accounts Receivable',
    match_status: 'conflict',
    matched_account_id: 5,
    matched_account_number: '1200',
    matched_account_name: 'Inventory',
    conflict_reason: "Number '1200' exists as 'Inventory' (asset), proposed type is 'asset'",
    confidence: 0,
  },
  {
    line_id: 2,
    raw: 'Cash',
    parsed_number: null,
    parsed_name: 'Cash',
    match_status: 'name_only',
    matched_account_id: 1,
    matched_account_number: '1000',
    matched_account_name: 'Cash',
    conflict_reason: null,
    confidence: 0.7,
  },
]

const mockLines: ImportLine[] = [
  {
    id: 1,
    batch_id: 10,
    line_number: 1,
    raw_account_number: '1200',
    raw_account_name: 'Accounts Receivable',
    raw_debit: '5000',
    raw_credit: null,
    raw_balance: null,
    raw_description: null,
    debit: '5000',
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
  {
    id: 2,
    batch_id: 10,
    line_number: 2,
    raw_account_number: null,
    raw_account_name: 'Cash',
    raw_debit: null,
    raw_credit: '3000',
    raw_balance: null,
    raw_description: null,
    debit: '0',
    credit: '3000',
    description: null,
    resolved_account_id: 1,
    // unmapped so the grid shows it without toggling showMapped
    mapping_status: 'unmapped',
    is_manually_mapped: false,
    mapped_by_user_id: null,
    mapped_at: null,
    suggested_account_id: null,
    notes: null,
  },
]

vi.mock('@/api/tbImport', () => ({
  tbImportApi: {
    getBatch: vi.fn().mockResolvedValue({
      id: 10, entity_id: 99, filename: 'test.csv', status: 'mapping_required',
      row_count: 2, mapped_row_count: 1, unmapped_row_count: 1,
    }),
    getBatchLines: vi.fn().mockResolvedValue(mockLines),
    getSuggestions: vi.fn().mockResolvedValue([]),
    parseAndMatch: vi.fn().mockResolvedValue(mockMatchResults),
    exportMappingsUrl: vi.fn().mockReturnValue('/export'),
  },
}))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, account_number: '1000', account_name: 'Cash', account_type: 'asset', normal_balance: 'debit', entity_id: 99, reporting_taxonomy_line_id: null },
    ]),
  },
}))

vi.mock('@/api/reportingTaxonomy', () => ({
  reportingTaxonomyApi: { list: vi.fn().mockResolvedValue([]) },
}))

vi.mock('@/api/reportingViews', () => ({
  reportingViewsApi: { list: vi.fn().mockResolvedValue([]) },
}))

vi.mock('@/api/fsliMappings', () => ({
  fsliMappingsApi: { upsert: vi.fn() },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useParams: () => ({ id: '10' }),
    useNavigate: () => vi.fn(),
  }
})

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/hooks/useFormatCurrency', () => ({
  useFormatCurrency: () => (v: number) => `$${v.toFixed(2)}`,
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MappingWorkbench conflict display', () => {
  it('shows conflict chip when match_status is conflict', async () => {
    const { MappingWorkbenchPage } = await import('@/pages/MappingWorkbenchPage')
    render(<MappingWorkbenchPage />, { wrapper })

    // Wait for conflict chip to appear
    const chips = await screen.findAllByTestId('conflict-chip')
    expect(chips.length).toBeGreaterThan(0)
    expect(chips[0]).toHaveTextContent('Number conflict')
  })

  it('shows conflicts filter option in the status dropdown', async () => {
    const { MappingWorkbenchPage } = await import('@/pages/MappingWorkbenchPage')
    render(<MappingWorkbenchPage />, { wrapper })

    const select = await screen.findByTestId('status-filter-select')
    expect(select).toBeInTheDocument()
    // The conflicts option should exist because conflictCount > 0
    await screen.findByTestId('conflicts-filter-badge')
  })

  it('shows name-match warning chip when match_status is name_only', async () => {
    const { MappingWorkbenchPage } = await import('@/pages/MappingWorkbenchPage')
    render(<MappingWorkbenchPage />, { wrapper })

    const chips = await screen.findAllByTestId('name-match-chip')
    expect(chips.length).toBeGreaterThan(0)
    expect(chips[0]).toHaveTextContent('Name match — verify')
  })
})
