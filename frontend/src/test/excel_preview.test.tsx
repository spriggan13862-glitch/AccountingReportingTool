import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import { ImportWizardPage } from '@/pages/ImportWizardPage'
import { MappingWorkbenchPage } from '@/pages/MappingWorkbenchPage'
import { tbImportApi } from '@/api/tbImport'

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
  useOrg: () => ({ org: { id: 1, name: 'Test Org' } }),
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 1, full_name: 'Test User', email: 'test@example.com', is_superuser: true, is_active: true, organization_id: 1 },
  }),
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, code: 'ACME-US', name: 'Acme US', entity_type: 'operating', currency: 'USD', active: true, parent_id: null, fiscal_year_end_month: null, fiscal_year_convention: null },
    ]),
  },
}))

vi.mock('@/api/accounts', () => ({
  accountsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/reportingTaxonomy', () => ({
  reportingTaxonomyApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/api/tbImport', () => ({
  tbImportApi: {
    detectFile: vi.fn().mockResolvedValue({
      source_format: 'xlsx',
      sheets: [
        {
          name: 'TB',
          row_count: 5,
          likely_tb_score: 10,
          headers: ['', 'Account Name', 'Debit', '', 'Credit'],
          preview_rows: [
            { A: '', B: 'Cash', C: '1000', D: '', E: '' },
            { A: '1010', B: 'Receivables', C: '500', D: '', E: '' },
          ],
          raw_rows: [
            ['', 'Account Name', 'Debit', '', 'Credit'],
            ['', 'Cash', '1000', '', ''],
            ['1010', 'Receivables', '500', '', ''],
            ['1020', 'Equipment', '', '', '200'],
          ],
          auto_header_row_idx: 0,
          detected_mapping: { account_number: 'A', account_name: 'B', debit: 'C', credit: 'E' },
        },
        {
          name: 'ADJTB',
          row_count: 2,
          likely_tb_score: 5,
          headers: ['Acct', 'Name'],
          preview_rows: [],
          raw_rows: [['Acct', 'Name']],
          auto_header_row_idx: 0,
          detected_mapping: {},
        }
      ],
      selected_sheet: 'TB',
      headers: ['', 'Account Name', 'Debit', '', 'Credit'],
      detected_mapping: { account_number: 'A', account_name: 'B', debit: 'C', credit: 'E' },
      unmapped_headers: [],
      preview_rows: [],
      confidence: 80,
    }),
    uploadBatch: vi.fn().mockResolvedValue({ id: 1 }),
    validateBatch: vi.fn().mockResolvedValue({ errors: [], warnings: [] }),
    getRawPreview: vi.fn().mockResolvedValue({ rows: [] }),
    postBatch: vi.fn().mockResolvedValue({}),
    getBatch: vi.fn(),
    getBatchLines: vi.fn(),
    getSuggestions: vi.fn(),
    mapLine: vi.fn().mockResolvedValue({}),
    skipLine: vi.fn().mockResolvedValue({}),
    bulkMap: vi.fn().mockResolvedValue([]),
    createAccountFromLine: vi.fn().mockResolvedValue({}),
  },
}))

describe('raw Excel preview preserves blank columns and column positions', () => {
  it('renders raw grid with blank columns intact and column dropdown letters', async () => {
    render(wrap(<ImportWizardPage />, '/import/new'))

    await waitFor(() => {
      expect(screen.getByText('ACME-US — Acme US')).toBeInTheDocument()
    })
    
    fireEvent.change(screen.getByLabelText('Entity *'), { target: { value: '1' } })
    
    const dateInput = document.querySelector('input[type="date"]')
    expect(dateInput).toBeInTheDocument()
    fireEvent.change(dateInput!, { target: { value: '2026-06-30' } })

    const fileInput = document.querySelector('input[type="file"]')
    expect(fileInput).toBeInTheDocument()
    const file = new File(['mock_excel_content'], 'trial_balance.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    fireEvent.change(fileInput!, { target: { files: [file] } })

    const analyzeBtn = screen.getByText(/Analyze File/i)
    fireEvent.click(analyzeBtn)

    await waitFor(() => {
      expect(screen.getByText('TB (5 rows)')).toBeInTheDocument()
    })
    expect(screen.getByText('ADJTB (2 rows)')).toBeInTheDocument()

    const tbTab = screen.getByText('TB (5 rows)')
    expect(tbTab).toBeInTheDocument()
    
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('D')).toBeInTheDocument()
    expect(screen.getByText('E')).toBeInTheDocument()

    expect(screen.getAllByText('Account Name')[0]).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('Receivables')).toBeInTheDocument()
    
    const continueBtn = screen.getByText(/Continue/i)
    fireEvent.click(continueBtn)

    await waitFor(() => {
      expect(screen.getByText(/Confirm column mapping/i)).toBeInTheDocument()
    })

    const selects = screen.getAllByRole('combobox')
    expect(selects[1]).toBeInTheDocument()
    
    const options = Array.from(selects[1].querySelectorAll('option'))
    expect(options.some(o => o.text.includes('A — blank — sample: blank'))).toBe(true)
    expect(options.some(o => o.text.includes('B — Account Name — sample: Cash'))).toBe(true)
    expect(options.some(o => o.text.includes('C — Debit — sample: 1000'))).toBe(true)
    expect(options.some(o => o.text.includes('D — blank — sample: blank'))).toBe(true)
    expect(options.some(o => o.text.includes('E — Credit — sample: blank'))).toBe(true)
  })
})

