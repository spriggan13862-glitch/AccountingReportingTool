import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReconciliationStatusBadge } from '@/components/reconciliation/ReconciliationStatusBadge'
import { VarianceBadge } from '@/components/reconciliation/VarianceBadge'
import { TieOutIndicator } from '@/components/reconciliation/TieOutIndicator'
import { SupportReferencePanel } from '@/components/reconciliation/SupportReferencePanel'
import { ReviewerCommentPanel } from '@/components/reconciliation/ReviewerCommentPanel'
import { RollforwardTable } from '@/components/reconciliation/RollforwardTable'
import { ReconciliationTable } from '@/components/reconciliation/ReconciliationTable'
import { ReconciliationPage } from '@/pages/ReconciliationPage'
import { ReconciliationDetailPage } from '@/pages/ReconciliationDetailPage'
import type { Reconciliation, ReconciliationLine, SupportReference, RollforwardScheduleLine } from '@/types'

// ---- helpers ----------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrap(element: React.ReactNode, path = '*', initialEntry = '/') {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ---- shared fixtures --------------------------------------------------------

const { mockRecon, mockLines, mockSupport, mockRollforward } = vi.hoisted(() => {
  const recon: Reconciliation = {
    id: 1,
    organization_id: 1,
    entity_id: 1,
    account_id: 5,
    period_id: 1,
    reconciliation_type: 'bank',
    status: 'prepared',
    preparer_user_id: 1,
    reviewer_user_id: null,
    prepared_at: '2024-03-15T10:00:00',
    reviewed_at: null,
    official_balance: '10000.00',
    supporting_balance: '9900.00',
    variance_amount: '100.00',
    variance_explanation: 'Deposit in transit',
    draft_preview_balance: '10200.00',
    tie_out_status: 'in_tolerance',
    tolerance_amount: '200.00',
    rollforward_opening_balance: '8000.00',
    rollforward_adjustments: '0.00',
    rollforward_closing_balance: '8000.00',
    notes: 'Monthly bank recon',
    reviewer_comment: null,
    created_at: '2024-03-01T00:00:00',
    updated_at: null,
  }

  const lines: ReconciliationLine[] = [
    {
      id: 1,
      reconciliation_id: 1,
      line_number: 1,
      description: 'GL ending balance',
      source_type: 'gl',
      source_reference: null,
      debit: '10000.00',
      credit: '0.00',
      balance: '10000.00',
      is_reconciling_item: false,
      reconciling_notes: null,
      created_at: '2024-03-01T00:00:00',
    },
    {
      id: 2,
      reconciliation_id: 1,
      line_number: 2,
      description: 'Deposit in transit',
      source_type: 'bank',
      source_reference: 'CHK-1234',
      debit: '0.00',
      credit: '100.00',
      balance: '-100.00',
      is_reconciling_item: true,
      reconciling_notes: 'Cleared on 3/18',
      created_at: '2024-03-01T00:00:00',
    },
  ]

  const support: SupportReference[] = [
    {
      id: 1,
      reconciliation_id: 1,
      reference_type: 'external_system',
      document_id: null,
      journal_entry_id: null,
      external_ref: 'BANK-STMT-2024-03',
      description: 'March 2024 bank statement',
      added_by_user_id: 1,
      added_at: '2024-03-15T10:00:00',
      created_at: '2024-03-15T10:00:00',
    },
  ]

  const rollforward: RollforwardScheduleLine[] = [
    { label: 'Opening Cash Balance', amount: '50000', is_subtotal: false },
    { label: 'Cash Inflows', amount: '15000', is_subtotal: false },
    { label: 'Cash Outflows (negative)', amount: '-8000', is_subtotal: false },
    { label: 'Closing Cash Balance', amount: '57000', is_subtotal: true },
  ]

  return { mockRecon: recon, mockLines: lines, mockSupport: support, mockRollforward: rollforward }
})

// ---- mocks ------------------------------------------------------------------

vi.mock('@/api/reconciliation', () => ({
  reconciliationApi: {
    list: vi.fn().mockResolvedValue([mockRecon]),
    get: vi.fn().mockResolvedValue(mockRecon),
    create: vi.fn().mockResolvedValue({ ...mockRecon, id: 2, status: 'not_started' }),
    transition: vi.fn().mockResolvedValue({ ...mockRecon, status: 'reviewed' }),
    getLines: vi.fn().mockResolvedValue(mockLines),
    getSupport: vi.fn().mockResolvedValue(mockSupport),
    cashSchedule: vi.fn().mockResolvedValue(mockRollforward),
    exportUrl: vi.fn().mockReturnValue('/api/v1/reconciliations/1/export'),
  },
}))

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: () => ({ org: { id: 1, name: 'Acme' }, setOrg: vi.fn() }),
  OrgProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// ---- tests ------------------------------------------------------------------

