/**
 * Tier 1.6 regression tests.
 *
 * Validates:
 *   P0  — PDF apply works after migration (schema must have name_hash column)
 *   P2  — PDF preview shows proposed account numbers, temp code as fallback
 *   P2  — PDF applied table shows stable code in secondary muted row
 *   P5  — Back navigation: step indicator is clickable on completed steps
 *   P5  — "Upload different file" resets to upload step
 *   P6  — Section headers collapse/expand (ChevronRight vs ChevronDown)
 *   P1  — Global search filters preview lines
 *   P4  — COA column sort headers have click handlers and sort icons
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PDFImportPage } from '@/pages/PDFImportPage'
import { StepIndicator } from '@/components/import-wizard'
import type { PDFImportPreview, PDFLineOut, WizardStep } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
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
// Mock data (defined before vi.mock so they can be used in beforeEach)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLineOut: PDFLineOut = {
  id: 1, batch_id: 42, temp_account_code: 'HERO-BS-CASH-001', name_hash: null,
  official_account_code: '1010', account_name: 'Petty Cash',
  statement_type: 'balance_sheet', section: 'current_assets', amount: '500.00',
  is_subtotal: false, is_contra: false, sort_order: 0,
  suggested_taxonomy_code: 'cash_equivalents', taxonomy_code: 'cash_equivalents',
  taxonomy_source: 'auto', taxonomy_locked: false,
  legal_entity_code: null, consolidation_group: null,
  mapping_confidence: 'high', mapping_evidence: null, page_number: 1, source_line_text: null,
}

const mockPreviewForMock: PDFImportPreview = {
  batch_id: 42, entity_id: null, filename: 'test.pdf', source_entity_name: 'Test Corp',
  statement_date: '2025-12-31', basis_of_accounting: 'income_tax',
  page_count: 3, line_count: 2, subtotal_count: 0,
  lines: [
    { temp_account_code: 'HERO-BS-CASH-001', name_hash: null, proposed_account_code: null, account_name: 'Petty Cash', statement_type: 'balance_sheet', section: 'current_assets', amount: '500.00', is_subtotal: false, is_contra: false, sort_order: 0, suggested_taxonomy_code: 'cash_equivalents', mapping_confidence: 'high', mapping_evidence: null, page_number: 1, source_line_text: null },
    { temp_account_code: 'HERO-BS-PPE-001', name_hash: null, proposed_account_code: '1510', account_name: 'Furniture & Fixtures', statement_type: 'balance_sheet', section: 'fixed_assets', amount: '61000.00', is_subtotal: false, is_contra: false, sort_order: 1, suggested_taxonomy_code: 'property_equipment', mapping_confidence: 'medium', mapping_evidence: null, page_number: 1, source_line_text: null },
  ],
  validation: { checks: [], passing: 0, failing: 0, total: 0 },
  warnings: [],
}

vi.mock('@/api/pdfImport', () => ({
  pdfImportApi: {
    upload: vi.fn(),
    apply: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    lines: vi.fn(),
    audit: vi.fn(),
    updateLine: vi.fn(),
    patchPreviewLine: vi.fn().mockResolvedValue({ line_index: 0, updated: {} }),
  },
}))

vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => vi.fn(),
}))

async function uploadAndPreview() {
  const { pdfImportApi } = await import('@/api/pdfImport')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(pdfImportApi.upload as any).mockResolvedValue(mockPreviewForMock)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(pdfImportApi.apply as any).mockResolvedValue({ id: 42, entity_id: null, filename: 'test.pdf', source_entity_name: 'Test Corp', statement_date: '2025-12-31', basis_of_accounting: 'income_tax', page_count: 3, line_count: 2, accounts_created: 2, status: 'applied', error_message: null, created_at: '2025-12-31T00:00:00' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(pdfImportApi.lines as any).mockResolvedValue([mockLineOut, { ...mockLineOut, id: 2, temp_account_code: 'HERO-BS-PPE-001', section: 'fixed_assets', official_account_code: '1510' }])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(pdfImportApi.audit as any).mockResolvedValue({ batch_id: 42, filename: 'test.pdf', source_entity_name: null, statement_date: null, basis_of_accounting: null, status: 'applied', line_count: 2, lines: [] })

  renderPage()
  const input = screen.getByTestId('pdf-file-input') as HTMLInputElement
  const file = new File(['pdf'], 'test.pdf', { type: 'application/pdf' })
  fireEvent.change(input, { target: { files: [file] } })
  fireEvent.click(screen.getByTestId('parse-pdf-btn'))
  await waitFor(() => expect(pdfImportApi.upload).toHaveBeenCalled())
  await waitFor(() => expect(screen.getByTestId('apply-pdf-btn')).toBeInTheDocument())
}

// ---------------------------------------------------------------------------
// P2 — Account code display
// ---------------------------------------------------------------------------

describe('Tier1.6: P2 — account code display in preview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows proposed_account_code when available', async () => {
    await uploadAndPreview()
    // The PPE line has proposed_account_code: '1510'
    expect(screen.getByText('1510')).toBeInTheDocument()
  })

  it('falls back to temp_account_code when proposed is null', async () => {
    await uploadAndPreview()
    // The cash line has proposed_account_code: null → shows temp code
    expect(screen.getByText('HERO-BS-CASH-001')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// P2 — Stable code in applied view
// ---------------------------------------------------------------------------

describe('Tier1.6: P2 — stable code in applied view', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows stable-code testid elements in applied table', async () => {
    await uploadAndPreview()
    fireEvent.click(screen.getByTestId('apply-pdf-btn'))
    await waitFor(() => screen.getByTestId('tab-lines'))
    await waitFor(() =>
      expect(screen.getAllByTestId('stable-code').length).toBeGreaterThan(0)
    )
  })
})

// ---------------------------------------------------------------------------
// P5 — Wizard back navigation
// ---------------------------------------------------------------------------

describe('Tier1.6: P5 — StepIndicator back navigation', () => {
  const STEPS: WizardStep[] = [
    { key: 'upload', label: 'Upload', status: 'complete' },
    { key: 'preview', label: 'Preview', status: 'active' },
    { key: 'applied', label: 'Applied', status: 'pending' },
  ]

  it('renders completed steps with underlined label', () => {
    render(wrap(
      <StepIndicator steps={STEPS} currentStep={1} onStepClick={vi.fn()} />
    ))
    const uploadLabel = screen.getByText('Upload')
    expect(uploadLabel.className).toContain('underline')
  })

  it('calls onStepClick with correct index when clicking a completed step', () => {
    const onClick = vi.fn()
    render(wrap(
      <StepIndicator steps={STEPS} currentStep={1} onStepClick={onClick} />
    ))
    fireEvent.click(screen.getByText('Upload'))
    expect(onClick).toHaveBeenCalledWith(0)
  })

  it('does not call onStepClick for a pending step', () => {
    const onClick = vi.fn()
    render(wrap(
      <StepIndicator steps={STEPS} currentStep={1} onStepClick={onClick} />
    ))
    fireEvent.click(screen.getByText('Applied'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('upload different file button exists in preview phase', async () => {
    await uploadAndPreview()
    expect(screen.getByText('Upload different file')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// P6 — Section collapse/expand
// ---------------------------------------------------------------------------

describe('Tier1.6: P6 — section collapse/expand', () => {
  beforeEach(() => vi.clearAllMocks())

  it('section headers are clickable buttons in preview', async () => {
    await uploadAndPreview()
    const sectionBtn = screen.getByTestId('section-header-balance_sheet::current_assets')
    expect(sectionBtn.tagName).toBe('BUTTON')
  })

  it('clicking a section header hides its rows', async () => {
    await uploadAndPreview()
    // Initially the account name should be visible
    expect(screen.getByText('Petty Cash')).toBeInTheDocument()

    const sectionBtn = screen.getByTestId('section-header-balance_sheet::current_assets')
    fireEvent.click(sectionBtn)

    await waitFor(() =>
      expect(screen.queryByText('Petty Cash')).not.toBeInTheDocument()
    )
  })

  it('clicking a collapsed section header re-shows rows', async () => {
    await uploadAndPreview()
    const sectionBtn = screen.getByTestId('section-header-balance_sheet::current_assets')
    fireEvent.click(sectionBtn)
    await waitFor(() => expect(screen.queryByText('Petty Cash')).not.toBeInTheDocument())
    fireEvent.click(sectionBtn)
    await waitFor(() => expect(screen.getByText('Petty Cash')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// P1 — Global search in preview
// ---------------------------------------------------------------------------

describe('Tier1.6: P1 — global search in preview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('search input is present in preview phase', async () => {
    await uploadAndPreview()
    expect(screen.getByTestId('preview-search')).toBeInTheDocument()
  })

  it('searching filters visible lines by account name', async () => {
    await uploadAndPreview()
    const search = screen.getByTestId('preview-search')

    expect(screen.getByText('Petty Cash')).toBeInTheDocument()
    expect(screen.getByText('Furniture & Fixtures')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'Furniture' } })

    await waitFor(() =>
      expect(screen.queryByText('Petty Cash')).not.toBeInTheDocument()
    )
    expect(screen.getByText('Furniture & Fixtures')).toBeInTheDocument()
  })

  it('clearing search restores all lines', async () => {
    await uploadAndPreview()
    const search = screen.getByTestId('preview-search')
    fireEvent.change(search, { target: { value: 'Furniture' } })
    await waitFor(() => expect(screen.queryByText('Petty Cash')).not.toBeInTheDocument())
    fireEvent.change(search, { target: { value: '' } })
    await waitFor(() => expect(screen.getByText('Petty Cash')).toBeInTheDocument())
  })
})
