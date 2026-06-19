import { useRef, useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  GripVertical,
  History,
  Lock,
  Search,
  ShieldAlert,
  Undo2,
  Unlock,
  Upload,
  X,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { pdfImportApi } from '@/api/pdfImport'
import { entitiesApi } from '@/api/entities'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
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
  PDFConflictResolutionRequest,
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

const IMPORT_TYPE_OPTIONS = [
  { value: 'financial_statements', label: 'Financial Statements' },
  { value: 'trial_balance',        label: 'Trial Balance' },
  { value: 'tax_return',           label: 'Tax Return' },
  { value: 'management_report',    label: 'Management Report' },
]

const BASIS_OPTIONS = [
  { value: '',           label: '— Select Basis —' },
  { value: 'gaap',       label: 'GAAP' },
  { value: 'tax_basis',  label: 'Tax Basis' },
  { value: 'cash_basis', label: 'Cash Basis' },
  { value: 'ifrs',       label: 'IFRS' },
  { value: 'income_tax', label: 'Income Tax (IRS Form)' },
  { value: 'other',      label: 'Other / Custom' },
]

const SCOPE_OPTIONS = [
  { value: '',            label: '— Select Scope —' },
  { value: 'standalone',  label: 'Standalone Entity' },
  { value: 'consolidated', label: 'Consolidated' },
  { value: 'combined',    label: 'Combined' },
]

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const CURRENT_YEAR = new Date().getFullYear()
const PERIOD_YEARS = Array.from({ length: 9 }, (_, i) => CURRENT_YEAR - 6 + i)

function lastDayOfPeriod(
  type: 'monthly' | 'quarterly' | 'annual',
  month: number,
  quarter: number,
  year: number,
): string {
  const endMonth = type === 'monthly' ? month : type === 'quarterly' ? quarter * 3 : 12
  const d = new Date(year, endMonth, 0)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const CONFLICT_RESOLUTIONS = [
  { value: 'keep_source',    label: 'Keep source taxonomy (from PDF/COA)' },
  { value: 'use_parent',     label: 'Use parent account taxonomy (inherited)' },
  { value: 'apply_global',   label: 'Apply global taxonomy suggestion' },
  { value: 'create_reclass', label: 'Create reclass adjustment' },
  { value: 'create_new',     label: 'Create new taxonomy line' },
  { value: 'accepted',       label: 'Mark as reviewed / accepted' },
]

type StmtFilter = 'all' | 'balance_sheet' | 'income_statement'
type Phase = 'upload' | 'preview' | 'applied'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: string): string {
  const n = parseFloat(amount)
  if (isNaN(n)) return amount
  return formatCurrency(n, { decimals: 2 })
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
    'synthetic', 'mapping_confidence', 'page_number',
  ]
  const esc = (v: string | null | undefined) => {
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
      String(l.synthetic_presentation_line ?? false),
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

function LabeledSelect({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  testId?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
        data-testid={testId}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

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
          header: 'PDF Subtotal',
          sortable: true,
          sortValue: (c) => parseFloat(c.extracted || '0'),
          className: 'text-right font-mono',
          render: (c) => <span>{fmt(c.extracted)}</span>,
        },
        {
          key: 'expected',
          header: 'Calculated Sum',
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
  disabled,
}: {
  value: string | null
  displayValue?: string
  placeholder?: string
  onSave: (v: string) => void
  testId?: string
  mono?: boolean
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  function commit() {
    setEditing(false)
    if (draft.trim() !== (value ?? '').trim()) onSave(draft.trim())
  }

  if (disabled) {
    return (
      <span
        className={`${mono ? 'font-mono' : ''} text-xs text-gray-400`}
        title="Locked — system-managed"
        data-testid={testId}
      >
        {displayValue || value || <span className="italic">{placeholder ?? '—'}</span>}
      </span>
    )
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

// P4: Taxonomy Conflict Resolution Panel
function ConflictResolutionPanel({
  line,
  onResolve,
  onClose,
}: {
  line: PDFLineOut
  onResolve: (lineId: number, body: PDFConflictResolutionRequest) => void
  onClose: () => void
}) {
  const [resolution, setResolution] = useState<PDFConflictResolutionRequest['resolution']>('keep_source')
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6 m-4"
        onClick={(e) => e.stopPropagation()}
        data-testid="conflict-resolution-panel"
      >
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-gray-900">Resolve Taxonomy Conflict</h3>
          <button type="button" onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 mb-4 text-sm">
          <div className="bg-gray-50 rounded p-3 space-y-1">
            <p className="text-xs font-medium text-gray-600">Account</p>
            <p className="font-medium text-gray-800">{line.account_name}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded p-3">
              <p className="text-xs font-medium text-blue-600 mb-1">Source taxonomy (PDF/COA)</p>
              <code className="text-xs text-blue-800">{line.source_taxonomy_code ?? '—'}</code>
            </div>
            <div className="bg-purple-50 rounded p-3">
              <p className="text-xs font-medium text-purple-600 mb-1">Current / Global taxonomy</p>
              <code className="text-xs text-purple-800">{line.taxonomy_code ?? '—'}</code>
            </div>
          </div>
          {line.conflict_reason && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">
              <strong>Reason:</strong> {line.conflict_reason}
            </p>
          )}
          {line.mapping_evidence && (
            <p className="text-xs text-gray-500">Evidence: {line.mapping_evidence}</p>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-2">Resolution</label>
          <div className="space-y-1.5">
            {CONFLICT_RESOLUTIONS.map((opt) => (
              <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="resolution"
                  value={opt.value}
                  checked={resolution === opt.value}
                  onChange={() => setResolution(opt.value as PDFConflictResolutionRequest['resolution'])}
                  className="mt-0.5"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none h-16"
            placeholder="Add resolution notes…"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { onResolve(line.id, { resolution, notes: notes || null }); onClose() }}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            data-testid="conflict-resolve-btn"
          >
            Apply Resolution
          </button>
        </div>
      </div>
    </div>
  )
}

// P5: Searchable taxonomy dropdown with create-new
function TaxonomySelect({
  value,
  onChange,
  disabled,
  testId,
}: {
  value: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newCode, setNewCode] = useState('')

  // Common taxonomy codes (from STANDARD_TAXONOMY_V2)
  const TAXONOMY_CODES = [
    'cash_equivalents', 'accounts_receivable', 'inventory', 'prepaid_expenses',
    'other_current_assets', 'property_equipment', 'intangible_assets',
    'other_long_term_assets', 'accumulated_depreciation',
    'accounts_payable', 'accrued_liabilities', 'short_term_debt',
    'current_portion_lt_debt', 'other_current_liabilities',
    'long_term_debt', 'other_long_term_liabilities',
    'common_stock', 'retained_earnings', 'additional_paid_in_capital',
    'other_equity',
    'revenue', 'other_income', 'cogs', 'gross_profit',
    'selling_expenses', 'general_admin', 'depreciation_amort',
    'interest_expense', 'operating_expenses', 'net_income',
  ]

  const filtered = TAXONOMY_CODES.filter((c) =>
    !search || c.includes(search.toLowerCase())
  )

  if (disabled) {
    return <span className="text-xs text-gray-400 font-mono" data-testid={testId}>{value ?? '—'}</span>
  }

  return (
    <div className="relative" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs font-mono px-1 py-0.5 rounded hover:bg-blue-50 hover:text-blue-700 border border-transparent hover:border-blue-200 transition-colors"
      >
        <span>{value ?? <span className="text-gray-400 italic">unmapped</span>}</span>
        <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-40 top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search taxonomy…"
              className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              data-testid="taxonomy-search-input"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
              onClick={() => { onChange(null); setOpen(false) }}
            >
              — clear —
            </button>
            {filtered.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => { onChange(code); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-blue-50 hover:text-blue-700 ${value === code ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'}`}
              >
                {code}
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 p-2">
            {!showCreate ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="w-full text-xs text-blue-600 hover:text-blue-800 text-left px-1"
                data-testid="create-new-taxonomy-btn"
              >
                + Create new taxonomy line
              </button>
            ) : (
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="new_taxonomy_code"
                  className="flex-1 text-xs px-1.5 py-1 border border-gray-300 rounded font-mono"
                />
                <button
                  type="button"
                  onClick={() => { if (newCode.trim()) { onChange(newCode.trim()); setOpen(false); setShowCreate(false) } }}
                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Applied lines table (P6: unified control bar; P7: no legal entity/consol by default)
// ---------------------------------------------------------------------------
function AppliedLinesTable({
  lines,
  onUpdateLine,
  collapsedSections,
  onToggleSection,
  onResolveConflict,
  showLegalEntity,
}: {
  lines: PDFLineOut[]
  onUpdateLine: (lineId: number, patch: PDFLineUpdateRequest) => void
  collapsedSections: Set<string>
  onToggleSection: (key: string) => void
  onResolveConflict: (line: PDFLineOut) => void
  showLegalEntity: boolean
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
        const calculated = groupLines.filter((l) => !l.is_subtotal).reduce((s, l) => s + parseFloat(l.amount || '0'), 0)
        const pdfSubtotalLine = groupLines.find((l) => l.is_subtotal)
        const pdfSubtotal = pdfSubtotalLine ? parseFloat(pdfSubtotalLine.amount || '0') : null
        const variance = pdfSubtotal !== null ? calculated - pdfSubtotal : null

        const cols = [
          {
            key: 'official_account_code',
            header: 'Acct #',
            sortable: true,
            sortValue: (l: PDFLineOut) => l.official_account_code ?? l.temp_account_code,
            render: (l: PDFLineOut) => (
              <div className="flex flex-col">
                {!l.is_subtotal ? (
                  <EditableCell
                    value={l.official_account_code}
                    placeholder="assign…"
                    mono
                    disabled={l.system_managed}
                    onSave={(v) => onUpdateLine(l.id, { official_account_code: v || null })}
                    testId={`official-code-${l.id}`}
                  />
                ) : (
                  <span className="text-gray-300">—</span>
                )}
                <span className="font-mono text-[10px] text-gray-300 mt-0.5 truncate" title={`Stable: ${l.temp_account_code}`} data-testid="stable-code">
                  {l.temp_account_code}
                </span>
              </div>
            )
          },
          {
            key: 'account_name',
            header: 'Account Name',
            sortable: true,
            sortValue: (l: PDFLineOut) => l.account_name,
            render: (l: PDFLineOut) => (
              <div className="flex items-center gap-1.5">
                {!l.is_subtotal ? (
                  <EditableCell
                    value={l.account_name}
                    disabled={l.system_managed}
                    onSave={(v) => onUpdateLine(l.id, { account_name: v || null })}
                    testId={`applied-name-${l.id}`}
                  />
                ) : (
                  <span>{l.account_name}</span>
                )}
                {l.synthetic_presentation_line && (
                  <span className="text-purple-600 text-[10px] font-semibold bg-purple-50 border border-purple-200 px-1 rounded" title="Synthetic presentation line — derived from P&L">
                    synthetic
                  </span>
                )}
                {l.is_contra && <span className="text-orange-500 font-semibold text-[10px] uppercase">(contra)</span>}
                {l.locked && <span title="Locked — system-managed"><Lock className="w-3 h-3 text-amber-500 flex-shrink-0" /></span>}
              </div>
            )
          },
          {
            key: 'taxonomy_code',
            header: 'Taxonomy',
            sortable: true,
            sortValue: (l: PDFLineOut) => l.taxonomy_code ?? l.suggested_taxonomy_code ?? '',
            render: (l: PDFLineOut) => (
              <div className="flex items-center gap-1">
                {!l.is_subtotal ? (
                  <>
                    <TaxonomySelect
                      value={l.taxonomy_code ?? l.suggested_taxonomy_code}
                      disabled={l.system_managed}
                      onChange={(v) => onUpdateLine(l.id, { taxonomy_code: v, taxonomy_locked: true })}
                      testId={`taxonomy-select-${l.id}`}
                    />
                    {!l.system_managed && (
                      <button
                        type="button"
                        onClick={() => onUpdateLine(l.id, { taxonomy_locked: !l.taxonomy_locked })}
                        title={l.taxonomy_locked ? 'Locked — click to unlock' : 'Unlocked — click to lock'}
                        className="text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0"
                        data-testid={`taxonomy-lock-${l.id}`}
                      >
                        {l.taxonomy_locked ? (
                          <Lock className="w-3.5 h-3.5 text-amber-500" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </div>
            )
          },
          {
            key: 'conflict',
            header: 'Conflict',
            sortable: true,
            sortValue: (l: PDFLineOut) => (l.taxonomy_conflict && !l.conflict_resolution ? 1 : 0),
            className: 'text-center w-24',
            render: (l: PDFLineOut) => {
              const actionable = !l.is_subtotal && l.taxonomy_conflict && !l.conflict_resolution
              if (actionable) {
                return (
                  <button
                    type="button"
                    onClick={() => onResolveConflict(l)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200 transition-colors"
                    title="Taxonomy conflict — click to resolve"
                    data-testid={`conflict-badge-${l.id}`}
                  >
                    conflict
                  </button>
                )
              }
              if (!l.is_subtotal && l.taxonomy_conflict && l.conflict_resolution) {
                return (
                  <span
                    className="text-[10px] text-green-600"
                    title={`Resolved: ${l.conflict_resolution}`}
                    data-testid={`conflict-resolved-${l.id}`}
                  >
                    resolved
                  </span>
                )
              }
              return <span className="text-gray-300">—</span>
            }
          },
          ...(showLegalEntity ? [
            {
              key: 'legal_entity_code',
              header: 'Legal Entity',
              sortable: true,
              sortValue: (l: PDFLineOut) => l.legal_entity_code ?? '',
              render: (l: PDFLineOut) => <span data-testid="legal-entity-cell">{l.legal_entity_code ?? '—'}</span>
            },
            {
              key: 'consolidation_group',
              header: 'Consol. Group',
              sortable: true,
              sortValue: (l: PDFLineOut) => l.consolidation_group ?? '',
              render: (l: PDFLineOut) => (
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
          ] : []),
          {
            key: 'amount',
            header: 'Amount',
            sortable: true,
            sortValue: (l: PDFLineOut) => parseFloat(l.amount || '0'),
            className: 'text-right font-mono',
            render: (l: PDFLineOut) => (
              <div className="flex items-center justify-end font-mono">
                {!l.is_subtotal && !l.system_managed ? (
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
        ]

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
                columns={cols}
                data={groupLines}
                rowKey={(l) => l.id}
                rowClassName={(l) => l.synthetic_presentation_line ? 'bg-purple-50/40' : ''}
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
                  {!!mapping.taxonomy_locked && (
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

// P2: Balance sheet imbalance panel
function BalanceSheetImbalancePanel({
  variance,
  onForceApply,
  isPending,
}: {
  variance: string
  onForceApply: () => void
  isPending: boolean
}) {
  return (
    <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-4" data-testid="bs-imbalance-panel">
      <div className="flex items-start gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-800">Balance Sheet Does Not Tie</p>
          <p className="text-xs text-red-700 mt-1">
            Assets ≠ Liabilities + Equity.{' '}
            <span className="font-mono font-semibold">Variance: {fmt(variance)}</span>
          </p>
          <p className="text-xs text-red-600 mt-2">
            Likely causes: synthetic Net Income in equity missing P&L section, subtotals extracted as accounts,
            or statement is a partial/section export.
          </p>
        </div>
      </div>
      <div className="text-xs text-red-700 space-y-0.5 mb-3 pl-7">
        <p>Correction options:</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Edit amounts in the preview to correct extraction errors</li>
          <li>Add or remove lines causing the imbalance</li>
          <li>Change import type to "Trial Balance" if this is not a balanced statement</li>
          <li>Override and apply anyway if you understand the variance</li>
        </ul>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={onForceApply}
        className="text-xs px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        data-testid="force-apply-btn"
      >
        {isPending ? 'Applying…' : 'Apply Anyway (override)'}
      </button>
    </div>
  )
}

// UX-DEF-11: Net income reconciliation warning panel
function NetIncomeReconPanel({
  niVariance,
  niInEquity,
  plNI,
}: {
  niVariance: string
  niInEquity: string | null
  plNI: string | null
}) {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-4" data-testid="ni-recon-panel">
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Net Income Reconciliation Mismatch</p>
          <p className="text-xs text-amber-700 mt-1">
            The Net Income shown in the Equity section (
            <span className="font-mono font-semibold">{fmt(niInEquity ?? '0')}</span>) does not match
            the P&amp;L net income (
            <span className="font-mono font-semibold">{fmt(plNI ?? '0')}</span>). Variance:{' '}
            <span className="font-mono font-semibold">{fmt(niVariance)}</span>.
          </p>
          <p className="text-xs text-amber-600 mt-2">
            Common causes: year-end vs. interim timing, partial P&amp;L extraction, or a retained earnings
            adjustment not reflected in the income statement. You may still apply — verify after import.
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// P10: Entity name fuzzy match
// ---------------------------------------------------------------------------

function entityNamesSimilar(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/\b(llc|inc|corp|ltd|co|company|the|and)\b/g, '')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const wa = new Set(na.split(' ').filter((w) => w.length > 2))
  const wb = nb.split(' ').filter((w) => w.length > 2)
  return wb.filter((w) => wa.has(w)).length >= 2
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function PDFImportPage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const [searchParams] = useSearchParams()

  // Phase machine
  const [phase, setPhase] = useState<Phase>('upload')

  const phaseIndex = phase === 'upload' ? 0 : phase === 'preview' ? 1 : 2
  const PDF_WIZARD_STEPS: WizardStep[] = [
    { key: 'upload', label: 'Upload', status: phaseIndex > 0 ? 'complete' : 'active' },
    { key: 'preview', label: 'Preview', status: phaseIndex > 1 ? 'complete' : phaseIndex === 1 ? 'active' : 'pending' },
    { key: 'applied', label: 'Applied', status: phaseIndex === 2 ? 'complete' : 'pending' },
  ]

  // Step 1 form state (P0)
  const [entityId, setEntityId] = useState<number | ''>('')
  const [pickerType, setPickerType] = useState<'monthly' | 'quarterly' | 'annual'>('monthly')
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth() + 1)
  const [pickerQuarter, setPickerQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [pickerYear, setPickerYear] = useState(CURRENT_YEAR)
  const [importType, setImportType] = useState('financial_statements')
  const [statementScope, setStatementScope] = useState('')
  const [basisOverride, setBasisOverride] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<PDFImportPreview | null>(null)
  const [appliedBatch, setAppliedBatch] = useState<PDFImportBatch | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  // P6: ONE global control bar state for preview
  const [stmtFilter, setStmtFilter] = useState<StmtFilter>('all')
  const [showSubtotals, setShowSubtotals] = useState(false)
  const [showMapping, setShowMapping] = useState(false)
  const [previewSearch, setPreviewSearch] = useState('')

  // Applied tab state
  const [appliedStmtFilter, setAppliedStmtFilter] = useState<StmtFilter>('all')
  const [appliedShowSubtotals, setAppliedShowSubtotals] = useState(false)
  const [appliedSearch, setAppliedSearch] = useState('')
  // P7: legal entity/consol hidden by default
  const [showLegalEntity, setShowLegalEntity] = useState(false)

  // Section collapse/expand state
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const expandAll = useCallback(() => setCollapsedSections(new Set()), [])
  const collapseAll = useCallback((groups: string[]) => setCollapsedSections(new Set(groups)), [])

  // Applied view state
  const [activeTab, setActiveTab] = useState<'lines' | 'audit'>('lines')

  // P4: Conflict resolution panel
  const [conflictLine, setConflictLine] = useState<PDFLineOut | null>(null)

  // UX-DEF-02: Preview section drag/drop
  const draggingLineIndexRef = useRef<number | null>(null)
  const [dragOverSection, setDragOverSection] = useState<string | null>(null)

  const appliedBatchId = appliedBatch?.id ?? null

  // Deep-link: ?batch=<id> navigates directly to the applied view for that batch
  useEffect(() => {
    const batchParam = searchParams.get('batch')
    if (!batchParam) return
    const id = Number(batchParam)
    if (!id || appliedBatch?.id === id) return
    pdfImportApi.get(id).then((batch) => {
      setAppliedBatch(batch)
      setPhase('applied')
      setActiveTab('lines')
      setAppliedLineUndoStack([])
    }).catch(() => { /* batch not found — stay on upload */ })
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const statementDate = lastDayOfPeriod(pickerType, pickerMonth, pickerQuarter, pickerYear)

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

  // P6: preview diff — compare original extraction vs current working state
  const previewBatchId = preview?.batch_id ?? null
  const { data: previewDiff } = useQuery({
    queryKey: ['pdf-preview-diff', previewBatchId],
    queryFn: () => pdfImportApi.previewDiff(previewBatchId!),
    enabled: phase === 'preview' && previewBatchId != null,
  })

  // P10: entity name mismatch — entities already cached by EntitySelect
  const { data: entitiesList = [] } = useQuery({
    queryKey: ['entities-list'],
    queryFn: () => entitiesApi.list(),
    staleTime: 30_000,
  })
  const selectedEntity = entitiesList.find((e) => e.id === entityId)
  const entityNameMismatch = (() => {
    if (!preview?.source_entity_name || !selectedEntity?.name) return false
    return !entityNamesSimilar(preview.source_entity_name, selectedEntity.name)
  })()

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('No file selected')
      if (!entityId) throw new Error('Entity required')
      return pdfImportApi.upload(file, {
        entityId: entityId as number,
        importType,
        statementScope: statementScope || undefined,
        basisOverride: basisOverride || undefined,
        statementDate: statementDate,
      })
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
    mutationFn: (forceApply: boolean) => {
      if (!preview) throw new Error('No preview')
      return pdfImportApi.apply(preview.batch_id, forceApply)
    },
    onSuccess: (batch) => {
      setAppliedBatch(batch)
      setPhase('applied')
      setActiveTab('lines')
      setAppliedLineUndoStack([])
      qc.invalidateQueries({ queryKey: ['pdf-batches'] })
      toast(`PDF applied: ${batch.line_count ?? 0} lines with stable codes and taxonomy mappings persisted`, 'success')
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const [appliedLineUndoStack, setAppliedLineUndoStack] = useState<Array<{ lineId: number; reverse: PDFLineUpdateRequest }>>([])

  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, patch }: { lineId: number; patch: PDFLineUpdateRequest }) =>
      pdfImportApi.updateLine(appliedBatchId!, lineId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pdf-lines', appliedBatchId] })
    },
    onError: (err: Error) => setApiError(err.message),
  })

  function onUpdateLineWithUndo(lineId: number, patch: PDFLineUpdateRequest) {
    const line = appliedLines.find((l) => l.id === lineId)
    if (line) {
      const reverse: PDFLineUpdateRequest = {}
      if ('official_account_code' in patch) reverse.official_account_code = line.official_account_code ?? null
      if ('account_name' in patch) reverse.account_name = line.account_name ?? null
      if ('taxonomy_code' in patch) reverse.taxonomy_code = line.taxonomy_code ?? null
      if ('taxonomy_locked' in patch) reverse.taxonomy_locked = line.taxonomy_locked ?? false
      if ('consolidation_group' in patch) reverse.consolidation_group = line.consolidation_group ?? null
      if ('amount' in patch) reverse.amount = line.amount ?? null
      setAppliedLineUndoStack((prev) => [...prev, { lineId, reverse }])
    }
    updateLineMutation.mutate({ lineId, patch })
  }

  function undoAppliedLineEdit() {
    const last = appliedLineUndoStack[appliedLineUndoStack.length - 1]
    if (!last) return
    setAppliedLineUndoStack((prev) => prev.slice(0, -1))
    updateLineMutation.mutate({ lineId: last.lineId, patch: last.reverse })
  }

  const resolveConflictMutation = useMutation({
    mutationFn: ({ lineId, body }: { lineId: number; body: PDFConflictResolutionRequest }) =>
      pdfImportApi.resolveConflict(appliedBatchId!, lineId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pdf-lines', appliedBatchId] })
      toast('Taxonomy conflict resolved', 'success')
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const bulkResolveMutation = useMutation({
    mutationFn: ({ resolution, conflictReason }: {
      resolution: 'keep_source' | 'apply_global' | 'accepted'
      conflictReason?: string
    }) => pdfImportApi.bulkResolveConflicts(appliedBatchId!, resolution, conflictReason),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pdf-lines', appliedBatchId] })
      toast(`${data.resolved} conflict${data.resolved === 1 ? '' : 's'} resolved`, 'success')
    },
    onError: (err: Error) => setApiError(err.message),
  })

  // P5: preview save indicator
  const [previewSaveStatus, setPreviewSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // P4: preview undo stack — stores the reverse patch for each edit
  const [previewUndoStack, setPreviewUndoStack] = useState<Array<{ lineIndex: number; reverse: Record<string, unknown> }>>([])

  const patchPreviewLineMutation = useMutation({
    mutationFn: ({ lineIndex, patch }: {
      lineIndex: number
      patch: { account_name?: string; section?: string; suggested_taxonomy_code?: string; proposed_account_code?: string | null; amount?: string; excluded?: boolean }
    }) => pdfImportApi.patchPreviewLine(preview!.batch_id, lineIndex, patch),
    onMutate: ({ lineIndex, patch }) => {
      setPreviewSaveStatus('saving')
      // Build reverse patch for undo before applying the change
      const line = preview?.lines[lineIndex]
      if (line) {
        const reverse: Record<string, unknown> = {}
        if ('account_name' in patch) reverse.account_name = line.account_name
        if ('section' in patch) reverse.section = line.section
        if ('suggested_taxonomy_code' in patch) reverse.suggested_taxonomy_code = line.suggested_taxonomy_code
        if ('proposed_account_code' in patch) reverse.proposed_account_code = line.proposed_account_code
        if ('amount' in patch) reverse.amount = line.amount
        if ('excluded' in patch) reverse.excluded = line.excluded ?? false
        setPreviewUndoStack((prev) => [...prev, { lineIndex, reverse }])
      }
    },
    onSuccess: (_data, { lineIndex, patch }) => {
      setPreviewSaveStatus('saved')
      setPreview((prev) => {
        if (!prev) return prev
        const lines = [...prev.lines]
        lines[lineIndex] = { ...lines[lineIndex], ...patch }
        return { ...prev, lines }
      })
      setTimeout(() => setPreviewSaveStatus('idle'), 2000)
    },
    onError: (err: Error) => {
      setPreviewSaveStatus('error')
      setApiError(err.message)
      setPreviewUndoStack((prev) => prev.slice(0, -1))
    },
  })

  function undoPreviewEdit() {
    const last = previewUndoStack[previewUndoStack.length - 1]
    if (!last) return
    setPreviewUndoStack((prev) => prev.slice(0, -1))
    pdfImportApi.patchPreviewLine(preview!.batch_id, last.lineIndex, last.reverse as Parameters<typeof pdfImportApi.patchPreviewLine>[2]).then((data) => {
      setPreview((prev) => {
        if (!prev) return prev
        const lines = [...prev.lines]
        lines[last.lineIndex] = { ...lines[last.lineIndex], ...data.updated }
        return { ...prev, lines }
      })
    })
  }

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
    setPickerType('monthly')
    setPickerMonth(new Date().getMonth() + 1)
    setPickerQuarter(Math.ceil((new Date().getMonth() + 1) / 3))
    setPickerYear(CURRENT_YEAR)
    setImportType('financial_statements')
    setStatementScope('')
    setBasisOverride('')
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
    if (appliedSearch) {
      const q = appliedSearch.toLowerCase()
      const matches =
        l.account_name.toLowerCase().includes(q) ||
        (l.official_account_code ?? '').toLowerCase().includes(q) ||
        l.section.toLowerCase().includes(q)
      if (!matches) return false
    }
    return true
  })

  const checks = preview?.validation?.checks ?? []
  const passingCount = checks.filter((c) => c.status === 'pass').length
  const failingCount = checks.filter((c) => c.status === 'fail').length

  const previewGroups = groupLines(visiblePreviewLines)
  const allPreviewGroups = groupLines(preview?.lines ?? [])

  const bsNotTied = preview && !preview.balance_sheet_tied && importType === 'financial_statements'
  const bsVariance = preview?.balance_sheet_variance ?? '0'
  const niMismatch = preview && !preview.net_income_reconciled && importType === 'financial_statements'
  const niVariance = preview?.net_income_variance ?? '0'

  // Should Apply button be disabled?
  // Only block on balance sheet not tying (matches backend gate). Subtotal mismatches
  // show a warning but do not block — the backend allows apply when BS is balanced.
  const canApply = !bsNotTied || importType !== 'financial_statements'
  const applyTitle = bsNotTied
    ? 'Balance sheet does not tie — review imbalance below or use force-apply'
    : failingCount > 0
    ? `${failingCount} subtotal mismatch(es) — review warnings, then apply`
    : undefined

  // ---------------------------------------------------------------------------
  // Workflow banner (shared)
  // ---------------------------------------------------------------------------

  const workflowBanner = (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5 text-sm text-blue-800">
      <p className="font-semibold mb-1 flex items-center gap-1.5">
        <FileText className="w-4 h-4" /> PDF Ingestion Workflow
      </p>
      <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono text-blue-600">
        {(['Upload PDF', 'Classify', 'Extract Lines', 'Validate Subtotals', 'Map to Taxonomy', 'Apply'] as const).map(
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
        breadcrumb={<Breadcrumb items={[{ label: 'Client Data', href: '/client-data/imports' }, { label: 'Imports', href: '/client-data/imports' }, { label: 'PDF Statement' }]} />}
      >
        {apiError && <ErrorBanner message={apiError} />}
        <StepIndicator steps={PDF_WIZARD_STEPS} currentStep={phaseIndex} onStepClick={handleStepClick} />
        {workflowBanner}

        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-800">Step 1 — Classify and upload</h2>

          {/* P0: Entity + period picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Entity *</label>
              <EntitySelect value={entityId} onChange={setEntityId} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">Period *</label>
              <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded w-fit">
                {(['monthly', 'quarterly', 'annual'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPickerType(t)}
                    className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                      pickerType === t
                        ? 'bg-white shadow-sm text-blue-700 border border-gray-200'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    data-testid={`period-type-${t}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {pickerType === 'monthly' && (
                  <select
                    value={pickerMonth}
                    onChange={(e) => setPickerMonth(Number(e.target.value))}
                    className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-400"
                    data-testid="period-month-select"
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                )}
                {pickerType === 'quarterly' && (
                  <select
                    value={pickerQuarter}
                    onChange={(e) => setPickerQuarter(Number(e.target.value))}
                    className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-400"
                    data-testid="period-quarter-select"
                  >
                    <option value={1}>Q1 (Jan–Mar)</option>
                    <option value={2}>Q2 (Apr–Jun)</option>
                    <option value={3}>Q3 (Jul–Sep)</option>
                    <option value={4}>Q4 (Oct–Dec)</option>
                  </select>
                )}
                <select
                  value={pickerYear}
                  onChange={(e) => setPickerYear(Number(e.target.value))}
                  className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-400"
                  data-testid="period-year-select"
                >
                  {PERIOD_YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-gray-400">
                Statement date: <strong className="text-gray-600" data-testid="period-derived-date">{statementDate}</strong>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <LabeledSelect
              label="Import Type *"
              value={importType}
              onChange={setImportType}
              options={IMPORT_TYPE_OPTIONS}
              testId="import-type-select"
            />
            <LabeledSelect
              label="Accounting Basis *"
              value={basisOverride}
              onChange={setBasisOverride}
              options={BASIS_OPTIONS}
              testId="basis-select"
            />
            <LabeledSelect
              label="Statement Scope *"
              value={statementScope}
              onChange={setStatementScope}
              options={SCOPE_OPTIONS}
              testId="scope-select"
            />
          </div>

          <p className="text-xs text-gray-500">
            Supports compiled or reviewed financial statements with extractable text (no scanned images).
            Select <strong>Trial Balance</strong> if importing raw debit/credit data instead of a presentation statement.
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

          <div className="flex items-center justify-end gap-3">
            {(() => {
              const missing = [
                !entityId && 'Entity',
                !basisOverride && 'Accounting Basis',
                !statementScope && 'Statement Scope',
                !file && 'PDF file',
              ].filter(Boolean) as string[]
              const disabled = missing.length > 0 || uploadMutation.isPending
              return (
                <>
                  {missing.length > 0 && !uploadMutation.isPending && (
                    <p className="text-xs text-amber-600" data-testid="missing-fields-hint">
                      Required: {missing.join(', ')}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => uploadMutation.mutate()}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                    data-testid="parse-pdf-btn"
                  >
                    {uploadMutation.isPending ? 'Extracting…' : 'Extract & Preview'}
                  </button>
                </>
              )
            })()}
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
                  key: 'import_type',
                  header: 'Type',
                  sortable: true,
                  sortValue: (b) => b.import_type ?? '',
                  render: (b) => <span className="text-xs capitalize">{(b.import_type ?? '').replace('_', ' ') || '—'}</span>
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
    const previewGroupKeys = Object.keys(previewGroups)

    return (
      <PageLayout
        title="PDF Financial Statement Import"
        subtitle="Extract balance sheet and income statement accounts from a compiled PDF"
        breadcrumb={<Breadcrumb items={[{ label: 'Client Data', href: '/client-data/imports' }, { label: 'Imports', href: '/client-data/imports' }, { label: 'PDF Statement' }]} />}
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
                  <span className="capitalize">{(preview.basis_of_accounting || 'unknown basis').replace('_', ' ')}</span>
                  {' · '}
                  <span className="capitalize">{(preview.import_type ?? 'financial_statements').replace('_', ' ')}</span>
                  {preview.statement_scope && preview.statement_scope !== 'unknown' && (
                    <> · <span className="capitalize">{preview.statement_scope}</span></>
                  )}
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

            {/* P10: Entity name mismatch warning */}
            {entityNameMismatch && (
              <div
                className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2"
                data-testid="entity-mismatch-warning"
              >
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Entity name mismatch</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    The PDF identifies this statement as{' '}
                    <span className="font-medium">&ldquo;{preview.source_entity_name}&rdquo;</span>,
                    but you selected <span className="font-medium">&ldquo;{selectedEntity?.name}&rdquo;</span>.
                    Verify you uploaded the correct file before applying.
                  </p>
                </div>
              </div>
            )}

            {/* P2: Balance sheet imbalance warning */}
            {bsNotTied && (
              <BalanceSheetImbalancePanel
                variance={bsVariance}
                onForceApply={() => applyMutation.mutate(true)}
                isPending={applyMutation.isPending}
              />
            )}

            {/* UX-DEF-11: Net income reconciliation warning */}
            {niMismatch && !bsNotTied && (
              <NetIncomeReconPanel
                niVariance={niVariance}
                niInEquity={preview?.net_income_in_equity ?? null}
                plNI={preview?.pnl_net_income ?? null}
              />
            )}

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

            {/* P6: ONE global control bar */}
            <div className="flex flex-wrap items-center gap-2 mb-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              {/* Search */}
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
                <input type="checkbox" checked={showSubtotals} onChange={(e) => setShowSubtotals(e.target.checked)} className="rounded" />
                Subtotals
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={showMapping} onChange={(e) => setShowMapping(e.target.checked)} className="rounded" />
                Taxonomy
              </label>
              <div className="ml-auto flex items-center gap-2">
                {/* P5: save indicator */}
                {previewSaveStatus === 'saving' && (
                  <span className="text-xs text-amber-500" data-testid="preview-save-indicator">Saving…</span>
                )}
                {previewSaveStatus === 'saved' && (
                  <span className="text-xs text-green-600" data-testid="preview-save-indicator">Saved</span>
                )}
                {previewSaveStatus === 'error' && (
                  <span className="text-xs text-red-500" data-testid="preview-save-indicator">Save failed</span>
                )}
                {/* P4: undo */}
                <button
                  type="button"
                  disabled={previewUndoStack.length === 0}
                  onClick={undoPreviewEdit}
                  title="Undo last edit"
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30"
                  data-testid="preview-undo-btn"
                >
                  <Undo2 className="w-3.5 h-3.5" /> Undo
                </button>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={expandAll} className="text-xs text-gray-500 hover:text-gray-700 underline">Expand all</button>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={() => collapseAll(previewGroupKeys)} className="text-xs text-gray-500 hover:text-gray-700 underline">Collapse all</button>
              </div>
            </div>

            {/* P4+P6: diff summary banner */}
            {previewDiff && (previewDiff.changed_count > 0 || previewDiff.excluded_count > 0) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-2 flex items-center gap-3 text-xs" data-testid="preview-diff-banner">
                <span className="text-blue-700 font-medium">Working preview differs from original extraction:</span>
                {previewDiff.changed_count > 0 && (
                  <span className="text-blue-600">{previewDiff.changed_count} edited</span>
                )}
                {previewDiff.excluded_count > 0 && (
                  <span className="text-amber-600">{previewDiff.excluded_count} excluded</span>
                )}
              </div>
            )}
            {(() => {
              const excludedCount = (preview.lines ?? []).filter((l) => l.excluded).length
              return excludedCount > 0 ? (
                <p className="text-xs text-amber-600 mb-2" data-testid="excluded-lines-hint">
                  {excludedCount} line{excludedCount !== 1 ? 's' : ''} excluded from apply — restore below to include
                </p>
              ) : null
            })()}

            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-400 italic">
                Click account name or section to edit · X to exclude a line from apply
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
                  disabled={applyMutation.isPending || !canApply}
                  onClick={() => applyMutation.mutate(false)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                  data-testid="apply-pdf-btn"
                  title={applyTitle}
                >
                  <CheckCircle className="w-4 h-4" />
                  {applyMutation.isPending ? 'Applying…' : `Apply ${(preview.lines ?? []).filter((l) => !l.excluded && !l.is_subtotal).length} Lines`}
                </button>
              </div>
            </div>
          </div>

          {/* Extracted lines — preview grouped by statement + section */}
          {Object.entries(previewGroups).map(([groupKey, { section, lines: groupLines }]) => {
            const [stmtType] = groupKey.split('::')
            const stmtLabel = STMT_LABELS[stmtType] ?? stmtType
            const sectionLabel = SECTION_LABELS[section] ?? section
            const detailCount = groupLines.filter((l) => !l.is_subtotal).length
            const isCollapsed = collapsedSections.has(groupKey)
            const { calculated, pdfSubtotal, variance } = getGroupTotals(allPreviewGroups[groupKey]?.lines ?? [])

            // P8: drag-and-drop section for taxonomy reclassification
            // (simplified: drop zone changes section on the line)

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
                      <span className="font-mono text-[10px] text-gray-300 mt-0.5 truncate" title={`Stable: ${l.temp_account_code}`} data-testid="stable-code">
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
                          disabled={l.system_managed}
                          onSave={(v) =>
                            patchPreviewLineMutation.mutate({ lineIndex, patch: { account_name: v } })
                          }
                          testId={`preview-name-${lineIndex}`}
                        />
                      ) : (
                        <span>{l.account_name}</span>
                      )}
                      {l.synthetic_presentation_line && (
                        <span className="text-purple-600 text-[10px] font-semibold bg-purple-50 border border-purple-200 px-1 rounded" title="Synthetic equity presentation line — derived from P&L, not editable">
                          synthetic
                        </span>
                      )}
                      {l.locked && <span title="Locked"><Lock className="w-3 h-3 text-amber-500" /></span>}
                      {l.is_contra && <span className="text-orange-500 font-semibold text-[10px] uppercase">(contra)</span>}
                    </div>
                  )
                }
              },
              // P8/UX-DEF-02: Section / drag-and-drop reclassification
              {
                key: 'section',
                header: 'Section',
                sortable: true,
                sortValue: (l: PDFImportPreviewLine) => l.section,
                render: (l: PDFImportPreviewLine) => {
                  const lineIndex = (preview?.lines ?? []).indexOf(l)
                  return (
                    <div className="flex items-center gap-1">
                      <span
                        draggable={!l.is_subtotal && lineIndex >= 0}
                        onDragStart={() => { draggingLineIndexRef.current = lineIndex }}
                        onDragEnd={() => { draggingLineIndexRef.current = null; setDragOverSection(null) }}
                        title="Drag to reclassify section"
                        className="cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      </span>
                      {!l.is_subtotal && lineIndex >= 0 ? (
                        <select
                          value={l.section}
                          onChange={(e) =>
                            patchPreviewLineMutation.mutate({ lineIndex, patch: { section: e.target.value } })
                          }
                          className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600 focus:border-blue-400"
                          data-testid={`section-select-${lineIndex}`}
                        >
                          {Object.entries(SECTION_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-500">{SECTION_LABELS[l.section] ?? l.section}</span>
                      )}
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
                      <TaxonomySelect
                        value={l.suggested_taxonomy_code}
                        disabled={l.system_managed}
                        onChange={(v) =>
                          patchPreviewLineMutation.mutate({ lineIndex, patch: { suggested_taxonomy_code: v ?? undefined } })
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
                      {!l.is_subtotal && lineIndex >= 0 && !l.system_managed ? (
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
              },
              // P4: exclude/restore action column
              {
                key: 'actions',
                header: '',
                sortable: false,
                className: 'w-8 text-center',
                render: (l: PDFImportPreviewLine) => {
                  const lineIndex = (preview?.lines ?? []).indexOf(l)
                  if (l.is_subtotal || l.system_managed || lineIndex < 0) return null
                  return l.excluded ? (
                    <button
                      type="button"
                      onClick={() => patchPreviewLineMutation.mutate({ lineIndex, patch: { excluded: false } })}
                      title="Restore line — include in apply"
                      className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                      data-testid={`restore-line-${lineIndex}`}
                    >
                      ↩
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => patchPreviewLineMutation.mutate({ lineIndex, patch: { excluded: true } })}
                      title="Exclude line from apply"
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      data-testid={`exclude-line-${lineIndex}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )
                }
              },
            ]

            return (
              <div
                key={groupKey}
                className={`bg-white border rounded-lg overflow-hidden transition-colors ${dragOverSection === groupKey ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverSection(groupKey) }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSection(null) }}
                onDrop={(e) => {
                  e.preventDefault()
                  const idx = draggingLineIndexRef.current
                  if (idx !== null && idx >= 0) {
                    patchPreviewLineMutation.mutate({ lineIndex: idx, patch: { section } })
                  }
                  setDragOverSection(null)
                  draggingLineIndexRef.current = null
                }}
              >
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
                    rowClassName={(l) => l.excluded ? 'opacity-40 line-through bg-red-50/40' : l.synthetic_presentation_line ? 'bg-purple-50/40' : ''}
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

  const appliedGroupKeys = Object.keys(groupLines(visibleAppliedLines))

  return (
    <PageLayout
      title="PDF Financial Statement Import"
      subtitle="Extract balance sheet and income statement accounts from a compiled PDF"
    >
      {apiError && <ErrorBanner message={apiError} />}
      <StepIndicator steps={PDF_WIZARD_STEPS} currentStep={phaseIndex} />
      {workflowBanner}

      {/* P4: Conflict resolution panel overlay */}
      {conflictLine && (
        <ConflictResolutionPanel
          line={conflictLine}
          onResolve={(lineId, body) => {
            resolveConflictMutation.mutate({ lineId, body })
          }}
          onClose={() => setConflictLine(null)}
        />
      )}

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

      {/* Tab bar + P9 help text */}
      <div className="mb-4 border-b border-gray-200">
        <div className="flex gap-1">
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
        {activeTab === 'lines' && (
          <p className="text-[11px] text-gray-400 px-1 py-1.5" data-testid="tab-lines-help">
            Editable working copy — update account codes, taxonomy assignments, and amounts.
          </p>
        )}
        {activeTab === 'audit' && (
          <p className="text-[11px] text-gray-400 px-1 py-1.5" data-testid="tab-audit-help">
            Immutable source evidence — shows the original extracted lines as-parsed from the PDF. Cannot be edited.
          </p>
        )}
      </div>

      {/* Lines tab */}
      {activeTab === 'lines' && (
        <div className="space-y-3">
          {/* UX-DEF-12: Bulk conflict resolution bar */}
          {(() => {
            const conflicting = appliedLines.filter((l) => l.taxonomy_conflict)
            if (conflicting.length === 0) return null
            const byReason = conflicting.reduce<Record<string, number>>((acc, l) => {
              const r = l.conflict_reason ?? 'unknown'
              acc[r] = (acc[r] ?? 0) + 1
              return acc
            }, {})
            return (
              <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="bulk-conflict-bar">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="text-xs font-medium text-amber-800">
                  {conflicting.length} taxonomy conflict{conflicting.length === 1 ? '' : 's'}
                  {Object.keys(byReason).length > 1 && ` across ${Object.keys(byReason).length} types`}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-xs text-amber-700">Resolve all:</span>
                  <button
                    type="button"
                    disabled={bulkResolveMutation.isPending}
                    onClick={() => bulkResolveMutation.mutate({ resolution: 'apply_global' })}
                    className="px-2 py-1 text-xs rounded border border-amber-400 bg-white text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    data-testid="bulk-resolve-global-btn"
                  >
                    Apply global
                  </button>
                  <button
                    type="button"
                    disabled={bulkResolveMutation.isPending}
                    onClick={() => bulkResolveMutation.mutate({ resolution: 'keep_source' })}
                    className="px-2 py-1 text-xs rounded border border-amber-400 bg-white text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    data-testid="bulk-resolve-source-btn"
                  >
                    Keep source
                  </button>
                  <button
                    type="button"
                    disabled={bulkResolveMutation.isPending}
                    onClick={() => bulkResolveMutation.mutate({ resolution: 'accepted' })}
                    className="px-2 py-1 text-xs rounded border border-amber-400 bg-white text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    data-testid="bulk-resolve-accept-btn"
                  >
                    Accept all
                  </button>
                </div>
              </div>
            )
          })()}

          {/* P6: ONE global control bar for applied view */}
          <div className="flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <div className="relative min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search accounts…"
                value={appliedSearch}
                onChange={(e) => setAppliedSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                data-testid="applied-search"
              />
              {appliedSearch && (
                <button type="button" onClick={() => setAppliedSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <StmtFilterBar value={appliedStmtFilter} onChange={setAppliedStmtFilter} />
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer ml-2">
              <input type="checkbox" checked={appliedShowSubtotals} onChange={(e) => setAppliedShowSubtotals(e.target.checked)} className="rounded" />
              Subtotals
            </label>
            {/* P7: toggle legal entity / consol group */}
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showLegalEntity} onChange={(e) => setShowLegalEntity(e.target.checked)} className="rounded" data-testid="show-legal-entity-toggle" />
              Legal Entity / Consol
            </label>
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={expandAll} className="text-xs text-gray-500 hover:text-gray-700 underline">Expand all</button>
              <span className="text-gray-300">|</span>
              <button type="button" onClick={() => collapseAll(appliedGroupKeys)} className="text-xs text-gray-500 hover:text-gray-700 underline">Collapse all</button>
              {appliedLineUndoStack.length > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={undoAppliedLineEdit}
                    disabled={updateLineMutation.isPending}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                    title={`Undo last edit (${appliedLineUndoStack.length} in stack)`}
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Undo ({appliedLineUndoStack.length})
                  </button>
                </>
              )}
            </div>
          </div>

          {linesLoading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading lines…</div>
          ) : (
            <AppliedLinesTable
              lines={visibleAppliedLines}
              onUpdateLine={onUpdateLineWithUndo}
              collapsedSections={collapsedSections}
              onToggleSection={toggleSection}
              onResolveConflict={setConflictLine}
              showLegalEntity={showLegalEntity}
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
            <AuditTrailPanel lines={auditTrail.lines as unknown as Record<string, unknown>[]} />
          ) : (
            <div className="text-sm text-gray-400 py-8 text-center">No audit data</div>
          )}
        </div>
      )}
    </PageLayout>
  )
}