describe('Milestone 19: Reconciliation and Rollforward', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ReconciliationStatusBadge renders correct label for each status', () => {
    const { rerender } = render(<ReconciliationStatusBadge status="not_started" />)
    expect(screen.getByTestId('recon-status-badge')).toHaveTextContent('Not Started')

    rerender(<ReconciliationStatusBadge status="reviewed" />)
    expect(screen.getByTestId('recon-status-badge')).toHaveTextContent('Reviewed')

    rerender(<ReconciliationStatusBadge status="rejected" />)
    expect(screen.getByTestId('recon-status-badge')).toHaveTextContent('Rejected')
  })

  it('VarianceBadge renders variance and tie-out status', () => {
    render(<VarianceBadge variance="100.00" tieOutStatus="in_tolerance" />)
    expect(screen.getByTestId('variance-badge')).toBeInTheDocument()
    expect(screen.getByTestId('tie-out-badge')).toHaveTextContent('In Tolerance')
    expect(screen.getByText(/100\.00/)).toBeInTheDocument()
  })

  it('VarianceBadge shows Out of Tolerance when tie-out status is out_of_tolerance', () => {
    render(<VarianceBadge variance="500.00" tieOutStatus="out_of_tolerance" />)
    expect(screen.getByTestId('tie-out-badge')).toHaveTextContent('Out of Tolerance')
  })

  it('TieOutIndicator renders correct icon for each status', () => {
    const { rerender } = render(<TieOutIndicator status="tied" />)
    expect(screen.getByTestId('tie-out-indicator')).toBeInTheDocument()
    expect(screen.getByLabelText(/Tie-out: tied/i)).toBeInTheDocument()

    rerender(<TieOutIndicator status="out_of_tolerance" />)
    expect(screen.getByLabelText(/Tie-out: out_of_tolerance/i)).toBeInTheDocument()
  })

  it('SupportReferencePanel renders references', () => {
    render(<SupportReferencePanel references={mockSupport} />)
    expect(screen.getByTestId('support-reference-panel')).toBeInTheDocument()
    expect(screen.getByText(/BANK-STMT-2024-03/)).toBeInTheDocument()
    expect(screen.getByText(/March 2024 bank statement/)).toBeInTheDocument()
  })

  it('SupportReferencePanel shows empty state when no references', () => {
    render(<SupportReferencePanel references={[]} />)
    expect(screen.getByText(/No support references attached/i)).toBeInTheDocument()
  })

  it('ReviewerCommentPanel renders reviewer comment', () => {
    const recon = { ...mockRecon, reviewer_comment: 'Please recheck deposit in transit', reviewed_at: '2024-03-16T08:00:00' }
    render(<ReviewerCommentPanel reconciliation={recon} />)
    expect(screen.getByTestId('reviewer-comment-panel')).toBeInTheDocument()
    expect(screen.getByText(/Please recheck deposit in transit/)).toBeInTheDocument()
  })

  it('ReviewerCommentPanel renders nothing when no comment', () => {
    render(<ReviewerCommentPanel reconciliation={mockRecon} />)
    expect(screen.queryByTestId('reviewer-comment-panel')).not.toBeInTheDocument()
  })

  it('RollforwardTable renders all lines with subtotal highlighted', () => {
    render(<RollforwardTable title="Cash Rollforward" lines={mockRollforward} />)
    expect(screen.getByTestId('rollforward-table')).toBeInTheDocument()
    expect(screen.getByText(/Opening Cash Balance/)).toBeInTheDocument()
    expect(screen.getByText(/Closing Cash Balance/)).toBeInTheDocument()
    expect(screen.getByText(/57,000\.00/)).toBeInTheDocument()
  })

  it('ReconciliationTable renders rows with status and variance', () => {
    render(<ReconciliationTable reconciliations={[mockRecon]} />)
    expect(screen.getByTestId('reconciliation-table')).toBeInTheDocument()
    expect(screen.getByTestId(`recon-row-${mockRecon.id}`)).toBeInTheDocument()
    expect(screen.getByText(/Prepared/)).toBeInTheDocument()
  })

  it('ReconciliationTable calls onSelect when row clicked', () => {
    const onSelect = vi.fn()
    render(<ReconciliationTable reconciliations={[mockRecon]} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId(`recon-row-${mockRecon.id}`))
    expect(onSelect).toHaveBeenCalledWith(mockRecon)
  })

  it('ReconciliationPage renders table and create button', () => {
    render(wrap(<ReconciliationPage />))
    expect(screen.getByTestId('create-recon-btn')).toBeInTheDocument()
  })

  it('ReconciliationDetailPage renders detail card and rollforward info', async () => {
    render(wrap(<ReconciliationDetailPage />, '/reconciliations/:id', '/reconciliations/1'))
    expect(await screen.findByTestId('recon-detail-card')).toBeInTheDocument()
  })
})
