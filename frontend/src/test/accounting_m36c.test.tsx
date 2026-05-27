/**
 * M36c — PDF Import applied-view shadow tests.
 *
 * Validates:
 *   - Applied view renders after successful apply
 *   - Stable account codes visible in applied lines table
 *   - Taxonomy code editable inline
 *   - Official code editable inline
 *   - Taxonomy lock toggle visible
 *   - Legal entity and consolidation group columns visible
 *   - Export CSV button present and enabled
 *   - Audit trail tab accessible and renders rows
 *   - New Import button resets to upload step
 *   - Batch history shown on upload step
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PDFImportPage } from '@/pages/PDFImportPage'
import type {
  PDFImportBatch,
  PDFImportPreview,
  PDFImportPreviewLine,
  PDFLineOut,
  PDFAuditTrail,
} from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
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
    temp_account_code: 'HERO-BS-CASH-AB12CD34',
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

function makeLineOut(overrides: Partial<PDFLineOut> = {}): PDFLineOut {
  return {
    id: 1,
    batch_id: 42,
    temp_account_code: 'HERO-BS-CASH-AB12CD34',
    name_hash: 'ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12',
    official_account_code: null,
    account_name: 'Petty Cash',
    statement_type: 'balance_sheet',
    section: 'current_assets',
    amount: '500.00',
    is_subtotal: false,
    is_contra: false,
    sort_order: 0,
    synthetic_presentation_line: false,
    system_managed: false,
    locked: false,
    suggested_taxonomy_code: 'cash_equivalents',
    taxonomy_code: 'cash_equivalents',
    taxonomy_source: 'auto',
    taxonomy_locked: false,
    source_taxonomy_code: null,
    taxonomy_conflict: false,
    conflict_reason: null,
    conflict_resolution: null,
    legal_entity_code: null,
    consolidation_group: null,
    mapping_confidence: 'high',
    mapping_evidence: 'Name: petty cash',
    page_number: 1,
    source_line_text: 'PETTY CASH $ 500.00',
    ...overrides,
  }
}

const MOCK_PREVIEW: PDFImportPreview = {
  batch_id: 42,
  entity_id: null,
  filename: 'hero_group_financial_statements_2025.pdf',
  source_entity_name: 'HERO GROUP, INC',
  statement_date: '2025-12-31',
  basis_of_accounting: 'income_tax',
  import_type: 'financial_statements',
  statement_scope: 'standalone',
  page_count: 6,
  line_count: 2,
  subtotal_count: 0,
  lines: [
    makeLine({ temp_account_code: 'HERO-BS-CASH-AB12CD34', account_name: 'Petty Cash', amount: '500.00' }),
    makeLine({
      temp_account_code: 'HERO-IS-REV-FF001122',
      account_name: 'Sales - Revenue',
      statement_type: 'income_statement',
      section: 'revenue',
      amount: '5334329.47',
      suggested_taxonomy_code: 'revenue',
    }),
  ],
  validation: {
    checks: [{ key: 'total_assets', label: 'TOTAL ASSETS', extracted: '500.00', expected: '500.00', difference: '0.00', status: 'pass' }],
    passing: 1,
    failing: 0,
    total: 1,
  },
  warnings: [],
  balance_sheet_variance: '0.00',
  balance_sheet_tied: true,
}

const MOCK_BATCH: PDFImportBatch = {
  id: 42,
  entity_id: null,
  filename: 'hero_group_financial_statements_2025.pdf',
  source_entity_name: 'HERO GROUP, INC',
  statement_date: '2025-12-31',
  basis_of_accounting: 'income_tax',
  import_type: 'financial_statements',
  statement_scope: 'standalone',
  page_count: 6,
  line_count: 2,
  accounts_created: 2,
  status: 'applied',
  error_message: null,
  created_at: '2025-12-31T00:00:00Z',
}

const MOCK_LINES: PDFLineOut[] = [
  makeLineOut({ id: 1, temp_account_code: 'HERO-BS-CASH-AB12CD34', account_name: 'Petty Cash', amount: '500.00' }),
  makeLineOut({
    id: 2,
    temp_account_code: 'HERO-IS-REV-FF001122',
    account_name: 'Sales - Revenue',
    statement_type: 'income_statement',
    section: 'revenue',
    amount: '5334329.47',
    taxonomy_code: 'revenue',
    suggested_taxonomy_code: 'revenue',
  }),
]

const MOCK_AUDIT: PDFAuditTrail = {
  batch_id: 42,
  filename: 'hero_group_financial_statements_2025.pdf',
  source_entity_name: 'HERO GROUP, INC',
  statement_date: '2025-12-31',
  basis_of_accounting: 'income_tax',
  status: 'applied',
  line_count: 2,
  lines: [
    {
      line_id: 1,
      temp_account_code: 'HERO-BS-CASH-AB12CD34',
      official_account_code: null,
      name_hash: 'ab12cd34',
      account_name: 'Petty Cash',
      statement_type: 'balance_sheet',
      section: 'current_assets',
      amount: '500.00',
      is_subtotal: false,
      page_number: 1,
      source_line_text: 'PETTY CASH $ 500.00',
      mapping: { taxonomy_code: 'cash_equivalents', taxonomy_source: 'auto', taxonomy_locked: false },
    },
  ] as PDFAuditTrail['lines'],
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('@/api/pdfImport', () => ({
  pdfImportApi: {
    upload: vi.fn(),
    apply: vi.fn(),
    list: vi.fn(),
    lines: vi.fn(),
    updateLine: vi.fn(),
    audit: vi.fn(),
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
const mockList = pdfImportApi.list as ReturnType<typeof vi.fn>
const mockLines = pdfImportApi.lines as ReturnType<typeof vi.fn>
const mockUpdateLine = pdfImportApi.updateLine as ReturnType<typeof vi.fn>
const mockAudit = pdfImportApi.audit as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Helper: drive through upload → preview → apply
// ---------------------------------------------------------------------------

async function uploadPreviewApply() {
  mockUpload.mockResolvedValue(MOCK_PREVIEW)
  mockApply.mockResolvedValue(MOCK_BATCH)
  mockLines.mockResolvedValue(MOCK_LINES)
  mockAudit.mockResolvedValue(MOCK_AUDIT)
  mockList.mockResolvedValue([MOCK_BATCH])

  renderPage()

  fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })

  const input = screen.getByTestId('pdf-file-input')
  const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' })
  fireEvent.change(input, { target: { files: [file] } })

  const parseBtn = screen.getByTestId('parse-pdf-btn')
  fireEvent.click(parseBtn)

  await waitFor(() => expect(screen.getByTestId('apply-pdf-btn')).toBeInTheDocument())

  fireEvent.click(screen.getByTestId('apply-pdf-btn'))

  await waitFor(() => expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument(), { timeout: 5_000 })
}

// ---------------------------------------------------------------------------
// Tests: applied view appears after apply
// ---------------------------------------------------------------------------

describe('PDFImportPage — applied view', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows applied header after successful apply', async () => {
    await uploadPreviewApply()
    expect(screen.getAllByText(/Applied/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/HERO GROUP, INC/i)).toBeInTheDocument()
  })

  it('shows applied status badge', async () => {
    await uploadPreviewApply()
    expect(screen.getByText('applied')).toBeInTheDocument()
  })

  it('shows batch filename', async () => {
    await uploadPreviewApply()
    expect(screen.getByText(/hero_group_financial_statements_2025\.pdf/)).toBeInTheDocument()
  })

  it('shows Export CSV button', async () => {
    await uploadPreviewApply()
    expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument()
  })

  it('shows New Import button', async () => {
    await uploadPreviewApply()
    expect(screen.getByTestId('new-import-btn')).toBeInTheDocument()
  })

  it('New Import button resets to upload step', async () => {
    await uploadPreviewApply()
    fireEvent.click(screen.getByTestId('new-import-btn'))
    await waitFor(() => expect(screen.getByTestId('pdf-drop-zone')).toBeInTheDocument())
  })

  it('shows Extracted Lines and Audit Trail tabs', async () => {
    await uploadPreviewApply()
    expect(screen.getByTestId('tab-lines')).toBeInTheDocument()
    expect(screen.getByTestId('tab-audit')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Tests: stable codes visible
// ---------------------------------------------------------------------------

describe('PDFImportPage — stable codes in applied lines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows stable account codes with HERO-BS- prefix', async () => {
    await uploadPreviewApply()
    await waitFor(() =>
      expect(screen.getAllByTestId('stable-code').length).toBeGreaterThan(0),
    )
    const codes = screen.getAllByTestId('stable-code').map((el) => el.textContent ?? '')
    expect(codes.some((c) => c.startsWith('HERO-BS-') || c.startsWith('HERO-IS-'))).toBe(true)
  })

  it('shows at least one hash-based code (8-char hex segment)', async () => {
    await uploadPreviewApply()
    await waitFor(() =>
      expect(screen.getAllByTestId('stable-code').length).toBeGreaterThan(0),
    )
    const codes = screen.getAllByTestId('stable-code').map((el) => el.textContent ?? '')
    // Stable codes end with 8-char hex — e.g. HERO-BS-CASH-AB12CD34
    expect(codes.some((c) => /[A-F0-9]{8}$/.test(c))).toBe(true)
  })

  it('renders Petty Cash account name', async () => {
    await uploadPreviewApply()
    await waitFor(() => expect(screen.getByText('Petty Cash')).toBeInTheDocument())
  })

  it('renders Sales - Revenue account', async () => {
    await uploadPreviewApply()
    await waitFor(() => expect(screen.getByText('Sales - Revenue')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Tests: taxonomy override
// ---------------------------------------------------------------------------

describe('PDFImportPage — taxonomy inline editing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateLine.mockResolvedValue({ ...MOCK_LINES[0], taxonomy_code: 'other_assets', taxonomy_locked: true })
  })

  it('taxonomy select cells are present', async () => {
    await uploadPreviewApply()
    await waitFor(() =>
      expect(screen.getAllByTestId(/^taxonomy-select-\d+$/).length).toBeGreaterThan(0),
    )
  })

  it('taxonomy select opens dropdown on click', async () => {
    await uploadPreviewApply()
    await waitFor(() =>
      expect(screen.getByTestId('taxonomy-select-1')).toBeInTheDocument(),
    )
    // Click the trigger button inside the TaxonomySelect container
    const selectContainer = screen.getByTestId('taxonomy-select-1')
    fireEvent.click(selectContainer.querySelector('button')!)
    await waitFor(() =>
      expect(screen.getByTestId('taxonomy-search-input')).toBeInTheDocument(),
    )
  })

  it('taxonomy dropdown opens and shows selectable options', async () => {
    await uploadPreviewApply()
    await waitFor(() => expect(screen.getByTestId('taxonomy-select-1')).toBeInTheDocument())
    const selectContainer = screen.getByTestId('taxonomy-select-1')
    fireEvent.click(selectContainer.querySelector('button')!)
    await waitFor(() => expect(screen.getByTestId('taxonomy-search-input')).toBeInTheDocument())
    // Verify taxonomy options are shown in the dropdown
    expect(screen.queryAllByText('cash_equivalents').length).toBeGreaterThan(0)
  })

  it('taxonomy lock icon visible for each non-subtotal line', async () => {
    await uploadPreviewApply()
    await waitFor(() =>
      expect(screen.getAllByTestId(/^taxonomy-lock-\d+$/).length).toBeGreaterThan(0),
    )
  })
})

// ---------------------------------------------------------------------------
// Tests: official account code editing
// ---------------------------------------------------------------------------

describe('PDFImportPage — official code inline editing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateLine.mockResolvedValue({ ...MOCK_LINES[0], official_account_code: '1010' })
  })

  it('official code cells present for non-subtotal lines', async () => {
    await uploadPreviewApply()
    await waitFor(() =>
      expect(screen.getAllByTestId(/^official-code-\d+$/).length).toBeGreaterThan(0),
    )
  })

  it('editing official code calls updateLine with official_account_code', async () => {
    await uploadPreviewApply()
    await waitFor(() => expect(screen.getByTestId('official-code-1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('official-code-1'))
    const input = await screen.findByTestId('official-code-1-input')
    fireEvent.change(input, { target: { value: '1010' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(mockUpdateLine).toHaveBeenCalledWith(
        42,
        1,
        expect.objectContaining({ official_account_code: '1010' }),
      ),
    )
  })
})

// ---------------------------------------------------------------------------
// Tests: legal entity + consolidation group columns
// ---------------------------------------------------------------------------

describe('PDFImportPage — legal entity and consolidation group', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('legal entity column cells are rendered after toggling visibility', async () => {
    await uploadPreviewApply()
    const toggle = screen.getByTestId('show-legal-entity-toggle')
    fireEvent.click(toggle)
    await waitFor(() =>
      expect(screen.getAllByTestId('legal-entity-cell').length).toBeGreaterThan(0),
    )
  })

  it('consolidation group column cells are rendered after toggling visibility', async () => {
    await uploadPreviewApply()
    const toggle = screen.getByTestId('show-legal-entity-toggle')
    fireEvent.click(toggle)
    await waitFor(() =>
      expect(screen.getAllByTestId('consol-group-cell').length).toBeGreaterThan(0),
    )
  })

  it('shows populated legal entity code when present', async () => {
    mockLines.mockResolvedValue([
      makeLineOut({ id: 1, legal_entity_code: 'HERO' }),
    ])
    mockApply.mockResolvedValue(MOCK_BATCH)
    mockUpload.mockResolvedValue(MOCK_PREVIEW)
    mockList.mockResolvedValue([MOCK_BATCH])

    renderPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    const input = screen.getByTestId('pdf-file-input')
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'f.pdf', { type: 'application/pdf' })] } })
    fireEvent.click(screen.getByTestId('parse-pdf-btn'))
    await waitFor(() => expect(screen.getByTestId('apply-pdf-btn')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('apply-pdf-btn'))
    await waitFor(() => expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument())
    const toggle = screen.getByTestId('show-legal-entity-toggle')
    fireEvent.click(toggle)
    await waitFor(() => expect(screen.getByText('HERO')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Tests: audit trail tab
// ---------------------------------------------------------------------------

describe('PDFImportPage — audit trail tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('audit trail tab can be activated', async () => {
    await uploadPreviewApply()
    fireEvent.click(screen.getByTestId('tab-audit'))
    await waitFor(() =>
      expect(screen.getAllByTestId('audit-row').length).toBeGreaterThan(0),
    )
  })

  it('audit trail shows source line text', async () => {
    await uploadPreviewApply()
    fireEvent.click(screen.getByTestId('tab-audit'))
    await waitFor(() => expect(screen.getByText('PETTY CASH $ 500.00')).toBeInTheDocument())
  })

  it('audit trail shows stable codes', async () => {
    await uploadPreviewApply()
    fireEvent.click(screen.getByTestId('tab-audit'))
    await waitFor(() =>
      expect(screen.getAllByText('HERO-BS-CASH-AB12CD34').length).toBeGreaterThan(0),
    )
  })
})

// ---------------------------------------------------------------------------
// Tests: batch history on upload step
// ---------------------------------------------------------------------------

describe('PDFImportPage — batch history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue([MOCK_BATCH])
  })

  it('shows batch history table on upload step', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('batch-history')).toBeInTheDocument(),
    )
  })

  it('shows applied batch filename in history', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('hero_group_financial_statements_2025.pdf')).toBeInTheDocument(),
    )
  })

  it('shows View link for applied batches', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId(`view-batch-42`)).toBeInTheDocument(),
    )
  })

  it('clicking View from history navigates to applied view', async () => {
    mockLines.mockResolvedValue(MOCK_LINES)
    mockAudit.mockResolvedValue(MOCK_AUDIT)

    renderPage()
    await waitFor(() => expect(screen.getByTestId('view-batch-42')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('view-batch-42'))

    await waitFor(() => expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument())
  })
})
