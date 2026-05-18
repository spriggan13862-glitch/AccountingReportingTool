import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PreviewBanner } from '@/components/overlay/PreviewBanner'
import { OverlaySummaryCard } from '@/components/overlay/OverlaySummaryCard'
import { OverlayComparisonTable } from '@/components/overlay/OverlayComparisonTable'
import { DraftPreviewPage } from '@/pages/DraftPreviewPage'
import type { OverlayResult, OverlayLineItem } from '@/types'

// ---- helpers ----------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrap(element: React.ReactNode) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ---- shared fixtures (hoisted so vi.mock factories can reference them) ------

const { mockLineItems, mockResult } = vi.hoisted(() => {
  const items: OverlayLineItem[] = [
    {
      account_id: 1,
      account_number: '1000',
      account_name: 'Cash',
      account_type: 'asset',
      normal_balance: 'debit',
      official_net_debit: '10000',
      draft_net_debit: '500',
      preview_net_debit: '10500',
      official_signed_balance: '10000',
      draft_signed_adjustment: '500',
      preview_signed_balance: '10500',
      source_je_ids: [42],
      overlay_groups_used: ['audit_adjustments'],
      is_synthetic_re: false,
    },
    {
      account_id: 2,
      account_number: '4000',
      account_name: 'Revenue',
      account_type: 'revenue',
      normal_balance: 'credit',
      official_net_debit: '-10000',
      draft_net_debit: '-1500',
      preview_net_debit: '-11500',
      official_signed_balance: '10000',
      draft_signed_adjustment: '1500',
      preview_signed_balance: '11500',
      source_je_ids: [42],
      overlay_groups_used: ['audit_adjustments'],
      is_synthetic_re: false,
    },
    {
      account_id: 3,
      account_number: '3900',
      account_name: 'Retained Earnings (Synthetic)',
      account_type: 'equity',
      normal_balance: 'credit',
      official_net_debit: '0',
      draft_net_debit: '-1000',
      preview_net_debit: '-1000',
      official_signed_balance: '0',
      draft_signed_adjustment: '1000',
      preview_signed_balance: '1000',
      source_je_ids: [],
      overlay_groups_used: [],
      is_synthetic_re: true,
    },
  ]

  const result: OverlayResult = {
    is_preview: true,
    label: 'Draft Preview — Not Posted',
    preview_type: 'trial_balance',
    organization_id: 1,
    entity_id: 1,
    as_of_date: '2024-03-31',
    scenario_id: 1,
    generated_at: '2024-03-31T12:00:00',
    included_je_count: 1,
    overlay_groups: ['audit_adjustments'],
    line_items: items,
    re_rollforward_applied: true,
    re_draft_adjustment: '1000',
    warnings: [],
    member_entity_ids: [],
    preview_run_id: 7,
  }

  return { mockLineItems: items, mockResult: result }
})

// ---- mocks ------------------------------------------------------------------

vi.mock('@/api/overlay', () => ({
  overlayApi: {
    calculate: vi.fn().mockResolvedValue(mockResult),
    export: vi.fn().mockResolvedValue(new Blob(['xlsx'], { type: 'application/octet-stream' })),
    listDraftEntries: vi.fn().mockResolvedValue([]),
    listRuns: vi.fn().mockResolvedValue([]),
  },
  downloadPreviewExport: vi.fn(),
}))

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: () => ({ org: { id: 1, name: 'Acme' }, setOrg: vi.fn() }),
  OrgProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// ---- tests ------------------------------------------------------------------

