import { useRef, useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  History,
  Lock,
  Search,
  Unlock,
  Upload,
  X,
} from 'lucide-react'
import { pdfImportApi } from '@/api/pdfImport'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { useToast } from '@/providers/ToastProvider'
import { StepIndicator } from '@/components/import-wizard'
import { AccountingDataGrid } from '@/components/data-grid'
import type { WizardStep } from '@/components/import-wizard'
import type {
  PDFImportBatch,
  PDFImportPreview,
  PDFImportPreviewLine,
  PDFLineOut,
  PDFLineUpdateRequest,
  PDFValidationCheck,
} from '@/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECTION_LABELS: Record<string, string> = {
  current_assets:        'Current Assets',
  fixed_assets:          'Fixed Assets',
  other_assets:          'Other Assets',
  current_liabilities:   'Current Liabilities',
  long_term_liabilities: 'Long-Term Liabilities',
  equity:                'Stockholders\' Equity',
  revenue:               'Income',
  cogs:                  'Cost of Sales',
  operating_expenses:    'Operating Expenses',
  other_income:          'Other Income & Expense',
}

const STMT_LABELS: Record<string, string> = {
  balance_sheet:    'Balance Sheet',
  income_statement: 'Income Statement',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  low:    'bg-red-50 text-red-700 border-red-200',
}

type StmtFilter = 'all' | 'balance_sheet' | 'income_statement'
type Phase = 'upload' | 'preview' | 'applied'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: string): string {
  const n = parseFloat(amount)
  if (isNaN(n)) return amount
  const abs = Math.abs(n)
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `(${formatted})` : formatted
}

function groupLines<T extends { statement_type: string; section: string }>(
  lines: T[],
): Record<string, { section: string; lines: T[] }> {
  const groups: Record<string, { section: string; lines: T[] }> = {}
  for (const line of lines) {
    const key = `${line.statement_type}::${line.section}`
    if (!groups[key]) groups[key] = { section: line.section, lines: [] }
    groups[key].lines.push(line)
  }
  return groups
}

function getGroupTotals(lines: PDFImportPreviewLine[]): {
  calculated: number
  pdfSubtotal: number | null
  variance: number | null
} {
  const subtotalLine = lines.find((l) => l.is_subtotal)
  const calculated = lines
    .filter((l) => !l.is_subtotal)
    .reduce((sum, l) => sum + parseFloat(l.amount || '0'), 0)
  const pdfSubtotal = subtotalLine ? parseFloat(subtotalLine.amount || '0') : null
  const variance = pdfSubtotal !== null ? calculated - pdfSubtotal : null
  return { calculated, pdfSubtotal, variance }
}

function exportLinesCSV(lines: PDFLineOut[], batchId: number) {
  const headers = [
    'stable_code', 'official_code', 'account_name',
    'statement', 'section', 'amount',
    'taxonomy_code', 'taxonomy_source', 'taxonomy_locked',
    'legal_entity_code', 'consolidation_group',
    'mapping_confidence', 'page_number',
  ]
  const esc = (v: string | null) => {
    if (v == null) return ''
    if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`
    return v
  }
  const rows = lines
    .filter((l) => !l.is_subtotal)
    .map((l) => [
      esc(l.temp_account_code),
      esc(l.official_account_code),
      esc(l.account_name),
      esc(l.statement_type),
      esc(l.section),
      esc(l.amount),
      esc(l.taxonomy_code ?? l.suggested_taxonomy_code),
      esc(l.taxonomy_source),
      String(l.taxonomy_locked),
      esc(l.legal_entity_code),
      esc(l.consolidation_group),
      esc(l.mapping_confidence),
      l.page_number != null ? String(l.page_number) : '',
    ])
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `coa_export_batch${batchId}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StmtFilterBar({
  value,
  onChange,
}: {
  value: StmtFilter
  onChange: (v: StmtFilter) => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {(['all', 'balance_sheet', 'income_statement'] as const).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            value === f
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          {f === 'all' ? 'All' : STMT_LABELS[f]}
        </button>
      ))}
    </div>
  )
}

function ValidationTable({ checks }: { checks: PDFValidationCheck[] }) {
  return (
    <AccountingDataGrid
      columns={[
        {
          key: 'label',
          header: 'Subtotal',
          sortable: true,
          sortValue: (c) => c.label,
          render: (c) => <span className="text-gray-700">{c.label}</span>,
        },
        {
          key: 'extracted',
          header: 'Extracted',
          sortable: true,
          sortValue: (c) => parseFloat(c.extracted || '0'),
          className: 'text-right font-mono',
          render: (c) => <span>{fmt(c.extracted)}</span>,
        },
        {
          key: 'expected',
          header: 'Expected (PDF)',
          sortable: true,
          sortValue: (c) => parseFloat(c.expected || '0'),
          className: 'text-right font-mono',
          render: (c) => <span>{fmt(c.expected)}</span>,
        },
        {
          key: 'difference',
          header: 'Diff',
          sortable: true,
          sortValue: (c) => parseFloat(c.difference || '0'),
          className: 'text-right font-mono text-gray-400',
          render: (c) => <span>{fmt(c.difference)}</span>,
        },
        {
          key: 'status',
          header: 'Status',
          sortable: true,
          sortValue: (c) => c.status,
          className: 'text-center w-16',
          render: (c) =>
            c.status === 'pass' ? (
              <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500 mx-auto" />
            ),
        },
      ]}
      data={checks}
      rowKey={(c) => c.key}
      rowClassName={(c) => (c.status === 'fail' ? 'bg-red-50' : '')}
      selectionEnabled={false}
      pageSize={20}
      exportFilename="pdf_validation_checks"
    />
  )
}

