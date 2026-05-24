import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronRight,
  HelpCircle,
  FileText,
  Building2,
  ArrowRight,
  Download
} from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import { entitiesApi } from '@/api/entities'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { useOrg } from '@/providers/OrgProvider'
import { useToast } from '@/providers/ToastProvider'
import { AccountingDataGrid } from '@/components/data-grid'
import type { ImportBatch, ImportBatchStatus } from '@/types'

function statusBadge(status: ImportBatchStatus) {
  const map: Record<ImportBatchStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    uploaded:         { label: 'Uploaded',         cls: 'bg-gray-100 border-gray-200 text-gray-700',   icon: <Clock className="w-3 h-3" /> },
    parsing:          { label: 'Parsing',           cls: 'bg-blue-50 border-blue-200 text-blue-700',   icon: <Clock className="w-3 h-3 animate-spin" /> },
    mapping_required: { label: 'Mapping Required',  cls: 'bg-amber-50 border-amber-200 text-amber-800', icon: <AlertCircle className="w-3 h-3" /> },
    validating:       { label: 'Validating',        cls: 'bg-blue-50 border-blue-200 text-blue-700',   icon: <Clock className="w-3 h-3 animate-spin" /> },
    validation_failed:{ label: 'Validation Failed', cls: 'bg-red-50 border-red-200 text-red-700',     icon: <XCircle className="w-3 h-3" /> },
    ready_to_post:    { label: 'Ready to Post',     cls: 'bg-green-50 border-green-200 text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
    posted:           { label: 'Posted',            cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
    rolled_back:      { label: 'Rolled Back',       cls: 'bg-orange-50 border-orange-200 text-orange-700', icon: <XCircle className="w-3 h-3" /> },
    rejected:         { label: 'Rejected',          cls: 'bg-red-50 border-red-200 text-red-700',     icon: <XCircle className="w-3 h-3" /> },
  }
  const { label, cls, icon } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600', icon: null }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold ${cls}`}>
      {icon}
      {label}
    </span>
  )
}

