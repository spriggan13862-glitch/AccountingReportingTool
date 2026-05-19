import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Clock, CheckCircle, AlertCircle, XCircle, ChevronRight, HelpCircle, FileText } from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { useOrg } from '@/providers/OrgProvider'
import { useToast } from '@/providers/ToastProvider'
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

  const [entityId, setEntityId] = useState('')
  const [asOfDate, setAsOfDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const { data: batches, isLoading } = useQuery({
    queryKey: ['import-batches', orgId],
    queryFn: () => tbImportApi.listBatches(orgId),
    enabled: !!orgId,
  })

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file || !entityId || !asOfDate) throw new Error('All fields required')
      return tbImportApi.uploadBatch({
        entity_id: Number(entityId),
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

      {/* Quick upload form */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Quick Upload</h2>
        <p className="text-xs text-gray-500 mb-4">For guided step-by-step import with sheet selection and column mapping, use the <button type="button" onClick={() => navigate('/import/new')} className="text-indigo-600 hover:underline">Import Wizard</button>.</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Entity ID</label>
            <input
              type="number"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="e.g. 1"
            />
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
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-2">
              <p className="font-semibold">Accepted file formats:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>CSV/XLSX</strong> — must have account number, account name, and debit/credit columns</li>
                <li><strong>QuickBooks (.QBO)</strong> — QBO transaction export</li>
                <li><strong>NetSuite</strong> — GL detail export with "Account" and "Amount" columns</li>
                <li><strong>Sage</strong> — trial balance export</li>
              </ul>
              <p className="font-semibold mt-2">Common column name patterns (auto-detected):</p>
              <div className="grid grid-cols-2 gap-1">
                <span>Account #, Acct, Number → account number</span>
                <span>Name, Description → account name</span>
                <span>Debit, Dr → debit amount</span>
                <span>Credit, Cr → credit amount</span>
                <span>Balance, Amount, Net → signed net balance</span>
                <span>"1000 - Cash" → combined number/name</span>
              </div>
              <p className="mt-2 text-blue-600">
                <strong>Tip:</strong> Any unmapped accounts will go to the Mapping Workbench after upload.
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
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Import History</h2>
        </div>
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-gray-400">Loading…</p>
        ) : !batches?.length ? (
          <div className="px-4 py-10 text-center">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 font-medium">No imports yet</p>
            <p className="text-xs text-gray-400 mt-1">Upload a trial balance or GL export above to begin.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">File</th>
                <th className="px-4 py-2 text-left">As of</th>
                <th className="px-4 py-2 text-left">Rows</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Uploaded</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.map((b: ImportBatch) => (
                <tr
                  key={b.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/import/${b.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{b.filename}</td>
                  <td className="px-4 py-3 text-gray-600">{b.as_of_date}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {b.row_count ?? '—'}
                    {b.unmapped_row_count ? (
                      <span className="ml-1 text-yellow-600">({b.unmapped_row_count} unmapped)</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{statusBadge(b.status)}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(b.uploaded_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-gray-400">
                    <ChevronRight className="w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageLayout>
  )
}