function EditableCell({
  value,
  displayValue,
  placeholder,
  onSave,
  testId,
  mono,
}: {
  value: string | null
  displayValue?: string
  placeholder?: string
  onSave: (v: string) => void
  testId?: string
  mono?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  function commit() {
    setEditing(false)
    if (draft.trim() !== (value ?? '').trim()) onSave(draft.trim())
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
        }}
        className={`w-full px-1 py-0.5 text-xs border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 ${mono ? 'font-mono' : ''}`}
        data-testid={testId ? `${testId}-input` : undefined}
      />
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      onKeyDown={(e) => { if (e.key === 'Enter') { setDraft(value ?? ''); setEditing(true) } }}
      className={`cursor-pointer rounded px-1 py-0.5 hover:bg-blue-50 hover:text-blue-700 transition-colors ${mono ? 'font-mono' : ''} text-xs`}
      title="Click to edit"
      data-testid={testId}
    >
      {displayValue || value || <span className="text-gray-300 italic">{placeholder ?? '—'}</span>}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Applied lines table
// ---------------------------------------------------------------------------
function AppliedLinesTable({
  lines,
  onUpdateLine,
  collapsedSections,
  onToggleSection,
}: {
  lines: PDFLineOut[]
  onUpdateLine: (lineId: number, patch: PDFLineUpdateRequest) => void
  collapsedSections: Set<string>
  onToggleSection: (key: string) => void
}) {
  const groups = groupLines(lines)

  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([groupKey, { section, lines: groupLines }]) => {
        const [stmtType] = groupKey.split('::')
        const stmtLabel = STMT_LABELS[stmtType] ?? stmtType
        const sectionLabel = SECTION_LABELS[section] ?? section
        const detailCount = groupLines.filter((l) => !l.is_subtotal).length
        const isCollapsed = collapsedSections.has(groupKey)
        const { calculated, pdfSubtotal, variance } = getGroupTotals(groupLines)

        return (
          <div key={groupKey} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => onToggleSection(groupKey)}
              className="w-full bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 hover:bg-gray-100 transition-colors text-left"
              data-testid={`applied-section-header-${groupKey}`}
            >
              {isCollapsed
                ? <ChevronRight className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />
              }
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {stmtLabel}
              </span>
              <ChevronRight className="w-3 h-3 text-gray-300" />
              <span className="text-xs font-semibold text-gray-700">{sectionLabel}</span>
              <span className="ml-2 text-xs text-gray-400">{detailCount} line{detailCount !== 1 ? 's' : ''}</span>
              <span className="ml-auto flex items-center gap-3 text-xs font-mono">
                <span className="text-gray-500" title="Calculated total">{fmt(String(calculated))}</span>
                {pdfSubtotal !== null && (
                  <>
                    <span className="text-gray-300">/ PDF {fmt(String(pdfSubtotal))}</span>
                    <span className={variance !== null && Math.abs(variance) > 0.005 ? 'text-red-500 font-semibold' : 'text-green-600'}>
                      {variance !== null && Math.abs(variance) > 0.005 ? `Δ ${fmt(String(variance))}` : '✓'}
                    </span>
                  </>
                )}
              </span>
            </button>
            {!isCollapsed && (
              <AccountingDataGrid
                columns={[
                  {
                    key: 'official_account_code',
                    header: 'Acct #',
                    sortable: true,
                    sortValue: (l) => l.official_account_code ?? l.temp_account_code,
                    render: (l) => (
                      <div className="flex flex-col">
                        {!l.is_subtotal ? (
                          <EditableCell
                            value={l.official_account_code}
                            placeholder="assign…"
                            mono
                            onSave={(v) => onUpdateLine(l.id, { official_account_code: v || null })}
                            testId={`official-code-${l.id}`}
                          />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                        <span className="font-mono text-[10px] text-gray-300 mt-0.5 truncate" title={`Stable code: ${l.temp_account_code}`} data-testid="stable-code">
                          {l.temp_account_code}
                        </span>
                      </div>
                    )
                  },
                  {
                    key: 'account_name',
                    header: 'Account Name',
                    sortable: true,
                    sortValue: (l) => l.account_name,
                    render: (l) => (
                      <div className="flex items-center gap-1.5">
                        {!l.is_subtotal ? (
                          <EditableCell
                            value={l.account_name}
                            onSave={(v) => onUpdateLine(l.id, { account_name: v || null })}
                            testId={`applied-name-${l.id}`}
                          />
                        ) : (
                          <span>{l.account_name}</span>
                        )}
                        {l.is_contra && <span className="text-orange-500 font-semibold text-[10px] uppercase">(contra)</span>}
                      </div>
                    )
                  },
                  {
                    key: 'taxonomy_code',
                    header: 'Taxonomy',
                    sortable: true,
                    sortValue: (l) => l.taxonomy_code ?? l.suggested_taxonomy_code ?? '',
                    render: (l) => (
                      <div className="flex items-center gap-1">
                        {!l.is_subtotal ? (
                          <>
                            <EditableCell
                              value={l.taxonomy_code ?? l.suggested_taxonomy_code}
                              placeholder="unmapped"
                              onSave={(v) => onUpdateLine(l.id, { taxonomy_code: v || null, taxonomy_locked: true })}
                              testId={`taxonomy-code-${l.id}`}
                            />
                            <button
                              type="button"
                              onClick={() => onUpdateLine(l.id, { taxonomy_locked: !l.taxonomy_locked })}
                              title={l.taxonomy_locked ? 'Locked — click to unlock' : 'Unlocked — click to lock'}
                              className="text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0 ml-1"
                              data-testid={`taxonomy-lock-${l.id}`}
                            >
                              {l.taxonomy_locked ? (
                                <Lock className="w-3.5 h-3.5 text-amber-500" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </div>
                    )
                  },
                  {
                    key: 'legal_entity_code',
                    header: 'Legal Entity',
                    sortable: true,
                    sortValue: (l) => l.legal_entity_code ?? '',
                    render: (l) => <span data-testid="legal-entity-cell">{l.legal_entity_code ?? '—'}</span>
                  },
                  {
                    key: 'consolidation_group',
                    header: 'Consol. Group',
                    sortable: true,
                    sortValue: (l) => l.consolidation_group ?? '',
                    render: (l) => (
                      <div className="flex items-center" data-testid="consol-group-cell">
                        {!l.is_subtotal ? (
                          <EditableCell
                            value={l.consolidation_group}
                            placeholder="none"
                            onSave={(v) => onUpdateLine(l.id, { consolidation_group: v || null })}
                            testId={`consol-group-${l.id}`}
                          />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </div>
                    )
                  },
                  {
                    key: 'amount',
                    header: 'Amount',
                    sortable: true,
                    sortValue: (l) => parseFloat(l.amount || '0'),
                    className: 'text-right font-mono',
                    render: (l) => (
                      <div className="flex items-center justify-end font-mono">
                        {!l.is_subtotal ? (
                          <EditableCell
                            value={l.amount}
                            displayValue={fmt(l.amount)}
                            onSave={(v) => onUpdateLine(l.id, { amount: v || null })}
                            testId={`applied-amount-${l.id}`}
                          />
                        ) : (
                          <span>{fmt(l.amount)}</span>
                        )}
                      </div>
                    )
                  }
                ]}
                data={groupLines}
                rowKey={(l) => l.id}
                exportFilename={`${stmtLabel}_${sectionLabel}_applied`}
                selectionEnabled={false}
                pageSize={100}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Audit trail panel
// ---------------------------------------------------------------------------

function AuditTrailPanel({ lines }: { lines: Record<string, unknown>[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-semibold text-gray-700">
          Extraction Audit Trail — {lines.length} lines
        </span>
        <span className="text-xs text-gray-400 ml-auto">
          Source document → extracted line → stable code → taxonomy mapping
        </span>
      </div>
      <AccountingDataGrid
        columns={[
          {
            key: 'index',
            header: '#',
            sortable: false,
            className: 'w-8 text-gray-400',
            render: (line) => <span>{lines.indexOf(line) + 1}</span>,
          },
          {
            key: 'temp_account_code',
            header: 'Stable Code',
            sortable: true,
            sortValue: (line) => String(line.temp_account_code ?? ''),
            className: 'font-mono text-indigo-700',
            render: (line) => <span>{String(line.temp_account_code ?? '')}</span>,
          },
          {
            key: 'account_name',
            header: 'Account Name',
            sortable: true,
            sortValue: (line) => String(line.account_name ?? ''),
            className: 'text-gray-800',
            render: (line) => <span>{String(line.account_name ?? '')}</span>,
          },
          {
            key: 'taxonomy_code',
            header: 'Taxonomy',
            sortable: true,
            sortValue: (line) => {
              const mapping = (line.mapping ?? {}) as Record<string, unknown>
              return String(mapping.taxonomy_code ?? '')
            },
            className: 'text-indigo-600 text-xs',
            render: (line) => {
              const mapping = (line.mapping ?? {}) as Record<string, unknown>
              return (
                <span>
                  {String(mapping.taxonomy_code ?? '—')}
                  {mapping.taxonomy_locked && (
                    <Lock className="w-3 h-3 text-amber-500 inline ml-1" />
                  )}
                </span>
              )
            },
          },
          {
            key: 'taxonomy_source',
            header: 'Source',
            sortable: true,
            sortValue: (line) => {
              const mapping = (line.mapping ?? {}) as Record<string, unknown>
              return String(mapping.taxonomy_source ?? '')
            },
            className: 'text-xs text-gray-400',
            render: (line) => {
              const mapping = (line.mapping ?? {}) as Record<string, unknown>
              return <span>{String(mapping.taxonomy_source ?? 'auto')}</span>
            },
          },
          {
            key: 'amount',
            header: 'Amount',
            sortable: true,
            sortValue: (line) => parseFloat(String(line.amount ?? '0')),
            className: 'text-right font-mono',
            render: (line) => <span>{fmt(String(line.amount ?? '0'))}</span>,
          },
          {
            key: 'page_number',
            header: 'Pg',
            sortable: true,
            sortValue: (line) => parseInt(String(line.page_number ?? '0')),
            className: 'text-gray-400 text-center',
            render: (line) => <span>{String(line.page_number ?? '—')}</span>,
          },
          {
            key: 'source_line_text',
            header: 'Source Line Text',
            sortable: true,
            sortValue: (line) => String(line.source_line_text ?? ''),
            className: 'text-gray-400 truncate max-w-[220px]',
            render: (line) => (
              <span title={String(line.source_line_text ?? '')}>
                {String(line.source_line_text ?? '—')}
              </span>
            ),
          },
        ]}
        data={lines}
        rowKey={(line) => String(line.line_id ?? lines.indexOf(line))}
        rowClassName={(line) => (String(line.is_subtotal) === 'true' ? 'bg-gray-50 font-semibold' : 'hover:bg-gray-50/50')}
        rowTestId={() => 'audit-row'}
        selectionEnabled={false}
        pageSize={50}
        exportFilename="pdf_extraction_audit"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function PDFImportPage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  // Phase machine
  const [phase, setPhase] = useState<Phase>('upload')

  const phaseIndex = phase === 'upload' ? 0 : phase === 'preview' ? 1 : 2
  const PDF_WIZARD_STEPS: WizardStep[] = [
    { key: 'upload', label: 'Upload', status: phaseIndex > 0 ? 'complete' : 'active' },
    { key: 'preview', label: 'Preview', status: phaseIndex > 1 ? 'complete' : phaseIndex === 1 ? 'active' : 'pending' },
    { key: 'applied', label: 'Applied', status: phaseIndex === 2 ? 'complete' : 'pending' },
  ]
  const [entityId, setEntityId] = useState<number | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<PDFImportPreview | null>(null)
  const [appliedBatch, setAppliedBatch] = useState<PDFImportBatch | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  // Preview filters + search
  const [stmtFilter, setStmtFilter] = useState<StmtFilter>('all')
  const [showSubtotals, setShowSubtotals] = useState(false)
  const [showMapping, setShowMapping] = useState(false)
  const [previewSearch, setPreviewSearch] = useState('')

  // Section collapse/expand state (shared across preview and applied views)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Applied view state
  const [activeTab, setActiveTab] = useState<'lines' | 'audit'>('lines')
  const [appliedStmtFilter, setAppliedStmtFilter] = useState<StmtFilter>('all')
  const [appliedShowSubtotals, setAppliedShowSubtotals] = useState(false)

  const appliedBatchId = appliedBatch?.id ?? null

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: recentBatches = [] } = useQuery({
    queryKey: ['pdf-batches'],
    queryFn: () => pdfImportApi.list(),
    enabled: phase === 'upload',
  })

  const { data: appliedLines = [], isLoading: linesLoading } = useQuery({
    queryKey: ['pdf-lines', appliedBatchId],
    queryFn: () => pdfImportApi.lines(appliedBatchId!),
    enabled: phase === 'applied' && appliedBatchId != null,
  })

  const { data: auditTrail, isLoading: auditLoading } = useQuery({
    queryKey: ['pdf-audit', appliedBatchId],
    queryFn: () => pdfImportApi.audit(appliedBatchId!),
    enabled: phase === 'applied' && appliedBatchId != null && activeTab === 'audit',
  })

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('No file selected')
      if (!entityId) throw new Error('Entity required')
      return pdfImportApi.upload(file, entityId as number)
    },
    onSuccess: (data) => {
      setPreview(data)
      setApiError(null)
      setPhase('preview')
      setStmtFilter('all')
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const applyMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error('No preview')
      return pdfImportApi.apply(preview.batch_id)
    },
    onSuccess: (batch) => {
      setAppliedBatch(batch)
      setPhase('applied')
      setActiveTab('lines')
      // setPreview(null)
      qc.invalidateQueries({ queryKey: ['pdf-batches'] })
      toast(`PDF applied: ${batch.line_count ?? 0} lines with stable codes and taxonomy mappings persisted`, 'success')
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, patch }: { lineId: number; patch: PDFLineUpdateRequest }) =>
      pdfImportApi.updateLine(appliedBatchId!, lineId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pdf-lines', appliedBatchId] })
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const patchPreviewLineMutation = useMutation({
    mutationFn: ({ lineIndex, patch }: {
      lineIndex: number
      patch: { account_name?: string; section?: string; suggested_taxonomy_code?: string }
    }) => pdfImportApi.patchPreviewLine(preview!.batch_id, lineIndex, patch),
    onSuccess: (_data, { lineIndex, patch }) => {
      // Apply the edit locally so the user sees it immediately without a refetch
      setPreview((prev) => {
        if (!prev) return prev
        const lines = [...prev.lines]
        lines[lineIndex] = { ...lines[lineIndex], ...patch }
        return { ...prev, lines }
      })
    },
    onError: (err: Error) => setApiError(err.message),
  })

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.toLowerCase().endsWith('.pdf')) {
      setFile(f)
      setPreview(null)
      setPhase('upload')
    }
  }

  function resetToUpload() {
    setPhase('upload')
    setFile(null)
    setEntityId('')
    setPreview(null)
    setAppliedBatch(null)
    setApiError(null)
    setPreviewSearch('')
    setCollapsedSections(new Set())
  }

  function handleStepClick(idx: number) {
    if (idx === 0 && phase !== 'upload') resetToUpload()
    if (idx === 1) {
      if (phase === 'applied') {
        if (preview) {
          setPhase('preview')
        } else {
          toast('This batch has already been applied. You cannot edit the raw preview.', 'warning')
        }
      }
    }
  }

  function viewBatchFromHistory(batch: PDFImportBatch) {
    setAppliedBatch(batch)
    setPhase('applied')
    setActiveTab('lines')
    setApiError(null)
  }

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const visiblePreviewLines = (preview?.lines ?? []).filter((l) => {
    if (!showSubtotals && l.is_subtotal) return false
    if (stmtFilter !== 'all' && l.statement_type !== stmtFilter) return false
    if (previewSearch) {
      const q = previewSearch.toLowerCase()
      const matches =
        l.account_name.toLowerCase().includes(q) ||
        (l.proposed_account_code ?? '').toLowerCase().includes(q) ||
        l.temp_account_code.toLowerCase().includes(q) ||
        l.section.toLowerCase().includes(q)
      if (!matches) return false
    }
    return true
  })

  const visibleAppliedLines = appliedLines.filter((l) => {
    if (!appliedShowSubtotals && l.is_subtotal) return false
    if (appliedStmtFilter !== 'all' && l.statement_type !== appliedStmtFilter) return false
    return true
  })

  const checks = preview?.validation?.checks ?? []
  const passingCount = checks.filter((c) => c.status === 'pass').length
  const failingCount = checks.filter((c) => c.status === 'fail').length

  const previewGroups = groupLines(visiblePreviewLines)
  const allPreviewGroups = groupLines(preview?.lines ?? [])

  // ---------------------------------------------------------------------------
  // Workflow banner (shared)
  // ---------------------------------------------------------------------------

  const workflowBanner = (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5 text-sm text-blue-800">
      <p className="font-semibold mb-1 flex items-center gap-1.5">
        <FileText className="w-4 h-4" /> PDF Ingestion Workflow
      </p>
      <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono text-blue-600">
        {(['Upload PDF', 'Extract Lines', 'Validate Subtotals', 'Map to Taxonomy', 'Apply / Consolidate'] as const).map(
          (step, i, arr) => (
            <span key={step} className="flex items-center gap-1.5">
              <span className="bg-blue-100 px-2 py-0.5 rounded">{step}</span>
              {i < arr.length - 1 && <ChevronRight className="w-3 h-3" />}
            </span>
          ),
        )}
      </div>
    </div>
  )

  // ---------------------------------------------------------------------------
  // PHASE: upload
  // ---------------------------------------------------------------------------

  if (phase === 'upload') {
    return (
      <PageLayout
        title="PDF Financial Statement Import"
        subtitle="Extract balance sheet and income statement accounts from a compiled PDF"
      >
        {apiError && <ErrorBanner message={apiError} />}
        <StepIndicator steps={PDF_WIZARD_STEPS} currentStep={phaseIndex} onStepClick={handleStepClick} />
        {workflowBanner}

        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-800">Step 1 — Select entity and upload PDF</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Entity *</label>
            <EntitySelect value={entityId} onChange={setEntityId} />
          </div>

          <p className="text-xs text-gray-500">
            Supports compiled or reviewed financial statements with extractable text (no scanned images).
            Income tax basis, GAAP, and cash basis PDFs are all accepted.
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            data-testid="pdf-drop-zone"
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            {file ? (
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
            ) : (
              <>
                <p className="text-sm text-gray-600">Drag & drop your PDF, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">PDF only — must have extractable (not scanned) text</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              data-testid="pdf-file-input"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) { setFile(f); setPreview(null) }
              }}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!file || !entityId || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              data-testid="parse-pdf-btn"
            >
              {uploadMutation.isPending ? 'Extracting…' : 'Extract & Preview'}
            </button>
          </div>
        </div>

        {/* Batch history */}
        {recentBatches.length > 0 && (
          <div className="mt-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
              <History className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-700">Recent Imports</span>
            </div>
            <AccountingDataGrid
              columns={[
                {
                  key: 'filename',
                  header: 'File',
                  sortable: true,
                  sortValue: (b) => b.filename,
                  render: (b) => (
                    <span className="font-mono truncate max-w-[200px]" title={b.filename}>
                      {b.filename}
                    </span>
                  )
                },
                {
                  key: 'source_entity_name',
                  header: 'Entity',
                  sortable: true,
                  sortValue: (b) => b.source_entity_name ?? '',
                  render: (b) => <span>{b.source_entity_name ?? '—'}</span>
                },
                {
                  key: 'statement_date',
                  header: 'Date',
                  sortable: true,
                  sortValue: (b) => b.statement_date ?? '',
                  render: (b) => <span>{b.statement_date ?? '—'}</span>
                },
                {
                  key: 'line_count',
                  header: 'Lines',
                  sortable: true,
                  sortValue: (b) => b.line_count ?? 0,
                  className: 'text-center',
                  render: (b) => <span>{b.line_count ?? '—'}</span>
                },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  sortValue: (b) => b.status,
                  className: 'text-center',
                  render: (b) => (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        b.status === 'applied'
                          ? 'bg-green-100 text-green-700'
                          : b.status === 'error'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {b.status}
                    </span>
                  )
                },
                {
                  key: 'actions',
                  header: '',
                  sortable: false,
                  className: 'text-right',
                  render: (b) => (
                    b.status === 'applied' ? (
                      <button
                        type="button"
                        onClick={() => viewBatchFromHistory(b)}
                        className="text-blue-600 hover:text-blue-800 text-xs underline"
                        data-testid={`view-batch-${b.id}`}
                      >
                        View
                      </button>
                    ) : null
                  )
                }
              ]}
              data={recentBatches.slice(0, 10)}
              rowKey={(b) => b.id}
              selectionEnabled={false}
              pageSize={10}
              exportFilename="recent_pdf_imports"
              data-testid="batch-history"
            />
          </div>
        )}
      </PageLayout>
    )
  }

  // ---------------------------------------------------------------------------
  // PHASE: preview
  // ---------------------------------------------------------------------------

  if (phase === 'preview' && preview) {
    return (
      <PageLayout
        title="PDF Financial Statement Import"
        subtitle="Extract balance sheet and income statement accounts from a compiled PDF"
      >
        {apiError && <ErrorBanner message={apiError} />}
        <StepIndicator steps={PDF_WIZARD_STEPS} currentStep={phaseIndex} onStepClick={handleStepClick} />
        {workflowBanner}

        <div className="space-y-4">
          {/* Header summary */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Step 2 — Review extracted lines</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  <span className="font-medium">{preview.source_entity_name}</span>
                  {' · '}
                  {preview.statement_date ?? 'Unknown date'}
                  {' · '}
                  <span className="capitalize">{preview.basis_of_accounting?.replace('_', ' ') ?? 'unknown basis'}</span>
                  {' · '}
                  {preview.page_count} pages · {preview.line_count} detail lines · {preview.subtotal_count} subtotals
                </p>
              </div>
              <button
                type="button"
                onClick={resetToUpload}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Upload different file
              </button>
            </div>

            {/* Validation summary */}
            <div
              className={`rounded-lg px-4 py-3 mb-4 ${
                failingCount > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {failingCount > 0 ? (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                <span className="text-sm font-semibold text-gray-800">
                  Subtotal Validation — {passingCount}/{checks.length} passing
                  {failingCount > 0 && ` · ${failingCount} mismatch(es)`}
                </span>
              </div>
              {checks.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                  <ValidationTable checks={checks} />
                </div>
              )}
            </div>

            {/* Warnings */}
            {preview.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4">
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {w}
                  </p>
                ))}
              </div>
            )}

            {/* Search + statement filter + options */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {/* Global search */}
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search accounts…"
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                  data-testid="preview-search"
                />
                {previewSearch && (
                  <button
                    type="button"
                    onClick={() => setPreviewSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <StmtFilterBar value={stmtFilter} onChange={setStmtFilter} />
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer ml-1">
                <input
                  type="checkbox"
                  checked={showSubtotals}
                  onChange={(e) => setShowSubtotals(e.target.checked)}
                  className="rounded"
                />
                Subtotals
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMapping}
                  onChange={(e) => setShowMapping(e.target.checked)}
                  className="rounded"
                />
                Show taxonomy mapping
              </label>
            </div>

            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-400 italic">
                Click account name or section to edit before applying
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetToUpload}
                  className="px-4 py-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 text-sm rounded"
                  data-testid="pdf-back-btn"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={applyMutation.isPending || failingCount > 0}
                  onClick={() => applyMutation.mutate()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                  data-testid="apply-pdf-btn"
                  title={failingCount > 0 ? 'Fix subtotal mismatches before applying' : undefined}
                >
                  <CheckCircle className="w-4 h-4" />
                  {applyMutation.isPending ? 'Applying…' : `Apply ${preview.line_count} Lines`}
                </button>
              </div>
            </div>
          </div>

          {/* Extracted lines table — preview (grouped by statement + section) */}
          {Object.entries(previewGroups).map(([groupKey, { section, lines: groupLines }]) => {
            const [stmtType] = groupKey.split('::')
            const stmtLabel = STMT_LABELS[stmtType] ?? stmtType
            const sectionLabel = SECTION_LABELS[section] ?? section
            const detailCount = groupLines.filter((l) => !l.is_subtotal).length
            const isCollapsed = collapsedSections.has(groupKey)
            const { calculated, pdfSubtotal, variance } = getGroupTotals(allPreviewGroups[groupKey]?.lines ?? [])

            const gridColumns = [
              {
                key: 'proposed_account_code',
                header: 'Acct #',
                sortable: true,
                sortValue: (l: PDFImportPreviewLine) => l.proposed_account_code ?? l.temp_account_code,
                render: (l: PDFImportPreviewLine) => {
                  const lineIndex = (preview?.lines ?? []).indexOf(l)
                  return (
                    <div className="flex flex-col">
                      {!l.is_subtotal && lineIndex >= 0 ? (
                        <EditableCell
                          value={l.proposed_account_code}
                          placeholder="assign…"
                          mono
                          onSave={(v) =>
                            patchPreviewLineMutation.mutate({ lineIndex, patch: { proposed_account_code: v || null } })
                          }
                          testId={`proposed-code-${lineIndex}`}
                        />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                      <span className="font-mono text-[10px] text-gray-300 mt-0.5 truncate" title={`Stable code: ${l.temp_account_code}`} data-testid="stable-code">
                        {l.temp_account_code}
                      </span>
                    </div>
                  )
                }
              },
              {
                key: 'account_name',
                header: 'Account Name',
                sortable: true,
                sortValue: (l: PDFImportPreviewLine) => l.account_name,
                render: (l: PDFImportPreviewLine) => {
                  const lineIndex = (preview?.lines ?? []).indexOf(l)
                  return (
                    <div className="flex items-center gap-1.5">
                      {!l.is_subtotal && lineIndex >= 0 ? (
                        <EditableCell
                          value={l.account_name}
                          onSave={(v) =>
                            patchPreviewLineMutation.mutate({ lineIndex, patch: { account_name: v } })
                          }
                          testId={`preview-name-${lineIndex}`}
                        />
                      ) : (
                        <span>{l.account_name}</span>
                      )}
                      {l.is_contra && <span className="text-orange-500 font-semibold text-[10px] uppercase">(contra)</span>}
                    </div>
                  )
                }
              },
              ...(showMapping ? [
                {
                  key: 'suggested_taxonomy_code',
                  header: 'Taxonomy',
                  sortable: true,
                  sortValue: (l: PDFImportPreviewLine) => l.suggested_taxonomy_code ?? '',
                  render: (l: PDFImportPreviewLine) => {
                    const lineIndex = (preview?.lines ?? []).indexOf(l)
                    return (
                      <EditableCell
                        value={l.suggested_taxonomy_code}
                        placeholder="unmapped"
                        onSave={(v) =>
                          patchPreviewLineMutation.mutate({ lineIndex, patch: { suggested_taxonomy_code: v || null } })
                        }
                        testId={`preview-taxonomy-${lineIndex}`}
                      />
                    )
                  }
                },
                {
                  key: 'mapping_confidence',
                  header: 'Confidence',
                  sortable: true,
                  sortValue: (l: PDFImportPreviewLine) => l.mapping_confidence ?? '',
                  render: (l: PDFImportPreviewLine) => l.mapping_confidence ? (
                    <span className={`px-1.5 py-0.5 rounded text-xs border ${CONFIDENCE_COLORS[l.mapping_confidence] ?? ''}`}>
                      {l.mapping_confidence}
                    </span>
                  ) : <span className="text-gray-300">—</span>
                },
                {
                  key: 'mapping_evidence',
                  header: 'Evidence',
                  sortable: true,
                  sortValue: (l: PDFImportPreviewLine) => l.mapping_evidence ?? '',
                  render: (l: PDFImportPreviewLine) => <span className="text-gray-400 text-xs truncate max-w-[128px]" title={l.mapping_evidence ?? ''}>{l.mapping_evidence ?? '—'}</span>
                }
              ] : []),
              {
                key: 'amount',
                header: 'Amount',
                sortable: true,
                sortValue: (l: PDFImportPreviewLine) => parseFloat(l.amount || '0'),
                className: 'text-right font-mono',
                render: (l: PDFImportPreviewLine) => {
                  const lineIndex = (preview?.lines ?? []).indexOf(l)
                  return (
                    <div className="flex items-center justify-end font-mono">
                      {!l.is_subtotal && lineIndex >= 0 ? (
                        <EditableCell
                          value={l.amount}
                          displayValue={fmt(l.amount)}
                          onSave={(v) =>
                            patchPreviewLineMutation.mutate({ lineIndex, patch: { amount: v } })
                          }
                          testId={`preview-amount-${lineIndex}`}
                        />
                      ) : (
                        <span>{fmt(l.amount)}</span>
                      )}
                    </div>
                  )
                }
              }
            ]

            return (
              <div key={groupKey} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection(groupKey)}
                  className="w-full bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 hover:bg-gray-100 transition-colors text-left"
                  data-testid={`section-header-${groupKey}`}
                >
                  {isCollapsed
                    ? <ChevronRight className="w-4 h-4 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-400" />
                  }
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{stmtLabel}</span>
                  <ChevronRight className="w-3 h-3 text-gray-300" />
                  <span className="text-xs font-semibold text-gray-700">{sectionLabel}</span>
                  <span className="ml-2 text-xs text-gray-400">{detailCount} line{detailCount !== 1 ? 's' : ''}</span>
                  <span className="ml-auto flex items-center gap-3 text-xs font-mono">
                    <span className="text-gray-500" title="Calculated total">{fmt(String(calculated))}</span>
                    {pdfSubtotal !== null && (
                      <>
                        <span className="text-gray-300">/ PDF {fmt(String(pdfSubtotal))}</span>
                        <span className={variance !== null && Math.abs(variance) > 0.005 ? 'text-red-500 font-semibold' : 'text-green-600'}>
                          {variance !== null && Math.abs(variance) > 0.005 ? `Δ ${fmt(String(variance))}` : '✓'}
                        </span>
                      </>
                    )}
                  </span>
                </button>
                {!isCollapsed && (
                  <AccountingDataGrid
                    columns={gridColumns}
                    data={groupLines}
                    rowKey={(l) => l.temp_account_code}
                    exportFilename={`${stmtLabel}_${sectionLabel}_preview`}
                    selectionEnabled={false}
                    pageSize={100}
                  />
                )}
              </div>
            )
          })}
        </div>
      </PageLayout>
    )
  }

  // ---------------------------------------------------------------------------
  // PHASE: applied
  // ---------------------------------------------------------------------------

  return (
    <PageLayout
      title="PDF Financial Statement Import"
      subtitle="Extract balance sheet and income statement accounts from a compiled PDF"
    >
      {apiError && <ErrorBanner message={apiError} />}
      <StepIndicator steps={PDF_WIZARD_STEPS} currentStep={phaseIndex} />
      {workflowBanner}

      {/* Applied header */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <h2 className="text-sm font-semibold text-gray-800">
                Applied — {appliedBatch?.source_entity_name ?? 'Unknown Entity'}
              </h2>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                {appliedBatch?.status ?? 'applied'}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {appliedBatch?.filename ?? '—'}
              {' · '}
              {appliedBatch?.statement_date ?? '—'}
              {' · '}
              {appliedBatch?.line_count ?? appliedLines.filter((l) => !l.is_subtotal).length} detail lines
              {' · '}
              Batch #{appliedBatchId}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportLinesCSV(appliedLines, appliedBatchId ?? 0)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              data-testid="export-csv-btn"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={resetToUpload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              data-testid="new-import-btn"
            >
              <Upload className="w-3.5 h-3.5" />
              New Import
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['lines', 'audit'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            data-testid={`tab-${tab}`}
          >
            {tab === 'lines' ? 'Extracted Lines' : 'Audit Trail'}
          </button>
        ))}
      </div>

      {/* Lines tab */}
      {activeTab === 'lines' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StmtFilterBar value={appliedStmtFilter} onChange={setAppliedStmtFilter} />
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer ml-2">
              <input
                type="checkbox"
                checked={appliedShowSubtotals}
                onChange={(e) => setAppliedShowSubtotals(e.target.checked)}
                className="rounded"
              />
              Show subtotals
            </label>
            <span className="ml-auto text-xs text-gray-400 italic">
              Click any taxonomy code or official code cell to edit
            </span>
          </div>

          {linesLoading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading lines…</div>
          ) : (
            <AppliedLinesTable
              lines={visibleAppliedLines}
              onUpdateLine={(lineId, patch) =>
                updateLineMutation.mutate({ lineId, patch })
              }
              collapsedSections={collapsedSections}
              onToggleSection={toggleSection}
            />
          )}
        </div>
      )}

      {/* Audit Trail tab */}
      {activeTab === 'audit' && (
        <div>
          {auditLoading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading audit trail…</div>
          ) : auditTrail ? (
            <AuditTrailPanel lines={auditTrail.lines as Record<string, unknown>[]} />
          ) : (
            <div className="text-sm text-gray-400 py-8 text-center">No audit data</div>
          )}
        </div>
      )}
    </PageLayout>
  )
}
