import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { journalEntriesApi } from '@/api/journalEntries'
import { workflowApi } from '@/api/workflow'
import { PageLayout } from '@/components/ui/PageLayout'
import { StatusBadge, SeverityBadge } from '@/components/ui/Badge'
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

export function JournalEntryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const jeId = Number(id)

  const { data: je, isLoading, isError, error } = useQuery({
    queryKey: ['journal-entry', jeId],
    queryFn: () => journalEntriesApi.get(jeId),
    enabled: !isNaN(jeId),
  })

  const { data: signoffs } = useQuery({
    queryKey: ['signoffs', 'journal_entry', jeId],
    queryFn: () => workflowApi.listSignoffs('journal_entry', jeId),
    enabled: !isNaN(jeId),
  })

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState message={(error as Error).message} />
  if (!je) return null

  return (
    <PageLayout
      title={je.je_number}
      subtitle={`${je.entry_date} · ${je.description}`}
      actions={<StatusBadge status={je.status} />}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Metadata */}
        <Section title="Details">
          <dl className="space-y-2 text-sm">
            {[
              ['Entity', je.entity_id],
              ['Scenario', je.scenario_id],
              ['Source', je.source],
              ['Created By', je.created_by ?? '—'],
              ['Posted By', je.posted_by ?? '—'],
              ['Created At', je.created_at],
              ['Posted At', je.posted_at ?? '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between">
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-900">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* Lines */}
        <Section title="Lines">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="pb-1 text-left">#</th>
                <th className="pb-1 text-left">Account</th>
                <th className="pb-1 text-right">Debit</th>
                <th className="pb-1 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {je.lines.map((line) => (
                <tr key={line.id} className="border-b border-gray-50">
                  <td className="py-1 text-gray-400">{line.line_number}</td>
                  <td className="py-1 font-mono">{line.account_id}</td>
                  <td className="py-1 text-right tabular-nums">{Number(line.debit) !== 0 ? line.debit : ''}</td>
                  <td className="py-1 text-right tabular-nums">{Number(line.credit) !== 0 ? line.credit : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* Warnings & Signoffs */}
        <div className="flex flex-col gap-4">
          {je.warnings.length > 0 && (
            <Section title="Validation Warnings">
              <ul className="space-y-2">
                {je.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <SeverityBadge severity={w.severity} />
                    <span className="text-gray-700">{w.message}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Signoffs">
            {!signoffs || signoffs.length === 0 ? (
              <p className="text-xs text-gray-400">No signoffs yet.</p>
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
      </div>
    </PageLayout>
  )
}
