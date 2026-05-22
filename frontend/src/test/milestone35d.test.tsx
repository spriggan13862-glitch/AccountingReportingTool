/**
 * M35d — Advanced hierarchy, undo/redo, drag/drop, Move To Child, FS empty states,
 *         Inherit Taxonomy feedback, Draft Overlay UX rebuild.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AccountNode } from '@/types'
import { within } from '@testing-library/react'

import { ChartOfAccountsPage } from '@/pages/ChartOfAccountsPage'
import { FinancialStatementsPage } from '@/pages/FinancialStatementsPage'
import { accountsApi } from '@/api/accounts'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { reparentMock } = vi.hoisted(() => ({ reparentMock: vi.fn() }))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    tree: vi.fn().mockResolvedValue([
      {
        id: 10, entity_id: 1, account_number: '2100', account_name: 'Lines of Credit',
        account_type: 'liability', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active', description: null,
        tax_line: null, source_system: null, reporting_taxonomy_line_id: null,
        children: [],
      },
      {
        id: 11, entity_id: 1, account_number: '2101', account_name: 'LOC - Aegis',
        account_type: 'liability', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active', description: null,
        tax_line: null, source_system: null, reporting_taxonomy_line_id: null,
        children: [],
      },
      {
        id: 12, entity_id: 1, account_number: '2102', account_name: 'LOC - River North',
        account_type: 'liability', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active', description: null,
        tax_line: null, source_system: null, reporting_taxonomy_line_id: null,
        children: [],
      },
    ] as AccountNode[]),
    list: vi.fn().mockResolvedValue([
      { id: 10, entity_id: 1, account_number: '2100', account_name: 'Lines of Credit', account_type: 'liability', normal_balance: 'credit', parent_account_id: null, active: true, detail_type: null, account_status: 'active', description: null, tax_line: null, source_system: null, reporting_taxonomy_line_id: null },
      { id: 11, entity_id: 1, account_number: '2101', account_name: 'LOC - Aegis', account_type: 'liability', normal_balance: 'credit', parent_account_id: null, active: true, detail_type: null, account_status: 'active', description: null, tax_line: null, source_system: null, reporting_taxonomy_line_id: null },
      { id: 12, entity_id: 1, account_number: '2102', account_name: 'LOC - River North', account_type: 'liability', normal_balance: 'credit', parent_account_id: null, active: true, detail_type: null, account_status: 'active', description: null, tax_line: null, source_system: null, reporting_taxonomy_line_id: null },
    ]),
    update: vi.fn().mockResolvedValue({}),
    reparent: reparentMock,
  },
}))

vi.mock('@/api/reportingTaxonomy', () => ({
  reportingTaxonomyApi: { list: vi.fn().mockResolvedValue([]) },
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, name: 'Test Entity', code: 'TEST', entity_type: 'operating' },
    ]),
  },
}))

vi.mock('@/api/scenarios', () => ({
  scenariosApi: { list: vi.fn().mockResolvedValue([]) },
}))

vi.mock('@/api/reporting', () => ({
  reportingApi: {
    taxonomyBalanceSheet: vi.fn().mockResolvedValue([]),
    taxonomyIncomeStatement: vi.fn().mockResolvedValue([]),
    inheritTaxonomy: vi.fn().mockResolvedValue({ updated: 5, already_set: 10, no_ancestor: 2 }),
  },
}))

vi.mock('@/api/financialStatements', () => ({
  financialStatementsApi: {
    getCashFlow: vi.fn().mockResolvedValue({ data: null }),
    getDrilldown: vi.fn().mockResolvedValue({ data: null }),
    getClosePackageUrl: vi.fn().mockReturnValue('/export'),
  },
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: () => ({ org: { id: 1, name: 'Test' } }),
}))

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 1, full_name: 'Test', email: 't@t.com', is_superuser: true, is_active: true, organization_id: 1 },
    logout: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderCOA() {
  render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={['/accounts']}>
        <Routes>
          <Route path="*" element={<ChartOfAccountsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderFS() {
  render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={['/financial-statements']}>
        <Routes>
          <Route path="*" element={<FinancialStatementsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function selectEntityAndWait() {
  await waitFor(() => {
    const sel = screen.getByTestId('entity-select') as HTMLSelectElement
    expect(sel.disabled).toBe(false)
  })
  fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
  await waitFor(() => screen.getByTestId('account-row-10'))
}

function makeReparentResult(
  accountId: number, accountNumber: string, accountName: string,
  newParentId: number | null, newParentNumber: string | null, newParentName: string | null,
  oldParentId: number | null = null, oldParentNumber: string | null = null, oldParentName: string | null = null,
) {
  return {
    account_id: accountId, account_number: accountNumber, account_name: accountName,
    old_parent_id: oldParentId, old_parent_number: oldParentNumber, old_parent_name: oldParentName,
    new_parent_id: newParentId, new_parent_number: newParentNumber, new_parent_name: newParentName,
  }
}

// ---------------------------------------------------------------------------
// Tests: Undo/Redo buttons
// ---------------------------------------------------------------------------

describe('ChartOfAccountsPage — undo/redo buttons', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders undo and redo buttons', async () => {
    renderCOA()
    await selectEntityAndWait()
    expect(screen.getByTestId('undo-btn')).toBeTruthy()
    expect(screen.getByTestId('redo-btn')).toBeTruthy()
  })

  it('undo button is disabled initially', async () => {
    renderCOA()
    await selectEntityAndWait()
    expect(screen.getByTestId('undo-btn')).toBeDisabled()
  })

  it('redo button is disabled initially', async () => {
    renderCOA()
    await selectEntityAndWait()
    expect(screen.getByTestId('redo-btn')).toBeDisabled()
  })

  it('undo becomes enabled after a reparent action', async () => {
    reparentMock.mockResolvedValue(makeReparentResult(11, '2101', 'LOC - Aegis', 10, '2100', 'Lines of Credit'))
    renderCOA()
    await selectEntityAndWait()

    // Open menu and click Make Child (2101 becomes child of 2100)
    const btn = screen.getByTestId('hierarchy-menu-btn-11')
    fireEvent.click(btn)
    await waitFor(() => screen.getByTestId('hierarchy-context-menu'))
    fireEvent.click(screen.getByTestId('action-make-child'))
    await waitFor(() => expect(reparentMock).toHaveBeenCalled())

    await waitFor(() => expect(screen.getByTestId('undo-btn')).not.toBeDisabled())
  })
})

// ---------------------------------------------------------------------------
// Tests: Expand/Collapse all
// ---------------------------------------------------------------------------

describe('ChartOfAccountsPage — expand/collapse all', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders expand-all and collapse-all buttons after entity selected', async () => {
    renderCOA()
    await selectEntityAndWait()
    expect(screen.getByTestId('expand-all-btn')).toBeTruthy()
    expect(screen.getByTestId('collapse-all-btn')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Tests: Move To Child
// ---------------------------------------------------------------------------

describe('ChartOfAccountsPage — Move To Child', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reparentMock.mockResolvedValue(makeReparentResult(11, '2101', 'LOC - Aegis', 10, '2100', 'Lines of Credit'))
  })

  it('shows action-move-to-child in context menu', async () => {
    renderCOA()
    await selectEntityAndWait()
    fireEvent.click(screen.getByTestId('hierarchy-menu-btn-10'))
    await waitFor(() => screen.getByTestId('hierarchy-context-menu'))
    expect(screen.getByTestId('action-move-to-child')).toBeTruthy()
  })

  it('opens Move To Child modal on action click', async () => {
    renderCOA()
    await selectEntityAndWait()
    fireEvent.click(screen.getByTestId('hierarchy-menu-btn-10'))
    await waitFor(() => screen.getByTestId('hierarchy-context-menu'))
    fireEvent.click(screen.getByTestId('action-move-to-child'))
    await waitFor(() => screen.getByTestId('move-to-child-modal'))
    expect(screen.getByTestId('move-to-child-modal')).toBeTruthy()
  })

  it('calls reparent(targetId, sourceId) when target selected in Move To Child', async () => {
    renderCOA()
    await selectEntityAndWait()
    // Open context menu on account 10 (2100 Lines of Credit)
    fireEvent.click(screen.getByTestId('hierarchy-menu-btn-10'))
    await waitFor(() => screen.getByTestId('hierarchy-context-menu'))
    fireEvent.click(screen.getByTestId('action-move-to-child'))
    await waitFor(() => screen.getByTestId('move-to-child-modal'))
    // Choose account 11 (2101) to become child of 10 (2100)
    await waitFor(() => screen.getByTestId('move-to-child-account-11'))
    fireEvent.click(screen.getByTestId('move-to-child-account-11'))
    // reparent(11, 10) — 11 becomes child of 10
    await waitFor(() => expect(reparentMock).toHaveBeenCalledWith(11, 10))
  })

  it('self is excluded from Move To Child modal', async () => {
    renderCOA()
    await selectEntityAndWait()
    fireEvent.click(screen.getByTestId('hierarchy-menu-btn-10'))
    await waitFor(() => screen.getByTestId('hierarchy-context-menu'))
    fireEvent.click(screen.getByTestId('action-move-to-child'))
    await waitFor(() => screen.getByTestId('move-to-child-modal'))
    await waitFor(() => screen.getByTestId('move-to-child-account-11'))
    expect(screen.queryByTestId('move-to-child-account-10')).toBeNull()
  })

  it('Move To Child modal closes on Escape', async () => {
    renderCOA()
    await selectEntityAndWait()
    fireEvent.click(screen.getByTestId('hierarchy-menu-btn-10'))
    await waitFor(() => screen.getByTestId('hierarchy-context-menu'))
    fireEvent.click(screen.getByTestId('action-move-to-child'))
    await waitFor(() => screen.getByTestId('move-to-child-modal'))
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('move-to-child-modal')).toBeNull())
  })
})

// ---------------------------------------------------------------------------
// Tests: Drag handle present
// ---------------------------------------------------------------------------

describe('ChartOfAccountsPage — drag handles', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('each account row has draggable attribute', async () => {
    renderCOA()
    await selectEntityAndWait()
    const row = screen.getByTestId('account-row-10')
    expect(row.getAttribute('draggable')).toBe('true')
  })
})

// ---------------------------------------------------------------------------
// Tests: FinancialStatementsPage empty states
// ---------------------------------------------------------------------------

describe('FinancialStatementsPage — empty states and inherit feedback', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows entity-prompt when no entity selected', async () => {
    renderFS()
    await waitFor(() => screen.getByText(/Select an entity and date/i))
  })

  it('shows no-data state when BS rows are empty', async () => {
    const { reportingApi } = await import('@/api/reporting')
    vi.mocked(reportingApi.taxonomyBalanceSheet).mockResolvedValue([])
    renderFS()
    await waitFor(() => {
      const sel = screen.getByTestId('entity-select') as HTMLSelectElement
      expect(sel.disabled).toBe(false)
    })
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    await waitFor(() => screen.getByText(/No taxonomy lines configured/i))
    expect(screen.getByText(/No taxonomy lines configured/i)).toBeTruthy()
  })

  it('shows Inherit Taxonomy button when entity is selected', async () => {
    renderFS()
    await waitFor(() => {
      const sel = screen.getByTestId('entity-select') as HTMLSelectElement
      expect(sel.disabled).toBe(false)
    })
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    await waitFor(() => screen.getByText('Inherit Taxonomy'))
  })

  it('shows inherit result with updated count when successful', async () => {
    const { reportingApi } = await import('@/api/reporting')
    vi.mocked(reportingApi.inheritTaxonomy).mockResolvedValue({ updated: 5, already_set: 10, no_ancestor: 0 })
    renderFS()
    await waitFor(() => {
      const sel = screen.getByTestId('entity-select') as HTMLSelectElement
      expect(sel.disabled).toBe(false)
    })
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    await waitFor(() => screen.getByText('Inherit Taxonomy'))
    fireEvent.click(screen.getByText('Inherit Taxonomy'))
    await waitFor(() => screen.getByTestId('inherit-result'))
    expect(screen.getByText(/5 accounts classified/i)).toBeTruthy()
  })

  it('shows no-ancestor warning when 0 updated and no_ancestor > 0', async () => {
    const { reportingApi } = await import('@/api/reporting')
    vi.mocked(reportingApi.inheritTaxonomy).mockResolvedValue({ updated: 0, already_set: 0, no_ancestor: 8 })
    renderFS()
    await waitFor(() => {
      const sel = screen.getByTestId('entity-select') as HTMLSelectElement
      expect(sel.disabled).toBe(false)
    })
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    await waitFor(() => screen.getByText('Inherit Taxonomy'))
    fireEvent.click(screen.getByText('Inherit Taxonomy'))
    await waitFor(() => screen.getByTestId('inherit-result'))
    expect(screen.getByText(/No eligible parent mappings found/i)).toBeTruthy()
  })

  it('shows already-set message when all accounts already classified', async () => {
    const { reportingApi } = await import('@/api/reporting')
    vi.mocked(reportingApi.inheritTaxonomy).mockResolvedValue({ updated: 0, already_set: 15, no_ancestor: 0 })
    renderFS()
    await waitFor(() => {
      const sel = screen.getByTestId('entity-select') as HTMLSelectElement
      expect(sel.disabled).toBe(false)
    })
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    await waitFor(() => screen.getByText('Inherit Taxonomy'))
    fireEvent.click(screen.getByText('Inherit Taxonomy'))
    await waitFor(() => screen.getByTestId('inherit-result'))
    expect(screen.getByText(/already have reporting lines/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Tests: M35c regression — existing tests still pass
// ---------------------------------------------------------------------------

describe('ChartOfAccountsPage — M35c regression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reparentMock.mockResolvedValue(makeReparentResult(11, '2101', 'LOC - Aegis', 10, '2100', 'Lines of Credit'))
  })

  it('renders hierarchy menu buttons', async () => {
    renderCOA()
    await selectEntityAndWait()
    expect(screen.getByTestId('hierarchy-menu-btn-10')).toBeTruthy()
    expect(screen.getByTestId('hierarchy-menu-btn-11')).toBeTruthy()
  })

  it('action-move-to still opens parent modal', async () => {
    renderCOA()
    await selectEntityAndWait()
    fireEvent.click(screen.getByTestId('hierarchy-menu-btn-11'))
    await waitFor(() => screen.getByTestId('hierarchy-context-menu'))
    fireEvent.click(screen.getByTestId('action-move-to'))
    await waitFor(() => screen.getByTestId('move-to-modal'))
    expect(screen.getByTestId('move-to-modal')).toBeTruthy()
  })

  it('Make Parent calls reparent correctly', async () => {
    renderCOA()
    await selectEntityAndWait()
    fireEvent.click(screen.getByTestId('hierarchy-menu-btn-10'))
    await waitFor(() => screen.getByTestId('hierarchy-context-menu'))
    fireEvent.click(screen.getByTestId('action-make-parent'))
    await waitFor(() => expect(reparentMock).toHaveBeenCalledWith(11, 10))
  })
})
