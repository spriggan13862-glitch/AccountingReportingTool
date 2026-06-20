import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: vi.fn().mockResolvedValue([]),
    listPaged: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50, pages: 1 }),
    tree: vi.fn().mockResolvedValue([
      {
        id: 1,
        account_number: '1000',
        account_name: 'Cash',
        account_type: 'asset',
        normal_balance: 'debit',
        active: true,
        account_status: 'active',
        parent_account_id: null,
        detail_type: null,
        description: null,
        tax_line: null,
        source_system: null,
        reporting_taxonomy_line_id: null,
        is_header: false,
        is_postable: true,
        fs_sign_convention: 1,
        cfs_section: null,
        fs_statement: null,
        fs_section: null,
        fs_line_label: null,
        fs_line_order: null,
        account_path: '1',
        depth_level: 0,
        sort_order: null,
        entity_id: 1,
        children: [
          {
            id: 2,
            account_number: '1001',
            account_name: 'Petty Cash',
            account_type: 'asset',
            normal_balance: 'debit',
            active: true,
            account_status: 'active',
            parent_account_id: 1,
            detail_type: null,
            description: null,
            tax_line: null,
            source_system: null,
            reporting_taxonomy_line_id: null,
            is_header: false,
            is_postable: true,
            fs_sign_convention: 1,
            cfs_section: null,
            fs_statement: null,
            fs_section: null,
            fs_line_label: null,
            fs_line_order: null,
            account_path: '1/2',
            depth_level: 1,
            sort_order: null,
            entity_id: 1,
            children: [],
          },
        ],
      },
    ]),
    getById: vi.fn().mockResolvedValue({
      id: 1,
      account_number: '1000',
      account_name: 'Cash',
      account_type: 'asset',
      normal_balance: 'debit',
      active: true,
      account_status: 'active',
      parent_account_id: null,
      detail_type: null,
      description: null,
      tax_line: null,
      source_system: null,
      reporting_taxonomy_line_id: null,
      is_header: false,
      is_postable: true,
      fs_sign_convention: 1,
      cfs_section: null,
      fs_statement: null,
      fs_section: null,
      fs_line_label: null,
      fs_line_order: null,
      account_path: '1',
      depth_level: 0,
      sort_order: null,
      entity_id: 1,
      children: [{ id: 2, account_number: '1001', account_name: 'Petty Cash', account_type: 'asset', normal_balance: 'debit', active: true, account_status: 'active', parent_account_id: 1, detail_type: null, description: null, tax_line: null, source_system: null, reporting_taxonomy_line_id: null, is_header: false, is_postable: true, fs_sign_convention: 1, cfs_section: null, fs_statement: null, fs_section: null, fs_line_label: null, fs_line_order: null, account_path: '1/2', depth_level: 1, sort_order: null, entity_id: 1 }],
      balance_summary: { total_debit: 1000, total_credit: 0, net_balance: 1000 },
    }),
    update: vi.fn().mockResolvedValue({ id: 1, account_number: '1000', account_name: 'Cash Updated', account_type: 'asset', normal_balance: 'debit', active: true, account_status: 'active', parent_account_id: null, detail_type: null, description: null, tax_line: null, source_system: null, reporting_taxonomy_line_id: null, is_header: false, is_postable: true, fs_sign_convention: 1, cfs_section: null, fs_statement: null, fs_section: null, fs_line_label: null, fs_line_order: null, account_path: '1', depth_level: 0, sort_order: null, entity_id: 1 }),
    deactivate: vi.fn().mockResolvedValue({ id: 1, active: false, account_status: 'inactive' }),
    delete: vi.fn().mockResolvedValue(null),
    reparent: vi.fn().mockResolvedValue({}),
    bulkUpdate: vi.fn().mockResolvedValue([]),
    backfillPaths: vi.fn().mockResolvedValue({ updated: 0 }),
    backfillFsSign: vi.fn().mockResolvedValue({ updated: 0 }),
    listWithHierarchy: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50, pages: 1 }),
  },
}))

vi.mock('@/api/reportingTaxonomy', () => ({
  reportingTaxonomyApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/providers/WorkspaceProvider', () => ({
  useWorkspace: () => ({ activeEntity: { id: 1, name: 'Test Entity' } }),
}))

vi.mock('@/providers/OrgProvider', () => ({
  useOrg: () => ({ activeOrg: { id: 1 } }),
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/components/ui/EntitySelect', () => ({
  EntitySelect: ({ onChange }: { onChange: (v: number) => void }) => (
    <button data-testid="entity-select" onClick={() => onChange(1)}>Entity 1</button>
  ),
}))

vi.mock('@/components/ui/CreateAccountModal', () => ({
  CreateAccountModal: () => <div data-testid="create-modal" />,
}))

vi.mock('@/components/data-grid', () => ({
  BatchActionBar: () => null,
  FilterBar: () => null,
}))

vi.mock('@/components/ui/PageLayout', () => ({
  PageLayout: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))

vi.mock('@/components/ui/Breadcrumb', () => ({
  Breadcrumb: () => null,
}))

vi.mock('@/components/ui/ValidationAlert', () => ({
  ErrorBanner: () => null,
}))

import { ChartOfAccountsPage } from '../pages/ChartOfAccountsPage'
import { accountsApi } from '@/api/accounts'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ChartOfAccountsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ChartOfAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders account list with filter bar after entity selection', async () => {
    renderPage()
    const entityBtn = screen.getByTestId('entity-select')
    fireEvent.click(entityBtn)
    await waitFor(() => {
      expect(screen.getByTestId('coa-search')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByTestId('create-account-btn')).toBeInTheDocument()
    })
  })

  it('clicking account row opens detail panel', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('entity-select'))
    await waitFor(() => {
      expect(screen.getByTestId('account-row-1')).toBeInTheDocument()
    })
    const nameBtn = screen.getByText('Cash')
    fireEvent.click(nameBtn)
    await waitFor(() => {
      expect(screen.getByTestId('balance-summary')).toBeInTheDocument()
    })
  })

  it('edit form saves via accountsApi.update', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('entity-select'))
    await waitFor(() => {
      expect(screen.getByTestId('edit-btn-1')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('edit-btn-1'))
    await waitFor(() => {
      const inputs = screen.getAllByRole('textbox')
      expect(inputs.length).toBeGreaterThan(0)
    })
    const checkBtn = screen.getByTitle('Save')
    fireEvent.click(checkBtn)
    await waitFor(() => {
      expect(accountsApi.update).toHaveBeenCalled()
    })
  })

  it('delete button absent when account has children', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('entity-select'))
    await waitFor(() => {
      expect(screen.getByTestId('account-row-1')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Cash'))
    await waitFor(() => {
      expect(screen.getByTestId('balance-summary')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('delete-btn')).not.toBeInTheDocument()
  })

  it('hierarchy tree toggle switches view mode', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('entity-select'))
    await waitFor(() => {
      expect(screen.getByTestId('hierarchy-toggle-btn')).toBeInTheDocument()
    })
    const toggleBtn = screen.getByTestId('hierarchy-toggle-btn')
    expect(toggleBtn).toHaveTextContent('Tree')
    fireEvent.click(toggleBtn)
    expect(toggleBtn).toHaveTextContent('Flat')
  })
})
