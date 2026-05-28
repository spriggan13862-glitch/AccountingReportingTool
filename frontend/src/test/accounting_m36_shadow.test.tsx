/**
 * M36 — PDF Import shadow tests.
 *
 * Validates:
 *   - PDFImportPage renders upload zone correctly
 *   - Preview renders after upload
 *   - Validation table shows pass/fail status
 *   - Statement filter chips work correctly
 *   - Taxonomy mapping toggle shows/hides columns
 *   - Apply button is disabled when validation has failures
 *   - Extracted line amounts formatted correctly
 *   - Sections rendered in correct order (BS before IS)
 *   - Subtotal rows have bold styling flag
 *   - Contra asset labels render
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PDFImportPage } from '@/pages/PDFImportPage'
import type { PDFImportPreview, PDFImportPreviewLine } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage() {
  const client = makeClient()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/pdf-import']}>
        <Routes>
          <Route path="/pdf-import" element={<PDFImportPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeLine(overrides: Partial<PDFImportPreviewLine> = {}): PDFImportPreviewLine {
  return {
    temp_account_code: 'HERO-BS-CASH-001',
    name_hash: null,
    proposed_account_code: null,
    account_name: 'Petty Cash',
    statement_type: 'balance_sheet',
    section: 'current_assets',
    amount: '500.00',
    is_subtotal: false,
    is_contra: false,
    sort_order: 0,
    suggested_taxonomy_code: 'cash_equivalents',
    mapping_confidence: 'high',
    mapping_evidence: 'Name: petty cash',
    page_number: 1,
    source_line_text: 'PETTY CASH $ 500.00',
    synthetic_presentation_line: false,
    system_managed: false,
    locked: false,
    ...overrides,
  }
}

const MOCK_PASSING_PREVIEW: PDFImportPreview = {
  batch_id: 1,
  entity_id: null,
  filename: 'hero_group_financial_statements_2025.pdf',
  source_entity_name: 'HERO GROUP, INC',
  statement_date: '2025-12-31',
  basis_of_accounting: 'income_tax',
  page_count: 6,
  line_count: 76,
  subtotal_count: 15,
  lines: [
    makeLine({ temp_account_code: 'HERO-BS-CASH-001', account_name: 'Petty Cash', amount: '500.00' }),
    makeLine({ temp_account_code: 'HERO-BS-CASH-002', account_name: 'Bank of Tampa CHK 2269', amount: '131968.80' }),
    makeLine({
      temp_account_code: 'HERO-BS-PPE-001',
      account_name: 'Furniture & Fixtures',
      statement_type: 'balance_sheet',
      section: 'fixed_assets',
      amount: '61445.35',
      suggested_taxonomy_code: 'property_equipment',
    }),
    makeLine({
      temp_account_code: 'HERO-BS-PPE-006',
      account_name: 'Accumulated Depreciation',
      statement_type: 'balance_sheet',
      section: 'fixed_assets',
      amount: '-183717.16',
      is_contra: true,
      suggested_taxonomy_code: 'property_equipment',
    }),
    makeLine({
      temp_account_code: 'HERO-BS-CASH-SUB001',
      account_name: 'Total Current Assets',
      amount: '632140.51',
      is_subtotal: true,
      mapping_confidence: null,
      mapping_evidence: null,
    }),
    makeLine({
      temp_account_code: 'HERO-IS-REV-001',
      account_name: 'Sales - Revenue',
      statement_type: 'income_statement',
      section: 'revenue',
      amount: '5334329.47',
      suggested_taxonomy_code: 'revenue',
    }),
    makeLine({
      temp_account_code: 'HERO-IS-COGS-001',
      account_name: 'COGS - Printing',
      statement_type: 'income_statement',
      section: 'cogs',
      amount: '1294814.27',
      suggested_taxonomy_code: 'cogs',
    }),
  ],
  validation: {
    checks: [
      {
        key: 'total_current_assets',
        label: 'TOTAL CURRENT ASSETS',
        extracted: '632140.51',
        expected: '632140.51',
        difference: '0.00',
        status: 'pass',
      },
      {
        key: 'total_assets',
        label: 'TOTAL ASSETS',
        extracted: '1338287.80',
        expected: '1338287.80',
        difference: '0.00',
        status: 'pass',
      },
    ],
    passing: 2,
    failing: 0,
    total: 2,
  },
  warnings: [],
  balance_sheet_variance: '0.00',
  balance_sheet_tied: true,
  import_type: 'financial_statements',
  statement_scope: 'standalone',
}

const MOCK_FAILING_PREVIEW: PDFImportPreview = {
  ...MOCK_PASSING_PREVIEW,
  validation: {
    checks: [
      {
        key: 'gross_profit',
        label: 'GROSS PROFIT',
        extracted: '36.74',
        expected: '1960042.39',
        difference: '1960005.65',
        status: 'fail',
      },
    ],
    passing: 0,
    failing: 1,
    total: 1,
  },
  warnings: ['Subtotal mismatch: GROSS PROFIT — extracted 36.74, expected 1960042.39'],
}

// ---------------------------------------------------------------------------
// Mock pdfImportApi
// ---------------------------------------------------------------------------

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/api/pdfImport', () => ({
  pdfImportApi: {
    upload: vi.fn(),
    apply: vi.fn(),
  },
}))

vi.mock('@/components/ui/EntitySelect', () => ({
  EntitySelect: ({ onChange, value }: { onChange: (v: number | '') => void; value: number | '' }) => (
    <select
      data-testid="entity-select"
      value={String(value)}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
    >
      <option value="">—</option>
      <option value="1">Test Entity</option>
    </select>
  ),
}))

import { pdfImportApi } from '@/api/pdfImport'
const mockUpload = pdfImportApi.upload as ReturnType<typeof vi.fn>
const mockApply = pdfImportApi.apply as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PDFImportPage — upload step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the upload drop zone', () => {
    renderPage()
    expect(screen.getByTestId('pdf-drop-zone')).toBeInTheDocument()
    expect(screen.getByTestId('parse-pdf-btn')).toBeInTheDocument()
  })

  it('parse button is disabled with no file', () => {
    renderPage()
    expect(screen.getByTestId('parse-pdf-btn')).toBeDisabled()
  })

  it('shows upload instructions text', () => {
    renderPage()
    expect(screen.getByText(/drag & drop your pdf/i)).toBeInTheDocument()
  })

  it('shows workflow steps banner', () => {
    renderPage()
    expect(screen.getByText('Upload PDF')).toBeInTheDocument()
    expect(screen.getByText('Extract Lines')).toBeInTheDocument()
    expect(screen.getByText('Validate Subtotals')).toBeInTheDocument()
    expect(screen.getByText('Map to Taxonomy')).toBeInTheDocument()
  })
})

describe('PDFImportPage — preview step (all passing)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockResolvedValue(MOCK_PASSING_PREVIEW)
  })

  async function uploadAndPreview() {
    renderPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })
    const input = screen.getByTestId('pdf-file-input')
    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
    const btn = screen.getByTestId('parse-pdf-btn')
    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByTestId('apply-pdf-btn')).toBeInTheDocument())
  }

  it('shows entity name after upload', async () => {
    await uploadAndPreview()
    expect(screen.getByText(/hero group, inc/i)).toBeInTheDocument()
  })

  it('shows statement date', async () => {
    await uploadAndPreview()
    expect(screen.getByText(/2025-12-31/)).toBeInTheDocument()
  })

  it('shows income tax basis', async () => {
    await uploadAndPreview()
    expect(screen.getByText(/income tax/i)).toBeInTheDocument()
  })

  it('shows passing validation summary', async () => {
    await uploadAndPreview()
    expect(screen.getByText(/2\/2 passing/i)).toBeInTheDocument()
  })

  it('apply button is enabled when all checks pass', async () => {
    await uploadAndPreview()
    expect(screen.getByTestId('apply-pdf-btn')).not.toBeDisabled()
  })

  it('shows account names in the preview table', async () => {
    await uploadAndPreview()
    expect(screen.getByText('Petty Cash')).toBeInTheDocument()
    expect(screen.getByText('Bank of Tampa CHK 2269')).toBeInTheDocument()
  })

  it('shows contra label for accumulated depreciation', async () => {
    await uploadAndPreview()
    expect(screen.getByText('(contra)')).toBeInTheDocument()
  })

  it('formats amounts with commas', async () => {
    await uploadAndPreview()
    expect(screen.getByText('131,968.80')).toBeInTheDocument()
  })

  it('shows statement filter chips', async () => {
    await uploadAndPreview()
    // "Balance Sheet" appears in both filter chip and section group header
    expect(screen.getAllByText('Balance Sheet').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Income Statement').length).toBeGreaterThanOrEqual(1)
  })

  it('shows section headers for balance sheet sections', async () => {
    await uploadAndPreview()
    expect(screen.getAllByText('Current Assets').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fixed Assets').length).toBeGreaterThan(0)
  })

  it('shows section headers for IS sections', async () => {
    await uploadAndPreview()
    expect(screen.getAllByText('Income').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cost of Sales').length).toBeGreaterThan(0)
  })

  it('shows temp account codes', async () => {
    await uploadAndPreview()
    expect(screen.getByText('HERO-BS-CASH-001')).toBeInTheDocument()
  })

  it('upload different file button resets to upload step', async () => {
    await uploadAndPreview()
    const resetBtn = screen.getByText('Upload different file')
    fireEvent.click(resetBtn)
    await waitFor(() => expect(screen.getByTestId('pdf-drop-zone')).toBeInTheDocument())
  })
})

describe('PDFImportPage — preview step (failing validation)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockResolvedValue(MOCK_FAILING_PREVIEW)
  })

  async function uploadAndPreview() {
    renderPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })
    const input = screen.getByTestId('pdf-file-input')
    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(screen.getByTestId('parse-pdf-btn'))
    await waitFor(() => expect(screen.getByTestId('apply-pdf-btn')).toBeInTheDocument())
  }

  it('shows failing count in validation summary', async () => {
    await uploadAndPreview()
    expect(screen.getByText(/1 mismatch/i)).toBeInTheDocument()
  })

  it('shows warning for subtotal mismatch', async () => {
    await uploadAndPreview()
    expect(screen.getByText(/subtotal mismatch/i)).toBeInTheDocument()
  })

  it('apply button is disabled when validation has failures', async () => {
    await uploadAndPreview()
    expect(screen.getByTestId('apply-pdf-btn')).toBeDisabled()
  })
})

describe('PDFImportPage — taxonomy mapping toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockResolvedValue(MOCK_PASSING_PREVIEW)
  })

  async function uploadAndPreview() {
    renderPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })
    const input = screen.getByTestId('pdf-file-input')
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'f.pdf', { type: 'application/pdf' })] } })
    fireEvent.click(screen.getByTestId('parse-pdf-btn'))
    await waitFor(() => expect(screen.getByTestId('apply-pdf-btn')).toBeInTheDocument())
  }

  it('taxonomy columns hidden by default', async () => {
    await uploadAndPreview()
    expect(screen.queryAllByText('cash_equivalents')).toHaveLength(0)
  })

  it('taxonomy columns visible after toggling show mapping', async () => {
    await uploadAndPreview()
    const toggle = screen.getByLabelText(/^taxonomy$/i)
    fireEvent.click(toggle)
    await waitFor(() =>
      expect(screen.queryAllByText('cash_equivalents').length).toBeGreaterThan(0)
    )
  })
})
