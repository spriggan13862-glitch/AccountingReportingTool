import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ImportReadinessMatrix } from '@/components/ui/ImportReadinessMatrix'
import type { ImportReadinessStatus } from '@/types'

vi.mock('@/api/importReadiness', () => ({
  importReadinessApi: {
    get: vi.fn(),
  },
}))

import { importReadinessApi } from '@/api/importReadiness'

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function makeReadiness(overrides: Partial<ImportReadinessStatus> = {}): ImportReadinessStatus {
  return {
    coa_available: false,
    coa_account_count: 0,
    tb_available: false,
    tb_has_balances: false,
    gl_available: false,
    fs_available: false,
    taxonomy_mapped_pct: 0,
    unmapped_account_count: 0,
    ready_for_accounting_view: false,
    ready_for_fs_presentation: false,
    ready_for_bridge: false,
    ready_for_drilldown: false,
    missing_for_accounting_view: [],
    missing_for_fs_presentation: [],
    ...overrides,
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeClient()}>
      {children}
    </QueryClientProvider>
  )
}

describe('Import Readiness Matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders matrix with all four import types', async () => {
    vi.mocked(importReadinessApi.get).mockResolvedValue(makeReadiness())

    render(<ImportReadinessMatrix entityId={1} />, { wrapper })

    const matrix = await screen.findByTestId('import-readiness-matrix')
    expect(matrix).toBeTruthy()

    expect(screen.getByTestId('readiness-coa-status')).toBeTruthy()
    expect(screen.getByTestId('readiness-tb-status')).toBeTruthy()
    expect(screen.getByTestId('readiness-gl-status')).toBeTruthy()
    expect(screen.getByTestId('readiness-fs-status')).toBeTruthy()
  })

  it('shows green check when coa_available', async () => {
    vi.mocked(importReadinessApi.get).mockResolvedValue(
      makeReadiness({ coa_available: true, coa_account_count: 42 })
    )

    render(<ImportReadinessMatrix entityId={1} />, { wrapper })

    await screen.findByTestId('import-readiness-matrix')
    // COA row should exist
    expect(screen.getByTestId('readiness-coa-status')).toBeTruthy()
    // Chart of Accounts label should appear
    expect(screen.getByText('Chart of Accounts')).toBeTruthy()
  })

  it('shows missing items when not ready_for_accounting_view', async () => {
    vi.mocked(importReadinessApi.get).mockResolvedValue(
      makeReadiness({
        coa_available: false,
        tb_available: false,
        ready_for_accounting_view: false,
        missing_for_accounting_view: [
          'No Chart of Accounts — upload a COA file or TB to create accounts',
          'No posted Trial Balance — upload and post a TB to create period balances',
        ],
      })
    )

    render(<ImportReadinessMatrix entityId={1} />, { wrapper })

    const missingList = await screen.findByTestId('readiness-missing-list')
    expect(missingList).toBeTruthy()
    expect(screen.getByText(/No Chart of Accounts/)).toBeTruthy()
    expect(screen.getByText(/No posted Trial Balance/)).toBeTruthy()
  })

  it('shows readiness badges for all four workflow states', async () => {
    vi.mocked(importReadinessApi.get).mockResolvedValue(
      makeReadiness({
        coa_available: true,
        coa_account_count: 10,
        tb_available: true,
        tb_has_balances: true,
        ready_for_accounting_view: true,
        ready_for_bridge: true,
      })
    )

    render(<ImportReadinessMatrix entityId={1} />, { wrapper })

    await screen.findByTestId('import-readiness-matrix')
    expect(screen.getByTestId('readiness-accounting-view')).toBeTruthy()
    expect(screen.getByTestId('readiness-fs-presentation')).toBeTruthy()
    expect(screen.getByTestId('readiness-bridge')).toBeTruthy()
    expect(screen.getByTestId('readiness-drilldown')).toBeTruthy()
  })
})
