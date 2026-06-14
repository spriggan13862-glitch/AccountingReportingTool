import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, ChevronRight, ChevronLeft, CheckCircle, AlertCircle,
  FileText, Download, Sparkles, RefreshCw
} from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { ScenarioSelect } from '@/components/ui/ScenarioSelect'
import { useOrg } from '@/providers/OrgProvider'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { useToast } from '@/providers/ToastProvider'
import { StepIndicator } from '@/components/import-wizard'
import { AccountingDataGrid } from '@/components/data-grid'
import type { WizardStep } from '@/components/import-wizard/types'
import type { SheetInfo } from '@/types'

const STEPS = [
  { label: 'Upload', desc: 'Select file and workspace context' },
  { label: 'Sheet', desc: 'Select workbook sheet' },
  { label: 'Column Mapping', desc: 'Verify ledger fields' },
  { label: 'Verify & Validate', desc: 'Check balances & net income' },
  { label: 'Post to Ledger', desc: 'Commit journal entry' },
]

export function TrialBalanceImportPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const { activeEntity } = useWorkspace()

  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [entityId, setEntityId] = useState<number | ''>(activeEntity?.id ?? '')
  const [asOfDate, setAsOfDate] = useState<string>('')
  const [scenarioId, setScenarioId] = useState<number>(1)
  
  const [detected, setDetected] = useState<any>(null)
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null)
  const [colMapping, setColMapping] = useState<Record<string, string>>({})
  
  const [batchId, setBatchId] = useState<number | null>(null)
  const [validationIssues, setValidationIssues] = useState<any[]>([])
  const [previewRows, setPreviewRows] = useState<any[]>([])
  
  const [jeNumber, setJeNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [apiError, setApiError] = useState<string | null>(null)

  const WIZARD_STEPS: WizardStep[] = STEPS.map((s, i) => {
    let status: 'pending' | 'active' | 'complete' | 'error' = 'pending'
    if (i === step) status = 'active'
    else if (i < step) status = 'complete'
    return { key: String(i), label: s.label, status }
  })

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
      if (result.sheets && result.sheets.length > 0) {
        setStep(1)
      } else {
        setStep(2)
      }
    },
    onError: (err: Error) => { setApiError(err.message) },
  })

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file || !entityId || !asOfDate) throw new Error('Entity and date are required')
      return tbImportApi.uploadBatch({
        entity_id: entityId as number,
        organization_id: orgId,
        as_of_date: asOfDate,
        scenario_id: scenarioId || 1,
        sheet_name: selectedSheet ?? undefined,
        file,
      })
    },
    onSuccess: (batch) => {
      setBatchId(batch.id)
      setJeNumber(`JE-TB-${batch.id}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`)
      setApiError(null)
      // Trigger validation immediately
      validateMutation.mutate(batch.id)
    },
    onError: (err: Error) => { setApiError(err.message) },
  })

  const validateMutation = useMutation({
    mutationFn: (id: number) => tbImportApi.validateBatch(id),
    onSuccess: (res, id) => {
      setValidationIssues([...(res.errors || []), ...(res.warnings || [])])
      // Load raw preview rows
      tbImportApi.getRawPreview(id, 100).then(preview => {
        setPreviewRows(preview.rows || [])
        setStep(3)
      })
    },
    onError: (err: Error) => { setApiError(err.message) },
  })

  const postMutation = useMutation({
    mutationFn: () => {
      if (!batchId || !jeNumber) throw new Error('Batch ID and JE number are required')
      return tbImportApi.postBatch(batchId, jeNumber, notes)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-batches', orgId] })
      toast('Trial balance successfully posted to general ledger', 'success')
      setStep(4)
    },
    onError: (err: Error) => { setApiError(err.message) },
  })

  function downloadTemplate() {
    const csv = [
      'Account Number,Account Name,Debit,Credit',
      '1010,Cash & Cash Equivalents,50000.00,',
      '1200,Accounts Receivable,12500.00,',
      '2000,Accounts Payable,,8500.00',
      '3000,Retained Earnings,,44000.00',
      '4000,Revenue,,25000.00',
      '5000,Expense,15000.00,',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'trial_balance_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageLayout
      title="Trial Balance Import"
      subtitle="Import period-end balances and map to taxonomy structure"
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

      <div className="mt-6 max-w-4xl mx-auto bg-white border border-gray-200 rounded-xl shadow-sm p-6" data-testid="tb-import-form">
        
        {/* Step 0: Upload */}
        {step === 0 && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Workspace Parameters</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EntitySelect
                value={entityId}
                onChange={(id) => setEntityId(id)}
                label="Entity"
                required
              />
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  As of Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <ScenarioSelect
              value={scenarioId}
              onChange={(id) => setScenarioId(typeof id === 'number' ? id : 1)}
              label="Data Category"
              organizationId={orgId || undefined}
            />

            <div className="border-t border-gray-100 pt-5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-semibold text-gray-700">Upload trial balance file (CSV/XLSX)</span>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="flex items-center gap-1 text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
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
                  if (dropped) setFile(dropped)
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
                    <p className="text-sm text-gray-650">Drag &amp; drop file, or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1.5">Supports standard accounting trial balance CSV or XLSX</p>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!file || !entityId || !asOfDate || detectMutation.isPending}
                onClick={() => detectMutation.mutate()}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-755 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors cursor-pointer"
              >
                {detectMutation.isPending ? 'Processing…' : 'Proceed to Sheet & Mapping'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Sheet Selection */}
        {step === 1 && detected && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Worksheet Selection</h3>
            <p className="text-xs text-gray-500">Multiple worksheets detected in this file. Select the sheet containing your trial balance.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {detected.sheets.map((sheet: SheetInfo) => (
                <div
                  key={sheet.name}
                  onClick={() => setSelectedSheet(sheet.name)}
                  className={`border p-4 rounded-lg cursor-pointer transition-all ${
                    selectedSheet === sheet.name
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 font-semibold ring-1 ring-indigo-600'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <FileText className="w-5 h-5 mx-auto mb-2 text-indigo-500" />
                  <p className="text-xs text-center font-medium truncate">{sheet.name}</p>
                  <p className="text-[10px] text-center text-gray-400 mt-0.5">{sheet.row_count} rows</p>
                  {sheet.likely_tb_score >= 5 && (
                    <p className="text-[10px] text-center text-emerald-600 font-semibold mt-0.5">Likely TB</p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between border-t border-gray-100 pt-5">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-650 text-xs font-semibold rounded hover:bg-gray-50 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="button"
                disabled={!selectedSheet}
                onClick={() => setStep(2)}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-755 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors cursor-pointer"
              >
                Next Step
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === 2 && detected && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Confirm Column Mapping</h3>
            <p className="text-xs text-gray-500">Ensure the import columns match standard ledger headers. Aliases are automatically resolved where possible.</p>
            
            <div className="space-y-3.5 max-w-xl">
              {[
                { key: 'account_number', label: 'Account Number', desc: 'Numeric or alphanumeric account code', required: true },
                { key: 'account_name', label: 'Account Name', desc: 'Account description text', required: false },
                { key: 'debit', label: 'Debit', desc: 'Debits list', required: false },
                { key: 'credit', label: 'Credit', desc: 'Credits list', required: false },
                { key: 'balance', label: 'Net Balance', desc: 'Signed balance (used if Debit/Credit not separated)', required: false },
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
                    {detected.headers.map((h: string) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex justify-between border-t border-gray-100 pt-5">
              <button
                type="button"
                onClick={() => setStep(detected.sheets.length > 0 ? 1 : 0)}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-650 text-xs font-semibold rounded hover:bg-gray-50 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="button"
                disabled={!colMapping['account_number'] || uploadMutation.isPending}
                onClick={() => uploadMutation.mutate()}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-755 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors cursor-pointer"
              >
                {uploadMutation.isPending ? 'Uploading…' : 'Process & Validate'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Verify & Validate */}
        {step === 3 && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Verification & Validation</h3>
            
            {/* Validation Alerts */}
            <div className="space-y-2.5">
              {validationIssues.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-emerald-800">All validations passed</p>
                    <p className="text-[10px] text-emerald-650 mt-0.5">Debit/credit amounts balance. No mapping errors or duplications detected.</p>
                  </div>
                </div>
              ) : (
                validationIssues.map((issue, idx) => {
                  const isErr = issue.severity === 'error'
                  return (
                    <div
                      key={idx}
                      className={`border rounded-lg p-3.5 flex items-start gap-3 ${
                        isErr ? 'bg-red-50/50 border-red-200 text-red-800' : 'bg-amber-50/50 border-amber-200 text-amber-800'
                      }`}
                    >
                      <AlertCircle className={`w-4.5 h-4.5 shrink-0 mt-0.5 ${isErr ? 'text-red-500' : 'text-amber-500'}`} />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-[9px] mb-0.5">
                          {issue.severity} — {issue.code}
                        </p>
                        <p className="text-xs leading-relaxed">{issue.message}</p>
                        {issue.suggested_resolution && (
                          <p className="text-[10px] opacity-75 mt-1 font-medium">Suggestion: {issue.suggested_resolution}</p>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* AccountingDataGrid Preview */}
            <div className="border border-gray-250 rounded-lg overflow-hidden h-72">
              <AccountingDataGrid
                columns={[
                  { key: 'account_number', header: 'Account Number', render: (r) => <span className="font-semibold text-gray-800">{r.account_number}</span> },
                  { key: 'account_name', header: 'Account Name', render: (r) => <span className="text-gray-600 font-medium">{r.account_name}</span> },
                  { key: 'debit', header: 'Debit', render: (r) => r.debit ? `$${parseFloat(r.debit).toLocaleString(undefined, {minimumFractionDigits:2})}` : '—' },
                  { key: 'credit', header: 'Credit', render: (r) => r.credit ? `$${parseFloat(r.credit).toLocaleString(undefined, {minimumFractionDigits:2})}` : '—' },
                ]}
                rowKey={(r) => r.account_number ?? String(Math.random())}
                data={previewRows}
                emptyMessage="No rows found in this preview."
              />
            </div>

            <div className="flex justify-between border-t border-gray-100 pt-5">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-655 text-xs font-semibold rounded hover:bg-gray-50 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back to Mapping
              </button>
              
              <button
                type="button"
                onClick={() => setStep(4)}
                disabled={validationIssues.some(i => i.severity === 'error')}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-755 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors cursor-pointer animate-pulse-subtle"
              >
                Next: Post to Ledger
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Post & Finalize */}
        {step === 4 && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Commit & Post to Ledger</h3>
            <p className="text-xs text-gray-500">Upon posting, a balanced journal entry will be recorded in the general ledger for the selected accounting period.</p>
            
            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Journal Entry Number</label>
                <input
                  type="text"
                  value={jeNumber}
                  onChange={(e) => setJeNumber(e.target.value)}
                  className="w-full border border-gray-300 rounded h-9 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-semibold"
                  placeholder="JE-TB-001"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes / Description</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded p-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Establish starting balances for Period..."
                />
              </div>
            </div>

            <div className="flex justify-between border-t border-gray-100 pt-5">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-655 text-xs font-semibold rounded hover:bg-gray-50 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back to Verification
              </button>
              
              <button
                type="button"
                disabled={!jeNumber || postMutation.isPending}
                onClick={() => postMutation.mutate()}
                className="flex items-center gap-1 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-755 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors shadow shadow-indigo-200 cursor-pointer"
              >
                {postMutation.isPending ? 'Posting…' : 'Post to Ledger'}
              </button>
            </div>
          </div>
        )}

      </div>
    </PageLayout>
  )
}
