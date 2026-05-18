import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertCircle, XCircle, ArrowLeft, RotateCcw } from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import type { ImportBatch, ImportLine, ImportIssue } from '@/types'

type Tab = 'lines' | 'issues' | 'mapping'

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    ERROR:   'bg-red-100 text-red-700',
    WARNING: 'bg-yellow-100 text-yellow-800',
    INFO:    'bg-blue-100 text-blue-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[severity] ?? 'bg-gray-100 text-gray-600'}`}>
      {severity}
    </span>
  )
}

function MappingStatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    mapped:   'bg-green-500',
    unmapped: 'bg-yellow-400',
    skipped:  'bg-gray-400',
    rejected: 'bg-red-500',
  }
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status] ?? 'bg-gray-300'}`} />
}

export function ImportReviewPage() {
  const { id } = useParams<{ id: string }>()
  const batchId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('lines')
  const [apiError, setApiError] = useState<string | null>(null)
  const [jeNumber, setJeNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [showPostForm, setShowPostForm] = useState(false)

  const { data: batch } = useQuery({
    queryKey: ['import-batch', batchId],
    queryFn: () => tbImportApi.getBatch(batchId),
    enabled: !!batchId,
  })

  const { data: lines } = useQuery({
    queryKey: ['import-lines', batchId],
    queryFn: () => tbImportApi.getBatchLines(batchId),
    enabled: !!batchId && tab === 'lines',
  })

  const { data: issues } = useQuery({
    queryKey: ['import-issues', batchId],
    queryFn: () => tbImportApi.getBatchIssues(batchId),
    enabled: !!batchId && tab === 'issues',
  })

  const validateMutation = useMutation({
    mutationFn: () => tbImportApi.validateBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-issues', batchId] })
      setTab('issues')
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const postMutation = useMutation({
    mutationFn: () => tbImportApi.postBatch(batchId, jeNumber, notes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      setShowPostForm(false)
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const rollbackMutation = useMutation({
    mutationFn: () => tbImportApi.rollbackBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  if (!batch) {
    return (
      <PageLayout title="Import Review">
        <p className="text-sm text-gray-400">Loading batch…</p>
      </PageLayout>
    )
  }

  const canValidate = ['mapping_required', 'validating', 'validation_failed', 'ready_to_post'].includes(batch.status)
  const canPost = batch.status === 'ready_to_post'
  const canRollback = batch.status === 'posted'

  return (
    <PageLayout
      title={`Import Review — ${batch.filename}`}
      subtitle={`Batch #${batch.id} · As of ${batch.as_of_date} · ${batch.row_count ?? 0} rows`}
      actions={
        <button
          type="button"
          onClick={() => navigate('/import')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Import Center
        </button>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Status bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex items-center gap-6">
        <div>
          <p className="text-xs text-gray-500">Status</p>
          <p className="text-sm font-semibold text-gray-800 capitalize">{batch.status.replace(/_/g, ' ')}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Rows</p>
          <p className="text-sm font-medium text-gray-700">{batch.row_count ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Mapped</p>
          <p className="text-sm font-medium text-green-600">{batch.mapped_row_count ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Unmapped</p>
          <p className={`text-sm font-medium ${(batch.unmapped_row_count ?? 0) > 0 ? 'text-yellow-600' : 'text-gray-600'}`}>
            {batch.unmapped_row_count ?? 0}
          </p>
        </div>
        {batch.total_debits && (
          <div>
            <p className="text-xs text-gray-500">Total DR</p>
            <p className="text-sm font-medium text-gray-700">{Number(batch.total_debits).toLocaleString()}</p>
          </div>
        )}
        {batch.total_credits && (
          <div>
            <p className="text-xs text-gray-500">Total CR</p>
            <p className="text-sm font-medium text-gray-700">{Number(batch.total_credits).toLocaleString()}</p>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {(batch.unmapped_row_count ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => navigate(`/import/${batchId}/mapping`)}
              className="px-3 py-1.5 bg-yellow-50 border border-yellow-300 text-yellow-800 text-sm rounded hover:bg-yellow-100"
            >
              Map Accounts ({batch.unmapped_row_count})
            </button>
          )}
          {canValidate && (
            <button
              type="button"
              disabled={validateMutation.isPending}
              onClick={() => validateMutation.mutate()}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {validateMutation.isPending ? 'Validating…' : 'Run Validation'}
            </button>
          )}
          {canPost && !showPostForm && (
            <button
              type="button"
              onClick={() => setShowPostForm(true)}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              Post to Ledger
            </button>
          )}
          {canRollback && (
            <button
              type="button"
              disabled={rollbackMutation.isPending}
              onClick={() => rollbackMutation.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 border border-orange-300 text-orange-800 text-sm rounded hover:bg-orange-100 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {rollbackMutation.isPending ? 'Rolling back…' : 'Rollback'}
            </button>
          )}
        </div>
      </div>

      {/* Post form */}
      {showPostForm && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-green-800 mb-3">Post Import to Ledger</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">JE Number *</label>
              <input
                type="text"
                value={jeNumber}
                onChange={(e) => setJeNumber(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder="e.g. IMPORT-2024-001"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder="Optional notes"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!jeNumber || postMutation.isPending}
              onClick={() => postMutation.mutate()}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
            >
              {postMutation.isPending ? 'Posting…' : 'Confirm Post'}
            </button>
            <button
              type="button"
              onClick={() => setShowPostForm(false)}
              className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-0 border-b border-gray-200 mb-4">
        {(['lines', 'issues', 'mapping'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'lines' ? 'Lines' : t === 'issues' ? 'Validation Issues' : 'Mapping Workbench'}
          </button>
        ))}
      </div>

      {/* Lines tab */}
      {tab === 'lines' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Account</th>
                <th className="px-4 py-2 text-right">Debit</th>
                <th className="px-4 py-2 text-right">Credit</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines?.map((l: ImportLine) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400">{l.line_number}</td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-gray-700">{l.raw_account_number}</span>
                    {l.raw_account_name && (
                      <span className="ml-2 text-gray-500">{l.raw_account_name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {Number(l.debit) > 0 ? Number(l.debit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {Number(l.credit) > 0 ? Number(l.credit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-1.5">
                      <MappingStatusDot status={l.mapping_status} />
                      <span className="capitalize text-gray-600">{l.mapping_status}</span>
                    </span>
                  </td>
                </tr>
              )) ?? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Issues tab */}
      {tab === 'issues' && (
        <div className="space-y-2">
          {!issues?.length ? (
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
              <p className="text-sm text-gray-500">No validation issues. Run validation to check the batch.</p>
            </div>
          ) : (
            issues.map((issue: ImportIssue) => (
              <div key={issue.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div className="flex items-start gap-3">
                  {issue.severity === 'ERROR' && <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
                  {issue.severity === 'WARNING' && <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />}
                  {issue.severity === 'INFO' && <CheckCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <SeverityBadge severity={issue.severity} />
                      <span className="text-xs font-mono text-gray-400">{issue.code}</span>
                    </div>
                    <p className="text-sm text-gray-700">{issue.message}</p>
                    {issue.suggested_resolution && (
                      <p className="text-xs text-gray-400 mt-0.5">Suggestion: {issue.suggested_resolution}</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Mapping tab */}
      {tab === 'mapping' && (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-6 text-center">
          <p className="text-sm text-gray-600 mb-3">
            Open the full Mapping Workbench for detailed account mapping controls.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/import/${batchId}/mapping`)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
          >
            Open Mapping Workbench
          </button>
        </div>
      )}
    </PageLayout>
  )
}