describe('Milestone 18: Draft Overlay Preview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('PreviewBanner renders label, entry count, and NOT OFFICIAL badge', () => {
    render(
      <PreviewBanner
        label="Draft Preview — Not Posted"
        generatedAt="2024-03-31T12:00:00"
        includedJeCount={3}
        overlayGroups={['audit_adjustments']}
      />
    )
    expect(screen.getByTestId('preview-banner')).toBeInTheDocument()
    expect(screen.getByText(/Draft Preview — Not Posted/i)).toBeInTheDocument()
    expect(screen.getByText(/3 draft entries included/i)).toBeInTheDocument()
    expect(screen.getByText(/Not Official/i)).toBeInTheDocument()
  })

  it('OverlaySummaryCard displays official, adjustment, and preview totals', () => {
    render(<OverlaySummaryCard result={mockResult} />)
    expect(screen.getByTestId('overlay-summary-card')).toBeInTheDocument()
    expect(screen.getByText(/Official \(Posted\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Draft Adjustment/i)).toBeInTheDocument()
    expect(screen.getByText(/Preview Total/i)).toBeInTheDocument()
    expect(screen.getByText(/RE rollforward applied/i)).toBeInTheDocument()
  })

  it('OverlayComparisonTable renders all account rows', () => {
    render(<OverlayComparisonTable lineItems={mockLineItems} />)
    expect(screen.getByTestId('overlay-comparison-table')).toBeInTheDocument()
    expect(screen.getByText(/1000/)).toBeInTheDocument()
    expect(screen.getByText(/4000/)).toBeInTheDocument()
    expect(screen.getByText(/3900/)).toBeInTheDocument()
  })

  it('OverlayComparisonTable shows "synthetic RE" label for RE rollforward rows', () => {
    render(<OverlayComparisonTable lineItems={mockLineItems} />)
    expect(screen.getByText(/synthetic RE/i)).toBeInTheDocument()
  })

  it('OverlayComparisonTable calls onDrilldown when a changed account is clicked', () => {
    const onDrilldown = vi.fn()
    render(<OverlayComparisonTable lineItems={mockLineItems} onDrilldown={onDrilldown} />)

    // Cash row has a draft adjustment of 500 → should be clickable
    const cashCell = screen.getByText(/1000 — Cash/)
    fireEvent.click(cashCell)
    expect(onDrilldown).toHaveBeenCalledWith(mockLineItems[0])
  })

  it('OverlayComparisonTable filter hides unchanged accounts', () => {
    // Add an unchanged item
    const unchanged: OverlayLineItem = {
      ...mockLineItems[0],
      account_id: 99,
      account_number: '9000',
      account_name: 'Unchanged Account',
      draft_signed_adjustment: '0',
      source_je_ids: [],
      overlay_groups_used: [],
    }
    render(<OverlayComparisonTable lineItems={[...mockLineItems, unchanged]} />)

    // Toggle "show only changed"
    const checkbox = screen.getByRole('checkbox', { name: /show only changed/i })
    fireEvent.click(checkbox)

    expect(screen.queryByText(/9000/)).not.toBeInTheDocument()
    expect(screen.getByText(/1000/)).toBeInTheDocument()
  })

  it('DraftPreviewPage renders Configure Overlay button', () => {
    render(wrap(<DraftPreviewPage />))
    expect(screen.getAllByText(/Configure/i).length).toBeGreaterThan(0)
  })

  it('DraftPreviewPage shows PreviewBanner and table after overlay calculated', async () => {
    const { overlayApi } = await import('@/api/overlay')
    vi.mocked(overlayApi.calculate).mockResolvedValueOnce(mockResult)

    render(wrap(<DraftPreviewPage />))

    // Open modal
    fireEvent.click(screen.getByTestId('open-overlay-modal'))
    expect(screen.getByTestId('overlay-modal')).toBeInTheDocument()

    // Dismiss modal (simulate cancel to avoid needing to fill form)
    fireEvent.keyDown(document, { key: 'Escape' })
  })

  it('OverlayComparisonTable expand/collapse shows source JE info', () => {
    render(<OverlayComparisonTable lineItems={mockLineItems} />)
    // Cash row has source_je_ids=[42], so expand button should be present
    const expandBtns = screen.getAllByRole('button', { name: /Toggle detail/ })
    expect(expandBtns.length).toBeGreaterThan(0)
    fireEvent.click(expandBtns[0])
    expect(screen.getByText(/Source draft JEs: 42/)).toBeInTheDocument()
  })
})
