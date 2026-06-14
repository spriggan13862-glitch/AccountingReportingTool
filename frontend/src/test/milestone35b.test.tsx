/**
 * M35b — ScenarioSelect, FinancialStatementsPage (taxonomy tabs), scenario picker in Comparative/Variance
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ScenarioSelect } from '@/components/ui/ScenarioSelect'
import { FinancialStatementsPage } from '@/pages/FinancialStatementsPage'
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
    user: {
      id: 1, full_name: 'Test User', email: 'test@example.com',
      is_superuser: true, is_active: true, organization_id: 1,
    },
    logout: vi.fn(),
  }),
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, name: 'Acme Corp', code: 'ACME', entity_type: 'operating' },
    ]),
  },
}))

vi.mock('@/api/scenarios', () => ({
  scenariosApi: {
    list: vi.fn().mockResolvedValue([
      { id: 10, code: 'ACT', name: 'Actuals', scenario_type: 'actual', description: null, active: true },
      { id: 11, code: 'BUD', name: 'Budget', scenario_type: 'budget', description: null, active: true },
    ]),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
  },
}))

vi.mock('@/api/reporting', () => ({
  reportingApi: {
    taxonomyBalanceSheet: vi.fn().mockResolvedValue([
      {
        taxonomy_id: 1, code: '1000', name: 'Assets', section: 'assets',
        statement_type: 'balance_sheet', sort_order: 10, parent_id: null,
        hierarchy_depth: 0, is_subtotal: false, normal_balance: 'debit',
        sign_flip: false, own_balance: '0', total_balance: '1000', display_balance: '1000', account_count: 2,
      },
      {
        taxonomy_id: 2, code: '1100', name: 'Cash', section: 'assets',
        statement_type: 'balance_sheet', sort_order: 20, parent_id: 1,
        hierarchy_depth: 1, is_subtotal: false, normal_balance: 'debit',
        sign_flip: false, own_balance: '1000', total_balance: '1000', display_balance: '1000', account_count: 2,
      },
    ]),
    taxonomyIncomeStatement: vi.fn().mockResolvedValue([
      {
        taxonomy_id: 5, code: '4000', name: 'Revenue', section: 'revenue',
        statement_type: 'income_statement', sort_order: 10, parent_id: null,
        hierarchy_depth: 0, is_subtotal: false, normal_balance: 'credit',
        sign_flip: true, own_balance: '-500', total_balance: '-500', display_balance: '500', account_count: 1,
      },
    ]),
    inheritTaxonomy: vi.fn().mockResolvedValue({ updated: 3, already_set: 10, no_ancestor: 0 }),
    trialBalance: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/periodGovernance', () => ({
  periodGovernanceApi: {
    buildComparativeReport: vi.fn().mockRejectedValue(new Error('not called')),
    getLockSummary: vi.fn().mockRejectedValue(new Error('not called')),
    getHistory: vi.fn().mockRejectedValue(new Error('not called')),
    runValidation: vi.fn().mockRejectedValue(new Error('not called')),
    softClose: vi.fn(),
    hardClose: vi.fn(),
    reopen: vi.fn(),
  },
}))

vi.mock('@/api/financialStatements', () => ({
  financialStatementsApi: {
    getCashFlow: vi.fn().mockRejectedValue(new Error('not called')),
    getDrilldown: vi.fn().mockRejectedValue(new Error('not called')),
    getClosePackageUrl: vi.fn().mockReturnValue('http://localhost/export'),
  },
}))

// ---------------------------------------------------------------------------
// ScenarioSelect
// ---------------------------------------------------------------------------

describe('ScenarioSelect', () => {
  it('renders placeholder and populates options from API', async () => {
    render(wrap(
      <ScenarioSelect value="" onChange={vi.fn()} label="Scenario" placeholder="Pick a scenario" />
    ))
    expect(screen.getByText(/loading|pick a scenario/i)).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByText(/Actuals/)).toBeTruthy()
    })
    expect(screen.getByText(/Budget/)).toBeTruthy()
  })

  it('shows type label in option text', async () => {
    render(wrap(
      <ScenarioSelect value="" onChange={vi.fn()} />
    ))
    await waitFor(() => {
      expect(screen.getByText(/Actual/)).toBeTruthy()
      expect(screen.getByText(/Budget/)).toBeTruthy()
    })
  })

  it('calls onChange with numeric id when selection changes', async () => {
    const onChange = vi.fn()
    render(wrap(
      <ScenarioSelect value="" onChange={onChange} />
    ))
    await waitFor(() => screen.getByText(/Actuals/))
    fireEvent.change(screen.getByTestId('scenario-select'), { target: { value: '10' } })
    expect(onChange).toHaveBeenCalledWith(10)
  })

  it('calls onChange with empty string when placeholder selected', async () => {
    const onChange = vi.fn()
    render(wrap(
      <ScenarioSelect value={10} onChange={onChange} placeholder="All" />
    ))
    await waitFor(() => screen.getByText(/Actuals/))
    fireEvent.change(screen.getByTestId('scenario-select'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
  })
})

// ---------------------------------------------------------------------------
// FinancialStatementsPage
// ---------------------------------------------------------------------------

describe('FinancialStatementsPage', () => {
  it('renders empty state when no entity selected', () => {
    render(wrap(<FinancialStatementsPage />))
    expect(screen.getByText(/Select an entity/i)).toBeTruthy()
  })

  async function selectEntity() {
    // Wait for entity list to load (select becomes enabled)
    await waitFor(() => {
      const sel = screen.getByTestId('entity-select') as HTMLSelectElement
      expect(sel.disabled).toBe(false)
    })
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
  }

  it('shows three tabs after entity and date selected', async () => {
    render(wrap(<FinancialStatementsPage />))
    await selectEntity()
    await waitFor(() => {
      expect(screen.getByTestId('tab-BS')).toBeTruthy()
      expect(screen.getByTestId('tab-IS')).toBeTruthy()
      expect(screen.getByTestId('tab-CF')).toBeTruthy()
    })
  })

  it('renders BS rows from taxonomy API', async () => {
    render(wrap(<FinancialStatementsPage />))
    await selectEntity()
    await waitFor(() => screen.getByTestId('taxonomy-table'))
    expect(screen.getByText('Assets')).toBeTruthy()
    expect(screen.getByText('Cash')).toBeTruthy()
  })

  it('switches to IS tab and renders IS rows', async () => {
    render(wrap(<FinancialStatementsPage />))
    await selectEntity()
    await waitFor(() => screen.getByTestId('tab-IS'))
    fireEvent.click(screen.getByTestId('tab-IS'))
    await waitFor(() => screen.getByText('Revenue'))
  })

  it('shows Inherit Taxonomy button when entity selected', async () => {
    render(wrap(<FinancialStatementsPage />))
    await selectEntity()
    await waitFor(() => expect(screen.getByText(/Inherit Taxonomy/i)).toBeTruthy())
  })
})

// ---------------------------------------------------------------------------
// ComparativeFinancialsPage — ScenarioSelect instead of raw input
// ---------------------------------------------------------------------------

describe('ComparativeFinancialsPage scenario picker', () => {
  it('renders scenario dropdown (not raw number input)', async () => {
    render(wrap(<ComparativeFinancialsPage />))
    await waitFor(() => screen.getByTestId('scenario-select'))
    // Should not have an input[type=number] for scenario
    const numberInputs = document.querySelectorAll('input[type="number"]')
    const hasScenarioNumberInput = Array.from(numberInputs).some((el) =>
      el.getAttribute('placeholder')?.includes('scenario') ||
      el.getAttribute('placeholder')?.includes('Scenario')
    )
    expect(hasScenarioNumberInput).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// VarianceAnalysisPage — ScenarioSelect instead of raw input
// ---------------------------------------------------------------------------

describe('VarianceAnalysisPage scenario picker', () => {
  it('renders scenario dropdown (not raw number input)', async () => {
    render(wrap(<VarianceAnalysisPage />))
    await waitFor(() => screen.getByTestId('scenario-select'))
    const numberInputs = document.querySelectorAll('input[type="number"]')
    const hasScenarioNumberInput = Array.from(numberInputs).some((el) =>
      el.getAttribute('placeholder')?.includes('scenario') ||
      el.getAttribute('placeholder')?.includes('Scenario')
    )
    expect(hasScenarioNumberInput).toBe(false)
  })
})
