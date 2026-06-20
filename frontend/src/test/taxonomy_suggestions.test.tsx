import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { TaxonomySuggestionPanel } from '@/components/taxonomy/TaxonomySuggestionPanel'
import type { MappingSuggestion } from '@/api/taxonomyLibrary'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockBulkSuggest, mockApplySuggestions, mockToast, mockAccountsList } = vi.hoisted(() => ({
  mockBulkSuggest: vi.fn(),
  mockApplySuggestions: vi.fn(),
  mockToast: vi.fn(),
  mockAccountsList: vi.fn(),
}))

vi.mock('@/api/taxonomyLibrary', () => ({
  taxonomyLibraryApi: {
    bulkSuggest: mockBulkSuggest,
    applySuggestions: mockApplySuggestions,
  },
}))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: mockAccountsList,
  },
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => mockToast,
}))

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const high: MappingSuggestion = {
  taxonomy_id: 1,
  taxonomy_code: 'us-gaap',
  taxonomy_node_id: 100,
  node_code: 'CASH',
  node_name: 'Cash',
  confidence_score: 0.9,
  reason: 'keyword match: cash',
}

const medium: MappingSuggestion = {
  taxonomy_id: 1,
  taxonomy_code: 'us-gaap',
  taxonomy_node_id: 110,
  node_code: 'AR',
  node_name: 'Accounts Receivable',
  confidence_score: 0.65,
  reason: 'account number range 1100-1199',
}

const low: MappingSuggestion = {
  taxonomy_id: 1,
  taxonomy_code: 'us-gaap',
  taxonomy_node_id: 120,
  node_code: 'OTHER_CURRENT_ASSET',
  node_name: 'Other Current Asset',
  confidence_score: 0.4,
  reason: 'account_type fallback',
}

const bulkSuggestData = {
  suggestions: {
    10: [high],
    11: [medium],
    12: [low],
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function wrap(ui: React.ReactElement) {
  return <QueryClientProvider client={makeClient()}>{ui}</QueryClientProvider>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaxonomySuggestionPanel — Sprint O6', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBulkSuggest.mockResolvedValue(bulkSuggestData)
    mockApplySuggestions.mockResolvedValue({ applied: 2, skipped: 1 })
  })

  it('renders suggestions from bulk suggest API', async () => {
    render(wrap(<TaxonomySuggestionPanel accountIds={[10, 11, 12]} taxonomyIds={[1]} />))
    await waitFor(() => expect(mockBulkSuggest).toHaveBeenCalledWith({
      account_ids: [10, 11, 12],
      taxonomy_ids: [1],
    }))
    await waitFor(() => expect(screen.getByTestId('taxonomy-suggestion-panel')).toBeInTheDocument())
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('Accounts Receivable')).toBeInTheDocument()
    expect(screen.getByText('Other Current Asset')).toBeInTheDocument()
  })

  it('confidence chips render correct colour classes (green/yellow/red)', async () => {
    render(wrap(<TaxonomySuggestionPanel accountIds={[10, 11, 12]} taxonomyIds={[1]} />))
    await waitFor(() => expect(screen.getByTestId('taxonomy-suggestion-panel')).toBeInTheDocument())

    const highChip = screen.getByTestId('confidence-chip-10::1::100')
    const mediumChip = screen.getByTestId('confidence-chip-11::1::110')
    const lowChip = screen.getByTestId('confidence-chip-12::1::120')

    expect(highChip.className).toContain('emerald')
    expect(mediumChip.className).toContain('amber')
    expect(lowChip.className).toContain('rose')
  })

  it('Apply Selected calls applySuggestions with only checked items', async () => {
    render(wrap(<TaxonomySuggestionPanel accountIds={[10, 11, 12]} taxonomyIds={[1]} />))
    await waitFor(() => expect(screen.getByTestId('taxonomy-suggestion-panel')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('suggestion-checkbox-10::1::100'))
    fireEvent.click(screen.getByTestId('suggestion-checkbox-11::1::110'))
    fireEvent.click(screen.getByTestId('apply-selected-btn'))

    await waitFor(() => expect(mockApplySuggestions).toHaveBeenCalledTimes(1))
    const call = mockApplySuggestions.mock.calls[0][0]
    expect(call.overwrite_existing).toBe(false)
    expect(call.suggestions).toHaveLength(2)
    const accountIds = call.suggestions.map((s: { account_id: number }) => s.account_id).sort()
    expect(accountIds).toEqual([10, 11])
  })

  it('Apply All filters by confidence threshold', async () => {
    render(
      wrap(
        <TaxonomySuggestionPanel
          accountIds={[10, 11, 12]}
          taxonomyIds={[1]}
          defaultApplyThreshold={0.7}
        />,
      ),
    )
    await waitFor(() => expect(screen.getByTestId('taxonomy-suggestion-panel')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('apply-all-btn'))

    await waitFor(() => expect(mockApplySuggestions).toHaveBeenCalledTimes(1))
    const call = mockApplySuggestions.mock.calls[0][0]
    expect(call.suggestions).toHaveLength(1)
    expect(call.suggestions[0].account_id).toBe(10)
    expect(call.suggestions[0].confidence_score).toBe(0.9)
  })
})

