import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import { JournalEntryDetailPage } from '@/pages/JournalEntryDetailPage'
import { AdjustmentsPage } from '@/pages/AdjustmentsPage'
import { parseAccountLabel } from '@/lib/parseAccountLabel'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderJEDetail(jeId: number) {
  const client = makeClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/adjustments/journal-entries/${jeId}`]}>
        <Routes>
          <Route path="/adjustments/journal-entries/:id" element={<JournalEntryDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function wrapPage(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Top-level mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/PageLayout', () => ({
  PageLayout: ({ children, title, actions }: { children: React.ReactNode; title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <div data-testid="page-actions">{actions}</div>
      {children}
    </div>
  ),
}))

vi.mock('@/components/ui/LoadingState', () => ({ LoadingState: () => <div>Loading…</div> }))
vi.mock('@/components/ui/ErrorState', () => ({ ErrorState: ({ message }: { message: string }) => <div>{message}</div> }))
vi.mock('@/components/ui/ValidationAlert', () => ({ ErrorBanner: () => null }))
vi.mock('@/components/ui/ConfirmDialog', () => ({ ConfirmDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/ui/Input', () => ({ Input: () => null }))
vi.mock('@/components/ui/Badge', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  SeverityBadge: ({ severity }: { severity: string }) => <span>{severity}</span>,
}))

vi.mock('@/api/workflow', () => ({
  workflowApi: { listSignoffs: vi.fn().mockResolvedValue([]) },
}))

vi.mock('@/api/reportingSettings', () => ({
  reportingSettingsApi: {
    get: vi.fn().mockResolvedValue({ decimal_places: 0, currency_symbol: '$', negative_format: 'parentheses' }),
  },
}))

vi.mock('@/api/journalEntries', () => ({
  journalEntriesApi: {
    get: vi.fn().mockResolvedValue({
      id: 1,
      je_number: 'JE-001',
      entry_date: '2026-01-15',
      entity_id: 1,
      scenario_id: 1,
      description: 'Accrue bonus liability',
      source: 'manual',
      status: 'draft',
      reversal_of_id: null,
      reversal_je_id: null,
      created_by: 'admin',
      posted_by: null,
      created_at: '2026-01-15T00:00:00',
      posted_at: null,
      reversed_at: null,
      warnings: [],
      lines: [
        { id: 10, line_number: 1, account_id: 101, entity_id: 1, debit: '50000', credit: '0', description: null, account_number: '6100', account_name: 'Bonus Expense' },
        { id: 11, line_number: 2, account_id: 102, entity_id: 1, debit: '0', credit: '50000', description: null, account_number: '2100', account_name: 'Accrued Liabilities' },
      ],
    }),
    postDraft: vi.fn(),
    reverse: vi.fn(),
  },
}))

vi.mock('@/api/adjustmentWorkspace', () => ({
  adjustmentWorkspaceApi: {
    listAdjustments: vi.fn().mockResolvedValue([
      {
        id: 1,
        je_number: 'AJE-001',
        entry_date: '2026-01-15',
        entity_id: 1,
        scenario_id: 1,
        description: 'Bonus accrual',
        source: 'manual',
        status: 'draft',
        overlay_group: null,
        materiality: null,
        total_debit: 5000,
        total_credit: 5000,
        impact: { ni_impact: 0, ebitda_impact: 0, asset_impact: 0, liability_impact: 0, equity_impact: 0 },
        package_ids: [],
        has_advisor_note: false,
        advisor_resolution_status: null,
        lines: [
          { line_number: 1, account_id: 1, account_number: '6100', account_name: 'Bonus Expense', debit: 5000, credit: 0, description: null },
          { line_number: 2, account_id: 2, account_number: '2100', account_name: 'Accrued Liabilities', debit: 0, credit: 5000, description: null },
        ],
      },
    ]),
  },
}))

vi.mock('@/providers/WorkspaceProvider', () => ({
  useWorkspace: vi.fn(() => ({
    activeEntity: { id: 1, name: 'Test Entity' },
    activePeriod: null,
    workspace: null,
  })),
}))

// ---------------------------------------------------------------------------
// JE Detail: account number / name (not raw ID)
// ---------------------------------------------------------------------------

describe('JournalEntryDetailPage — account number and name', () => {
  it('shows account number not raw database ID', async () => {
    renderJEDetail(1)
    expect(await screen.findByText('6100')).toBeInTheDocument()
    expect(await screen.findByText('2100')).toBeInTheDocument()
    expect(screen.queryAllByText('101')).toHaveLength(0)
  })

  it('shows account name', async () => {
    renderJEDetail(1)
    expect(await screen.findByText('Bonus Expense')).toBeInTheDocument()
    expect(await screen.findByText('Accrued Liabilities')).toBeInTheDocument()
  })

  it('shows Acct # and Account Name column headers', async () => {
    renderJEDetail(1)
    expect(await screen.findByText('Acct #')).toBeInTheDocument()
    expect(await screen.findByText('Account Name')).toBeInTheDocument()
  })

  it('renders a back button', async () => {
    renderJEDetail(1)
    expect(await screen.findByTestId('back-btn')).toBeInTheDocument()
    expect(screen.getByTestId('back-btn')).toHaveTextContent('← Back')
  })

  it('formats amounts without .00 when decimals=0', async () => {
    renderJEDetail(1)
    await screen.findByText('6100')
    const cells = screen.getAllByText('$50,000')
    expect(cells.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// parseAccountLabel utility
// ---------------------------------------------------------------------------

describe('parseAccountLabel', () => {
  it('splits "1000 Cash" into number and name', () => {
    expect(parseAccountLabel('1000 Cash')).toEqual({ account_number: '1000', account_name: 'Cash' })
  })

  it('splits "1000 - Cash" (dash separator)', () => {
    expect(parseAccountLabel('1000 - Cash')).toEqual({ account_number: '1000', account_name: 'Cash' })
  })

  it('splits "1000: Cash" (colon separator)', () => {
    expect(parseAccountLabel('1000: Cash')).toEqual({ account_number: '1000', account_name: 'Cash' })
  })

  it('splits "1000 · Cash" (middle dot)', () => {
    expect(parseAccountLabel('1000 · Cash')).toEqual({ account_number: '1000', account_name: 'Cash' })
  })

  it('splits "1000 — Cash" (em dash)', () => {
    expect(parseAccountLabel('1000 — Cash')).toEqual({ account_number: '1000', account_name: 'Cash' })
  })

  it('returns null account_number for pure name "Cash"', () => {
    expect(parseAccountLabel('Cash')).toEqual({ account_number: null, account_name: 'Cash' })
  })

  it('returns null account_name for pure number "1000"', () => {
    expect(parseAccountLabel('1000')).toEqual({ account_number: '1000', account_name: null })
  })

  it('returns both null for empty string', () => {
    expect(parseAccountLabel('')).toEqual({ account_number: null, account_name: null })
  })
})

// ---------------------------------------------------------------------------
// AdjustmentsPage — inline line column alignment
// ---------------------------------------------------------------------------

describe('AdjustmentsPage — expanded line column alignment', () => {
  it('renders Debit and Credit column headers', async () => {
    wrapPage(<AdjustmentsPage />)
    await screen.findByTestId('adjustments-table')
    expect(screen.getAllByText(/^debit$/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^credit$/i).length).toBeGreaterThan(0)
  })

  it('renders Account # and Account Name column headers', async () => {
    wrapPage(<AdjustmentsPage />)
    await screen.findByTestId('adjustments-table')
    expect(screen.getAllByText(/account #/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/account name/i).length).toBeGreaterThan(0)
  })

  it('expanded lines show account number and name', async () => {
    wrapPage(<AdjustmentsPage />)
    await screen.findByTestId('adjustments-table')
    const expandBtn = await screen.findByLabelText('Expand lines')
    fireEvent.click(expandBtn)
    // After expand: 6100 appears in both summary row and expanded lines
    await waitFor(() => {
      expect(screen.getAllByText('6100').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Bonus Expense').length).toBeGreaterThan(0)
      expect(screen.getAllByText('2100').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Accrued Liabilities').length).toBeGreaterThan(0)
    })
  })

  it('totals row appears in expanded block', async () => {
    wrapPage(<AdjustmentsPage />)
    await screen.findByTestId('adjustments-table')
    const expandBtn = await screen.findByLabelText('Expand lines')
    fireEvent.click(expandBtn)
    await waitFor(() => {
      expect(screen.getAllByText('Totals').length).toBeGreaterThan(0)
    })
  })

  it('collapsing hides the expanded line detail rows', async () => {
    wrapPage(<AdjustmentsPage />)
    await screen.findByTestId('adjustments-table')
    // Summary row shows first account number already; expanded detail shows it too
    const expandBtn = await screen.findByLabelText('Expand lines')
    fireEvent.click(expandBtn)
    // After expand, there should be 2 occurrences (summary + line)
    await waitFor(() => expect(screen.getAllByText('6100').length).toBeGreaterThan(1))
    const collapseBtn = screen.getByLabelText('Collapse lines')
    fireEvent.click(collapseBtn)
    // After collapse, only the summary row occurrence remains (1)
    await waitFor(() => expect(screen.getAllByText('6100').length).toBe(1))
  })
})
