/**
 * Tier 1.9 — Financial Statement Import Accounting Logic, Taxonomy Conflicts,
 * and Adjustment Bridge Foundation.
 *
 * Validates:
 *  1.  Financial statement import classification fields rendered in Step 1
 *  2.  Synthetic Net Income line shows locked/system-managed badge
 *  3.  Apply button blocked when balance sheet does not tie
 *  4.  Balance sheet imbalance panel shows variance amount
 *  5.  Force-apply path clears blocker and calls apply(true)
 *  6.  Taxonomy conflict badge visible for conflicted lines
 *  7.  Conflict badge opens resolution panel
 *  8.  Taxonomy dropdown supports create-new option
 *  9.  Preview has ONE global control bar (single preview-search)
 * 10.  Adjustment Bridge page renders slicer panel and compute button
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PDFImportPage } from '@/pages/PDFImportPage'
import { AdjustmentBridgePage } from '@/pages/AdjustmentBridgePage'
import type {
  PDFImportPreview,
  PDFImportPreviewLine,
  PDFImportBatch,
  PDFLineOut,
  PDFAuditTrail,
} from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function renderPDFPage() {
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

function renderBridgePage() {
  const client = makeClient()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/adjustment-bridge']}>
        <Routes>
          <Route path="/adjustment-bridge" element={<AdjustmentBridgePage />} />
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
    name_hash: 'ab12cd34ef56',
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

const TIED_PREVIEW: PDFImportPreview = {
  batch_id: 42,
  entity_id: null,
  filename: 'test.pdf',
  source_entity_name: 'Test Corp',
  statement_date: '2025-12-31',
  basis_of_accounting: 'gaap',
  import_type: 'financial_statements',
  statement_scope: 'standalone',
  page_count: 2,
  line_count: 1,
  subtotal_count: 0,
  lines: [makeLine()],
  validation: { checks: [], passing: 0, failing: 0, total: 0 },
  warnings: [],
  balance_sheet_variance: '0.00',
  balance_sheet_tied: true,
  net_income_variance: null,
  net_income_reconciled: true,
  net_income_in_equity: null,
  pnl_net_income: null,
}

const UNTIED_PREVIEW: PDFImportPreview = {
  ...TIED_PREVIEW,
  balance_sheet_variance: '-497332.90',
  balance_sheet_tied: false,
}

const SYNTHETIC_LINE_PREVIEW: PDFImportPreview = {
  ...TIED_PREVIEW,
  lines: [
    makeLine(),
    makeLine({
      temp_account_code: 'HERO-EQ-NI-SYNTH01',
      account_name: 'Net Income',
      statement_type: 'balance_sheet',
      section: 'equity',
      amount: '250000.00',
      synthetic_presentation_line: true,
      system_managed: true,
      locked: true,
      suggested_taxonomy_code: 'net_income',
    }),
  ],
}

const CONFLICT_LINE_OUT: PDFLineOut = makeLineOut({
  id: 2,
  taxonomy_conflict: true,
  source_taxonomy_code: 'cash_equivalents',
  conflict_reason: 'Source taxonomy cash_equivalents conflicts with global suggestion revenue',
  taxonomy_code: 'revenue',
})

const MOCK_BATCH: PDFImportBatch = {
  id: 42,
  entity_id: null,
  filename: 'test.pdf',
  source_entity_name: 'Test Corp',
  statement_date: '2025-12-31',
  basis_of_accounting: 'gaap',
  import_type: 'financial_statements',
  statement_scope: 'standalone',
  page_count: 2,
  line_count: 1,
  accounts_created: 1,
  status: 'applied',
  error_message: null,
  created_at: '2025-12-31T00:00:00Z',
}

const MOCK_AUDIT: PDFAuditTrail = {
  batch_id: 42,
  filename: 'test.pdf',
  source_entity_name: 'Test Corp',
  statement_date: '2025-12-31',
  basis_of_accounting: 'gaap',
  status: 'applied',
  line_count: 1,
  lines: [],
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
    list: vi.fn().mockResolvedValue([]),
    lines: vi.fn().mockResolvedValue([]),
    updateLine: vi.fn(),
    audit: vi.fn(),
    resolveConflict: vi.fn(),
    patchPreviewLine: vi.fn().mockResolvedValue({ line_index: 0, updated: {} }),
  },
}))

vi.mock('@/api/adjustmentBridge', () => ({
  adjustmentBridgeApi: {
    compute: vi.fn().mockResolvedValue({ rows_computed: 10, message: 'OK' }),
    rows: vi.fn().mockResolvedValue([]),
    listViews: vi.fn().mockResolvedValue([]),
    createView: vi.fn(),
    updateView: vi.fn(),
    deleteView: vi.fn(),
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
const mockLines = pdfImportApi.lines as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Helper: upload and reach preview step
// ---------------------------------------------------------------------------

async function goToPreview(previewData: PDFImportPreview) {
  mockUpload.mockResolvedValue(previewData)
  mockApply.mockResolvedValue(MOCK_BATCH)
  mockLines.mockResolvedValue([makeLineOut()])
  ;(pdfImportApi.audit as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AUDIT)

  renderPDFPage()
  fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
  fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
  fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })

  const input = screen.getByTestId('pdf-file-input')
  fireEvent.change(input, { target: { files: [new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })] } })
  fireEvent.click(screen.getByTestId('parse-pdf-btn'))
  await waitFor(() => expect(screen.getByTestId('apply-pdf-btn')).toBeInTheDocument(), { timeout: 5000 })
}

// ---------------------------------------------------------------------------
// 1. Import classification fields in Step 1 + P0 period picker + P1 button guard
// ---------------------------------------------------------------------------

describe('Tier1.9: P0 — import type classification', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows Import Type selector in step 1', () => {
    renderPDFPage()
    expect(screen.getByTestId('import-type-select')).toBeInTheDocument()
  })

  it('shows Accounting Basis selector in step 1', () => {
    renderPDFPage()
    expect(screen.getByTestId('basis-select')).toBeInTheDocument()
  })

  it('shows Statement Scope selector in step 1', () => {
    renderPDFPage()
    expect(screen.getByTestId('scope-select')).toBeInTheDocument()
  })

  it('import type defaults to financial_statements', () => {
    renderPDFPage()
    const select = screen.getByTestId('import-type-select') as HTMLSelectElement
    expect(select.value).toBe('financial_statements')
  })
})

describe('Tier1.9: P0 — period picker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows monthly/quarterly/annual type tabs', () => {
    renderPDFPage()
    expect(screen.getByTestId('period-type-monthly')).toBeInTheDocument()
    expect(screen.getByTestId('period-type-quarterly')).toBeInTheDocument()
    expect(screen.getByTestId('period-type-annual')).toBeInTheDocument()
  })

  it('monthly mode shows month and year selectors', () => {
    renderPDFPage()
    fireEvent.click(screen.getByTestId('period-type-monthly'))
    expect(screen.getByTestId('period-month-select')).toBeInTheDocument()
    expect(screen.getByTestId('period-year-select')).toBeInTheDocument()
  })

  it('quarterly mode shows quarter and year selectors', () => {
    renderPDFPage()
    fireEvent.click(screen.getByTestId('period-type-quarterly'))
    expect(screen.getByTestId('period-quarter-select')).toBeInTheDocument()
    expect(screen.getByTestId('period-year-select')).toBeInTheDocument()
  })

  it('annual mode shows only year selector', () => {
    renderPDFPage()
    fireEvent.click(screen.getByTestId('period-type-annual'))
    expect(screen.queryByTestId('period-month-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('period-quarter-select')).not.toBeInTheDocument()
    expect(screen.getByTestId('period-year-select')).toBeInTheDocument()
  })

  it('shows derived statement date', () => {
    renderPDFPage()
    expect(screen.getByTestId('period-derived-date')).toBeInTheDocument()
    expect(screen.getByTestId('period-derived-date').textContent).toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})

describe('Tier1.9: P1 — Extract & Preview button guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('button is disabled when entity and file are missing', () => {
    renderPDFPage()
    expect(screen.getByTestId('parse-pdf-btn')).toBeDisabled()
  })

  it('button is disabled when basis is missing', () => {
    renderPDFPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    const file = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByTestId('pdf-file-input'), { target: { files: [file] } })
    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })
    expect(screen.getByTestId('parse-pdf-btn')).toBeDisabled()
  })

  it('button is disabled when scope is missing', () => {
    renderPDFPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    const file = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByTestId('pdf-file-input'), { target: { files: [file] } })
    fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
    expect(screen.getByTestId('parse-pdf-btn')).toBeDisabled()
  })

  it('button is enabled when entity, basis, scope, and file are set', () => {
    renderPDFPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })
    const file = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByTestId('pdf-file-input'), { target: { files: [file] } })
    expect(screen.getByTestId('parse-pdf-btn')).not.toBeDisabled()
  })

  it('shows missing fields hint when incomplete', () => {
    renderPDFPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    expect(screen.getByTestId('missing-fields-hint')).toBeInTheDocument()
    expect(screen.getByTestId('missing-fields-hint').textContent).toMatch(/Accounting Basis|Statement Scope|PDF file/)
  })
})

// ---------------------------------------------------------------------------
// 2. Synthetic Net Income line (P1)
// ---------------------------------------------------------------------------

describe('Tier1.9: P1 — synthetic Net Income line', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows synthetic badge on system-managed equity line', async () => {
    await goToPreview(SYNTHETIC_LINE_PREVIEW)
    await waitFor(() =>
      expect(screen.getAllByText(/synthetic/i).length).toBeGreaterThan(0)
    )
  })

  it('synthetic line account name is visible', async () => {
    await goToPreview(SYNTHETIC_LINE_PREVIEW)
    await waitFor(() => expect(screen.getByText('Net Income')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// 3 & 4. Balance sheet tie blocker (P2)
// ---------------------------------------------------------------------------

describe('Tier1.9: P2 — balance sheet tie check', () => {
  beforeEach(() => vi.clearAllMocks())

  it('apply button enabled when balance sheet is tied', async () => {
    await goToPreview(TIED_PREVIEW)
    expect(screen.getByTestId('apply-pdf-btn')).not.toBeDisabled()
  })

  it('apply button disabled when balance sheet does not tie', async () => {
    await goToPreview(UNTIED_PREVIEW)
    expect(screen.getByTestId('apply-pdf-btn')).toBeDisabled()
  })

  it('shows variance amount when balance sheet does not tie', async () => {
    await goToPreview(UNTIED_PREVIEW)
    // fmt() renders negatives as (497,332.90) — check for presence of "497,332.90" in the imbalance panel
    await waitFor(() =>
      expect(screen.getByTestId('bs-imbalance-panel').textContent).toMatch(/497[,.]332/)
    )
  })

  it('force-apply button present when balance sheet does not tie', async () => {
    await goToPreview(UNTIED_PREVIEW)
    await waitFor(() =>
      expect(screen.getByTestId('force-apply-btn')).toBeInTheDocument()
    )
  })

  it('clicking force-apply calls apply with forceApply=true', async () => {
    await goToPreview(UNTIED_PREVIEW)
    await waitFor(() => expect(screen.getByTestId('force-apply-btn')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('force-apply-btn'))
    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith(42, true)
    )
  })
})

// ---------------------------------------------------------------------------
// 5. Taxonomy conflict badge (P4)
// ---------------------------------------------------------------------------

describe('Tier1.9: P4 — taxonomy conflict badge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApply.mockResolvedValue(MOCK_BATCH)
    mockLines.mockResolvedValue([CONFLICT_LINE_OUT])
    ;(pdfImportApi.audit as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AUDIT)
  })

  async function uploadApplyAndView() {
    mockUpload.mockResolvedValue(TIED_PREVIEW)
    renderPDFPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })
    
    fireEvent.change(screen.getByTestId('pdf-file-input'), {
      target: { files: [new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(screen.getByTestId('parse-pdf-btn'))
    await waitFor(() => screen.getByTestId('apply-pdf-btn'), { timeout: 5000 })
    fireEvent.click(screen.getByTestId('apply-pdf-btn'))
    await waitFor(() => screen.getByTestId('export-csv-btn'), { timeout: 5000 })
  }

  it('conflict badge shown for lines with taxonomy_conflict=true', async () => {
    await uploadApplyAndView()
    await waitFor(() =>
      expect(screen.getAllByTestId(/^conflict-badge-\d+$/).length).toBeGreaterThan(0)
    )
  })

  it('clicking conflict badge reveals resolution options', async () => {
    await uploadApplyAndView()
    await waitFor(() => screen.getAllByTestId(/^conflict-badge-\d+$/))
    const badge = screen.getAllByTestId(/^conflict-badge-\d+$/)[0]
    fireEvent.click(badge)
    await waitFor(() =>
      expect(screen.getByTestId('conflict-resolution-panel')).toBeInTheDocument()
    )
  })
})

// ---------------------------------------------------------------------------
// 6. Taxonomy dropdown supports create-new (P5)
// ---------------------------------------------------------------------------

describe('Tier1.9: P5 — taxonomy create-new', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApply.mockResolvedValue(MOCK_BATCH)
    mockLines.mockResolvedValue([makeLineOut()])
    ;(pdfImportApi.audit as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AUDIT)
  })

  it('shows create-new-taxonomy button when taxonomy dropdown is open', async () => {
    mockUpload.mockResolvedValue(TIED_PREVIEW)
    renderPDFPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })

    fireEvent.change(screen.getByTestId('pdf-file-input'), {
      target: { files: [new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(screen.getByTestId('parse-pdf-btn'))
    await waitFor(() => screen.getByTestId('apply-pdf-btn'), { timeout: 5000 })
    fireEvent.click(screen.getByTestId('apply-pdf-btn'))
    await waitFor(() => screen.getByTestId('export-csv-btn'), { timeout: 5000 })

    // Open a TaxonomySelect
    const taxSelect = await screen.findByTestId('taxonomy-select-1')
    fireEvent.click(taxSelect.querySelector('button')!)
    await waitFor(() =>
      expect(screen.getByTestId('create-new-taxonomy-btn')).toBeInTheDocument()
    )
  })
})

// ---------------------------------------------------------------------------
// 7. Single global control bar in preview (P6)
// ---------------------------------------------------------------------------

describe('Tier1.9: P6 — single global control bar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preview has exactly one search input', async () => {
    await goToPreview(TIED_PREVIEW)
    const searchInputs = screen.getAllByTestId('preview-search')
    expect(searchInputs).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// P7 — Entity ID regression: flows from Step 1 into upload call
// ---------------------------------------------------------------------------

describe('Tier1.9: P7 — entity_id flows into upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockResolvedValue(TIED_PREVIEW)
  })

  it('upload is called with entity_id matching selected entity', async () => {
    renderPDFPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })
    fireEvent.change(screen.getByTestId('pdf-file-input'), {
      target: { files: [new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(screen.getByTestId('parse-pdf-btn'))
    await waitFor(() => expect(mockUpload).toHaveBeenCalled())
    const [, opts] = mockUpload.mock.calls[0]
    expect(opts.entityId).toBe(1)
  })

  it('upload includes statementDate derived from period picker', async () => {
    renderPDFPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })
    fireEvent.change(screen.getByTestId('pdf-file-input'), {
      target: { files: [new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(screen.getByTestId('parse-pdf-btn'))
    await waitFor(() => expect(mockUpload).toHaveBeenCalled())
    const [, opts] = mockUpload.mock.calls[0]
    expect(opts.statementDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ---------------------------------------------------------------------------
// P9 — Tab help text
// ---------------------------------------------------------------------------

describe('Tier1.9: P9 — tab help text', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApply.mockResolvedValue(MOCK_BATCH)
    mockLines.mockResolvedValue([makeLineOut()])
    ;(pdfImportApi.audit as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AUDIT)
  })

  it('Extracted Lines tab shows editable working copy help text', async () => {
    mockUpload.mockResolvedValue(TIED_PREVIEW)
    renderPDFPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })
    fireEvent.change(screen.getByTestId('pdf-file-input'), {
      target: { files: [new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(screen.getByTestId('parse-pdf-btn'))
    await waitFor(() => screen.getByTestId('apply-pdf-btn'))
    fireEvent.click(screen.getByTestId('apply-pdf-btn'))
    await waitFor(() => screen.getByTestId('export-csv-btn'))

    fireEvent.click(screen.getByTestId('tab-lines'))
    expect(screen.getByTestId('tab-lines-help')).toBeInTheDocument()
    expect(screen.getByTestId('tab-lines-help').textContent).toMatch(/editable/i)
  })

  it('Audit Trail tab shows immutable help text', async () => {
    mockUpload.mockResolvedValue(TIED_PREVIEW)
    renderPDFPage()
    fireEvent.change(screen.getByTestId('entity-select'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('basis-select'), { target: { value: 'gaap' } })
    fireEvent.change(screen.getByTestId('scope-select'), { target: { value: 'standalone' } })
    fireEvent.change(screen.getByTestId('pdf-file-input'), {
      target: { files: [new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(screen.getByTestId('parse-pdf-btn'))
    await waitFor(() => screen.getByTestId('apply-pdf-btn'))
    fireEvent.click(screen.getByTestId('apply-pdf-btn'))
    await waitFor(() => screen.getByTestId('export-csv-btn'))

    fireEvent.click(screen.getByTestId('tab-audit'))
    expect(screen.getByTestId('tab-audit-help')).toBeInTheDocument()
    expect(screen.getByTestId('tab-audit-help').textContent).toMatch(/immutable/i)
  })
})

// ---------------------------------------------------------------------------
// P4 — Line exclude/restore controls
// ---------------------------------------------------------------------------

describe('Tier1.9: P4 — exclude/restore line controls', () => {
  beforeEach(() => vi.clearAllMocks())

  it('undo button is present in preview phase', async () => {
    await goToPreview(TIED_PREVIEW)
    expect(screen.getByTestId('preview-undo-btn')).toBeInTheDocument()
  })

  it('undo button is disabled when no edits have been made', async () => {
    await goToPreview(TIED_PREVIEW)
    expect(screen.getByTestId('preview-undo-btn')).toBeDisabled()
  })

  it('exclude button (data-testid=exclude-line-N) is present for detail lines', async () => {
    await goToPreview(TIED_PREVIEW)
    // The line at index 0 is a detail line — should have exclude button
    expect(screen.getByTestId('exclude-line-0')).toBeInTheDocument()
  })

  it('clicking exclude button calls patchPreviewLine with excluded: true', async () => {
    const mockPatch = pdfImportApi.patchPreviewLine as ReturnType<typeof vi.fn>
    mockPatch.mockResolvedValue({ line_index: 0, updated: { excluded: true } })
    await goToPreview(TIED_PREVIEW)
    fireEvent.click(screen.getByTestId('exclude-line-0'))
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(42, 0, expect.objectContaining({ excluded: true }))
    )
  })
})

// ---------------------------------------------------------------------------
// P5 — Preview save indicator
// ---------------------------------------------------------------------------

describe('Tier1.9: P5 — preview save indicator', () => {
  beforeEach(() => vi.clearAllMocks())

  it('save indicator not visible when no edits pending', async () => {
    await goToPreview(TIED_PREVIEW)
    expect(screen.queryByTestId('preview-save-indicator')).not.toBeInTheDocument()
  })

  it('save indicator shows Saved after successful edit', async () => {
    const mockPatch = pdfImportApi.patchPreviewLine as ReturnType<typeof vi.fn>
    mockPatch.mockResolvedValue({ line_index: 0, updated: { excluded: true } })
    await goToPreview(TIED_PREVIEW)
    fireEvent.click(screen.getByTestId('exclude-line-0'))
    await waitFor(() =>
      expect(screen.getByTestId('preview-save-indicator')).toBeInTheDocument()
    )
    await waitFor(() =>
      expect(screen.getByTestId('preview-save-indicator').textContent).toMatch(/saved/i)
    )
  })
})

// ---------------------------------------------------------------------------
// 8. Adjustment Bridge skeleton (P10)
// ---------------------------------------------------------------------------

describe('Tier1.9: P10 — Adjustment Bridge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the Adjustment Bridge page heading', () => {
    renderBridgePage()
    expect(screen.getAllByText(/adjustment bridge/i).length).toBeGreaterThan(0)
  })

  it('renders Compute/Refresh button', () => {
    renderBridgePage()
    expect(screen.getByTestId('compute-bridge-btn')).toBeInTheDocument()
  })

  it('renders entity slicer', () => {
    renderBridgePage()
    // EntitySelect renders with data-testid="entity-select" via mock
    expect(screen.getByTestId('entity-select')).toBeInTheDocument()
  })
})
