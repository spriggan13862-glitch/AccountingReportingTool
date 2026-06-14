import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ScenarioManagerPage } from '@/pages/ScenarioManagerPage'
import type { AdjustmentPackage } from '@/api/adjustmentWorkspace'
import type { AdvisorScenario } from '@/api/advisorScenarios'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={['/workbench/scenarios']}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockPackages: AdjustmentPackage[] = [
  { id: 10, organization_id: 'default-org', name: 'Audit Pkg', package_type: 'audit', created_at: '2026-01-01', items: [] } as unknown as AdjustmentPackage,
  { id: 11, organization_id: 'default-org', name: 'Management Pkg', package_type: 'management', created_at: '2026-01-02', items: [] } as unknown as AdjustmentPackage,
]

const mockScenarios: AdvisorScenario[] = [
  {
    id: 1,
    organization_id: 'default-org',
    name: 'As Reported',
    scenario_type: 'as_reported',
    description: null,
    created_at: '2026-01-01',
    updated_at: null,
    packages: [],
  },
  {
    id: 2,
    organization_id: 'default-org',
    name: 'Management View',
    scenario_type: 'management',
    description: 'Mgmt adjustments',
    created_at: '2026-01-02',
    updated_at: null,
    packages: [
      { id: 1, package_id: 11, package_name: 'Management Pkg', package_type: 'management', included: true, include_order: 0 },
    ],
  },
]

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockListPackages } = vi.hoisted(() => ({
  mockListPackages: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/api/adjustmentWorkspace', () => ({
  adjustmentWorkspaceApi: {
    listPackages: mockListPackages,
    createPackage: vi.fn(),
    deletePackage: vi.fn(),
  },
}))

vi.mock('@/api/advisorScenarios', () => ({
  listAdvisorScenarios: vi.fn().mockResolvedValue([]),
  createAdvisorScenario: vi.fn(),
  deleteAdvisorScenario: vi.fn(),
  addPackageToScenario: vi.fn(),
  removePackageFromScenario: vi.fn(),
  togglePackageInScenario: vi.fn(),
  compareScenarios: vi.fn(),
  downloadScenarioExport: vi.fn(),
  ADVISOR_SCENARIO_TYPE_LABELS: {
    as_reported: 'As Reported',
    management: 'Management Adjustments',
    management_tax: 'Management + Tax',
    management_tax_qoe: 'Management + Tax + QoE',
    sba: 'SBA Adjusted',
    custom: 'Custom',
  },
  PACKAGE_TYPE_LABELS: {
    audit: 'Audit',
    management: 'Management',
    tax: 'Tax',
    qoe: 'QoE',
    seller: 'Seller',
    buyer: 'Buyer',
    sba: 'SBA',
    client_posting: 'Client Posting',
  },
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScenarioManagerPage — Sprint 3.15', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page wrapper', async () => {
    render(wrap(<ScenarioManagerPage />))
    expect(screen.getByTestId('scenario-manager-page')).toBeInTheDocument()
  })

  it('renders all three tabs', () => {
    render(wrap(<ScenarioManagerPage />))
    expect(screen.getByTestId('tab-packages')).toBeInTheDocument()
    expect(screen.getByTestId('tab-scenarios')).toBeInTheDocument()
    expect(screen.getByTestId('tab-compare')).toBeInTheDocument()
  })

  it('packages tab is active by default', () => {
    render(wrap(<ScenarioManagerPage />))
    expect(screen.getByTestId('packages-panel')).toBeInTheDocument()
  })

  it('shows empty state when no packages', async () => {
    render(wrap(<ScenarioManagerPage />))
    await waitFor(() => {
      expect(screen.getByTestId('empty-packages')).toBeInTheDocument()
    })
  })

  it('shows create package button', () => {
    render(wrap(<ScenarioManagerPage />))
    expect(screen.getByTestId('create-package-btn')).toBeInTheDocument()
  })

  it('clicking scenarios tab shows scenarios panel', async () => {
    render(wrap(<ScenarioManagerPage />))
    fireEvent.click(screen.getByTestId('tab-scenarios'))
    expect(screen.getByTestId('scenarios-panel')).toBeInTheDocument()
  })

  it('shows empty state when no scenarios', async () => {
    render(wrap(<ScenarioManagerPage />))
    fireEvent.click(screen.getByTestId('tab-scenarios'))
    await waitFor(() => {
      expect(screen.getByTestId('empty-scenarios')).toBeInTheDocument()
    })
  })

  it('shows create scenario button in scenarios tab', () => {
    render(wrap(<ScenarioManagerPage />))
    fireEvent.click(screen.getByTestId('tab-scenarios'))
    expect(screen.getByTestId('create-scenario-btn')).toBeInTheDocument()
  })

  it('clicking compare tab shows compare panel', () => {
    render(wrap(<ScenarioManagerPage />))
    fireEvent.click(screen.getByTestId('tab-compare'))
    expect(screen.getByTestId('compare-panel')).toBeInTheDocument()
  })

  it('compare panel shows run comparison button', () => {
    render(wrap(<ScenarioManagerPage />))
    fireEvent.click(screen.getByTestId('tab-compare'))
    expect(screen.getByTestId('run-comparison-btn')).toBeInTheDocument()
  })

  it('compare panel shows empty state when no comparison run', () => {
    render(wrap(<ScenarioManagerPage />))
    fireEvent.click(screen.getByTestId('tab-compare'))
    expect(screen.getByTestId('compare-empty')).toBeInTheDocument()
  })

  it('renders package rows when packages exist', async () => {
    mockListPackages.mockResolvedValue(mockPackages as never)
    render(wrap(<ScenarioManagerPage />))
    await waitFor(() => {
      expect(screen.getByTestId('package-row-10')).toBeInTheDocument()
      expect(screen.getByTestId('package-row-11')).toBeInTheDocument()
    })
  })

  it('renders scenario rows when scenarios exist', async () => {
    const mod = await import('@/api/advisorScenarios')
    vi.mocked(mod.listAdvisorScenarios).mockResolvedValue(mockScenarios)
    render(wrap(<ScenarioManagerPage />))
    fireEvent.click(screen.getByTestId('tab-scenarios'))
    await waitFor(() => {
      expect(screen.getByTestId('scenario-row-1')).toBeInTheDocument()
      expect(screen.getByTestId('scenario-row-2')).toBeInTheDocument()
    })
  })

  it('new-package-name and new-package-type inputs appear after clicking create', () => {
    render(wrap(<ScenarioManagerPage />))
    fireEvent.click(screen.getByTestId('create-package-btn'))
    expect(screen.getByTestId('new-package-name')).toBeInTheDocument()
    expect(screen.getByTestId('new-package-type')).toBeInTheDocument()
  })

  it('new-scenario-name and new-scenario-type inputs visible after clicking create in scenarios tab', () => {
    render(wrap(<ScenarioManagerPage />))
    fireEvent.click(screen.getByTestId('tab-scenarios'))
    fireEvent.click(screen.getByTestId('create-scenario-btn'))
    expect(screen.getByTestId('new-scenario-name')).toBeInTheDocument()
    expect(screen.getByTestId('new-scenario-type')).toBeInTheDocument()
  })
})
