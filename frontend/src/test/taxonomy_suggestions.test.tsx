import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { TaxonomySuggestionPanel } from '@/components/taxonomy/TaxonomySuggestionPanel'
import type { MappingSuggestion } from '@/api/taxonomyLibrary'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockBulkSuggest, mockApplySuggestions, mockToast } = vi.hoisted(() => ({
  mockBulkSuggest: vi.fn(),
  mockApplySuggestions: vi.fn(),
  mockToast: vi.fn(),
}))

vi.mock('@/api/taxonomyLibrary', () => ({
  taxonomyLibraryApi: {
    bulkSuggest: mockBulkSuggest,
    applySuggestions: mockApplySuggestions,
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
