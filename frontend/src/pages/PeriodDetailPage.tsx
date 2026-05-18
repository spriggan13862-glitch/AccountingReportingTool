import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { periodsApi } from '@/api/periods'
import { workflowApi } from '@/api/workflow'
import { PageLayout } from '@/components/ui/PageLayout'
import { StatusBadge, SeverityBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Input } from '@/components/ui/Input'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </div>
  )
}

export function PeriodDetailPage() {
  const { id } = useParams<{ id: string }>()
  const periodId = Number(id)
  const queryClient = useQueryClient()

  const [closeOpen, setCloseOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [closeForm, setCloseForm] = useState({
    re_account_id: '',
    scenario_id: '',
    closing_je_number: '',
  })

  const { data: period, isLoading, isError, error } = useQuery({
    queryKey: ['period', periodId],
    queryFn: () => periodsApi.get(periodId),
    enabled: !isNaN(periodId),
  })

  const { data: signoffs } = useQuery({
    queryKey: ['signoffs', 'accounting_period', periodId],
    queryFn: () => workflowApi.listSignoffs('accounting_period', periodId),
    enabled: !isNaN(periodId),
  })

  const closeMutation = useMutation({
    mutationFn: () =>
      periodsApi.close(periodId, {
        re_account_id: Number(closeForm.re_account_id),
        scenario_id: Number(closeForm.scenario_id),
        closing_je_number: closeForm.closing_je_number,
      }),
    onSuccess: () => {
      setCloseOpen(false)
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['period', periodId] })
    },
    onError: (err: Error) => {
      setCloseOpen(false)
      setActionError(err.message)
    },
  })

  const reopenMutation = useMutation({
    mutationFn: () => periodsApi.reopen(periodId),
    onSuccess: () => {
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['period', periodId] })
    },
    onError: (err: Error) => setActionError(err.message),
  })

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState message={(error as Error).message} />
  if (!period) return null

  return (
    <>
      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close Accounting Period"
        description="Closing a period generates closing entries and locks it against further postings."
        confirmLabel="Close Period"
        destructive
        onConfirm={() => closeMutation.mutate()}
      />

      <PageLayout
        title={period.period_name}
        subtitle={`${period.start_date} → ${period.end_date} · FY${period.fiscal_year} / P${period.fiscal_period}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={period.is_closed ? 'completed' : 'open'} />
            {!period.is_closed && (
              <button
                type="button"
                onClick={() => setCloseOpen(true)}
                data-testid="close-period-btn"
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Close Period
              </button>
            )}
            {period.is_closed && (
              <button
                type="button"
                onClick={() => reopenMutation.mutate()}
                disabled={reopenMutation.isPending}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {reopenMutation.isPending ? 'Reopening…' : 'Reopen'}
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4 max-w-2xl">
          {actionError && (
            <ErrorBanner message={actionError} data-testid="period-error" />
          )}

          {/* Close form (shown when dialog is pending) */}
          {!period.is_closed && (
            <Section title="Close Parameters">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Input
                  label="RE Account ID"
                  type="number"
                  value={closeForm.re_account_id}
                  onChange={(e) => setCloseForm({ ...closeForm, re_account_id: e.target.value })}
                  placeholder="Retained Earnings acct"
                />
                <Input
                  label="Scenario ID"
                  type="number"
                  value={closeForm.scenario_id}
                  onChange={(e) => setCloseForm({ ...closeForm, scenario_id: e.target.value })}
                  placeholder="1"
                />
                <Input
                  label="Closing JE Number"
                  value={closeForm.closing_je_number}
                  onChange={(e) => setCloseForm({ ...closeForm, closing_je_number: e.target.value })}
                  placeholder="CL-2024-03"
                />
              </div>
            </Section>
          )}

          <Section title="Details">
            <dl className="space-y-2 text-sm">
              {[
                ['Entity ID', period.entity_id],
                ['Type', period.period_type],
                ['Created At', period.created_at],
                ['Closed At', period.closed_at ?? '—'],
                ['Closed By', period.closed_by ?? '—'],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="font-medium text-gray-900">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Signoffs">
            {!signoffs || signoffs.length === 0 ? (
              <p className="text-xs text-gray-400">No signoffs.</p>
            ) : (
              <ul className="space-y-2">
                {signoffs.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Reviewer #{s.reviewer_user_id}</span>
                    <StatusBadge status={s.signoff_status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </PageLayout>
    </>
  )
}
