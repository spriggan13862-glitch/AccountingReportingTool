import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { reconciliationApi } from '@/api/reconciliation'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { ReconciliationStatusBadge } from '@/components/reconciliation/ReconciliationStatusBadge'
import { VarianceBadge } from '@/components/reconciliation/VarianceBadge'
import { TieOutIndicator } from '@/components/reconciliation/TieOutIndicator'
import { SupportReferencePanel } from '@/components/reconciliation/SupportReferencePanel'
import { ReviewerCommentPanel } from '@/components/reconciliation/ReviewerCommentPanel'
import { RollforwardTable } from '@/components/reconciliation/RollforwardTable'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import type { RollforwardScheduleLine } from '@/types'

function makeFmt(fmtCurrency: (v: number | null | undefined) => string) {
  return (val: string | null | undefined) => {
    if (val == null) return '—'
    const n = parseFloat(val)
    if (isNaN(n)) return '—'
    return fmtCurrency(n)
  }
}

export function ReconciliationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const reconId = Number(id)
  const queryClient = useQueryClient()
  const fmtCurrency = useFormatCurrency()
  const fmt = makeFmt(fmtCurrency)
  const [apiError, setApiError] = useState<string | null>(null)
  const [scheduleLines, setScheduleLines] = useState<RollforwardScheduleLine[] | null>(null)
  const [cashOpening, setCashOpening] = useState('')
  const [cashInflows, setCashInflows] = useState('')
  const [cashOutflows, setCashOutflows] = useState('')

  const { data: recon, isLoading } = useQuery({
    queryKey: ['reconciliation', reconId],
    queryFn: () => reconciliationApi.get(reconId),
    enabled: !!reconId,
  })

  const { data: lines } = useQuery({
    queryKey: ['reconciliation-lines', reconId],
    queryFn: () => reconciliationApi.getLines(reconId),
    enabled: !!reconId,
  })

  const { data: support } = useQuery({
    queryKey: ['reconciliation-support', reconId],
    queryFn: () => reconciliationApi.getSupport(reconId),
    enabled: !!reconId,
  })

  const transitionMutation = useMutation({
    mutationFn: (target: string) => reconciliationApi.transition(reconId, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', reconId] })
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  async function handleCashSchedule() {
    if (!cashOpening) return
    try {
      const result = await reconciliationApi.cashSchedule(cashOpening, cashInflows || '0', cashOutflows || '0')
      setScheduleLines(result)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Error building schedule')
    }
  }

  if (isLoading) {
    return (
      <PageLayout title="Reconciliation Detail">
        <p className="text-sm text-gray-500">Loading…</p>
      </PageLayout>
    )
  }

  if (!recon) {
    return (
      <PageLayout title="Reconciliation Detail">
        <ErrorBanner message="Reconciliation not found" />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title={`Reconciliation #${recon.id}`}
      subtitle={`Account ${recon.account_id} · ${recon.reconciliation_type}`}
      actions={
        <div className="flex items-center gap-2">
          <a
            href={reconciliationApi.exportUrl(reconId)}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            data-testid="export-recon-btn"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </a>
        </div>
      }
    >
      <div className="space-y-4 max-w-4xl">
        {apiError && <ErrorBanner message={apiError} />}

        {/* Status card */}
        <div className="rounded-lg border border-gray-200 bg-white p-4" data-testid="recon-detail-card">
          <div className="flex items-center justify-between mb-3">
            <ReconciliationStatusBadge status={recon.status} />
            <TieOutIndicator status={recon.tie_out_status} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500">Official Balance</p>
              <p className="text-sm font-semibold tabular-nums">{fmt(recon.official_balance)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Supporting Balance</p>
              <p className="text-sm font-semibold tabular-nums">{fmt(recon.supporting_balance)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Variance</p>
              <VarianceBadge variance={recon.variance_amount} tieOutStatus={recon.tie_out_status} />
            </div>
          </div>
          {recon.draft_preview_balance && (
            <div className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Draft Preview Balance: {fmt(recon.draft_preview_balance)}
            </div>
          )}
          {recon.variance_explanation && (
            <div className="mt-2 text-xs text-gray-600">
              <span className="font-medium">Variance explanation:</span> {recon.variance_explanation}
            </div>
          )}
        </div>

        {/* Rollforward info */}
        {recon.rollforward_opening_balance !== null && (
          <div className="rounded-lg border border-gray-200 bg-white p-4" data-testid="rollforward-info">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Rollforward</h3>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-gray-500">Opening Balance</p>
                <p className="font-semibold tabular-nums">{fmt(recon.rollforward_opening_balance)}</p>
              </div>
              <div>
                <p className="text-gray-500">Adjustments</p>
                <p className="font-semibold tabular-nums">{fmt(recon.rollforward_adjustments)}</p>
              </div>
              <div>
                <p className="text-gray-500">Closing Balance</p>
                <p className="font-semibold tabular-nums">{fmt(recon.rollforward_closing_balance)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Reviewer comment */}
        <ReviewerCommentPanel reconciliation={recon} />

        {/* Reconciliation lines */}
        {lines && lines.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white" data-testid="recon-lines">
            <div className="border-b px-4 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Reconciliation Lines
              </h3>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-500">
                  <th className="py-1.5 pl-4 text-left">#</th>
                  <th className="py-1.5 text-left">Description</th>
                  <th className="py-1.5 text-left">Source</th>
                  <th className="py-1.5 text-right pr-3">Debit</th>
                  <th className="py-1.5 text-right pr-3">Credit</th>
                  <th className="py-1.5 text-right pr-3">Balance</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b border-gray-50">
                    <td className="py-1 pl-4 font-mono">{line.line_number}</td>
                    <td className="py-1 text-gray-700">{line.description ?? '—'}</td>
                    <td className="py-1 capitalize text-gray-500">{line.source_type}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{fmt(line.debit)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{fmt(line.credit)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums font-medium">{fmt(line.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Support references */}
        <SupportReferencePanel references={support ?? []} />

        {/* Status actions */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Actions</h3>
          <div className="flex flex-wrap gap-2">
            {recon.status === 'not_started' && (
              <button
                type="button"
                onClick={() => transitionMutation.mutate('in_progress')}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                data-testid="action-in-progress"
              >
                Start
              </button>
            )}
            {recon.status === 'in_progress' && (
              <button
                type="button"
                onClick={() => transitionMutation.mutate('prepared')}
                className="rounded-md bg-yellow-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-yellow-600"
                data-testid="action-prepared"
              >
                Mark Prepared
              </button>
            )}
            {recon.status === 'prepared' && (
              <>
                <button
                  type="button"
                  onClick={() => transitionMutation.mutate('reviewed')}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  data-testid="action-reviewed"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => transitionMutation.mutate('rejected')}
                  className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                  data-testid="action-rejected"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </div>

        {/* Cash rollforward calculator */}
        <div className="rounded-lg border border-gray-200 bg-white p-4" data-testid="cash-rollforward-calculator">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Cash Rollforward Schedule
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-600">Opening Balance</label>
              <input
                type="number"
                value={cashOpening}
                onChange={(e) => setCashOpening(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                data-testid="cash-opening"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-600">Inflows</label>
              <input
                type="number"
                value={cashInflows}
                onChange={(e) => setCashInflows(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                data-testid="cash-inflows"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-600">Outflows</label>
              <input
                type="number"
                value={cashOutflows}
                onChange={(e) => setCashOutflows(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                data-testid="cash-outflows"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleCashSchedule}
            disabled={!cashOpening}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            data-testid="build-cash-schedule"
          >
            Build Schedule
          </button>
          {scheduleLines && (
            <div className="mt-3">
              <RollforwardTable title="Cash Rollforward" lines={scheduleLines} />
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