// ---------------------------------------------------------------------------
// Issue 10 — Redesign tests
// ---------------------------------------------------------------------------

const accountFixtures = [
  {
    id: 10, entity_id: 1, account_number: '1000', account_name: 'Cash',
    account_type: 'asset', normal_balance: 'debit', parent_account_id: null,
    active: true, detail_type: null, account_status: 'active', description: null,
    tax_line: null, source_system: null, reporting_taxonomy_line_id: null,
    is_header: false, is_postable: true, fs_sign_convention: null,
    cfs_section: null, fs_statement: null, fs_section: null, fs_line_label: null,
    fs_line_order: null, account_path: null, depth_level: null, sort_order: null,
  },
  {
    id: 11, entity_id: 1, account_number: '1100', account_name: 'Accounts Receivable',
    account_type: 'asset', normal_balance: 'debit', parent_account_id: null,
    active: true, detail_type: null, account_status: 'active', description: null,
    tax_line: null, source_system: null, reporting_taxonomy_line_id: null,
    is_header: false, is_postable: true, fs_sign_convention: null,
    cfs_section: null, fs_statement: null, fs_section: null, fs_line_label: null,
    fs_line_order: null, account_path: null, depth_level: null, sort_order: null,
  },
  {
    id: 12, entity_id: 1, account_number: '1500', account_name: 'Other Current Asset',
    account_type: 'asset', normal_balance: 'debit', parent_account_id: null,
    active: true, detail_type: null, account_status: 'active', description: null,
    tax_line: null, source_system: null, reporting_taxonomy_line_id: null,
    is_header: false, is_postable: true, fs_sign_convention: null,
    cfs_section: null, fs_statement: null, fs_section: null, fs_line_label: null,
    fs_line_order: null, account_path: null, depth_level: null, sort_order: null,
  },
]

const multiTaxonomy: MappingSuggestion = {
  taxonomy_id: 2,
  taxonomy_code: 'ifrs',
  taxonomy_node_id: 200,
  node_code: 'CASH_IFRS',
  node_name: 'Cash and equivalents',
  confidence_score: 0.8,
  reason: 'ifrs keyword match',
}