export function ImportCenterPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const [showFormatHelp, setShowFormatHelp] = useState(false)

  const [entityId, setEntityId] = useState<number | ''>('')
  const [asOfDate, setAsOfDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  // Current active configuration card view (defaults to Trial Balance)
  const [activeTab, setActiveTab] = useState<'tb' | 'gl'>('tb')

  const { data: batches, isLoading } = useQuery({
    queryKey: ['import-batches', orgId],
    queryFn: () => tbImportApi.listBatches(orgId),
    enabled: !!orgId,
  })

  const { data: entityData } = useQuery({
    queryKey: ['entities'],
    queryFn: () => entitiesApi.list(),
    enabled: !!orgId,
  })
  const entityCount = entityData?.length ?? 0

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file || !entityId || !asOfDate) throw new Error('All fields required')
      return tbImportApi.uploadBatch({
        entity_id: entityId as number,
        organization_id: orgId,
        as_of_date: asOfDate,
        file,
      })
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: ['import-batches', orgId] })
      setFile(null)
      setApiError(null)
      toast(`Import uploaded: ${file?.name ?? 'file'} — review and map accounts to continue`, 'success')
      navigate(`/import/${batch.id}`)
    },
    onError: (err: Error) => { setApiError(err.message); toast(err.message, 'error') },
  })

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  // Aggregate statistics for Mapping Summary Card
  const latestBatch = batches && batches.length > 0 ? batches[0] : null
  const mappingProgress = latestBatch
    ? latestBatch.row_count
      ? Math.round((((latestBatch.row_count - (latestBatch.unmapped_row_count ?? 0)) / latestBatch.row_count) * 100))
      : 0
    : 0

  // Dynamically collect active validation issues from current batches
  const activeIssues = batches
    ? batches
        .filter((b) => b.status === 'validation_failed' || (b.unmapped_row_count ?? 0) > 0)
        .map((b) => {
          if (b.status === 'validation_failed') {
            return {
              id: `err-${b.id}`,
              type: 'error' as const,
              category: 'Validation Failed',
              message: b.error_message || 'Verification checks failed for this trial balance.',
              filename: b.filename,
              batchId: b.id,
              affectedItems: b.row_count ?? 0,
            }
          } else {
            return {
              id: `warn-${b.id}`,
              type: 'warning' as const,
              category: 'Unmapped Accounts',
              message: `${b.unmapped_row_count} accounts require mapping to taxonomy lines.`,
              filename: b.filename,
              batchId: b.id,
              affectedItems: b.unmapped_row_count ?? 0,
            }
          }
        })
    : []

  return (
    <PageLayout
      title="Import Center"
      subtitle="Upload and manage your financial data imports across all formats"
      actions={
        <button
          type="button"
          onClick={() => navigate('/import/new')}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Upload className="w-4 h-4" /> New Import Wizard
        </button>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Entity-first enforcement */}
      {entityCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 flex items-start gap-3 shadow-sm">
          <Building2 className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Create an entity first</p>
            <p className="text-xs text-amber-700 mt-1">
              Imports are associated with entities. You need at least one entity before uploading trial balance data.
            </p>
            <button
              type="button"
              onClick={() => navigate('/entities')}
              className="mt-2 flex items-center gap-1 text-xs text-amber-700 underline font-medium hover:text-amber-900"
            >
              Go to Entities <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Modern dashed Upload Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Trial Balance Card */}
        <div
          onClick={() => setActiveTab('tb')}
          className={`border rounded-lg p-5 text-center cursor-pointer transition-all duration-200 ${
            activeTab === 'tb'
              ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-600'
              : 'border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          <div className="mx-auto mb-3 rounded-lg bg-indigo-100 p-2.5 w-11 h-11 flex items-center justify-center text-indigo-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">Trial Balance</h3>
          <p className="text-[10px] text-gray-400 mt-1">CSV, XLSX</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">CSV</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">XLSX</span>
          </div>
        </div>

        {/* General Ledger Card */}
        <div
          onClick={() => setActiveTab('gl')}
          className={`border rounded-lg p-5 text-center cursor-pointer transition-all duration-200 ${
            activeTab === 'gl'
              ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-600'
              : 'border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          <div className="mx-auto mb-3 rounded-lg bg-emerald-100 p-2.5 w-11 h-11 flex items-center justify-center text-emerald-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">General Ledger</h3>
          <p className="text-[10px] text-gray-400 mt-1">CSV, XLSX</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">CSV</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">XLSX</span>
          </div>
        </div>

        {/* Chart of Accounts Card */}
        <div
          onClick={() => navigate('/coa-import')}
          className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-indigo-600 hover:bg-indigo-50/10 transition-all duration-200"
        >
          <div className="mx-auto mb-3 rounded-lg bg-blue-100 p-2.5 w-11 h-11 flex items-center justify-center text-blue-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">Chart of Accounts</h3>
          <p className="text-[10px] text-gray-400 mt-1">QuickBooks, CSV</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">QB</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">CSV</span>
          </div>
        </div>

        {/* PDF Card */}
        <div
          onClick={() => navigate('/pdf-import')}
          className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-indigo-600 hover:bg-indigo-50/10 transition-all duration-200"
        >
          <div className="mx-auto mb-3 rounded-lg bg-orange-100 p-2.5 w-11 h-11 flex items-center justify-center text-orange-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">PDF Import</h3>
          <p className="text-[10px] text-gray-400 mt-1">AI-Powered Parser</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">PDF</span>
          </div>
        </div>

        {/* Excel / CSV Card */}
        <div
          onClick={() => navigate('/import/new')}
          className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-indigo-600 hover:bg-indigo-50/10 transition-all duration-200"
        >
          <div className="mx-auto mb-3 rounded-lg bg-purple-100 p-2.5 w-11 h-11 flex items-center justify-center text-purple-600">
            <Upload className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">Excel / CSV</h3>
          <p className="text-[10px] text-gray-400 mt-1">Generic Wizard</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">XLSX</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">CSV</span>
          </div>
        </div>
      </div>

      {/* Two-Column split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Form/Placeholder & History Grid */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Quick upload form inline (if Trial Balance selected) */}
          {activeTab === 'tb' && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">Quick Upload — Trial Balance</h2>
              <p className="text-xs text-gray-500 mb-4">
                For guided step-by-step import with sheet selection and column mapping, use the{' '}
                <button type="button" onClick={() => navigate('/import/new')} className="text-indigo-600 font-semibold hover:underline">
                  Import Wizard
                </button>
                .
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Entity</label>
                  <EntitySelect value={entityId} onChange={setEntityId} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">As-of Date</label>
                  <input
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Format guidance toggle */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setShowFormatHelp((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-800"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  {showFormatHelp ? 'Hide format guidance' : 'Show accepted formats & tips'}
                </button>
                {showFormatHelp && (
                  <div className="mt-2 p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs text-indigo-900 space-y-3">
                    <p className="font-semibold text-indigo-950">Accepted file formats:</p>
                    <ul className="space-y-1 list-disc list-inside text-indigo-800">
                      <li><strong>CSV/XLSX</strong> — account number, account name, and debit/credit or signed-amount columns</li>
                      <li><strong>QuickBooks (.QBO)</strong> — QBO transaction export</li>
                      <li><strong>NetSuite</strong> — GL detail export with "Account" and "Amount" columns</li>
                      <li><strong>Sage</strong> — trial balance export</li>
                    </ul>

                    <p className="font-semibold text-indigo-950">Common column name patterns (auto-detected):</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-white border border-indigo-100 p-2.5 rounded font-mono text-[10px] text-indigo-700">
                      <span>Account #, Acct, Number → account number</span>
                      <span>Name, Description → account name</span>
                      <span>Debit, Dr → debit amount</span>
                      <span>Credit, Cr → credit amount</span>
                      <span>Balance, Amount, Net → signed net balance</span>
                      <span>"1000 - Cash" → combined number/name</span>
                    </div>

                    <div>
                      <p className="font-semibold text-indigo-950 mb-1.5">Download starter templates:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                          { label: 'Format A — Debit/Credit', filename: 'template_debit_credit.csv',
                            content: 'Account Number,Account Name,Debit,Credit\n1000,Cash,50000.00,0.00\n4000,Revenue,0.00,50000.00\n' },
                          { label: 'Format B — Signed Amount', filename: 'template_signed_amount.csv',
                            content: 'Account Number,Account Name,Amount\n1000,Cash,50000.00\n4000,Revenue,-50000.00\n' },
                          { label: 'Format C — Combined Account', filename: 'template_combined.csv',
                            content: 'Account,Debit,Credit\n1000 - Cash,50000.00,0.00\n4000 - Revenue,0.00,50000.00\n' },
                          { label: 'Format D — Mapping Template', filename: 'template_mapping.csv',
                            content: 'Source Account Number,Source Account Name,Internal Account Number,Internal Account Name,Account Type,Detail Type,Reporting Line\n1000,Cash,1000,Cash,asset,current_asset,Current Assets\n4000,Revenue,4000,Revenue,revenue,operating_revenue,Revenue\n' },
                        ].map(({ label, filename, content }) => (
                          <button
                            key={filename}
                            type="button"
                            onClick={() => {
                              const blob = new Blob([content], { type: 'text/csv' })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = filename
                              a.click()
                              URL.revokeObjectURL(url)
                            }}
                            className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-indigo-200 rounded text-indigo-700 hover:bg-indigo-100 font-semibold transition-colors"
                          >
                            <Download className="w-3.5 h-3.5 flex-shrink-0" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
                  dragOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                {file ? (
                  <p className="text-sm font-semibold text-gray-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">Drag &amp; drop a CSV or XLSX file, or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">Supports CSV, XLSX, QBO, NetSuite, Sage exports</p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  disabled={!file || !entityId || !asOfDate || uploadMutation.isPending}
                  onClick={() => uploadMutation.mutate()}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {uploadMutation.isPending ? 'Uploading…' : 'Upload & Begin Review'}
                </button>
              </div>
            </div>
          )}

          {/* General Ledger Placeholder inline (if GL selected) */}
          {activeTab === 'gl' && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-emerald-100 p-2.5 text-emerald-600">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-gray-800 mb-1">General Ledger Import</h2>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                    Sync full transaction journals directly from your general ledger. Direct ERP API synchronization
                    (NetSuite, QuickBooks Online, Sage Intacct) is currently in closed preview.
                  </p>
                  
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
                    <p className="text-xs text-gray-600 font-semibold">Alternative Manual Mechanics:</p>
                    <ul className="text-xs text-gray-500 list-disc list-inside space-y-1">
                      <li>Use the <button type="button" onClick={() => navigate('/journal-entries/new')} className="text-indigo-600 font-semibold hover:underline">Journal Entries</button> ledger modules to create manual journals.</li>
                      <li>Import a Trial Balance using the left card above to establish period-end balances.</li>
                      <li>Contact <span className="font-mono text-[10px] bg-white border px-1.5 py-0.5 rounded text-gray-700">ledger-support@livemarketing.test</span> to request API access.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Import History Table card */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Import History</h2>
            </div>
            
            <AccountingDataGrid
              columns={[
                {
                  key: 'filename',
                  header: 'File Name',
                  sortable: true,
                  sortValue: (b) => b.filename,
                  render: (b) => (
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="font-semibold text-gray-900 truncate max-w-[200px]">{b.filename}</span>
                    </div>
                  ),
                },
                {
                  key: 'type',
                  header: 'Type',
                  sortable: true,
                  sortValue: () => 'Trial Balance',
                  render: () => <span className="text-xs text-gray-500 font-medium">Trial Balance</span>,
                },
                {
                  key: 'as_of_date',
                  header: 'Period',
                  sortable: true,
                  sortValue: (b) => b.as_of_date,
                  render: (b) => <span className="text-gray-600">{b.as_of_date}</span>,
                },
                {
                  key: 'row_count',
                  header: 'Rows',
                  sortable: true,
                  sortValue: (b) => b.row_count ?? 0,
                  render: (b) => (
                    <span className="text-gray-600 font-medium">
                      {b.row_count ?? '—'}
                      {b.unmapped_row_count ? (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded">
                          {b.unmapped_row_count} unmapped
                        </span>
                      ) : null}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  sortable: true,
                  sortValue: (b) => b.status,
                  render: (b) => statusBadge(b.status),
                },
                {
                  key: 'uploaded_at',
                  header: 'Uploaded',
                  sortable: true,
                  sortValue: (b) => b.uploaded_at,
                  render: (b) => <span className="text-gray-500">{new Date(b.uploaded_at).toLocaleDateString()}</span>,
                },
              ]}
              data={batches ?? []}
              rowKey={(b) => b.id}
              onRowClick={(b) => navigate(`/import/${b.id}`)}
              rowActions={[
                {
                  key: 'view',
                  label: 'Open Import Details',
                  icon: ChevronRight,
                  onClick: (b) => navigate(`/import/${b.id}`),
                },
              ]}
              exportFilename="trial_balance_imports"
              loading={isLoading}
              emptyMessage="No trial balance imports found."
              data-testid="import-history-grid"
            />
          </div>
        </div>

        {/* Right Column: Summaries Panel */}
        <div className="space-y-6">
          
          {/* Mapping Status Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Mapping Status Summary</h3>
            <p className="text-xs text-gray-500 mb-4">Account classification progress for recent imports</p>

            {latestBatch ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">Staged accounts</span>
                  <span className="font-semibold text-gray-800">{latestBatch.row_count ?? 0}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">Mapped accounts</span>
                  <span className="font-semibold text-green-600">
                    {(latestBatch.row_count ?? 0) - (latestBatch.unmapped_row_count ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">Unmapped accounts</span>
                  <span className={`font-semibold ${latestBatch.unmapped_row_count ? 'text-amber-600' : 'text-gray-500'}`}>
                    {latestBatch.unmapped_row_count ?? 0}
                  </span>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${mappingProgress}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between items-center mt-1.5 text-[10px] text-gray-400">
                    <span>{mappingProgress}% Complete</span>
                    <span>100% Target</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/import/${latestBatch.id}`)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-semibold rounded hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    Review Latest Import <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed rounded-lg">
                <p className="text-xs text-gray-400">No active imports staged.</p>
              </div>
            )}
          </div>

          {/* Validation Issues Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Validation Summary</h3>
            <p className="text-xs text-gray-500 mb-4">Warnings & errors from recent imports</p>

            {activeIssues.length > 0 ? (
              <div className="space-y-3">
                {activeIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`flex items-start gap-3 rounded-lg p-3 ${
                      issue.type === 'error' ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'
                    }`}
                  >
                    {issue.type === 'error' ? (
                      <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${issue.type === 'error' ? 'text-red-800' : 'text-amber-800'}`}>
                          {issue.category}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-white border font-medium text-gray-500">
                          {issue.affectedItems} items
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-700 mt-1 font-semibold truncate">{issue.filename}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-normal">{issue.message}</p>
                      <button
                        type="button"
                        onClick={() => navigate(`/import/${issue.batchId}`)}
                        className="mt-2 text-[10px] text-indigo-600 font-semibold hover:underline flex items-center gap-0.5"
                      >
                        Resolve Issues <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-green-50/50 border border-dashed border-green-200 rounded-lg">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-xs font-semibold text-green-800">All Imports Validated</p>
                <p className="text-[10px] text-green-600 mt-1">No outstanding warnings or balance issues.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </PageLayout>
  )
}

