import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '@/api/reports'
import { PageLayout } from '@/components/ui/PageLayout'
import { StatusBadge, Badge, SeverityBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </div>
  )
}

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const runId = Number(id)

  const { data: run, isLoading, isError, error } = useQuery({
    queryKey: ['report', runId],
    queryFn: () => reportsApi.get(runId),
    enabled: !isNaN(runId),
  })

  const { data: validation } = useQuery({
    queryKey: ['report-validation', runId],
    queryFn: () => reportsApi.getValidation(runId),
    enabled: run?.status === 'completed',
  })

  const { data: workflow } = useQuery({
    queryKey: ['report-workflow', runId],
    queryFn: () => reportsApi.getWorkflow(runId),
    enabled: run?.status === 'completed',
  })

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState message={(error as Error).message} />
  if (!run) return null

  const valSummary = validation?.validation_summary as Record<string, unknown[]> | undefined
  const wfSummary = workflow?.workflow_summary as Record<string, unknown[]> | undefined
  const allValItems = [
    ...(valSummary?.errors ?? []),
    ...(valSummary?.warnings ?? []),
    ...(valSummary?.info ?? []),
  ] as Array<Record<string, string>>

  return (
    <PageLayout
      title={`Report #${run.id}`}
      subtitle={run.report_type.replace(/_/g, ' ')}
      actions={<StatusBadge status={run.status} />}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Metadata">
          <dl className="space-y-2 text-sm">
            {[
              ['Format', run.output_format.toUpperCase()],
              ['Entity ID', run.entity_id ?? '—'],
              ['Period ID', run.accounting_period_id ?? '—'],
              ['Storage Path', run.storage_path ?? '—'],
              ['Document ID', run.generated_document_id ?? '—'],
              ['Created At', run.created_at],
              ['Completed At', run.completed_at ?? '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between">
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-900 truncate max-w-xs">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Validation Summary">
          {!validation && <p className="text-xs text-gray-400">Not available.</p>}
          {allValItems.length === 0 && validation && (
            <p className="text-xs text-green-600">No validation issues.</p>
          )}
          {allValItems.length > 0 && (
            <ul className="space-y-2">
              {allValItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <SeverityBadge severity={item.severity ?? 'info'} />
                  <span className="text-gray-700">{item.message ?? JSON.stringify(item)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Workflow Summary">
          {!workflow && <p className="text-xs text-gray-400">Not available.</p>}
          {wfSummary && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">
                  Tasks ({(wfSummary.tasks ?? []).length})
                </p>
                {(wfSummary.tasks as Array<Record<string, string>>).slice(0, 3).map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-0.5">
                    <span className="truncate text-gray-700">{t.title}</span>
                    <Badge>{t.status}</Badge>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">
                  Issues ({(wfSummary.issues ?? []).length})
                </p>
                {(wfSummary.issues as Array<Record<string, string>>).slice(0, 3).map((i, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm py-0.5">
                    <span className="truncate text-gray-700">{i.title}</span>
                    <SeverityBadge severity={i.severity} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>
    </PageLayout>
  )
}