describe('TaxonomySuggestionPanel — redesign (issue 10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBulkSuggest.mockResolvedValue({
      suggestions: {
        10: [high, multiTaxonomy],
        11: [medium],
        12: [low],
      },
    })
    mockApplySuggestions.mockResolvedValue({ applied: 1, skipped: 0 })
    mockAccountsList.mockResolvedValue(accountFixtures)
  })

  it('shows account_number instead of internal #id when entityId is provided', async () => {
    render(wrap(<TaxonomySuggestionPanel accountIds={[10, 11, 12]} taxonomyIds={[1, 2]} entityId={1} />))
    await waitFor(() => expect(screen.getByTestId('taxonomy-suggestion-panel')).toBeInTheDocument())

    // Default confidence range filters out low (0.4) suggestion for account 12
    await waitFor(() => {
      expect(screen.getByTestId('suggestion-account-number-10::1::100')).toHaveTextContent('1000')
    })
    expect(screen.getByTestId('suggestion-account-number-11::1::110')).toHaveTextContent('1100')
    // Account name visible
    expect(screen.getByTestId('suggestion-account-name-10::1::100')).toHaveTextContent('Cash')
    expect(screen.getByTestId('suggestion-account-name-11::1::110')).toHaveTextContent('Accounts Receivable')
    // Internal id "#10" is no longer the displayed account label
    expect(screen.queryByText('#10')).not.toBeInTheDocument()
  })

  it('select-all checkbox toggles every visible row', async () => {
    render(wrap(<TaxonomySuggestionPanel accountIds={[10, 11, 12]} taxonomyIds={[1, 2]} entityId={1} />))
    await waitFor(() => expect(screen.getByTestId('taxonomy-suggestion-panel')).toBeInTheDocument())

    const selectAll = screen.getByTestId('suggestion-select-all') as HTMLInputElement
    fireEvent.click(selectAll)

    // After clicking select-all, all four visible rows are checked
    expect((screen.getByTestId('suggestion-checkbox-10::1::100') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('suggestion-checkbox-10::2::200') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('suggestion-checkbox-11::1::110') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('suggestion-checkbox-12::1::120') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId('selected-count')).toHaveTextContent('4 of 4 selected')

    // Clicking again deselects all
    fireEvent.click(selectAll)
    expect((screen.getByTestId('suggestion-checkbox-10::1::100') as HTMLInputElement).checked).toBe(false)
    expect(screen.getByTestId('selected-count')).toHaveTextContent('0 of 4 selected')
  })

  it('sort by confidence puts highest first by default', async () => {
    render(wrap(<TaxonomySuggestionPanel accountIds={[10, 11, 12]} taxonomyIds={[1, 2]} entityId={1} />))
    await waitFor(() => expect(screen.getByTestId('taxonomy-suggestion-panel')).toBeInTheDocument())

    const rows = screen.getAllByTestId(/^suggestion-row-/)
    expect(rows[0].getAttribute('data-testid')).toBe('suggestion-row-10::1::100') // 0.9
    expect(rows[1].getAttribute('data-testid')).toBe('suggestion-row-10::2::200') // 0.8
    expect(rows[2].getAttribute('data-testid')).toBe('suggestion-row-11::1::110') // 0.65
    expect(rows[3].getAttribute('data-testid')).toBe('suggestion-row-12::1::120') // 0.4
  })

  it('filter by taxonomy code narrows visible rows', async () => {
    render(wrap(<TaxonomySuggestionPanel accountIds={[10, 11, 12]} taxonomyIds={[1, 2]} entityId={1} />))
    await waitFor(() => expect(screen.getByTestId('taxonomy-suggestion-panel')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('filter-taxonomy'), { target: { value: 'ifrs' } })

    await waitFor(() => {
      expect(screen.getByTestId('suggestion-row-10::2::200')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('suggestion-row-10::1::100')).not.toBeInTheDocument()
    expect(screen.queryByTestId('suggestion-row-11::1::110')).not.toBeInTheDocument()
  })

  it('Apply Selected is disabled when nothing is selected', async () => {
    render(wrap(<TaxonomySuggestionPanel accountIds={[10, 11, 12]} taxonomyIds={[1, 2]} entityId={1} />))
    await waitFor(() => expect(screen.getByTestId('taxonomy-suggestion-panel')).toBeInTheDocument())

    const btn = screen.getByTestId('apply-selected-btn') as HTMLButtonElement
    expect(btn.disabled).toBe(true)

    fireEvent.click(screen.getByTestId('suggestion-checkbox-10::1::100'))
    expect((screen.getByTestId('apply-selected-btn') as HTMLButtonElement).disabled).toBe(false)
  })
})
