import { useState, useRef, useEffect } from 'react'
import { useFormatNumber } from '@/hooks/useFormatCurrency'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Upload, ChevronRight, ChevronLeft, CheckCircle, AlertCircle,
  Table, FileText, Layers, ArrowRight, Info, Download, Building2,
} from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import { entitiesApi } from '@/api/entities'
import { periodsApi } from '@/api/periods'
import { taxonomyLibraryApi } from '@/api/taxonomyLibrary'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { ImportReadinessMatrix } from '@/components/ui/ImportReadinessMatrix'
import { useOrg } from '@/providers/OrgProvider'
import { useToast } from '@/providers/ToastProvider'
import { StepIndicator } from '@/components/import-wizard'
import type { WizardStep } from '@/components/import-wizard/types'
import type { AccountingPeriod, DetectResult, Entity } from '@/types'

const STEPS = [
  { label: 'Upload', desc: 'Select file and period' },
  { label: 'Sheet', desc: 'Choose worksheet' },
  { label: 'Columns', desc: 'Confirm column mapping' },
  { label: 'Mapping Basis', desc: 'Choose taxonomies to drive FSLI suggestions' },
  { label: 'Preview', desc: 'Review detected data' },
  { label: 'Accounts', desc: 'Mapping preview' },
  { label: 'Confirm', desc: 'Upload and begin' },
]

const TAXONOMY_STORAGE_KEY = 'import-wizard-taxonomy-ids'
const DEFAULT_TAXONOMY_CODES = ['us-gaap', 'us_gaap', 'usgaap', 'management', 'mgmt']

const STANDARD_FIELDS = [
  { key: 'account_number', label: 'Account Number', required: true },
  { key: 'account_name', label: 'Account Name', required: false },
  { key: 'debit', label: 'Debit', required: false },
  { key: 'credit', label: 'Credit', required: false },
  { key: 'balance', label: 'Net Balance', required: false },
  { key: 'description', label: 'Description', required: false },
]

// Shared StepIndicator is imported from components

function colLetter(idx: number): string {
  let result = ''
  let n = idx + 1
  while (n > 0) {
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

const COLUMN_ALIASES: Record<string, string[]> = {
  account_number: ['account_number','account #','account no','account no.','account number','acct #','acct no','acct','num','gl account','gl #','code','account code','account id','ledger account','chart of accounts'],
  account_name: ['account_name','account name','account description','gl account name','name','title','account title','ledger name'],
  debit: ['debit','debit amount','dr','dr amount','debit balance','debit (dr)','ending debit','total debit'],
  credit: ['credit','credit amount','cr','cr amount','credit balance','credit (cr)','ending credit','total credit'],
  balance: ['balance','net balance','net amount','net change','ending balance','amount','total','period net','net activity','net','balance amount'],
  description: ['description','memo','notes','narration','detail','transaction description','account description'],
}

function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const header of headers) {
    const normalized = header.trim().toLowerCase().replace(/[-_]/g, ' ')
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (!(field in mapping) && aliases.some(a => a.replace(/[-_]/g, ' ') === normalized)) {
        mapping[field] = header
        break
      }
    }
  }
  return mapping
}

