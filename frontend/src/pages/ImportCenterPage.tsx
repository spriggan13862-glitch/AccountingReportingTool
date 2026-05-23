import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Clock, CheckCircle, AlertCircle, XCircle, ChevronRight, HelpCircle, FileText, Building2, ArrowRight, Download } from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import { entitiesApi } from '@/api/entities'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { useOrg } from '@/providers/OrgProvider'
import { useToast } from '@/providers/ToastProvider'
import { AccountingDataGrid } from '@/components/data-grid'
import type { GridColumn, RowAction } from '@/components/data-grid'
import type { ImportBatch, ImportBatchStatus } from '@/types'

function statusBadge(status: ImportBatchStatus) {
  const map: Record<ImportBatchStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    uploaded:         { label: 'Uploaded',         cls: 'bg-gray-100 text-gray-700',   icon: <Clock className="w-3 h-3" /> },
    parsing:          { label: 'Parsing',           cls: 'bg-blue-100 text-blue-700',   icon: <Clock className="w-3 h-3" /> },
    mapping_required: { label: 'Mapping Required',  cls: 'bg-yellow-100 text-yellow-800', icon: <AlertCircle className="w-3 h-3" /> },
    validating:       { label: 'Validating',        cls: 'bg-blue-100 text-blue-700',   icon: <Clock className="w-3 h-3" /> },
    validation_failed:{ label: 'Validation Failed', cls: 'bg-red-100 text-red-700',     icon: <XCircle className="w-3 h-3" /> },
    ready_to_post:    { label: 'Ready to Post',     cls: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
    posted:           { label: 'Posted',            cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
    rolled_back:      { label: 'Rolled Back',       cls: 'bg-orange-100 text-orange-700', icon: <XCircle className="w-3 h-3" /> },
    rejected:         { label: 'Rejected',          cls: 'bg-red-100 text-red-700',     icon: <XCircle className="w-3 h-3" /> },
  }
  const { label, cls, icon } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600', icon: null }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {icon}{label}
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

  return (
    <PageLayout
      title="Import Center"
      subtitle="Upload trial balance and GL files for staged review and posting"
      actions={
        <button
          type="button"
          onClick={() => navigate('/import/new')}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
        >
          <Upload className="w-4 h-4" /> New Import Wizard
        </button>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Entity-first enforcement */}
      {entityCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-4 flex items-start gap-3">
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

      {/* Quick upload form */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Quick Upload</h2>
        <p className="text-xs text-gray-500 mb-4">For guided step-by-step import with sheet selection and column mapping, use the <button type="button" onClick={() => navigate('/import/new')} className="text-indigo-600 hover:underline">Import Wizard</button>.</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
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
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Format guidance */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowFormatHelp((v) => !v)}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {showFormatHelp ? 'Hide format guidance' : 'Show accepted formats & tips'}
          </button>
          {showFormatHelp && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-3">
              <p className="font-semibold">Accepted file formats:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>CSV/XLSX</strong> — account number, account name, and debit/credit or signed-amount columns</li>
                <li><strong>QuickBooks (.QBO)</strong> — QBO transaction export</li>
                <li><strong>NetSuite</strong> — GL detail export with "Account" and "Amount" columns</li>
                <li><strong>Sage</strong> — trial balance export</li>
              </ul>

              <p className="font-semibold">Common column name patterns (auto-detected):</p>
              <div className="grid grid-cols-2 gap-1">
                <span>Account #, Acct, Number → account number</span>
                <span>Name, Description → account name</span>
                <span>Debit, Dr → debit amount</span>
                <span>Credit, Cr → credit amount</span>
                <span>Balance, Amount, Net → signed net balance</span>
                <span>"1000 - Cash" → combined number/name</span>
              </div>

              <div>
                <p className="font-semibold mb-1">Download starter templates:</p>
                <div className="grid grid-cols-2 gap-2">
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
                      className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-blue-300 rounded text-blue-700 hover:bg-blue-100 font-medium"
                    >
                      <Download className="w-3 h-3 flex-shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-blue-600">
                <strong>Tip:</strong> Any unmapped accounts go to the Mapping Workbench after upload.
              </p>
            </div>
          )}
        </div>

        {/* Drop zone */}
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
            <p className="text-sm font-medium text-gray-700">{file.name}</p>
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
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {uploadMutation.isPending ? 'Uploading…' : 'Upload & Begin Review'}
          </button>
        </div>
      </div>

      {/* Batch history */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Import History</h2>
        </div>
        <AccountingDataGrid
          columns={[
            {
              key: 'filename',
              header: 'File',
              sortable: true,
              sortValue: (b) => b.filename,
              render: (b) => <span className="font-semibold text-gray-900">{b.filename}</span>,
            },
            {
              key: 'as_of_date',
              header: 'As of',
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
                <span className="text-gray-600">
                  {b.row_count ?? '—'}
                  {b.unmapped_row_count ? (
                    <span className="ml-1 text-yellow-600">({b.unmapped_row_count} unmapped)</span>
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
    </PageLayout>
  )
}
