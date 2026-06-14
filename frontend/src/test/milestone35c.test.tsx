/**
 * M35c — Hierarchy context-menu actions in ChartOfAccountsPage
 * Tests: Make Parent, Make Child, Outdent, Move To, context-menu presence,
 *        MoveToParentModal, keyboard dismissal, validation feedback.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AccountNode } from '@/types'

import { within } from '@testing-library/react'
import { ChartOfAccountsPage } from '@/pages/ChartOfAccountsPage'
import { accountsApi } from '@/api/accounts'

// ---------------------------------------------------------------------------
// Mocks — reparentMock hoisted so it's available inside vi.mock factories
// ---------------------------------------------------------------------------

const { reparentMock } = vi.hoisted(() => ({ reparentMock: vi.fn() }))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    tree: vi.fn().mockResolvedValue([
      {
        id: 10, entity_id: 1, account_number: '2100', account_name: 'Lines of Credit',
        account_type: 'liability', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active', description: null,
        tax_line: null, source_system: null, reporting_taxonomy_line_id: null, children: [],
      },
      {
        id: 11, entity_id: 1, account_number: '2101', account_name: 'LOC - Aegis',
        account_type: 'liability', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active', description: null,
        tax_line: null, source_system: null, reporting_taxonomy_line_id: null, children: [],
      },
      {
        id: 12, entity_id: 1, account_number: '2102', account_name: 'LOC - River North',
        account_type: 'liability', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active', description: null,
        tax_line: null, source_system: null, reporting_taxonomy_line_id: null, children: [],
      },
    ] as unknown as AccountNode[]),
    list: vi.fn().mockResolvedValue([
      {
        id: 10, entity_id: 1, account_number: '2100', account_name: 'Lines of Credit',
        account_type: 'liability', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active', description: null,
        tax_line: null, source_system: null, reporting_taxonomy_line_id: null,
      },
      {
        id: 11, entity_id: 1, account_number: '2101', account_name: 'LOC - Aegis',
        account_type: 'liability', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active', description: null,
        tax_line: null, source_system: null, reporting_taxonomy_line_id: null,
      },
      {
        id: 12, entity_id: 1, account_number: '2102', account_name: 'LOC - River North',
        account_type: 'liability', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active', description: null,
        tax_line: null, source_system: null, reporting_taxonomy_line_id: null,
      },
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

function renderPage() {
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

async function selectEntityAndWaitForAccounts() {
  await waitFor(() => {
    const sel = screen.getByTestId('entity-select') as HTMLSelectElement
    expect(sel.disabled).toBe(false)
  })
  fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
  await waitFor(() => screen.getByTestId('account-row-10'))
}

async function openMenu(accountId: number) {
  const btn = screen.getByTestId(`hierarchy-menu-btn-${accountId}`)
  fireEvent.click(btn)
  await waitFor(() => screen.getByTestId('hierarchy-context-menu'))
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
// Tests: context menu presence
// ---------------------------------------------------------------------------

describe('ChartOfAccountsPage — hierarchy context menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reparentMock.mockResolvedValue(
      makeReparentResult(11, '2101', 'LOC - Aegis', 10, '2100', 'Lines of Credit')
    )
  })

  it('renders hierarchy menu button per row', async () => {
    renderPage()
    await selectEntityAndWaitForAccounts()
    expect(screen.getByTestId('hierarchy-menu-btn-10')).toBeTruthy()
    expect(screen.getByTestId('hierarchy-menu-btn-11')).toBeTruthy()
    expect(screen.getByTestId('hierarchy-menu-btn-12')).toBeTruthy()
  })

  it('opens context menu on ⋮ button click', async () => {
    renderPage()
    await selectEntityAndWaitForAccounts()
    await openMenu(10)
    expect(screen.getByTestId('hierarchy-context-menu')).toBeTruthy()
  })

  it('opens context menu on right-click (contextmenu event)', async () => {
    renderPage()
    await selectEntityAndWaitForAccounts()
    const row = screen.getByTestId('account-row-10')
    fireEvent.contextMenu(row, { clientX: 200, clientY: 200 })
    await waitFor(() => screen.getByTestId('hierarchy-context-menu'))
  })

  it('shows account number and name in menu header', async () => {
    renderPage()
    await selectEntityAndWaitForAccounts()
    await openMenu(10)
    const menu = screen.getByTestId('hierarchy-context-menu')
    expect(within(menu).getByText(/2100/)).toBeTruthy()
    expect(within(menu).getByText(/Lines of Credit/)).toBeTruthy()
  })

  it('closes context menu on Escape key', async () => {
    renderPage()
    await selectEntityAndWaitForAccounts()
    await openMenu(10)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('hierarchy-context-menu')).toBeNull())
  })
})

// ---------------------------------------------------------------------------
// Tests: Make Parent / Make Child / Outdent
// ---------------------------------------------------------------------------

describe('ChartOfAccountsPage — hierarchy actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reparentMock.mockResolvedValue(
      makeReparentResult(11, '2101', 'LOC - Aegis', 10, '2100', 'Lines of Credit')
    )
  })

  it('Make Parent: reparent(nextId, selectedId) — next becomes child of selected', async () => {
    renderPage()
    await selectEntityAndWaitForAccounts()
    await openMenu(10) // 2100 selected; 2101 (id=11) is next
    fireEvent.click(screen.getByTestId('action-make-parent'))
    await waitFor(() => expect(reparentMock).toHaveBeenCalledWith(11, 10))
  })

  it('Make Child: reparent(selectedId, prevId) — selected becomes child of prev', async () => {
    renderPage()
    await selectEntityAndWaitForAccounts()
    await openMenu(11) // 2101 selected; 2100 (id=10) is prev
    fireEvent.click(screen.getByTestId('action-make-child'))
    await waitFor(() => expect(reparentMock).toHaveBeenCalledWith(11, 10))
  })

  it('Outdent: reparent(selectedId, null) when account has a parent', async () => {
    // Give account 11 a parent so Outdent is enabled
    vi.mocked(accountsApi.tree).mockResolvedValueOnce([
      {
        id: 10, entity_id: 1, account_number: '2100', account_name: 'Lines of Credit',
        account_type: 'liability', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active', description: null,
        tax_line: null, source_system: null, reporting_taxonomy_line_id: null, children: [],
      },
      {
        id: 11, entity_id: 1, account_number: '2101', account_name: 'LOC - Aegis',
        account_type: 'liability', normal_balance: 'credit', parent_account_id: 10, // HAS parent
        active: true, detail_type: null, account_status: 'active', description: null,
        tax_line: null, source_system: null, reporting_taxonomy_line_id: null, children: [],
      },
      {
        id: 12, entity_id: 1, account_number: '2102', account_name: 'LOC - River North',
        account_type: 'liability', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active', description: null,
        tax_line: null, source_system: null, reporting_taxonomy_line_id: null, children: [],
      },
    ] as unknown as import('@/types').AccountNode[])
    reparentMock.mockResolvedValue(
      makeReparentResult(11, '2101', 'LOC - Aegis', null, null, null, 10, '2100', 'Lines of Credit')
    )
    renderPage()
    await selectEntityAndWaitForAccounts()
    await openMenu(11)
    const outdentBtn = screen.getByTestId('action-outdent')
    expect(outdentBtn).not.toBeDisabled()
    fireEvent.click(outdentBtn)
    await waitFor(() => expect(reparentMock).toHaveBeenCalledWith(11, null))
  })

  it('Make Parent is disabled on last account (no next)', async () => {
    renderPage()
    await selectEntityAndWaitForAccounts()
    await openMenu(12) // last account
    const btn = screen.getByTestId('action-make-parent')
    expect(btn).toBeDisabled()
  })

  it('Make Child is disabled on first account (no prev)', async () => {
    renderPage()
    await selectEntityAndWaitForAccounts()
    await openMenu(10) // first account
    const btn = screen.getByTestId('action-make-child')
    expect(btn).toBeDisabled()
  })

  it('Outdent is disabled when account has no parent', async () => {
    renderPage()
    await selectEntityAndWaitForAccounts()
    await openMenu(10) // parent_account_id = null
    expect(screen.getByTestId('action-outdent')).toBeDisabled()
  })

  it('shows sub-label for Make Parent with target account', async () => {
    renderPage()
    await selectEntityAndWaitForAccounts()
    await openMenu(10) // next is 2101
    await waitFor(() => expect(screen.getByText(/2101 LOC - Aegis/)).toBeTruthy())
  })

  it('shows sub-label for Make Child with prev account', async () => {
    renderPage()
    await selectEntityAndWaitForAccounts()
    await openMenu(11) // prev is 2100
    await waitFor(() => expect(screen.getByText(/2100 Lines of Credit/)).toBeTruthy())
  })
})

// ---------------------------------------------------------------------------
// Tests: Move To modal
// ---------------------------------------------------------------------------

describe('MoveToParentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reparentMock.mockResolvedValue(
      makeReparentResult(11, '2101', 'LOC - Aegis', 10, '2100', 'Lines of Credit')
    )
  })

  async function openMoveToModal() {
    renderPage()
    await selectEntityAndWaitForAccounts()
    await openMenu(11)
    fireEvent.click(screen.getByTestId('action-move-to'))
    await waitFor(() => screen.getByTestId('move-to-modal'))
  }

  it('opens Move To modal on action-move-to click', async () => {
    await openMoveToModal()
    expect(screen.getByTestId('move-to-modal')).toBeTruthy()
  })

  it('shows search input', async () => {
    await openMoveToModal()
    expect(screen.getByTestId('move-to-search')).toBeTruthy()
  })

  it('lists other accounts but not the selected account', async () => {
    await openMoveToModal()
    await waitFor(() => expect(screen.getByTestId('move-to-account-10')).toBeTruthy())
    expect(screen.getByTestId('move-to-account-12')).toBeTruthy()
    expect(screen.queryByTestId('move-to-account-11')).toBeNull() // self excluded
  })

  it('filters accounts by search query', async () => {
    await openMoveToModal()
    await waitFor(() => screen.getByTestId('move-to-search'))
    fireEvent.change(screen.getByTestId('move-to-search'), { target: { value: 'River' } })
    await waitFor(() => expect(screen.getByTestId('move-to-account-12')).toBeTruthy())
    expect(screen.queryByTestId('move-to-account-10')).toBeNull()
  })

  it('calls reparent when account selected', async () => {
    await openMoveToModal()
    await waitFor(() => screen.getByTestId('move-to-account-10'))
    fireEvent.click(screen.getByTestId('move-to-account-10'))
    await waitFor(() => expect(reparentMock).toHaveBeenCalledWith(11, 10))
  })

  it('calls reparent with null when Root option selected', async () => {
    reparentMock.mockResolvedValue(
      makeReparentResult(11, '2101', 'LOC - Aegis', null, null, null, 10, '2100', 'Lines of Credit')
    )
    await openMoveToModal()
    await waitFor(() => screen.getByTestId('move-to-root'))
    fireEvent.click(screen.getByTestId('move-to-root'))
    await waitFor(() => expect(reparentMock).toHaveBeenCalledWith(11, null))
  })

  it('closes on Escape key', async () => {
    await openMoveToModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('move-to-modal')).toBeNull())
  })

  it('closes on Cancel button', async () => {
    await openMoveToModal()
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(screen.queryByTestId('move-to-modal')).toBeNull())
  })
})