function RawSheetGrid({
  rawRows, headerRowIdx, onSelectRow,
}: {
  rawRows: string[][]
  headerRowIdx: number | null
  onSelectRow: (idx: number) => void
}) {
  if (!rawRows.length) return null
  const numCols = rawRows.reduce((max, row) => Math.max(max, row.length), 0)
  const colIndices = Array.from({ length: numCols }, (_, i) => i)
  return (
    <div className="overflow-auto border border-gray-200 rounded-lg max-h-80 text-[11px] font-mono">
      <table className="border-collapse w-max">
        <thead className="sticky top-0 z-10 bg-gray-100">
          <tr>
            <th className="px-2 py-1 border border-gray-300 text-gray-400 text-right min-w-[3rem] select-none">#</th>
            {colIndices.map(i => (
              <th key={i} className="px-2 py-1 border border-gray-300 text-gray-600 min-w-[8rem] text-center font-semibold">
                {colLetter(i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rawRows.map((row, rowIdx) => {
            const isHeader = rowIdx === headerRowIdx
            return (
              <tr
                key={rowIdx}
                onClick={() => onSelectRow(rowIdx)}
                className={`cursor-pointer transition-colors ${
                  isHeader ? 'bg-indigo-100 font-semibold' : 'even:bg-gray-50 hover:bg-indigo-50'
                }`}
              >
                <td className={`px-2 py-1 border border-gray-200 text-right select-none ${isHeader ? 'text-indigo-700 font-bold' : 'text-gray-400'}`}>
                  {rowIdx + 1}{isHeader ? ' ★' : ''}
                </td>
                {colIndices.map(colIdx => {
                  const val = row[colIdx] ?? ''
                  return (
                    <td
                      key={colIdx}
                      className={`px-2 py-1 border border-gray-200 whitespace-nowrap max-w-[12rem] overflow-hidden text-ellipsis ${
                        val ? (isHeader ? 'text-indigo-800' : 'text-gray-800') : 'text-gray-300'
                      }`}
                      title={val}
                    >
                      {val || ''}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ConfidenceMeter({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-400' : 'bg-red-400'
  const label = score >= 80 ? 'High confidence' : score >= 50 ? 'Partial detection' : 'Low confidence'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-600 whitespace-nowrap">{score}% — {label}</span>
    </div>
  )
}

export function ImportWizardPage() {
  const fmtNumber = useFormatNumber()
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [entityId, setEntityId] = useState('')
  const [asOfDate, setAsOfDate] = useState('')
  const [usePeriodPicker, setUsePeriodPicker] = useState(false)
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [detected, setDetected] = useState<DetectResult | null>(null)
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null)
  const [headerRowIdx, setHeaderRowIdx] = useState<number | null>(null)
  const [colMapping, setColMapping] = useState<Record<string, string>>({})
  const [importSourceType, setImportSourceType] = useState<'tb' | 'gl' | 'coa' | 'fs'>('tb')
  const [apiError, setApiError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{ existingBatchId: number; existingStatus: string } | null>(null)
  const [selectedTaxonomyIds, setSelectedTaxonomyIds] = useState<number[]>([])
  const [taxonomyDefaultsInitialized, setTaxonomyDefaultsInitialized] = useState(false)

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (file || Object.keys(colMapping).length > 0) {
        e.preventDefault()
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [file, colMapping])

  const WIZARD_STEPS: WizardStep[] = STEPS.map((s, i) => {
    let status: 'pending' | 'active' | 'complete' | 'error' = 'pending'
    if (i === step) status = 'active'
    else if (i < step) status = 'complete'
    return { key: String(i), label: s.label, status }
  })

  const handleStepClick = (idx: number) => {
    if (idx === 1 && detected && detected.sheets.length === 0) {
      return
    }
    setStep(idx)
  }

  const { data: entityData } = useQuery({
    queryKey: ['entities'],
    queryFn: () => entitiesApi.list(),
    enabled: !!orgId,
  })
  const entities: Entity[] = entityData ?? []

  const { data: periodsData = [] } = useQuery({
    queryKey: ['wizard-periods', entityId],
    queryFn: () => periodsApi.list(Number(entityId)),
    enabled: !!entityId,
    staleTime: 30_000,
  })
  const sortedPeriods = [...periodsData].sort((a, b) => b.end_date.localeCompare(a.end_date))

  const { data: taxonomiesData = [] } = useQuery({
    queryKey: ['wizard-taxonomies'],
    queryFn: () => taxonomyLibraryApi.list(),
    staleTime: 60_000,
  })
  const systemTaxonomies = taxonomiesData.filter((t) => t.is_system && t.is_active)

  useEffect(() => {
    if (taxonomyDefaultsInitialized) return
    if (systemTaxonomies.length === 0) return
    const defaults = systemTaxonomies.filter((t) =>
      DEFAULT_TAXONOMY_CODES.some((code) => t.code.toLowerCase() === code || t.name.toLowerCase() === code)
    )
    setSelectedTaxonomyIds(defaults.map((t) => t.id))
    setTaxonomyDefaultsInitialized(true)
  }, [systemTaxonomies, taxonomyDefaultsInitialized])

  const detectMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('No file selected')
      return tbImportApi.detectFile(file)
    },
    onSuccess: (result) => {
      setDetected(result)
      setSelectedSheet(result.selected_sheet)
      setColMapping(result.detected_mapping)
      setApiError(null)
      // Find auto_header_row_idx for the selected sheet
      const selectedSheetData = result.sheets.find(s => s.name === result.selected_sheet)
      setHeaderRowIdx(selectedSheetData?.auto_header_row_idx ?? 0)
      // Skip sheet step for CSV or single-sheet XLSX
      setStep(result.sheets.length > 1 ? 1 : 2)
    },
    onError: (err: Error) => { setApiError(err.message) },
  })

  const uploadMutation = useMutation({
    mutationFn: (force: boolean = false) => {
      if (!file || !entityId || !asOfDate) throw new Error('All fields required')
      return tbImportApi.uploadBatch({
        entity_id: Number(entityId),
        organization_id: orgId,
        as_of_date: asOfDate,
        sheet_name: selectedSheet ?? undefined,
        header_row_index: headerRowIdx ?? undefined,
        column_mapping: Object.keys(colMapping).length > 0 ? colMapping : undefined,
        force,
        file,
      })
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: ['import-batches', orgId] })
      toast(`Import started: ${batch.row_count ?? 0} rows parsed — ${batch.unmapped_row_count ?? 0} need mapping`, 'success')
      setApiError(null)
      setDuplicateWarning(null)
      try {
        if (selectedTaxonomyIds.length > 0) {
          window.localStorage.setItem(TAXONOMY_STORAGE_KEY, JSON.stringify(selectedTaxonomyIds))
        } else {
          window.localStorage.removeItem(TAXONOMY_STORAGE_KEY)
        }
      } catch {
        // ignore storage failures (private mode etc)
      }
      if ((batch.unmapped_row_count ?? 0) > 0) {
        navigate(`/import/${batch.id}/mapping`)
      } else {
        navigate(`/import/${batch.id}`)
      }
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: { code?: string; existing_batch_id?: number; existing_status?: string } } } })?.response?.data?.detail
      if (detail?.code === 'DUPLICATE_IMPORT') {
        setDuplicateWarning({ existingBatchId: detail.existing_batch_id!, existingStatus: detail.existing_status! })
        setApiError(null)
      } else {
        setApiError((err as Error).message ?? 'Upload failed')
      }
    },
  })

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) { setFile(dropped); setDetected(null) }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (f) { setFile(f); setDetected(null) }
  }

  function canProceedStep0() { return !!file && !!entityId && !!asOfDate }

  // Download sample CSV template
  function downloadTemplate() {
    const csv = [
      'Account Number,Account Name,Debit,Credit',
      '1000,Cash,50000.00,',
      '1200,Accounts Receivable,25000.00,',
      '2000,Accounts Payable,,30000.00',
      '3000,Retained Earnings,,45000.00',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tb_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageLayout
      title="New Import"
      subtitle="Guided trial balance and GL import wizard"
      actions={
        <button
          type="button"
          onClick={() => {
            if (file || Object.keys(colMapping).length > 0) {
              if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
                navigate('/import')
              }
            } else {
              navigate('/import')
            }
          }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Import Center
        </button>
      }
    >
      <StepIndicator steps={WIZARD_STEPS} currentStep={step} onStepClick={handleStepClick} />
      {apiError && <ErrorBanner message={apiError} />}
      {duplicateWarning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3 mb-4">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Duplicate file detected</p>
            <p className="text-xs text-amber-700 mt-1">
              This file was already imported (Batch #{duplicateWarning.existingBatchId}, status: {duplicateWarning.existingStatus}).
              Import again to create a separate version, or view the existing batch.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => navigate(`/import/${duplicateWarning.existingBatchId}`)}
                className="text-xs px-3 py-1.5 border border-amber-400 rounded text-amber-800 hover:bg-amber-100"
              >
                View Existing Batch
              </button>
              <button
                type="button"
                onClick={() => { setDuplicateWarning(null); uploadMutation.mutate(true) }}
                disabled={uploadMutation.isPending}
                className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
              >
                Import Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entity-first guard */}
      {entities.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">No entities found</p>
            <p className="text-xs text-amber-700 mt-1">
              You need at least one entity before importing trial balance data.
              Entities represent the legal entities or cost centers you report on.
            </p>
            <button
              type="button"
              onClick={() => navigate('/entities')}
              className="mt-2 text-xs text-amber-700 underline font-medium hover:text-amber-900"
            >
              Create an entity first →
            </button>
          </div>
        </div>
      )}

      {/* Step 0: File + Entity + Date */}
      {step === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-sm font-semibold text-gray-800">Step 1 — Select file and reporting period</h2>
            <div className="flex items-start gap-1.5 text-[11px] text-gray-400 max-w-xs">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Import one trial balance per period. Each import creates a posted journal entry in the ledger tagged as "As Reported."</span>
            </div>
          </div>

          {/* Import source type selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Import File Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                {
                  key: 'tb' as const,
                  label: 'Trial Balance',
                  desc: 'Creates accounts & period balances, suggests FSLI',
                  requires: 'Requires period/date',
                  provides: ['account_number', 'account_name', 'period_balance', 'fsli_suggestion'],
                  after: 'Next: Map accounts to FSLI taxonomy',
                },
                {
                  key: 'gl' as const,
                  label: 'General Ledger',
                  desc: 'Imports transactions, derives period activity',
                  requires: 'Requires period/date + opening balances',
                  provides: ['transactions', 'account_activity', 'journal_entries'],
                  after: 'Next: Verify opening balance import',
                },
                {
                  key: 'coa' as const,
                  label: 'Chart of Accounts',
                  desc: 'Creates accounts & hierarchy, no balances',
                  requires: 'No period required',
                  provides: ['account_number', 'account_name', 'account_type', 'parent_account_id'],
                  after: 'Next: Upload a Trial Balance to add balances',
                },
                {
                  key: 'fs' as const,
                  label: 'Financial Statement',
                  desc: 'Maps presentation lines to taxonomy, no account detail',
                  requires: 'No period required',
                  provides: ['fs_line_items', 'presentation_amounts'],
                  after: 'Next: Upload via PDF Import for AI extraction',
                },
              ] as const).map(({ key, label, desc, requires, provides, after }) => {
                const selected = importSourceType === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setImportSourceType(key)}
                    className={`text-left p-3 rounded-lg border-2 transition-all ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className={`text-xs font-bold mb-0.5 ${selected ? 'text-indigo-800' : 'text-gray-800'}`}>{label}</div>
                    <div className="text-[10px] text-gray-500 leading-snug">{desc}</div>
                  </button>
                )
              })}
            </div>

            {/* Source type detail panel */}
            {(() => {
              const INFO = {
                tb: {
                  label: 'Trial Balance',
                  desc: 'Creates accounts and period balances. Matches rows to existing COA accounts or creates new ones. Suggests FSLI taxonomy line assignment for each account.',
                  requires: ['entity_id', 'period / as-of date'],
                  provides: ['account_number', 'account_name', 'period_balance', 'fsli_suggestion'],
                  after: 'After import: map unmapped accounts to FSLI taxonomy in the Mapping Workbench.',
                  color: 'indigo',
                },
                gl: {
                  label: 'General Ledger',
                  desc: 'Imports individual transactions and derives period activity. Creates accounts if they don\'t exist. Requires opening balances to compute ending balances.',
                  requires: ['entity_id', 'period / as-of date', 'opening balance import'],
                  provides: ['transactions', 'account_activity', 'journal_entries'],
                  after: 'After import: verify opening balance import is present to compute ending balances.',
                  color: 'emerald',
                },
                coa: {
                  label: 'Chart of Accounts',
                  desc: 'Creates or updates Account records with full hierarchy (parent_account_id). Sets account_type, normal_balance, and account_number. Does NOT create balances.',
                  requires: ['entity_id'],
                  provides: ['account_number', 'account_name', 'account_type', 'normal_balance', 'parent_account_id'],
                  after: 'After import: upload a Trial Balance to add period balances to the account hierarchy.',
                  color: 'blue',
                },
                fs: {
                  label: 'Financial Statement (PDF/Excel)',
                  desc: 'Imports presentation-level line items, not raw accounts. Maps to taxonomy/FSLI lines. Useful for building comparisons or seeding FSLI structure. Use the PDF Import page for AI extraction.',
                  requires: ['entity_id'],
                  provides: ['fs_line_items', 'presentation_amounts'],
                  after: 'After import: use the PDF Import page (/pdf-import) for AI-powered extraction from PDF statements.',
                  color: 'orange',
                },
              }[importSourceType]

              return (
                <div className={`mt-3 rounded-lg border border-${INFO.color}-200 bg-${INFO.color}-50/40 p-3`}>
                  <div className="flex items-start gap-2">
                    <Layers className={`h-4 w-4 text-${INFO.color}-600 shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-800 mb-1">{INFO.label}</p>
                      <p className="text-xs text-gray-600 mb-2">{INFO.desc}</p>
                      <div className="grid grid-cols-2 gap-3 text-[10px]">
                        <div>
                          <span className="font-semibold text-gray-500 uppercase tracking-wide">Requires</span>
                          <ul className="mt-1 space-y-0.5">
                            {INFO.requires.map(r => (
                              <li key={r} className="flex items-center gap-1 text-gray-600">
                                <span className="w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <span className="font-semibold text-gray-500 uppercase tracking-wide">Provides</span>
                          <ul className="mt-1 space-y-0.5">
                            {INFO.provides.map(p => (
                              <li key={p} className="flex items-center gap-1 text-gray-600">
                                <span className="w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="mt-2 flex items-start gap-1 text-[10px] text-amber-700">
                        <ArrowRight className="h-3 w-3 shrink-0 mt-0.5" />
                        {INFO.after}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* File dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            {file ? (
              <div>
                <p className="text-sm font-medium text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">Drag &amp; drop or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">CSV, XLSX, XLS — max 20 MB</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
          </div>

          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
          >
            <Download className="w-3.5 h-3.5" /> Download sample CSV template
          </button>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="wizard-entity-select" className="block text-xs font-medium text-gray-600 mb-1">Entity *</label>
              <select
                id="wizard-entity-select"
                value={entityId}
                onChange={(e) => { setEntityId(e.target.value); setSelectedPeriodId('') }}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">Select entity…</option>
                {entities.filter((e) => e.active).map((e) => (
                  <option key={e.id} value={e.id}>{e.code} — {e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-600">
                  {usePeriodPicker ? 'Accounting Period *' : 'As-of Date *'}
                </label>
                {entityId && (
                  <button
                    type="button"
                    onClick={() => {
                      setUsePeriodPicker((v) => !v)
                      setSelectedPeriodId('')
                      setAsOfDate('')
                    }}
                    className="text-[10px] text-indigo-600 hover:underline"
                  >
                    {usePeriodPicker ? 'Enter date manually' : 'Pick from accounting periods'}
                  </button>
                )}
              </div>
              {usePeriodPicker ? (
                <select
                  value={selectedPeriodId}
                  onChange={(e) => {
                    setSelectedPeriodId(e.target.value)
                    const p = sortedPeriods.find((p: AccountingPeriod) => String(p.id) === e.target.value)
                    if (p) setAsOfDate(p.end_date)
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  <option value="">Select period…</option>
                  {sortedPeriods.map((p: AccountingPeriod) => (
                    <option key={p.id} value={p.id}>
                      {p.period_name} (ends {p.end_date})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              )}
              {usePeriodPicker && asOfDate && (
                <p className="text-[10px] text-gray-400 mt-0.5">As-of date: {asOfDate}</p>
              )}
            </div>
          </div>

          {entityId && (
            <ImportReadinessMatrix entityId={Number(entityId)} />
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (file || Object.keys(colMapping).length > 0) {
                  if (window.confirm('You have unsaved changes. Are you sure you want to cancel?')) {
                    navigate('/import')
                  }
                } else {
                  navigate('/import')
                }
              }}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canProceedStep0() || detectMutation.isPending}
              onClick={() => detectMutation.mutate()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {detectMutation.isPending ? 'Analyzing file…' : <>Analyze File <ChevronRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Sheet selection (XLSX only) */}
      {step === 1 && detected && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Step 2 — Select worksheet</h2>
          <p className="text-xs text-gray-500">
            Found {detected.sheets.length} sheet{detected.sheets.length !== 1 ? 's' : ''} in <strong>{file?.name}</strong>.
            Select the sheet containing trial balance data.
          </p>

          <div className="space-y-2">
            {detected.sheets.map((sheet) => (
              <label
                key={sheet.name}
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedSheet === sheet.name
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="sheet"
                  checked={selectedSheet === sheet.name}
                  onChange={() => {
                    const hdr = sheet.auto_header_row_idx ?? 0
                    setSelectedSheet(sheet.name)
                    setHeaderRowIdx(hdr)
                    const headers = sheet.raw_rows?.[hdr] ?? sheet.headers
                    const mapping = autoDetectMapping(headers)
                    setDetected((prev) => prev ? {
                      ...prev,
                      headers,
                      preview_rows: sheet.preview_rows,
                      detected_mapping: mapping,
                      unmapped_headers: headers.filter(h => !Object.values(mapping).includes(h)),
                    } : prev)
                    setColMapping(mapping)
                  }}
                  className="text-indigo-600"
                />
                <Layers className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    {sheet.name} ({fmtNumber(sheet.row_count)} rows)
                  </p>
                </div>
                {sheet.likely_tb_score >= 5 && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    Likely TB
                  </span>
                )}
                {sheet.likely_tb_score > 0 && sheet.likely_tb_score < 5 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    Score: {sheet.likely_tb_score}
                  </span>
                )}
              </label>
            ))}
          </div>

          {/* Header preview for selected sheet */}
          {selectedSheet && detected.headers.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-600 mb-2">
                Detected columns in <span className="font-semibold">{selectedSheet}</span>:
              </p>
              <div className="flex flex-wrap gap-1">
                {detected.headers.map((h, i) => (
                  <span key={i} className="text-xs bg-white border border-gray-300 px-2 py-0.5 rounded font-mono text-gray-700">{h || <span className="text-gray-300 italic">blank</span>}</span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Auto-detected {Object.keys(detected.detected_mapping).length} of {detected.headers.length} column mappings (confidence: {detected.confidence}%)
              </p>
            </div>
          )}

          {selectedSheet && (() => {
            const sheetData = detected.sheets.find((s) => s.name === selectedSheet)
            if (!sheetData?.raw_rows?.length) return null
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-600">
                    Worksheet preview — click a row to set as header
                  </p>
                  <p className="text-xs text-gray-400">
                    Header: Row {(headerRowIdx ?? 0) + 1}
                    {' · '}{detected.headers.filter(Boolean).length} columns
                  </p>
                </div>
                <RawSheetGrid
                  rawRows={sheetData.raw_rows}
                  headerRowIdx={headerRowIdx}
                  onSelectRow={(rowIdx) => {
                    setHeaderRowIdx(rowIdx)
                    const newHeaders = sheetData.raw_rows[rowIdx] ?? []
                    const newMapping = autoDetectMapping(newHeaders)
                    setDetected((prev) => prev ? {
                      ...prev,
                      headers: newHeaders,
                      detected_mapping: newMapping,
                      unmapped_headers: newHeaders.filter(h => !Object.values(newMapping).includes(h)),
                    } : prev)
                    setColMapping(newMapping)
                  }}
                />
              </div>
            )
          })()}

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(0)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              disabled={!selectedSheet}
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Column mapping */}
      {step === 2 && detected && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <div className="flex items-start justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Step 3 — Confirm column mapping</h2>
            <div className="w-64">
              <ConfidenceMeter score={detected.confidence} />
            </div>
          </div>

          {/* Mapping template presets */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-600 mb-2">Apply a preset template:</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'QuickBooks', mapping: { account_number: detected.headers.find(h => /account.*num|acct.*#/i.test(h)) ?? '', account_name: detected.headers.find(h => /account.*name|description/i.test(h)) ?? '', debit: detected.headers.find(h => /debit|dr/i.test(h)) ?? '', credit: detected.headers.find(h => /credit|cr/i.test(h)) ?? '' } },
                { label: 'NetSuite', mapping: { account_number: detected.headers.find(h => /^account$/i.test(h) || /account.*num/i.test(h)) ?? '', account_name: detected.headers.find(h => /account.*name|name/i.test(h)) ?? '', balance: detected.headers.find(h => /amount|balance|net/i.test(h)) ?? '' } },
                { label: 'Sage', mapping: { account_number: detected.headers.find(h => /nominal|account.*code|code/i.test(h)) ?? '', account_name: detected.headers.find(h => /account.*name|description|name/i.test(h)) ?? '', debit: detected.headers.find(h => /debit/i.test(h)) ?? '', credit: detected.headers.find(h => /credit/i.test(h)) ?? '' } },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    const m: Record<string, string> = {}
                    Object.entries(preset.mapping).forEach(([k, v]) => { if (v) m[k] = v })
                    setColMapping(m)
                  }}
                  className="px-3 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-indigo-50 hover:border-indigo-300 text-gray-700 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setColMapping(detected.detected_mapping)}
                className="px-3 py-1 text-xs border border-indigo-300 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors"
              >
                Reset to auto-detected
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Auto-detected {Object.keys(colMapping).length} of {detected.headers.length} columns.
            Override any mapping below.
          </p>

          <div className="space-y-3">
            {STANDARD_FIELDS.map((field) => (
              <div key={field.key} className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </p>
                  <p className="text-xs text-gray-400">{field.key}</p>
                </div>
                <select
                  value={colMapping[field.key] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setColMapping((prev) => {
                      const next = { ...prev }
                      if (val) next[field.key] = val
                      else delete next[field.key]
                      return next
                    })
                  }}
                  className={`border rounded px-3 py-2 text-sm ${
                    colMapping[field.key]
                      ? 'border-green-300 bg-green-50'
                      : field.required
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-300'
                  }`}
                >
                  <option value="">(not mapped)</option>
                  {(() => {
                    const sheetData = detected.sheets.find(s => s.name === selectedSheet)
                    const dataRow = sheetData?.raw_rows?.[(headerRowIdx ?? 0) + 1]
                    return detected.headers.map((h, colIdx) => {
                      const sample = dataRow?.[colIdx]
                      const letter = colLetter(colIdx)
                      const name = h.trim() || 'blank'
                      const sampleText = sample || 'blank'
                      return (
                        <option key={colIdx} value={letter}>
                          {letter} — {name} — sample: {sampleText}
                        </option>
                      )
                    })
                  })()}
                </select>
              </div>
            ))}
          </div>

          {detected.unmapped_headers.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded p-3">
              <p className="text-xs text-gray-500 font-medium mb-1">Unmapped source columns (will be ignored):</p>
              <div className="flex flex-wrap gap-1">
                {detected.unmapped_headers.map((h) => (
                  <span key={h} className="text-xs bg-white border border-gray-300 px-2 py-0.5 rounded font-mono">{h}</span>
                ))}
              </div>
            </div>
          )}

          {/* Supported account label formats */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-800">
            <p className="font-semibold mb-1 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" /> Supported account label formats</p>
            <ul className="space-y-0.5 font-mono text-[11px] text-blue-700">
              <li>1000 Cash</li>
              <li>1000 - Cash</li>
              <li>1000: Cash</li>
              <li>1000-01 · Operating Account <span className="text-blue-500 font-sans">(subaccounts)</span></li>
              <li>Account name only <span className="text-blue-500 font-sans">(no number required)</span></li>
            </ul>
          </div>

          {(!colMapping.account_number) && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded p-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">Account Number mapping is required to continue.</p>
            </div>
          )}

          {colMapping.account_number && !colMapping.debit && !colMapping.credit && !colMapping.balance && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded p-3">
              <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />
              <p className="text-xs text-yellow-700">No amount column mapped. Map either Debit/Credit or Net Balance.</p>
            </div>
          )}

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(detected.sheets.length > 1 ? 1 : 0)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              disabled={!colMapping.account_number}
              onClick={() => setStep(3)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
              data-testid="continue-to-mapping-basis-btn"
            >
              Choose Mapping Basis <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Choose Mapping Basis */}
      {step === 3 && detected && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5" data-testid="mapping-basis-step">
          <h2 className="text-sm font-semibold text-gray-800">Step 4 — Choose mapping basis</h2>
          <p className="text-xs text-gray-500">
            Which taxonomy should drive FSLI suggestions for these accounts? Selected taxonomies will be
            available in the Mapping Workbench after import.
          </p>

          {systemTaxonomies.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3" data-testid="no-system-taxonomies-warning">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">No system taxonomies seeded</p>
                <p className="text-xs text-amber-700 mt-1">
                  No system taxonomies seeded. Run <code className="font-mono bg-amber-100 px-1 rounded">python scripts/seed_taxonomies.py</code> first.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2" data-testid="taxonomy-checkbox-list">
              {systemTaxonomies.map((tax) => {
                const checked = selectedTaxonomyIds.includes(tax.id)
                return (
                  <label
                    key={tax.id}
                    htmlFor={`taxonomy-checkbox-${tax.id}`}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      checked ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      id={`taxonomy-checkbox-${tax.id}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedTaxonomyIds((prev) =>
                          prev.includes(tax.id) ? prev.filter((id) => id !== tax.id) : [...prev, tax.id]
                        )
                      }}
                      className="mt-1 text-indigo-600"
                      data-testid={`taxonomy-checkbox-${tax.id}`}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{tax.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{tax.code}</p>
                      {tax.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{tax.description}</p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          )}

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(2)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setSelectedTaxonomyIds([]); setStep(4) }}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50"
                data-testid="skip-taxonomy-btn"
              >
                Skip — choose later in Mapping Workbench
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
                data-testid="continue-taxonomy-btn"
              >
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Data preview */}
      {step === 4 && detected && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Step 5 — Data preview</h2>
          <p className="text-xs text-gray-500">
            First {detected.preview_rows.length} row{detected.preview_rows.length !== 1 ? 's' : ''} from the file
            {selectedSheet ? ` (sheet: ${selectedSheet})` : ''}.
            Columns highlighted in indigo are mapped.
          </p>

          {detected.preview_rows.length > 0 ? (
            <div className="overflow-auto max-h-[480px] border border-gray-200 rounded">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50">
                    {detected.headers.map((h) => {
                      const isMapped = Object.values(colMapping).includes(h)
                      const fieldName = Object.entries(colMapping).find(([, v]) => v === h)?.[0]
                      return (
                        <th
                          key={h}
                          className={`px-3 py-2 text-left font-semibold whitespace-nowrap border-b ${
                            isMapped ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-500'
                          }`}
                        >
                          {h}
                          {fieldName && (
                            <span className="block text-indigo-400 font-normal text-xs">→ {fieldName}</span>
                          )}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {detected.preview_rows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {detected.headers.map((h) => {
                        const isMapped = Object.values(colMapping).includes(h)
                        const val = row[h] ?? ''
                        const isEmpty = !val.trim()
                        return (
                          <td
                            key={h}
                            className={`px-3 py-1.5 font-mono whitespace-nowrap ${
                              isEmpty ? 'text-gray-300' : isMapped ? 'text-gray-800' : 'text-gray-500'
                            }`}
                          >
                            {isEmpty ? '—' : val}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-gray-200 rounded p-6 text-center text-gray-400 text-sm">
              No preview rows available.
            </div>
          )}

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(3)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => setStep(5)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Account mapping summary */}
      {step === 5 && detected && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Step 6 — Account mapping summary</h2>
          <p className="text-xs text-gray-500">
            After upload, the system will try to auto-match source accounts to your Chart of Accounts.
            Any unmatched accounts will go to the Mapping Workbench.
          </p>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{detected.preview_rows.length}+</p>
              <p className="text-xs text-blue-600 mt-1">Rows to import</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-700">Auto</p>
              <p className="text-xs text-green-600 mt-1">Exact account matches</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-yellow-700">?</p>
              <p className="text-xs text-yellow-600 mt-1">May need mapping</p>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-700">What happens next:</p>
            <ol className="space-y-1 text-xs text-gray-600 list-decimal list-inside">
              <li>File is uploaded and parsed into the import pipeline</li>
              <li>Accounts are auto-matched by number (exact), then name (fuzzy)</li>
              <li>Unmapped accounts go to the Mapping Workbench for manual resolution</li>
              <li>After mapping, run validation to check balance and data integrity</li>
              <li>Post the import to create a journal entry in the ledger</li>
            </ol>
          </div>

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(4)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => setStep(6)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
            >
              Review & Confirm <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Final confirmation */}
      {step === 6 && detected && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-800">Step 7 — Confirm and upload</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded">
                <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">File</p>
                  <p className="text-sm font-medium text-gray-800">{file?.name}</p>
                </div>
              </div>
              {selectedSheet && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded">
                  <Layers className="w-5 h-5 text-indigo-400 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Sheet</p>
                    <p className="text-sm font-medium text-gray-800">{selectedSheet}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded">
                <Table className="w-5 h-5 text-indigo-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Format detected</p>
                  <p className="text-sm font-medium text-gray-800 uppercase">{detected.source_format}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded">
                <Info className="w-5 h-5 text-indigo-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">As-of Date</p>
                  <p className="text-sm font-medium text-gray-800">{asOfDate}</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border border-gray-200 rounded space-y-2">
              <p className="text-xs font-semibold text-gray-700 mb-3">Column mapping summary</p>
              {STANDARD_FIELDS.map((f) => (
                <div key={f.key} className="flex justify-between items-center py-0.5">
                  <span className="text-xs text-gray-500">{f.label}</span>
                  {colMapping[f.key] ? (
                    <span className="text-xs font-mono text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                      {colMapping[f.key]}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(5)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              disabled={uploadMutation.isPending}
              onClick={() => uploadMutation.mutate(false)}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {uploadMutation.isPending
                ? 'Uploading…'
                : <><ArrowRight className="w-4 h-4" /> Upload &amp; Begin Import</>}
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
