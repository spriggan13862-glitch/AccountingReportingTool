import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { CheckCircle, AlertTriangle, XCircle, Loader, RefreshCw, Lock, Unlock } from 'lucide-react'
import { periodGovernanceApi } from '@/api/periodGovernance'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import type { ShadowCloseReport, ShadowCheckResult, PeriodLockSummary, PeriodGovernanceEvent } from '@/types'

function checkIcon(status: string) {
  if (status === 'valid') return <CheckCircle className="w-4 h-4 text-green-500" />
  if (status === 'warning') return <AlertTriangle className="w-4 h-4 text-orange-500" />
  return <XCircle className="w-4 h-4 text-red-500" />
}

function overallBadge(status: string) {
  const map: Record<string, string> = {
    valid:   'bg-green-100 text-green-800',
    warning: 'bg-orange-100 text-orange-800',
    blocked: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`px-2 py-1 rounded text-xs font-semibold capitalize ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  )
}

function statusIcon(status: string) {
  if (status === 'open') return <Unlock className="w-3.5 h-3.5 text-green-600" />
  if (status === 'soft_closed') return <Lock className="w-3.5 h-3.5 text-orange-500" />
  if (status === 'hard_closed') return <Lock className="w-3.5 h-3.5 text-red-600" />
  return <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
}

function periodStatusBadge(status: string) {
  const map: Record<string, string> = {
    open:        'bg-green-100 text-green-800',
    soft_closed: 'bg-orange-100 text-orange-800',
    hard_closed: 'bg-red-100 text-red-800',
    reopened:    'bg-blue-100 text-blue-800',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {statusIcon(status)}
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export function VarianceAnalysisPage() {
  const [periodId, setPeriodId] = useState('')
  const [entityId, setEntityId] = useState('')
  const [scenarioId, setScenarioId] = useState('')
  const [reason, setReason] = useState('')
  const [apiError, setApiError] = useState<string | null>(null)

  const canQuery = !!periodId && !!entityId

  const { data: lockSummary, refetch: refetchLock } = useQuery<PeriodLockSummary>({
    queryKey: ['lock-summary', periodId],
    queryFn: () => periodGovernanceApi.getLockSummary(Number(periodId)),
    enabled: !!periodId,
    retry: false,
  })

  const { data: history, refetch: refetchHistory } = useQuery<PeriodGovernanceEvent[]>({
    queryKey: ['gov-history', periodId],
    queryFn: () => periodGovernanceApi.getHistory(Number(periodId)),
    enabled: !!periodId,
    retry: false,
  })

  const [shadowReport, setShadowReport] = useState<ShadowCloseReport | null>(null)
  const [validating, setValidating] = useState(false)

  async function runValidation() {
    if (!canQuery) return
    setValidating(true)
    setApiError(null)
    try {
      const report = await periodGovernanceApi.runValidation(
        Number(periodId),
        Number(entityId),
        scenarioId ? Number(scenarioId) : undefined,
        true,
      )
      setShadowReport(report)
    } catch (err: unknown) {
      setApiError((err as Error).message ?? 'Validation failed')
    } finally {
      setValidating(false)
    }
  }

  const softCloseMutation = useMutation({
    mutationFn: () => periodGovernanceApi.softClose(Number(periodId), reason || undefined),
    onSuccess: () => { setApiError(null); refetchLock(); refetchHistory() },
    onError: (err: Error) => setApiError(err.message),
  })

  const hardCloseMutation = useMutation({
    mutationFn: () => periodGovernanceApi.hardClose(Number(periodId), reason || undefined),
    onSuccess: () => { setApiError(null); refetchLock(); refetchHistory() },
    onError: (err: Error) => setApiError(err.message),
  })

  const reopenMutation = useMutation({
    mutationFn: () => periodGovernanceApi.reopen(Number(periodId), reason || undefined),
    onSuccess: () => { setApiError(null); refetchLock(); refetchHistory() },
    onError: (err: Error) => setApiError(err.message),
  })

  const anyPending = softCloseMutation.isPending || hardCloseMutation.isPending || reopenMutation.isPending

  return (
    <PageLayout
      title="Period Governance & Variance Analysis"
      subtitle="Shadow-close validation, lock state management, and audit history"
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Input */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Period ID</label>
            <input type="number" value={periodId} onChange={(e) => setPeriodId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Period ID" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Entity ID</label>
            <input type="number" value={entityId} onChange={(e) => setEntityId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Entity ID" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Scenario ID (optional)</label>
            <input type="number" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="All scenarios" />
          </div>
        </div>
        <button
          type="button"
          disabled={!canQuery || validating}
          onClick={runValidation}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {validating ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Run Shadow-Close Validation
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Main: shadow close results */}
        <div className="col-span-2 space-y-4">
          {shadowReport && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">Shadow-Close Validation</h3>
                <div className="flex items-center gap-2">
                  {overallBadge(shadowReport.overall_status)}
                  <span className="text-xs text-gray-400">{new Date(shadowReport.run_at).toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-2">
                {shadowReport.checks.map((check: ShadowCheckResult) => (
                  <div
                    key={check.check}
                    className={`flex items-start gap-3 p-3 rounded border ${
                      check.status === 'blocked' ? 'border-red-200 bg-red-50' :
                      check.status === 'warning' ? 'border-orange-200 bg-orange-50' :
                      'border-green-200 bg-green-50'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">{checkIcon(check.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono font-semibold text-gray-600">{check.check}</span>
                      </div>
                      <p className="text-sm text-gray-700">{check.message}</p>
                      {Object.keys(check.detail).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {Object.entries(check.detail).map(([k, v]) => (
                            <span key={k} className="text-xs text-gray-500">
                              <span className="font-medium">{k}:</span> {String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: lock state + governance actions */}
        <div className="space-y-4">
          {/* Current lock state */}
          {lockSummary && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Period Lock State</h3>
              <div className="mb-3">{periodStatusBadge(lockSummary.period_status)}</div>
              <div className="space-y-1 text-xs text-gray-600">
                <p>Posting allowed: <span className={`font-medium ${lockSummary.posting_allowed ? 'text-green-700' : 'text-red-700'}`}>{lockSummary.posting_allowed ? 'Yes' : 'No'}</span></p>
                <p>Soft-locked: <span className="font-medium">{lockSummary.is_soft_locked ? 'Yes' : 'No'}</span></p>
                <p>Hard-locked: <span className="font-medium">{lockSummary.is_hard_locked ? 'Yes' : 'No'}</span></p>
              </div>
            </div>
          )}

          {/* Governance actions */}
          {periodId && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Governance Actions</h3>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs mb-2"
                placeholder="Reason (recommended)"
              />
              <div className="space-y-1.5">
                <button
                  type="button"
                  disabled={anyPending}
                  onClick={() => softCloseMutation.mutate()}
                  className="w-full px-2 py-1.5 bg-orange-100 text-orange-700 text-xs rounded hover:bg-orange-200 disabled:opacity-50"
                >
                  Soft-Close Period
                </button>
                <button
                  type="button"
                  disabled={anyPending}
                  onClick={() => hardCloseMutation.mutate()}
                  className="w-full px-2 py-1.5 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200 disabled:opacity-50"
                >
                  Hard-Close Period
                </button>
                <button
                  type="button"
                  disabled={anyPending}
                  onClick={() => reopenMutation.mutate()}
                  className="w-full px-2 py-1.5 bg-blue-100 text-blue-700 text-xs rounded hover:bg-blue-200 disabled:opacity-50"
                >
                  Reopen Period
                </button>
              </div>
            </div>
          )}

          {/* Governance history */}
          {history && history.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Governance History</h3>
              <div className="space-y-2">
                {history.map((evt: PeriodGovernanceEvent) => (
                  <div key={evt.id} className="text-xs border-l-2 border-gray-200 pl-2">
                    <p className="font-medium text-gray-700 capitalize">{evt.event_type.replace(/_/g, ' ')}</p>
                    <p className="text-gray-500">{evt.from_status} → {evt.to_status}</p>
                    {evt.reason && <p className="text-gray-400 italic">{evt.reason}</p>}
                    <p className="text-gray-400">{new Date(evt.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
