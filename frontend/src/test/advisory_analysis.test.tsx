import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { AdvisoryAnalysisPage } from '@/pages/AdvisoryAnalysisPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={['/workbench/advisory-analysis']}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Hoisted mock data (must be defined before vi.mock calls)
// ---------------------------------------------------------------------------

const { mockBridge, mockQoE, mockSBA, mockDSCR } = vi.hoisted(() => ({
  mockBridge: {
    entity_id: 1,
    base_ebitda: '500000',
    sections: [
      {
        category: 'Owner Compensation Normalization',
        overlay_group: 'normalization',
        items: [
          {
            je_id: 1, je_number: 'JE-001', entry_date: '2026-01-15',
            description: 'Owner salary addback', overlay_group: 'normalization',
            package_name: 'Management Pkg', package_type: 'management',
            ni_impact: '80000', ebitda_impact: '80000',
            asset_impact: '0', liability_impact: '0', equity_impact: '80000', amount: '80000',
          },
        ],
        subtotal: '80000',
      },
    ],
    total_adjustments: '80000',
    adjusted_ebitda: '580000',
  },
  mockQoE: {
    entity_id: 1,
    items: [
      {
        je_id: 3, je_number: 'JE-003', entry_date: '2026-01-20',
        description: 'QoE adjustment A', overlay_group: 'topside',
        package_name: 'QoE Package', package_type: 'qoe',
        ni_impact: '15000', ebitda_impact: '15000',
        asset_impact: '0', liability_impact: '0', equity_impact: '15000', amount: '15000',
      },
    ],
    total: '15000',
    count: 1,
  },
  mockSBA: {
    entity_id: 1,
    items: [],
    total: '0',
    count: 0,
    note: 'SBA 7(a) addbacks — expenses not expected to continue post-transfer',
  },
  mockDSCR: {
    entity_id: 1,
    adjusted_ebitda: '580000',
    annual_debt_service: '200000',
    dscr: '2.90',
    coverage_note: 'Strong coverage',
  },
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/advisorScenarios', () => ({
  listAdvisorScenarios: vi.fn().mockResolvedValue([]),
  ADVISOR_SCENARIO_TYPE_LABELS: {},
  PACKAGE_TYPE_LABELS: {},
}))

vi.mock('@/api/advisoryAnalysis', () => ({
  getEBITDABridge: vi.fn().mockResolvedValue(mockBridge),
  getQoESchedule: vi.fn().mockResolvedValue(mockQoE),
  getSBAAddback: vi.fn().mockResolvedValue(mockSBA),
  getDSCR: vi.fn().mockResolvedValue(mockDSCR),
  downloadAdvisoryExport: vi.fn(),
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: { list: vi.fn().mockResolvedValue([]) },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdvisoryAnalysisPage — Sprint 3.16', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the page wrapper', () => {
    render(wrap(<AdvisoryAnalysisPage />))
    expect(screen.getByTestId('advisory-analysis-page')).toBeInTheDocument()
  })

  it('renders analysis controls section', () => {
    render(wrap(<AdvisoryAnalysisPage />))
    expect(screen.getByTestId('analysis-controls')).toBeInTheDocument()
  })

  it('shows configure state initially (before run)', () => {
    render(wrap(<AdvisoryAnalysisPage />))
    expect(screen.getByTestId('configure-state')).toBeInTheDocument()
  })

  it('run analysis button is present', () => {
    render(wrap(<AdvisoryAnalysisPage />))
    expect(screen.getByTestId('run-analysis-btn')).toBeInTheDocument()
  })

  it('run analysis button is disabled when no entity selected', () => {
    render(wrap(<AdvisoryAnalysisPage />))
    expect(screen.getByTestId('run-analysis-btn')).toBeDisabled()
  })

  it('base ebitda input is present', () => {
    render(wrap(<AdvisoryAnalysisPage />))
    expect(screen.getByTestId('base-ebitda-input')).toBeInTheDocument()
  })

  it('heading text Advisory Analysis appears in page', () => {
    render(wrap(<AdvisoryAnalysisPage />))
    const matches = screen.getAllByText('Advisory Analysis')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('subtitle p contains EBITDA bridge', () => {
    render(wrap(<AdvisoryAnalysisPage />))
    const matches = screen.getAllByText(/EBITDA bridge/)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('analysis tabs are not visible before running', () => {
    render(wrap(<AdvisoryAnalysisPage />))
    expect(screen.queryByTestId('analysis-tabs')).not.toBeInTheDocument()
  })

  it('debt-service input is not visible before results', () => {
    render(wrap(<AdvisoryAnalysisPage />))
    expect(screen.queryByTestId('debt-service-input')).not.toBeInTheDocument()
  })

  it('export button is not visible before results', () => {
    render(wrap(<AdvisoryAnalysisPage />))
    expect(screen.queryByTestId('export-btn')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Nav registration
// ---------------------------------------------------------------------------

describe('AdvisoryAnalysisPage — nav registration', () => {
  it('advisory-analysis is NOT in the main nav rail', async () => {
    const { NAV_GROUPS } = await import('@/config/nav')
    for (const g of NAV_GROUPS) {
      expect(g.items.find((i) => i.id === 'advisory-analysis')).toBeUndefined()
    }
  })

  it('adjustments group has 3 items', async () => {
    const { NAV_GROUPS } = await import('@/config/nav')
    const g = NAV_GROUPS.find((g) => g.id === 'adjustments')!
    expect(g.items.length).toBe(3)
  })
})