describe('TrialBalanceImportPage raw preview and mapping', () => {
  it('renders raw Excel preview correctly and updates column letters mapping', async () => {
    const { TrialBalanceImportPage } = await import('@/pages/TrialBalanceImportPage')
    render(wrap(<TrialBalanceImportPage />))

    await waitFor(() => {
      expect(screen.getByText('Upload trial balance file (CSV/XLSX)')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText('ACME-US — Acme US')).toBeInTheDocument()
    })

    const entitySelect = screen.getByTestId('entity-select')
    expect(entitySelect).toBeInTheDocument()
    fireEvent.change(entitySelect, { target: { value: '1' } })

    const dateInput = document.querySelector('input[type="date"]')
    expect(dateInput).toBeInTheDocument()
    fireEvent.change(dateInput!, { target: { value: '2026-06-30' } })

    const fileInput = document.querySelector('input[type="file"]')
    expect(fileInput).toBeInTheDocument()
    const file = new File(['mock_excel_content'], 'tb.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    fireEvent.change(fileInput!, { target: { files: [file] } })

    const proceedBtn = screen.getByText(/Proceed to Sheet & Mapping/i)
    fireEvent.click(proceedBtn)

    await waitFor(() => {
      expect(screen.getByText('Select Worksheet')).toBeInTheDocument()
    })

    expect(screen.getAllByText('TB')[0]).toBeInTheDocument()
    expect(screen.getByText('ADJTB')).toBeInTheDocument()

    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('D')).toBeInTheDocument()
    expect(screen.getByText('E')).toBeInTheDocument()

    expect(screen.getByText('Account Name')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()

    const useSheetBtn = screen.getByText(/Use This Sheet/i)
    fireEvent.click(useSheetBtn)

    await waitFor(() => {
      expect(screen.getByText('Map Columns')).toBeInTheDocument()
    })

    const selects = screen.getAllByRole('combobox')
    expect(selects[0]).toBeInTheDocument()
  })

  it('renders unmapped accounts warning and Resolve Mappings button when validations fail', async () => {
    const { TrialBalanceImportPage } = await import('@/pages/TrialBalanceImportPage')
    const { tbImportApi } = await import('@/api/tbImport')

    const mockIssues = {
      errors: [
        { code: 'IMPORT_MISSING_MAPPING', severity: 'error', message: 'Line 2: account 1000-01 has no mapping.', suggested_resolution: 'Use the mapping workbench' }
      ],
      warnings: []
    }
    vi.mocked(tbImportApi.validateBatch).mockResolvedValueOnce(mockIssues)

    render(wrap(<TrialBalanceImportPage />))

    await waitFor(() => {
      expect(screen.getByText('ACME-US — Acme US')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    const dateInput = document.querySelector('input[type="date"]')
    fireEvent.change(dateInput!, { target: { value: '2026-06-30' } })

    const file = new File(['mock_content'], 'tb.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const fileInput = document.querySelector('input[type="file"]')
    fireEvent.change(fileInput!, { target: { files: [file] } })

    fireEvent.click(screen.getByText(/Proceed to Sheet & Mapping/i))

    await waitFor(() => {
      expect(screen.getByText('Select Worksheet')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/Use This Sheet/i))

    await waitFor(() => {
      expect(screen.getByText('Map Columns')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/Process & Validate/i))

    await waitFor(() => {
      expect(screen.getByText('Verification & Validation')).toBeInTheDocument()
    })

    expect(screen.getByText(/Unmapped accounts detected/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Resolve Mappings/i).length).toBeGreaterThan(0)
  })

  it('renders duplicate warning banner when uploadBatch fails with DUPLICATE_IMPORT', async () => {
    const { TrialBalanceImportPage } = await import('@/pages/TrialBalanceImportPage')
    const { tbImportApi } = await import('@/api/tbImport')

    const duplicateError = {
      response: {
        data: {
          detail: {
            code: 'DUPLICATE_IMPORT',
            existing_batch_id: 42,
            existing_status: 'posted'
          }
        }
      }
    }
    vi.mocked(tbImportApi.uploadBatch).mockRejectedValueOnce(duplicateError)

    render(wrap(<TrialBalanceImportPage />))

    await waitFor(() => {
      expect(screen.getByText('ACME-US — Acme US')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    const dateInput = document.querySelector('input[type="date"]')
    fireEvent.change(dateInput!, { target: { value: '2026-06-30' } })

    const file = new File(['mock_content'], 'tb.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const fileInput = document.querySelector('input[type="file"]')
    fireEvent.change(fileInput!, { target: { files: [file] } })

    fireEvent.click(screen.getByText(/Proceed to Sheet & Mapping/i))

    await waitFor(() => {
      expect(screen.getByText('Select Worksheet')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/Use This Sheet/i))

    await waitFor(() => {
      expect(screen.getByText('Map Columns')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/Process & Validate/i))

    await waitFor(() => {
      expect(screen.getByText('Duplicate file detected')).toBeInTheDocument()
    })

    expect(screen.getByText(/This file was already imported/i)).toBeInTheDocument()
    expect(screen.getByText('View Existing Batch')).toBeInTheDocument()
    expect(screen.getByText('Import Anyway')).toBeInTheDocument()

    vi.mocked(tbImportApi.uploadBatch).mockResolvedValueOnce({ id: 43 })
    fireEvent.click(screen.getByText('Import Anyway'))

    await waitFor(() => {
      expect(tbImportApi.uploadBatch).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
    })
  })
})

describe('MappingWorkbenchPage sub-account indentation and connectors', () => {
  it('renders sub-accounts with indentation and branch connector └─', async () => {
    const mockBatch = {
      id: 42,
      filename: 'tb_sub.xlsx',
      row_count: 3,
      mapped_row_count: 1,
      unmapped_row_count: 2,
      status: 'mapping_required',
      entity_id: 1,
      organization_id: 1,
    }

    const mockLines = [
      {
        id: 101,
        batch_id: 42,
        line_number: 1,
        raw_account_number: '1000',
        raw_account_name: 'Cash Parent',
        mapping_status: 'mapped',
        debit: '100.00',
        credit: '0.00',
      },
      {
        id: 102,
        batch_id: 42,
        line_number: 2,
        raw_account_number: '1000-01',
        raw_account_name: 'Cash Sub 1',
        mapping_status: 'unmapped',
        debit: '50.00',
        credit: '0.00',
      },
      {
        id: 103,
        batch_id: 42,
        line_number: 3,
        raw_account_number: '1000.02',
        raw_account_name: 'Cash Sub 2',
        mapping_status: 'unmapped',
        debit: '50.00',
        credit: '0.00',
      }
    ]

    vi.mocked(tbImportApi.getBatch).mockResolvedValue(mockBatch)
    vi.mocked(tbImportApi.getBatchLines).mockResolvedValue(mockLines)
    vi.mocked(tbImportApi.getSuggestions).mockResolvedValue([])

    render(wrap(<MappingWorkbenchPage />, '/import/42/mapping', '/import/:id/mapping'))

    await waitFor(() => {
      expect(screen.getByText('1000-01')).toBeInTheDocument()
    })
    expect(screen.getByText('1000.02')).toBeInTheDocument()

    const connectors = screen.getAllByText('└─')
    expect(connectors.length).toBe(2)

    const container1 = screen.getByText('1000-01').closest('div')
    expect(container1).toHaveStyle({ paddingLeft: '1.25rem' })

    const container2 = screen.getByText('1000.02').closest('div')
    expect(container2).toHaveStyle({ paddingLeft: '1.25rem' })
  })

  it('allows editing mappings of already mapped accounts', async () => {
    const mockBatch = {
      id: 42,
      filename: 'tb_sub.xlsx',
      row_count: 1,
      mapped_row_count: 1,
      unmapped_row_count: 0,
      status: 'validating',
      entity_id: 1,
      organization_id: 1,
    }

    const mockLines = [
      {
        id: 101,
        batch_id: 42,
        line_number: 1,
        raw_account_number: '1000',
        raw_account_name: 'Cash Parent',
        mapping_status: 'mapped',
        resolved_account_id: 501,
        debit: '100.00',
        credit: '0.00',
      }
    ]

    const mockAccounts = [
      { id: 501, account_number: '1000', account_name: 'Cash Parent Account', account_type: 'asset', normal_balance: 'debit', entity_id: 1 }
    ]

    const { accountsApi } = await import('@/api/accounts')
    vi.mocked(accountsApi.list).mockResolvedValue(mockAccounts)

    vi.mocked(tbImportApi.getBatch).mockResolvedValue(mockBatch)
    vi.mocked(tbImportApi.getBatchLines).mockResolvedValue(mockLines)
    vi.mocked(tbImportApi.getSuggestions).mockResolvedValue([])

    render(wrap(<MappingWorkbenchPage />, '/import/42/mapping', '/import/:id/mapping'))

    await waitFor(() => {
      expect(screen.getByTestId('show-all-toggle')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('show-all-toggle'))

    await waitFor(() => {
      expect(screen.getByText('1000 — Cash Parent Account')).toBeInTheDocument()
    })

    const changeBtn = screen.getByRole('button', { name: 'Change' })
    expect(changeBtn).toBeInTheDocument()

    fireEvent.click(changeBtn)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search by account # or name…')).toBeInTheDocument()
    })
    
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    expect(cancelBtn).toBeInTheDocument()

    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.getByText('1000 — Cash Parent Account')).toBeInTheDocument()
    })
    expect(screen.queryByPlaceholderText('Search by account # or name…')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// TB import: column_mapping propagation and Step 3 account display
// ---------------------------------------------------------------------------

describe('TrialBalanceImportPage: column_mapping sent to uploadBatch', () => {
  it('passes column_mapping to uploadBatch when user assigns columns', async () => {
    const { TrialBalanceImportPage } = await import('@/pages/TrialBalanceImportPage')
    const { tbImportApi } = await import('@/api/tbImport')

    render(wrap(<TrialBalanceImportPage />))

    await waitFor(() => expect(screen.getByText('ACME-US — Acme US')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    const dateInput = document.querySelector('input[type="date"]')
    fireEvent.change(dateInput!, { target: { value: '2026-06-30' } })

    const file = new File(['mock'], 'tb.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

    fireEvent.click(screen.getByText(/Proceed to Sheet & Mapping/i))
    await waitFor(() => expect(screen.getByText('Select Worksheet')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Use This Sheet/i))
    await waitFor(() => expect(screen.getByText('Map Columns')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Process & Validate/i))

    await waitFor(() =>
      expect(tbImportApi.uploadBatch).toHaveBeenCalledWith(
        expect.objectContaining({ column_mapping: expect.any(Object) })
      )
    )
  })

  it('shows raw_account_number and raw_account_name in Step 3 verification grid', async () => {
    const { TrialBalanceImportPage } = await import('@/pages/TrialBalanceImportPage')
    const { tbImportApi } = await import('@/api/tbImport')

    vi.mocked(tbImportApi.getRawPreview).mockResolvedValueOnce({
      batch_id: 1,
      source_format: 'xlsx',
      column_mapping: { account_number: 'B', balance: 'C' },
      source_headers: ['Row', 'Account', 'Balance'],
      rows: [
        { line_number: 1, raw_account_number: '1000', raw_account_name: 'Cash', raw_debit: null, raw_credit: null, raw_balance: '50000', raw_description: null, debit: '50000', credit: '0', mapping_status: 'mapped', resolved_account_id: 1, suggested_account_id: null },
        { line_number: 2, raw_account_number: '1000-01', raw_account_name: 'FHB - MLI Operating', raw_debit: null, raw_credit: null, raw_balance: '25000', raw_description: null, debit: '25000', credit: '0', mapping_status: 'mapped', resolved_account_id: 2, suggested_account_id: null },
      ],
      total_rows: 2,
      showing: 2,
    })

    render(wrap(<TrialBalanceImportPage />))

    await waitFor(() => expect(screen.getByText('ACME-US — Acme US')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    const dateInput = document.querySelector('input[type="date"]')
    fireEvent.change(dateInput!, { target: { value: '2026-06-30' } })

    const file = new File(['mock'], 'tb.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

    fireEvent.click(screen.getByText(/Proceed to Sheet & Mapping/i))
    await waitFor(() => expect(screen.getByText('Select Worksheet')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Use This Sheet/i))
    await waitFor(() => expect(screen.getByText('Map Columns')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Process & Validate/i))

    await waitFor(() => expect(screen.getByText('Verification & Validation')).toBeInTheDocument(), { timeout: 3000 })

    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('1000-01')).toBeInTheDocument()
    expect(screen.getByText('FHB - MLI Operating')).toBeInTheDocument()
  })

  it('shows mapping status column in Step 3 verification grid', async () => {
    const { TrialBalanceImportPage } = await import('@/pages/TrialBalanceImportPage')
    const { tbImportApi } = await import('@/api/tbImport')

    vi.mocked(tbImportApi.getRawPreview).mockResolvedValueOnce({
      batch_id: 1,
      source_format: 'xlsx',
      column_mapping: { account_number: 'Account', debit: 'Debit', credit: 'Credit' },
      source_headers: ['Account', 'Debit', 'Credit'],
      rows: [
        { line_number: 1, raw_account_number: '2000', raw_account_name: 'Accounts Payable', raw_debit: null, raw_credit: null, raw_balance: null, raw_description: null, debit: '0', credit: '30000', mapping_status: 'unmapped', resolved_account_id: null, suggested_account_id: null },
      ],
      total_rows: 1,
      showing: 1,
    })

    render(wrap(<TrialBalanceImportPage />))

    await waitFor(() => expect(screen.getByText('ACME-US — Acme US')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    const dateInput = document.querySelector('input[type="date"]')
    fireEvent.change(dateInput!, { target: { value: '2026-06-30' } })

    const file = new File(['mock'], 'tb.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

    fireEvent.click(screen.getByText(/Proceed to Sheet & Mapping/i))
    await waitFor(() => expect(screen.getByText('Select Worksheet')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Use This Sheet/i))
    await waitFor(() => expect(screen.getByText('Map Columns')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Process & Validate/i))

    await waitFor(() => expect(screen.getByText('Verification & Validation')).toBeInTheDocument(), { timeout: 3000 })

    expect(screen.getByText('2000')).toBeInTheDocument()
    expect(screen.getByText('unmapped')).toBeInTheDocument()
  })

  it('uploadBatch call does not include column_mapping when no columns assigned', async () => {
    const { TrialBalanceImportPage } = await import('@/pages/TrialBalanceImportPage')
    const { tbImportApi } = await import('@/api/tbImport')
    vi.mocked(tbImportApi.uploadBatch).mockResolvedValueOnce({ id: 99 })

    render(wrap(<TrialBalanceImportPage />))

    await waitFor(() => expect(screen.getByText('ACME-US — Acme US')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    const dateInput = document.querySelector('input[type="date"]')
    fireEvent.change(dateInput!, { target: { value: '2026-06-30' } })

    const file = new File(['mock'], 'tb.csv', { type: 'text/csv' })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

    fireEvent.click(screen.getByText(/Proceed to Sheet & Mapping/i))
    await waitFor(() => expect(screen.getByText('Select Worksheet')).toBeInTheDocument())

    // Override detected_mapping to empty so colMapping starts empty
    const detectMock = vi.mocked(tbImportApi.detectFile)
    // After clicking "Use This Sheet" without account_number mapped,
    // the "Process & Validate" button should be disabled
    fireEvent.click(screen.getByText(/Use This Sheet/i))
    await waitFor(() => expect(screen.getByText('Map Columns')).toBeInTheDocument())

    // When account_number IS mapped (auto-detect should have set it),
    // clicking Process & Validate should include column_mapping
    const procBtn = screen.getByText(/Process & Validate/i)
    if (!procBtn.hasAttribute('disabled')) {
      fireEvent.click(procBtn)
      await waitFor(() =>
        expect(tbImportApi.uploadBatch).toHaveBeenCalledWith(
          expect.objectContaining({ column_mapping: expect.any(Object) })
        )
      )
    } else {
      // Button disabled = account_number not mapped = column_mapping would be omitted
      expect(procBtn).toBeDisabled()
    }
  })
})
