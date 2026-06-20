import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertCircle, XCircle, ArrowLeft, RotateCcw, Clock, Upload, Shield, Download, Scan, EyeOff } from 'lucide-react'
import { useFormatCurrencyCompact } from '@/hooks/useFormatCurrency'
import { tbImportApi } from '@/api/tbImport'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { AccountingDataGrid } from '@/components/data-grid'
import type { ImportBatch, ImportLine, ImportIssue, RawPreview, DetectedTotalRow } from '@/types'

type Tab = 'lines' | 'issues' | 'preview' | 'mapping'

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

const BLOCKING_CODES = new Set(['OUT_OF_BALANCE', 'MISSING_ACCOUNT', 'UNMAPPED_REQUIRED', 'INVALID_AMOUNT'])

function IssuesPanel({ batchId, issues }: { batchId: number; issues: ImportIssue[] | undefined }) {
  const [warningsOpen, setWarningsOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  const grouped = useMemo(() => {
    const errors: ImportIssue[] = []
    const warnings: ImportIssue[] = []
    const infos: ImportIssue[] = []
    for (const i of (issues ?? [])) {
      if (i.severity === 'ERROR') errors.push(i)
      else if (i.severity === 'WARNING') warnings.push(i)
      else infos.push(i)
    }
    return { errors, warnings, infos }
  }, [issues])

  function exportCsv() {
    const rows = [
      ['Severity', 'Code', 'Message', 'Suggestion'],
      ...(issues ?? []).map((i) => [i.severity, i.code, i.message, i.suggested_resolution ?? '']),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `import-${batchId}-issues.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  function IssueRow({ issue }: { issue: ImportIssue }) {
    const isBlocking = BLOCKING_CODES.has(issue.code)
    return (
      <div className="flex items-start gap-3 px-4 py-2.5 border-b last:border-0">
        {issue.severity === 'ERROR' && <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
        {issue.severity === 'WARNING' && <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />}
        {issue.severity === 'INFO' && <CheckCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <SeverityBadge severity={issue.severity} />
            <span className="text-xs font-mono text-gray-400">{issue.code}</span>
            {isBlocking && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-red-100 text-red-700 rounded">Blocks posting</span>}
          </div>
          <p className="text-sm text-gray-700">{issue.message}</p>
          {issue.suggested_resolution && (
            <p className="text-xs text-gray-400 mt-0.5">Suggestion: {issue.suggested_resolution}</p>
          )}
        </div>
      </div>
    )
  }

  if (!issues?.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center">
        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
        <p className="text-sm text-gray-500">No validation issues. Run validation to check the batch.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={exportCsv} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" /> Export Issues CSV
        </button>
      </div>

      {/* Errors — always expanded, block posting */}
      {grouped.errors.length > 0 && (
        <div className="bg-white border border-red-200 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-semibold text-red-700">{grouped.errors.length} Error{grouped.errors.length !== 1 ? 's' : ''}</span>
            <span className="text-xs text-red-500 ml-1">— must resolve before posting</span>
          </div>
          {grouped.errors.map((i) => <IssueRow key={i.id} issue={i} />)}
        </div>
      )}

      {/* Warnings — collapsed by default */}
      {grouped.warnings.length > 0 && (
        <div className="bg-white border border-yellow-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setWarningsOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 bg-yellow-50 border-b border-yellow-200 hover:bg-yellow-100 transition-colors"
          >
            <AlertCircle className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-semibold text-yellow-700 flex-1 text-left">
              {grouped.warnings.length} Warning{grouped.warnings.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-yellow-600">Non-blocking</span>
            <span className="text-xs text-gray-400 ml-2">{warningsOpen ? '▲ collapse' : '▼ expand'}</span>
          </button>
          {warningsOpen && grouped.warnings.map((i) => <IssueRow key={i.id} issue={i} />)}
        </div>
      )}

      {/* Info — collapsed by default */}
      {grouped.infos.length > 0 && (
        <div className="bg-white border border-blue-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200 hover:bg-blue-100 transition-colors"
          >
            <CheckCircle className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-blue-700 flex-1 text-left">
              {grouped.infos.length} Info notice{grouped.infos.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-gray-400 ml-2">{infoOpen ? '▲ collapse' : '▼ expand'}</span>
          </button>
          {infoOpen && grouped.infos.map((i) => <IssueRow key={i.id} issue={i} />)}
        </div>
      )}
    </div>
  )
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
  const [selectedLineIds, setSelectedLineIds] = useState<Set<number>>(new Set())
  const [detectedTotals, setDetectedTotals] = useState<DetectedTotalRow[]>([])

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

  const { data: rawPreview } = useQuery({
    queryKey: ['import-raw-preview', batchId],
    queryFn: () => tbImportApi.getRawPreview(batchId),
    enabled: !!batchId && tab === 'preview',
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

  const detectTotalsMutation = useMutation({
    mutationFn: () => tbImportApi.detectTotalRows(batchId),
    onSuccess: (rows) => {
      setDetectedTotals(rows)
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const excludeLinesMutation = useMutation({
    mutationFn: (args: { lineIds: number[]; reason: string }) =>
      tbImportApi.excludeLines(batchId, args.lineIds, args.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      setSelectedLineIds(new Set())
      setDetectedTotals([])
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const fmtCompact = useFormatCurrencyCompact()

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
            <p className="text-sm font-medium text-gray-700">{fmtCompact(Number(batch.total_debits))}</p>
          </div>
        )}
        {batch.total_credits && (
          <div>
            <p className="text-xs text-gray-500">Total CR</p>
            <p className="text-sm font-medium text-gray-700">{fmtCompact(Number(batch.total_credits))}</p>
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
        {(['lines', 'preview', 'issues', 'mapping'] as Tab[]).map((t) => {
          const label: Record<Tab, string> = {
            lines: 'Lines',
            preview: 'Raw Preview',
            issues: `Validation Issues${issues?.length ? ` (${issues.length})` : ''}`,
            mapping: 'Mapping Workbench',
          }
          return (
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
              {label[t]}
            </button>
          )
        })}
      </div>

      {/* Lines tab */}
      {tab === 'lines' && (
        <div className="space-y-2">
          {/* Toolbar: detect total rows + batch actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={detectTotalsMutation.isPending}
              onClick={() => detectTotalsMutation.mutate()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50"
              data-testid="detect-total-rows-btn"
            >
              <Scan className="w-3.5 h-3.5" />
              {detectTotalsMutation.isPending ? 'Detecting…' : 'Detect Total Rows'}
            </button>

            {detectedTotals.length > 0 && (
              <button
                type="button"
                disabled={excludeLinesMutation.isPending}
                onClick={() =>
                  excludeLinesMutation.mutate({
                    lineIds: detectedTotals.map((r) => r.line_id),
                    reason: 'total_row',
                  })
                }
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-yellow-300 rounded bg-yellow-50 text-yellow-800 hover:bg-yellow-100 disabled:opacity-50"
              >
                <EyeOff className="w-3.5 h-3.5" />
                Exclude {detectedTotals.length} detected row{detectedTotals.length !== 1 ? 's' : ''}
              </button>
            )}

            {selectedLineIds.size > 0 && (
              <>
                <span className="text-xs text-gray-500 px-1">{selectedLineIds.size} selected</span>
                <button
                  type="button"
                  disabled={excludeLinesMutation.isPending}
                  onClick={() =>
                    excludeLinesMutation.mutate({
                      lineIds: Array.from(selectedLineIds),
                      reason: 'manual',
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50"
                >
                  <EyeOff className="w-3.5 h-3.5" /> Exclude Selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLineIds(new Set())}
                  className="text-xs text-gray-400 hover:text-gray-600 px-1"
                >
                  Clear
                </button>
              </>
            )}
          </div>

          {detectedTotals.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-xs text-yellow-800">
              Detected {detectedTotals.length} likely total/header row{detectedTotals.length !== 1 ? 's' : ''}.
              Rows highlighted in yellow. Click "Exclude … detected rows" to skip them all.
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-sm border-collapse" data-testid="lines-grid">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-200 w-8">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selectedLineIds.size > 0 && (lines ?? []).filter(l => l.mapping_status !== 'skipped').every(l => selectedLineIds.has(l.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLineIds(new Set((lines ?? []).filter(l => l.mapping_status !== 'skipped').map(l => l.id)))
                          } else {
                            setSelectedLineIds(new Set())
                          }
                        }}
                      />
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-200 w-12">#</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-200">Source Acct #</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-200">Source Acct Name</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600 border-b border-gray-200">Debit</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600 border-b border-gray-200">Credit</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-200">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lines === undefined ? (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">Loading…</td></tr>
                  ) : lines.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">No lines found.</td></tr>
                  ) : (
                    lines.map((l) => {
                      const isDetected = detectedTotals.some((d) => d.line_id === l.id)
                      const isSelected = selectedLineIds.has(l.id)
                      return (
                        <tr
                          key={l.id}
                          className={`border-b border-gray-100 last:border-0 transition-colors ${
                            isDetected
                              ? 'bg-yellow-50'
                              : isSelected
                                ? 'bg-indigo-50'
                                : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-3 py-2 w-8">
                            <input
                              type="checkbox"
                              className="rounded"
                              checked={isSelected}
                              onChange={(e) => {
                                setSelectedLineIds((prev) => {
                                  const next = new Set(prev)
                                  if (e.target.checked) next.add(l.id)
                                  else next.delete(l.id)
                                  return next
                                })
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 text-gray-400 text-xs w-12">{l.line_number}</td>
                          <td className="px-3 py-2 font-mono text-gray-700 text-xs">{l.raw_account_number || '—'}</td>
                          <td className="px-3 py-2 text-gray-600 text-xs">
                            {l.raw_account_name || '—'}
                            {isDetected && (
                              <span className="ml-2 text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                                {detectedTotals.find((d) => d.line_id === l.id)?.reason.replace(/_/g, ' ')}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                            {Number(l.debit) > 0 ? fmtCompact(Number(l.debit)) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                            {Number(l.credit) > 0 ? fmtCompact(Number(l.credit)) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1.5">
                              <MappingStatusDot status={l.mapping_status} />
                              <span className="capitalize text-gray-600 text-xs">{l.mapping_status}</span>
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Issues tab — grouped by severity, warnings collapsed by default */}
      {tab === 'issues' && <IssuesPanel batchId={batchId} issues={issues} />}

      {/* Raw preview tab */}
      {tab === 'preview' && (
        <div className="space-y-3">
          {!rawPreview ? (
            <p className="text-sm text-gray-400">Loading preview…</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Showing {rawPreview.showing} of {rawPreview.total_rows} rows · Format: <span className="font-semibold uppercase">{rawPreview.source_format}</span>
                </p>
                <a
                  href={tbImportApi.exportMappingsUrl(batchId)}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                  target="_blank" rel="noreferrer"
                >
                  <Download className="w-3.5 h-3.5" /> Export mappings CSV
                </a>
              </div>
              <AccountingDataGrid
                columns={[
                  {
                    key: 'line_number',
                    header: '#',
                    sortable: true,
                    sortValue: (row: any) => row.line_number,
                    className: 'text-gray-400 w-12',
                    render: (row: any) => <span>{row.line_number}</span>,
                  },
                  ...rawPreview.source_headers.map((h: string) => {
                    const isMapped = Object.values(rawPreview.column_mapping).includes(h)
                    const field = Object.entries(rawPreview.column_mapping).find(([, v]) => v === h)?.[0]
                    return {
                      key: `header_${h}`,
                      header: field ? `${h} → ${field}` : h,
                      headerClassName: isMapped ? 'text-indigo-700 bg-indigo-50 font-semibold' : 'text-gray-500 font-semibold',
                      sortable: true,
                      sortValue: (row: any) => {
                        const fieldMap: Record<string, keyof typeof row> = {
                          [rawPreview.column_mapping.account_number]: 'raw_account_number',
                          [rawPreview.column_mapping.account_name]: 'raw_account_name',
                          [rawPreview.column_mapping.debit]: 'raw_debit',
                          [rawPreview.column_mapping.credit]: 'raw_credit',
                          [rawPreview.column_mapping.balance]: 'raw_balance',
                          [rawPreview.column_mapping.description]: 'raw_description',
                        }
                        const field = fieldMap[h]
                        return String(field ? (row[field] ?? '') : '')
                      },
                      render: (row: any) => {
                        const fieldMap: Record<string, keyof typeof row> = {
                          [rawPreview.column_mapping.account_number]: 'raw_account_number',
                          [rawPreview.column_mapping.account_name]: 'raw_account_name',
                          [rawPreview.column_mapping.debit]: 'raw_debit',
                          [rawPreview.column_mapping.credit]: 'raw_credit',
                          [rawPreview.column_mapping.balance]: 'raw_balance',
                          [rawPreview.column_mapping.description]: 'raw_description',
                        }
                        const field = fieldMap[h]
                        const val = field ? row[field] : null
                        return (
                          <span className={val ? 'text-gray-800 font-mono' : 'text-gray-300 font-mono'}>
                            {val ?? '—'}
                          </span>
                        )
                      }
                    }
                  }),
                  {
                    key: 'mapping_status',
                    header: 'Status',
                    sortable: true,
                    sortValue: (row: any) => row.mapping_status,
                    render: (row: any) => {
                      const statusColors: Record<string, string> = {
                        mapped: 'text-green-600', unmapped: 'text-yellow-600',
                        skipped: 'text-gray-400', rejected: 'text-red-500',
                      }
                      return (
                        <span className={`font-medium capitalize ${statusColors[row.mapping_status] ?? 'text-gray-500'}`}>
                          {row.mapping_status}
                        </span>
                      )
                    }
                  }
                ]}
                data={rawPreview?.rows}
                rowKey={(row: any) => row.line_number}
                selectionEnabled={false}
                pageSize={50}
                exportFilename={`batch_${batchId}_raw_preview`}
                data-testid="raw-preview-grid"
              />
            </>
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

      {/* Activity timeline */}
      <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Activity Timeline</h3>
        <div className="space-y-3">
          {batch.uploaded_at && (
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <Upload className="w-3 h-3 text-blue-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700">Uploaded</p>
                <p className="text-xs text-gray-400">{new Date(batch.uploaded_at).toLocaleString()}</p>
              </div>
            </div>
          )}
          {batch.status === 'mapping_required' && (
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="w-3 h-3 text-yellow-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700">Awaiting account mapping</p>
                <p className="text-xs text-gray-400">{batch.unmapped_row_count} accounts need resolution</p>
              </div>
            </div>
          )}
          {['validating', 'validation_failed', 'ready_to_post', 'posted', 'rolled_back'].includes(batch.status) && (
            <div className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${batch.status === 'validation_failed' ? 'bg-red-100' : 'bg-green-100'}`}>
                <Shield className={`w-3 h-3 ${batch.status === 'validation_failed' ? 'text-red-500' : 'text-green-500'}`} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700">
                  {batch.status === 'validation_failed' ? 'Validation failed' : 'Validation passed'}
                </p>
                <p className="text-xs text-gray-400">DR {fmtCompact(Number(batch.total_debits ?? 0))} / CR {fmtCompact(Number(batch.total_credits ?? 0))}</p>
                {batch.status === 'validation_failed' && batch.error_message && (
                  <p className="text-xs text-red-600 mt-1 font-medium">{batch.error_message}</p>
                )}
              </div>
            </div>
          )}
          {batch.status === 'posted' && batch.reviewed_at && (
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle className="w-3 h-3 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700">Posted to ledger</p>
                <p className="text-xs text-gray-400">JE #{batch.posted_je_id} · {new Date(batch.reviewed_at).toLocaleString()}</p>
              </div>
            </div>
          )}
          {batch.status === 'rolled_back' && (
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                <RotateCcw className="w-3 h-3 text-orange-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700">Rolled back</p>
                <p className="text-xs text-gray-400">Reversal JE #{batch.reversal_je_id}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
