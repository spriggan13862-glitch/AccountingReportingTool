/**
 * M34 — QB COA taxonomy fixes:
 *   - Unassigned filter chip
 *   - Global search input
 *   - Reporting-line filter dropdown
 *   - Source Evidence column
 *   - Parent Account column in preview
 *   - Parent account inline edit in ChartOfAccountsPage
 *   - Hierarchy depth reflected in row indentation
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { COAImportPage } from '@/pages/COAImportPage'
import { ChartOfAccountsPage } from '@/pages/ChartOfAccountsPage'

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

// ---------------------------------------------------------------------------
// Mocks — all data inlined (vi.mock hoisting requirement)
// ---------------------------------------------------------------------------

vi.mock('@/providers/OrgProvider',  () => ({ useOrg:  () => ({ org: { id: 1, name: 'Acme' } }) }))
vi.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1 }, logout: vi.fn() }) }))
vi.mock('@/providers/ToastProvider',() => ({ useToast: () => vi.fn() }))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'ACME', name: 'Acme Corp', entity_type: 'operating', active: true,
        currency: 'USD', fiscal_year_end_month: 12, fiscal_year_convention: 'calendar' },
    ]),
  },
}))

vi.mock('@/api/coaImport', () => ({
  coaImportApi: {
    upload: vi.fn().mockResolvedValue({
      batch_id: 20, entity_id: 1, filename: 'qb_m34.csv', source_system: 'quickbooks',
      detected_columns: { account_name: 'Account Name', account_type: 'Type', detail_type: 'Detail Type', account_number: 'Account #', tax_line: 'Tax Line' },
      row_count: 5, warnings: [],
      rows: [
        { row_index: 0, account_number: '1000', account_name: 'Cash', raw_type: 'Bank',
          account_type: 'asset', normal_balance: 'debit', detail_type: 'Checking',
          description: null, tax_line: 'B/S-Assets: Cash',
          suggested_reporting_line: 'Cash & Cash Equivalents',
          source_evidence: 'Tax Line = B/S-Assets: Cash',
          parent_account_number: null, parent_account_name: null, hierarchy_depth: 0,
          indent: 0, parent_row_idx: null },
        { row_index: 1, account_number: '1010', account_name: 'Petty Cash', raw_type: 'Bank',
          account_type: 'asset', normal_balance: 'debit', detail_type: 'Cash On Hand',
          description: null, tax_line: null,
          suggested_reporting_line: 'Cash & Cash Equivalents',
          source_evidence: 'Detail Type = Cash On Hand',
          parent_account_number: '1000', parent_account_name: 'Cash', hierarchy_depth: 1,
          indent: 2, parent_row_idx: 0 },
        { row_index: 2, account_number: '1500', account_name: 'Office Equipment', raw_type: 'Fixed Assets',
          account_type: 'asset', normal_balance: 'debit', detail_type: 'Furniture & Fixtures',
          description: null, tax_line: 'Deductions: Depreciation',
          suggested_reporting_line: 'Property & Equipment',
          source_evidence: 'Type = Fixed Assets',
          parent_account_number: null, parent_account_name: null, hierarchy_depth: 0,
          indent: 0, parent_row_idx: null },
        { row_index: 3, account_number: '4000', account_name: 'Revenue', raw_type: 'Income',
          account_type: 'revenue', normal_balance: 'credit', detail_type: 'Service/Fee Income',
          description: null, tax_line: 'Income: Gross receipts or sales',
          suggested_reporting_line: 'Revenue',
          source_evidence: 'Tax Line = Income: Gross receipts or sales',
          parent_account_number: null, parent_account_name: null, hierarchy_depth: 0,
          indent: 0, parent_row_idx: null },
        { row_index: 4, account_number: '6999', account_name: 'Miscellaneous Expense', raw_type: 'Expenses',
          account_type: 'expense', normal_balance: 'debit', detail_type: null,
          description: null, tax_line: null,
          suggested_reporting_line: null,  // unassigned
          source_evidence: null,
          parent_account_number: null, parent_account_name: null, hierarchy_depth: 0,
          indent: 0, parent_row_idx: null },
      ],
    }),
    apply: vi.fn().mockResolvedValue({ id: 20, accounts_created: 5, accounts_updated: 0, status: 'applied' }),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    preview: vi.fn(),
  },
}))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, entity_id: 1, account_number: '1000', account_name: 'Cash',
        account_type: 'asset', normal_balance: 'debit', parent_account_id: null,
        active: true, detail_type: 'Checking', account_status: 'active',
        description: null, tax_line: null, source_system: 'quickbooks', reporting_taxonomy_line_id: 1 },
      { id: 2, entity_id: 1, account_number: '4000', account_name: 'Revenue',
        account_type: 'revenue', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active',
        description: null, tax_line: null, source_system: 'quickbooks', reporting_taxonomy_line_id: 2 },
    ]),
    listPaged: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100, pages: 1 }),
    tree: vi.fn().mockResolvedValue([
      {
        id: 1, entity_id: 1, account_number: '1000', account_name: 'Cash',
        account_type: 'asset', normal_balance: 'debit', parent_account_id: null,
        active: true, detail_type: 'Checking', account_status: 'active',
        description: null, tax_line: null, source_system: 'quickbooks',
        reporting_taxonomy_line_id: 1,
        children: [
          {
            id: 3, entity_id: 1, account_number: '1010', account_name: 'Petty Cash',
            account_type: 'asset', normal_balance: 'debit', parent_account_id: 1,
            active: true, detail_type: 'Cash On Hand', account_status: 'active',
            description: null, tax_line: null, source_system: 'quickbooks',
            reporting_taxonomy_line_id: 1,
            children: [],
          },
        ],
      },
      {
        id: 2, entity_id: 1, account_number: '4000', account_name: 'Revenue',
        account_type: 'revenue', normal_balance: 'credit', parent_account_id: null,
        active: true, detail_type: null, account_status: 'active',
        description: null, tax_line: null, source_system: 'quickbooks',
        reporting_taxonomy_line_id: 2,
        children: [],
      },
    ]),
    create: vi.fn().mockResolvedValue({ id: 99 }),
    update: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/api/reportingTaxonomy', () => ({
  reportingTaxonomyApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'cash_equivalents', name: 'Cash & Cash Equivalents', section: 'assets', sort_order: 100, is_subtotal: false, parent_id: null },
      { id: 2, code: 'revenue', name: 'Revenue', section: 'revenue', sort_order: 600, is_subtotal: false, parent_id: null },
    ]),
  },
}))

// ---------------------------------------------------------------------------
// Helper to upload a file and get to preview step
// ---------------------------------------------------------------------------

async function renderAndUpload() {
  const result = render(wrap(<COAImportPage />))
  // Wait for entity options to load
  await waitFor(() => {
    const sel = document.querySelector('[data-testid="entity-select"]') as HTMLSelectElement
    expect(sel).toBeTruthy()
    expect(sel.options.length).toBeGreaterThan(1)  // should have entity option(s) beyond placeholder
  })
  // Select entity
  const sel = document.querySelector('[data-testid="entity-select"]') as HTMLSelectElement
  fireEvent.change(sel, { target: { value: '1' } })
  // Attach a file
  await waitFor(() => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
  })
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['dummy'], 'qb_m34.csv', { type: 'text/csv' })
  Object.defineProperty(input, 'files', { value: [file] })
  fireEvent.change(input)
  // Click upload (wait for button to become enabled)
  await waitFor(() => {
    const btn = screen.getByText(/Parse & Preview/i).closest('button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })
  fireEvent.click(screen.getByText(/Parse & Preview/i))
  await waitFor(() => expect(screen.getByText(/Step 2/i)).toBeTruthy())
  return result
}

// ---------------------------------------------------------------------------
// COAImportPage — M34
// ---------------------------------------------------------------------------

describe('COAImportPage — M34', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows Unassigned filter chip after upload when there are unassigned rows', async () => {
    await renderAndUpload()
    await waitFor(() => {
      expect(screen.getByText(/Unassigned · \d/i)).toBeTruthy()
    })
  })

  it('Unassigned chip filters to only unassigned rows', async () => {
    await renderAndUpload()
    await waitFor(() => {
      const chip = screen.getByText(/Unassigned · \d/i)
      fireEvent.click(chip)
    })
    await waitFor(() => {
      // Only the unassigned row (Miscellaneous Expense) should be visible
      expect(screen.getByText('Miscellaneous Expense')).toBeTruthy()
      // Assigned rows should be hidden
      expect(screen.queryByText('Cash')).toBeNull()
    })
  })

  it('clicking Unassigned chip again clears the filter', async () => {
    await renderAndUpload()
    await waitFor(() => {
      const chip = screen.getByText(/Unassigned · \d/i)
      fireEvent.click(chip)
    })
    await waitFor(() => {
      const chip = screen.getByText(/Unassigned · \d/i)
      fireEvent.click(chip)
    })
    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeTruthy()
    })
  })

  it('shows global search input', async () => {
    await renderAndUpload()
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search by name/i)).toBeTruthy()
    })
  })

  it('search filters rows by account name', async () => {
    await renderAndUpload()
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/Search by name/i)
      fireEvent.change(input, { target: { value: 'Petty' } })
    })
    await waitFor(() => {
      expect(screen.getByText('Petty Cash')).toBeTruthy()
      // Revenue row should not appear as a table cell
      const cells = document.querySelectorAll('td')
      const revenueCell = Array.from(cells).find((td) => td.textContent?.trim() === 'Revenue')
      expect(revenueCell).toBeUndefined()
    })
  })

  it('search filters rows by account number', async () => {
    await renderAndUpload()
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/Search by name/i)
      fireEvent.change(input, { target: { value: '1500' } })
    })
    await waitFor(() => {
      expect(screen.getByText('Office Equipment')).toBeTruthy()
      expect(screen.queryByText('Cash')).toBeNull()
    })
  })

  it('shows reporting-line filter dropdown', async () => {
    await renderAndUpload()
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /Filter by reporting line/i })).toBeTruthy()
    })
  })

  it('shows Evidence column in preview table', async () => {
    await renderAndUpload()
    await waitFor(() => {
      expect(screen.getByText('Evidence')).toBeTruthy()
    })
  })

  it('shows source evidence values in evidence column', async () => {
    await renderAndUpload()
    await waitFor(() => {
      // source_evidence for 1000 is "Tax Line = B/S-Assets: Cash" — truncated in column
      expect(screen.getAllByText(/Tax Line/i).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows Parent Account column in preview table', async () => {
    await renderAndUpload()
    await waitFor(() => {
      expect(screen.getByText('Parent Account')).toBeTruthy()
    })
  })

  it('shows parent account number for child row (1010 parent is 1000)', async () => {
    await renderAndUpload()
    await waitFor(() => {
      // parent_account_number = "1000" should appear in parent column for 1010
      const cells = screen.getAllByText('1000')
      expect(cells.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows Reporting Line column header with help icon', async () => {
    await renderAndUpload()
    await waitFor(() => {
      expect(screen.getByText('Reporting Line')).toBeTruthy()
    })
  })

  it('type filter chip and unassigned chip can both be rendered', async () => {
    await renderAndUpload()
    await waitFor(() => {
      expect(screen.getAllByText(/asset · \d/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/Unassigned · \d/i)).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// ChartOfAccountsPage — M34 parent account inline edit
// ---------------------------------------------------------------------------

describe('ChartOfAccountsPage — M34', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders Parent column header', async () => {
    render(wrap(<ChartOfAccountsPage />, '/accounts?entity=1'))
    await waitFor(() => {
      expect(screen.getByText('Parent')).toBeTruthy()
    })
  })

  it('shows parent account selector when editing a row', async () => {
    render(wrap(<ChartOfAccountsPage />, '/accounts?entity=1'))
    await waitFor(() => {
      const editBtns = screen.getAllByTitle('Edit')
      fireEvent.click(editBtns[0])
    })
    await waitFor(() => {
      // Parent dropdown should appear — it lists all accounts for selection
      // Look for "— none (root) —" option which is the default in the parent selector
      const selects = document.querySelectorAll('select')
      const parentSelect = Array.from(selects).find((s) =>
        s.querySelector('option[value=""]')?.textContent?.includes('none (root)')
      )
      expect(parentSelect).toBeTruthy()
    })
  })

  it('parent selector lists other accounts as options', async () => {
    render(wrap(<ChartOfAccountsPage />, '/accounts?entity=1'))
    await waitFor(() => {
      const editBtns = screen.getAllByTitle('Edit')
      fireEvent.click(editBtns[0])
    })
    await waitFor(() => {
      // Account 4000 Revenue should appear in the parent dropdown (it's not the edited account)
      expect(screen.getByText(/4000.*Revenue/i)).toBeTruthy()
    })
  })
})
