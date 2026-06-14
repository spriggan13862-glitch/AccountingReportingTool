/**
 * M30 — Picker infrastructure, Trial Balance page, JE Create upgrade
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { EntitySelect } from '@/components/ui/EntitySelect'
import { PeriodSelect } from '@/components/ui/PeriodSelect'
import { ScenarioMultiSelect } from '@/components/ui/ScenarioMultiSelect'
import { TrialBalancesPage } from '@/pages/TrialBalancesPage'
import { JournalEntryCreatePage } from '@/pages/JournalEntryCreatePage'
import { ComparativeFinancialsPage } from '@/pages/ComparativeFinancialsPage'
import { VarianceAnalysisPage } from '@/pages/VarianceAnalysisPage'

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

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: () => ({ org: { id: 1, name: 'Acme Corp' } }),
}))

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 1, full_name: 'Test User', email: 'test@example.com',
      is_superuser: true, is_active: true, organization_id: 1 },
    logout: vi.fn(),
  }),
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'ACME', name: 'Acme Corp', entity_type: 'operating', currency: 'USD',
        active: true, parent_id: null, fiscal_year_end_month: 12, fiscal_year_convention: 'calendar' },
      { id: 2, code: 'LM', name: 'Live Marketing', entity_type: 'operating', currency: 'USD',
        active: true, parent_id: null, fiscal_year_end_month: 12, fiscal_year_convention: 'calendar' },
    ]),
  },
}))

vi.mock('@/api/periods', () => ({
  periodsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 10, entity_id: 1, period_name: 'Jan 2024', start_date: '2024-01-01',
        end_date: '2024-01-31', fiscal_year: 2024, fiscal_period: 1, period_type: 'monthly',
        is_closed: false, closed_at: null, closed_by: null, created_at: '2024-01-01' },
      { id: 11, entity_id: 1, period_name: 'Feb 2024', start_date: '2024-02-01',
        end_date: '2024-02-29', fiscal_year: 2024, fiscal_period: 2, period_type: 'monthly',
        is_closed: false, closed_at: null, closed_by: null, created_at: '2024-01-01' },
    ]),
  },
}))

vi.mock('@/api/scenarios', () => ({
  scenariosApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'ACTUAL', name: 'Actual', scenario_type: 'actual', description: null, active: true },
      { id: 2, code: 'BUDGET', name: 'Budget', scenario_type: 'budget', description: null, active: true },
    ]),
  },
}))

vi.mock('@/api/reporting', () => ({
  reportingApi: {
    trialBalance: vi.fn().mockResolvedValue([
      { account_id: 1, account_number: '1000', account_name: 'Cash', account_type: 'asset',
        normal_balance: 'debit', total_debit: '50000.00', total_credit: '10000.00',
        net_debit: '40000.00', signed_balance: '40000.00' },
      { account_id: 5, account_number: '4000', account_name: 'Revenue', account_type: 'revenue',
        normal_balance: 'credit', total_debit: '0.00', total_credit: '60000.00',
        net_debit: '-60000.00', signed_balance: '60000.00' },
    ]),
  },
}))

vi.mock('@/api/periodGovernance', () => ({
  periodGovernanceApi: {
    buildComparativeReport: vi.fn().mockResolvedValue({
      report_type: 'income_statement', entity_id: 1,
      current_period_id: 10, comparison_period_id: 11,
      current_period_name: 'Jan 2024', comparison_period_name: 'Feb 2024',
      scenario_id: null, materiality_threshold: '1000',
      generated_at: '2024-01-31T00:00:00Z',
      sections: [], material_variances_count: 0,
    }),
    getLockSummary: vi.fn().mockResolvedValue({ period_id: 10, status: 'open', events: [] }),
    getHistory: vi.fn().mockResolvedValue([]),
    runValidation: vi.fn().mockResolvedValue({
      period_id: 10, entity_id: 1, overall_status: 'valid', checks: [], run_at: '2024-01-31T00:00:00Z',
    }),
    softClose: vi.fn(), hardClose: vi.fn(), reopen: vi.fn(),
  },
}))

vi.mock('@/api/journalEntries', () => ({
  journalEntriesApi: {
    createDraft: vi.fn(),
    createAndPost: vi.fn(),
  },
}))

vi.mock('@/api/workflow', () => ({ workflowApi: { listTasks: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/api/reports', () => ({ reportsApi: { list: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/api/tbImport', () => ({ tbImportApi: { listBatches: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/api/accounts', () => ({
  accountsApi: { list: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))
vi.mock('@/providers/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    activeEntity: null, setActiveEntity: vi.fn(),
    activePeriod: null, setActivePeriod: vi.fn(),
    activeScenarioIds: [], setActiveScenarioIds: vi.fn(),
    dataView: 'adjusted', setDataView: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// EntitySelect
// ---------------------------------------------------------------------------

describe('EntitySelect', () => {
  it('renders with loading state then shows entities', async () => {
    render(wrap(
      <EntitySelect label="Entity" value="" onChange={vi.fn()} />,
    ))
    await waitFor(() => {
      expect(screen.getByTestId('entity-select')).toBeTruthy()
    })
    await waitFor(() => {
      expect(screen.getByText(/ACME — Acme Corp/)).toBeTruthy()
    })
  })

  it('calls onChange with numeric id on selection', async () => {
    const onChange = vi.fn()
    render(wrap(<EntitySelect label="Entity" value="" onChange={onChange} />))
    await waitFor(() => screen.getByText(/ACME — Acme Corp/))
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('calls onChange with empty string when deselected', async () => {
    const onChange = vi.fn()
    render(wrap(<EntitySelect label="Entity" value={1} onChange={onChange} />))
    await waitFor(() => screen.getByTestId('entity-select'))
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
  })
})

// ---------------------------------------------------------------------------
// PeriodSelect
// ---------------------------------------------------------------------------

describe('PeriodSelect', () => {
  it('shows "Select entity first" when no entity chosen', () => {
    render(wrap(<PeriodSelect label="Period" entityId="" value="" onChange={vi.fn()} />))
    expect(screen.getByText(/Select entity first/i)).toBeTruthy()
  })

  it('loads and shows periods when entity is provided', async () => {
    render(wrap(<PeriodSelect label="Period" entityId={1} value="" onChange={vi.fn()} />))
    await waitFor(() => {
      expect(screen.getByText(/Feb 2024/)).toBeTruthy()
    })
  })

  it('calls onChange with numeric id', async () => {
    const onChange = vi.fn()
    render(wrap(<PeriodSelect label="Period" entityId={1} value="" onChange={onChange} />))
    await waitFor(() => screen.getByText(/Jan 2024/))
    fireEvent.change(screen.getByTestId('period-select'), { target: { value: '10' } })
    expect(onChange).toHaveBeenCalledWith(10)
  })
})

// ---------------------------------------------------------------------------
// ScenarioMultiSelect
// ---------------------------------------------------------------------------

describe('ScenarioMultiSelect', () => {
  it('renders scenario checkboxes', async () => {
    render(wrap(<ScenarioMultiSelect value={[]} onChange={vi.fn()} label="Scenarios" />))
    await waitFor(() => {
      expect(screen.getByText(/ACTUAL/)).toBeTruthy()
      expect(screen.getByText(/BUDGET/)).toBeTruthy()
    })
  })

  it('calls onChange with toggled id', async () => {
    const onChange = vi.fn()
    render(wrap(<ScenarioMultiSelect value={[]} onChange={onChange} label="Scenarios" />))
    await waitFor(() => screen.getByText(/ACTUAL/))
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(onChange).toHaveBeenCalledWith([1])
  })

  it('removes id when already selected', async () => {
    const onChange = vi.fn()
    render(wrap(<ScenarioMultiSelect value={[1]} onChange={onChange} label="Scenarios" />))
    await waitFor(() => screen.getByText(/ACTUAL/))
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(onChange).toHaveBeenCalledWith([])
  })
})

// ---------------------------------------------------------------------------
// TrialBalancesPage
// ---------------------------------------------------------------------------

describe('TrialBalancesPage', () => {
  it('renders parameter form on mount', async () => {
    render(wrap(<TrialBalancesPage />))
    await waitFor(() => {
      expect(screen.getByText('Trial Balance')).toBeTruthy()
    })
    expect(screen.getByTestId('entity-select')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Run/i })).toBeTruthy()
  })

  it('Run button is disabled until entity is selected', async () => {
    render(wrap(<TrialBalancesPage />))
    await waitFor(() => screen.getByRole('button', { name: /Run/i }))
    expect(screen.getByRole('button', { name: /Run/i })).toBeDisabled()
  })

  it('enables Run and fetches TB after entity selected', async () => {
    const { reportingApi } = await import('@/api/reporting')
    render(wrap(<TrialBalancesPage />))
    await waitFor(() => screen.getByText(/ACME — Acme Corp/))
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run/i })).not.toBeDisabled()
    })
    fireEvent.click(screen.getByRole('button', { name: /Run/i }))
    await waitFor(() => {
      expect(reportingApi.trialBalance).toHaveBeenCalledWith(1, expect.any(String), [], undefined)
    })
  })

  it('renders TB rows with type grouping after data loads', async () => {
    render(wrap(<TrialBalancesPage />))
    await waitFor(() => screen.getByText(/ACME/))
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /Run/i }))
    await waitFor(() => {
      expect(screen.getByTestId('trial-balance-table')).toBeTruthy()
    })
    expect(screen.getByText('Cash')).toBeTruthy()
    expect(screen.getByText('Revenue')).toBeTruthy()
    // Section headers
    expect(screen.getByText('asset')).toBeTruthy()
    expect(screen.getByText('revenue')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// JournalEntryCreatePage (upgraded)
// ---------------------------------------------------------------------------

describe('JournalEntryCreatePage', () => {
  it('renders entity and scenario pickers instead of raw ID inputs', async () => {
    render(wrap(<JournalEntryCreatePage />))
    await waitFor(() => {
      expect(screen.getByTestId('entity-select')).toBeTruthy()
      expect(screen.getByTestId('scenario-multi-select')).toBeTruthy()
    })
  })

  it('shows account search comboboxes in the line items grid', async () => {
    render(wrap(<JournalEntryCreatePage />))
    await waitFor(() => {
      const searches = screen.getAllByTestId('account-search')
      expect(searches.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('Save Draft button is disabled until entity and scenario are selected', async () => {
    render(wrap(<JournalEntryCreatePage />))
    await waitFor(() => screen.getByTestId('entity-select'))
    expect(screen.getByRole('button', { name: /Save Draft/i })).toBeDisabled()
  })

  it('shows balance totals row', async () => {
    render(wrap(<JournalEntryCreatePage />))
    await waitFor(() => {
      expect(screen.getByTestId('je-totals')).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// ComparativeFinancialsPage (upgraded)
// ---------------------------------------------------------------------------

describe('ComparativeFinancialsPage', () => {
  it('renders entity picker instead of raw Entity ID input', async () => {
    render(wrap(<ComparativeFinancialsPage />))
    await waitFor(() => {
      expect(screen.getByTestId('entity-select')).toBeTruthy()
    })
  })

  it('period pickers are disabled until entity is selected', async () => {
    render(wrap(<ComparativeFinancialsPage />))
    await waitFor(() => screen.getByTestId('entity-select'))
    const periodSelects = screen.getAllByTestId('period-select')
    expect(periodSelects[0]).toBeDisabled()
    expect(periodSelects[1]).toBeDisabled()
  })

  it('period pickers enable after entity is selected', async () => {
    render(wrap(<ComparativeFinancialsPage />))
    await waitFor(() => screen.getByText(/ACME — Acme Corp/))
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    await waitFor(() => {
      const periodSelects = screen.getAllByTestId('period-select')
      expect(periodSelects[0]).not.toBeDisabled()
    })
  })
})

// ---------------------------------------------------------------------------
// VarianceAnalysisPage (upgraded)
// ---------------------------------------------------------------------------

describe('VarianceAnalysisPage', () => {
  it('renders entity picker', async () => {
    render(wrap(<VarianceAnalysisPage />))
    await waitFor(() => {
      expect(screen.getByTestId('entity-select')).toBeTruthy()
    })
  })

  it('period picker is disabled until entity selected', async () => {
    render(wrap(<VarianceAnalysisPage />))
    await waitFor(() => screen.getByTestId('period-select'))
    expect(screen.getByTestId('period-select')).toBeDisabled()
  })

  it('Run Shadow-Close Validation button is disabled without entity+period', async () => {
    render(wrap(<VarianceAnalysisPage />))
    await waitFor(() => screen.getByRole('button', { name: /Run Shadow-Close/i }))
    expect(screen.getByRole('button', { name: /Run Shadow-Close/i })).toBeDisabled()
  })
})
