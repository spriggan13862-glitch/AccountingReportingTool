import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Upload, ChevronRight, ChevronLeft, CheckCircle, AlertCircle,
  FileText, Download
} from 'lucide-react'
import { journalEntriesApi } from '@/api/journalEntries'
import { periodsApi } from '@/api/periods'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { PeriodSelect } from '@/components/ui/PeriodSelect'
import { ScenarioSelect } from '@/components/ui/ScenarioSelect'
import { useOrg } from '@/providers/OrgProvider'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { useToast } from '@/providers/ToastProvider'
import { StepIndicator } from '@/components/import-wizard'
import { AccountingDataGrid } from '@/components/data-grid'
import type { WizardStep } from '@/components/import-wizard/types'
import type { AccountingPeriod } from '@/types'

const STEPS = [
  { label: 'Upload & Config', desc: 'Upload CSV & set parameters' },
  { label: 'Column Mapping', desc: 'Map columns to journal fields' },
  { label: 'Verify & Preview', desc: 'Inspect transaction detail & balance' },
  { label: 'Finalize', desc: 'Import to general ledger' },
]

export function JournalEntryImportPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const { activeEntity } = useWorkspace()

  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [entityId, setEntityId] = useState<number | ''>(activeEntity?.id ?? '')
  const [periodId, setPeriodId] = useState<number | ''>('')
  const [asOfDate, setAsOfDate] = useState<string>('')

  const [fileHeaders, setFileHeaders] = useState<string[]>([])
  const [colMapping, setColMapping] = useState<Record<string, string>>({})

  const [groupedTransactions, setGroupedTransactions] = useState<any[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const [scenarioId, setScenarioId] = useState<number | ''>('')
  const [overlayGroup, setOverlayGroup] = useState<string>('audit_adjustment')
  const [isReversing, setIsReversing] = useState<boolean>(false)

  const [apiError, setApiError] = useState<string | null>(null)

  // Fetch periods to derive as_of_date from selected period's end_date
  const { data: periods = [] } = useQuery<AccountingPeriod[]>({
    queryKey: ['periods-list', entityId],
    queryFn: () => periodsApi.list(entityId as number),
    enabled: !!entityId,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (periodId) {
      const p = periods.find((p) => p.id === periodId)
      if (p) setAsOfDate(p.end_date)
    }
  }, [periodId, periods])

  const WIZARD_STEPS: WizardStep[] = STEPS.map((s, i) => {
    let status: 'pending' | 'active' | 'complete' | 'error' = 'pending'
    if (i === step) status = 'active'
    else if (i < step) status = 'complete'
    return { key: String(i), label: s.label, status }
  })

  const handleFileChange = (selectedFile: File) => {
    setFile(selectedFile)
    setApiError(null)
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (!text) return
      
      const lines = text.split(/\r?\n/)
      if (lines.length === 0) return
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
      setFileHeaders(headers)
      
      // Auto mapping
      const mapping: Record<string, string> = {}
      headers.forEach(h => {
        const norm = h.toLowerCase().replace(/[-_#]/g, ' ').trim()
        if (norm.includes('number') || norm.includes('je') || norm.includes('id')) {
          mapping['je_number'] = h
        } else if (norm.includes('date')) {
          mapping['entry_date'] = h
        } else if (norm.includes('desc') || norm.includes('memo') || norm.includes('notes')) {
          mapping['description'] = h
        } else if (norm.includes('acct') || norm.includes('account')) {
          mapping['account_number'] = h
        } else if (norm.includes('debit') || norm.includes('dr')) {
          mapping['debit'] = h
        } else if (norm.includes('credit') || norm.includes('cr')) {
          mapping['credit'] = h
        }
      })
      setColMapping(mapping)
    }
    reader.readAsText(selectedFile)
  }

  const processColumnsAndProceed = () => {
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (!text) return
      
      const lines = text.split(/\r?\n/)
      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
      
      const parsedRows: any[] = []
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        
        const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => {
          row[h] = cols[idx] || ''
        })
        parsedRows.push(row)
      }
      
      // Group rows by JE number or date+description
      const groups: Record<string, any[]> = {}
      const errors: string[] = []
      
      parsedRows.forEach((row, idx) => {
        const jeNum = row[colMapping['je_number']]?.trim() || ''
        const dateStr = row[colMapping['entry_date']]?.trim() || ''
        const desc = row[colMapping['description']]?.trim() || ''
        const acctNum = row[colMapping['account_number']]?.trim() || ''
        const debitStr = row[colMapping['debit']]?.trim() || '0'
        const creditStr = row[colMapping['credit']]?.trim() || '0'
        
        const groupKey = jeNum || `${dateStr}::${desc}`
        if (!groupKey || groupKey === '::') {
          errors.push(`Row ${idx + 2}: Missing grouping identifiers (je_number or entry_date + description).`)
          return
        }
        
        const dr = parseFloat(debitStr) || 0
        const cr = parseFloat(creditStr) || 0
        
        if (!groups[groupKey]) {
          groups[groupKey] = []
        }
        groups[groupKey].push({
          je_number: jeNum,
          entry_date: dateStr,
          description: desc,
          account_number: acctNum,
          debit: dr,
          credit: cr
        })
      })
      
      // Validate groupings and debits/credits tie checks
      const transactions = Object.entries(groups).map(([key, items]) => {
        const totalDr = items.reduce((sum, item) => sum + item.debit, 0)
        const totalCr = items.reduce((sum, item) => sum + item.credit, 0)
        const diff = Math.abs(totalDr - totalCr)
        const isUnbalanced = diff > 0.01
        
        if (isUnbalanced) {
          errors.push(`Journal Entry '${key}': Out of balance (Debits: $${totalDr.toFixed(2)} vs Credits: $${totalCr.toFixed(2)}). Diff: $${diff.toFixed(2)}.`)
        }
        
        return {
          key,
          je_number: items[0].je_number || `IMP-${key.slice(0, 8)}`,
          entry_date: items[0].entry_date,
          description: items[0].description || 'Imported Journal Entry',
          total_debits: totalDr,
          total_credits: totalCr,
          line_count: items.length,
          is_unbalanced: isUnbalanced,
          lines: items
        }
      })
      
      setGroupedTransactions(transactions)
      setValidationErrors(errors)
      setStep(2)
    }
    reader.readAsText(file)
  }

  const importMutation = useMutation({
    mutationFn: () => {
      if (!file || !entityId) throw new Error('Entity selection is required')
      return journalEntriesApi.importCsv(
        entityId as number,
        file,
        scenarioId !== '' ? scenarioId : undefined,
        overlayGroup || undefined,
        isReversing
      )
    },
    onSuccess: (res) => {
      toast(res.message || 'Journal CSV successfully imported', 'success')
      setStep(3)
    },
    onError: (err: Error) => { setApiError(err.message) },
  })

  function downloadTemplate() {
    const csv = [
      'je_number,entry_date,description,account_number,debit,credit',
      'ADJ-001,2025-01-31,Adjust depreciation expense,5100,2400.00,0.00',
      'ADJ-001,2025-01-31,Adjust depreciation expense,1600,0.00,2400.00',
      'ADJ-002,2025-01-31,Reclassify cash transaction,1020,850.00,0.00',
      'ADJ-002,2025-01-31,Reclassify cash transaction,1010,0.00,850.00',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'journal_entry_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageLayout
      title="Journal Entries Import"
      subtitle="Import batch manual journal adjustments into the ledger"
      actions={
        <button
          type="button"
          onClick={() => navigate('/import')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="w-4 h-4" /> Cancel
        </button>
      }
    >
      <StepIndicator steps={WIZARD_STEPS} currentStep={step} onStepClick={(idx) => {
        if (idx < step) setStep(idx)
      }} />

      {apiError && <ErrorBanner message={apiError} />}

      <div className="mt-6 max-w-4xl mx-auto bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        
        {/* Step 0: Upload & Config */}
        {step === 0 && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Workspace & Parameter Configuration</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EntitySelect
                value={entityId}
                onChange={(id) => { setEntityId(id); setPeriodId('') }}
                label="Entity"
                required
              />
              <PeriodSelect
                entityId={entityId}
                value={periodId}
                onChange={(id) => setPeriodId(id)}
                label="Period (auto-fills date below)"
                required={false}
              />
              <ScenarioSelect
                value={scenarioId}
                onChange={setScenarioId}
                label="Adjustment Scenario"
                organizationId={orgId || undefined}
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Adjustment Category / Overlay Group</label>
                <input
                  type="text"
                  value={overlayGroup}
                  onChange={(e) => setOverlayGroup(e.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. audit_adjustment, tax_entry, reclass"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                As of Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => { setAsOfDate(e.target.value); setPeriodId('') }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Select a period above to auto-fill, or enter any date directly. No pre-configured period required.
              </p>
            </div>

            <div className="flex items-start gap-2 pt-2 border-t border-gray-50 mt-4">
              <input
                type="checkbox"
                id="isReversing"
                checked={isReversing}
                onChange={(e) => setIsReversing(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-650 focus:ring-indigo-500 border-gray-300 mt-0.5"
              />
              <div>
                <label htmlFor="isReversing" className="block text-xs font-bold text-gray-700 cursor-pointer">
                  Schedule Reversing Entries
                </label>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Swaps debits and credits on every journal entry row, establishing a negative offsets journal dated the first of the next month.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-semibold text-gray-700">Upload Adjusting Journal Entries File (CSV)</span>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="flex items-center gap-1 text-xs text-indigo-655 font-bold hover:underline cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Download Template
                </button>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const dropped = e.dataTransfer.files[0]
                  if (dropped) handleFileChange(dropped)
                }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all duration-200 ${
                  dragOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50/50'
                }`}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                {file ? (
                  <div>
                    <p className="text-sm font-semibold text-gray-750">{file.name}</p>
                    <p className="text-xs text-gray-450 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-650">Drag &amp; drop journal adjustment CSV, or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1.5 font-medium">Headers should include: je_number, entry_date, account_number, debit, credit</p>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    if (f) handleFileChange(f)
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!file || !entityId || !periodId}
                onClick={() => setStep(1)}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-650 hover:bg-indigo-755 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors cursor-pointer"
              >
                Proceed to Mapping
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Column Mapping */}
        {step === 1 && file && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Journal Header Mapping</h3>
            <p className="text-xs text-gray-500">Confirm schema bindings before parsing transaction lines.</p>
            
            <div className="space-y-3.5 max-w-xl">
              {[
                { key: 'je_number', label: 'Journal Entry Code', desc: 'Identifier for grouping (e.g. ADJ-001)', required: false },
                { key: 'entry_date', label: 'Posting Date', desc: 'Date of entry (YYYY-MM-DD)', required: true },
                { key: 'description', label: 'Memo Description', desc: 'Explanation notes for adjustment line', required: false },
                { key: 'account_number', label: 'Account Number', desc: 'GL account number', required: true },
                { key: 'debit', label: 'Debit', desc: 'Debit Amount', required: true },
                { key: 'credit', label: 'Credit', desc: 'Credit Amount', required: true },
              ].map(({ key, label, desc, required }) => (
                <div key={key} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center border-b border-gray-50 pb-3">
                  <div>
                    <span className="text-xs font-bold text-gray-700 flex items-center gap-1">
                      {label} {required && <span className="text-red-500">*</span>}
                    </span>
                    <p className="text-[10px] text-gray-400">{desc}</p>
                  </div>
                  <select
                    value={colMapping[key] ?? ''}
                    onChange={(e) => setColMapping(prev => ({ ...prev, [key]: e.target.value }))}
                    className="h-8.5 rounded border border-gray-300 px-3 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">— Select Source Column —</option>
                    {fileHeaders.map((h: string) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex justify-between border-t border-gray-100 pt-5">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-655 text-xs font-semibold rounded hover:bg-gray-50 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="button"
                disabled={!colMapping['entry_date'] || !colMapping['account_number'] || !colMapping['debit'] || !colMapping['credit']}
                onClick={processColumnsAndProceed}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-650 hover:bg-indigo-755 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors cursor-pointer"
              >
                Group & Preview
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Transaction Preview & Grouping */}
        {step === 2 && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Adjustments Verification</h3>
            
            {/* Validation Alerts */}
            {validationErrors.length > 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-red-800 font-bold text-xs">
                  <AlertCircle className="w-4.5 h-4.5 text-red-500 shrink-0" />
                  <span>Validation check failed ({validationErrors.length} issues)</span>
                </div>
                <ul className="text-xs text-red-750 list-disc list-inside space-y-1 pl-1">
                  {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-250 rounded-lg p-3.5 flex items-center gap-2.5">
                <CheckCircle className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                <span className="text-xs font-semibold text-emerald-800">All journal entries are balanced and ready to post.</span>
              </div>
            )}

            <div className="border border-gray-250 rounded-lg overflow-hidden h-72">
              <AccountingDataGrid
                columns={[
                  { key: 'je_number', header: 'JE Code', render: (r) => <span className="font-semibold text-gray-800">{r.je_number}</span> },
                  { key: 'entry_date', header: 'Posting Date', render: (r) => <span className="text-gray-500 font-medium">{r.entry_date}</span> },
                  { key: 'description', header: 'Memo Description', render: (r) => <span className="text-gray-600 truncate max-w-[200px] block">{r.description}</span> },
                  { key: 'line_count', header: 'Lines', render: (r) => <span className="text-slate-500 font-semibold">{r.line_count}</span> },
                  { key: 'total_debits', header: 'Debits Sum', render: (r) => `$${r.total_debits.toLocaleString(undefined, {minimumFractionDigits: 2})}` },
                  { key: 'total_credits', header: 'Credits Sum', render: (r) => `$${r.total_credits.toLocaleString(undefined, {minimumFractionDigits: 2})}` },
                  { key: 'status', header: 'Audit Status', render: (r) => r.is_unbalanced ? <span className="text-rose-600 font-semibold">Unbalanced</span> : <span className="text-emerald-600 font-semibold">Balanced</span> },
                ]}
                rowKey={(r) => r.je_number}
                data={groupedTransactions}
                emptyMessage="No grouped transactions found."
              />
            </div>

            <div className="flex justify-between border-t border-gray-100 pt-5">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-655 text-xs font-semibold rounded hover:bg-gray-50 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back to Mapping
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={validationErrors.length > 0}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-650 hover:bg-indigo-755 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors cursor-pointer"
              >
                Next: Finalize Import
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Finalize */}
        {step === 3 && (
          <div className="space-y-6 text-center py-6">
            <div className="mx-auto w-12 h-12 bg-indigo-50 text-indigo-650 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 animate-pulse" />
            </div>
            
            <h3 className="text-sm font-bold text-gray-800">Final Confirmation</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed mt-1">
              You are about to import <span className="font-semibold text-gray-700">{groupedTransactions.length} journal entries</span> totaling <span className="font-semibold text-gray-700">${groupedTransactions.reduce((sum, t) => sum + t.total_debits, 0).toLocaleString(undefined, {minimumFractionDigits:2})}</span> into the ledger database.
            </p>

            {isReversing && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-w-md mx-auto text-xs text-amber-800 text-left mt-3">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  Automatic reversing entries enabled
                </p>
                <p className="text-[10px] text-amber-700 mt-0.5">
                  Reversal offset postings will be scheduled and created for the 1st of the next month.
                </p>
              </div>
            )}

            <div className="flex justify-center gap-3 border-t border-gray-100 pt-6 mt-6">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-655 text-xs font-semibold rounded hover:bg-gray-50 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              
              <button
                type="button"
                disabled={importMutation.isPending || scenarioId === ''}
                title={scenarioId === '' ? 'Select a scenario before importing' : undefined}
                onClick={() => importMutation.mutate()}
                className="flex items-center gap-1 px-5 py-2 bg-indigo-650 hover:bg-indigo-755 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors shadow shadow-indigo-150 cursor-pointer"
              >
                {importMutation.isPending ? 'Processing…' : 'Import & Commit'}
              </button>
            </div>
          </div>
        )}

      </div>
    </PageLayout>
  )
}
