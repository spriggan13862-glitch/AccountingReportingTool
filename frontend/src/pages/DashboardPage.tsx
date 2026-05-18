import { useQuery } from '@tanstack/react-query'
import { workflowApi } from '@/api/workflow'
import { reportsApi } from '@/api/reports'
import { journalEntriesApi } from '@/api/journalEntries'
import { useOrg } from '@/providers/OrgProvider'
import { PageLayout } from '@/components/ui/PageLayout'
import { StatusBadge, SeverityBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'

function DashboardCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  )
}

export function DashboardPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0

  const tasks = useQuery({
    queryKey: ['tasks', orgId],
    queryFn: () => workflowApi.listTasks(orgId, { status: 'open' }),
    enabled: orgId > 0,
  })

  const issues = useQuery({
    queryKey: ['issues', orgId],
    queryFn: () => workflowApi.listIssues(orgId, { status: 'open' }),
    enabled: orgId > 0,
  })

  const reports = useQuery({
    queryKey: ['reports', orgId],
    queryFn: () => reportsApi.list(orgId),
    enabled: orgId > 0,
  })

  const jes = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => journalEntriesApi.list(),
    enabled: orgId > 0,
  })

  if (!org) {
    return (
      <PageLayout title="Dashboard">
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          <p className="text-sm">No organization selected.</p>
          <p className="mt-1 text-xs text-gray-400">Use the organization switcher in the top nav to get started.</p>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Dashboard" subtitle={`Overview for ${org.name}`}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Open Tasks */}
        <DashboardCard title="Open Tasks">
          {tasks.isLoading && <LoadingState message="Loading tasks…" />}
          {tasks.isError && <ErrorState message="Could not load tasks." />}
          {tasks.data && (
            tasks.data.length === 0
              ? <p className="text-xs text-gray-400">No open tasks.</p>
              : <ul className="space-y-2">
                  {tasks.data.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-gray-700">{t.title}</span>
                      <StatusBadge status={t.status} />
                    </li>
                  ))}
                  {tasks.data.length > 5 && (
                    <p className="text-xs text-gray-400">+{tasks.data.length - 5} more</p>
                  )}
                </ul>
          )}
        </DashboardCard>

        {/* Unresolved Issues */}
        <DashboardCard title="Unresolved Issues">
          {issues.isLoading && <LoadingState message="Loading issues…" />}
          {issues.isError && <ErrorState message="Could not load issues." />}
          {issues.data && (
            issues.data.length === 0
              ? <p className="text-xs text-gray-400">No open issues.</p>
              : <ul className="space-y-2">
                  {issues.data.slice(0, 5).map((i) => (
                    <li key={i.id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-gray-700">{i.title}</span>
                      <SeverityBadge severity={i.severity} />
                    </li>
                  ))}
                  {issues.data.length > 5 && (
                    <p className="text-xs text-gray-400">+{issues.data.length - 5} more</p>
                  )}
                </ul>
          )}
        </DashboardCard>

        {/* Recent Reports */}
        <DashboardCard title="Recent Reports">
          {reports.isLoading && <LoadingState message="Loading reports…" />}
          {reports.isError && <ErrorState message="Could not load reports." />}
          {reports.data && (
            reports.data.length === 0
              ? <p className="text-xs text-gray-400">No report runs yet.</p>
              : <ul className="space-y-2">
                  {reports.data.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-gray-700">
                        {r.report_type.replace(/_/g, ' ')}
                      </span>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
          )}
        </DashboardCard>

        {/* Recent JEs */}
        <DashboardCard title="Recent Journal Entries">
          {jes.isLoading && <LoadingState message="Loading entries…" />}
          {jes.isError && <ErrorState message="Could not load journal entries." />}
          {jes.data && (
            jes.data.length === 0
              ? <p className="text-xs text-gray-400">No journal entries.</p>
              : <ul className="space-y-2">
                  {jes.data.slice(0, 5).map((je) => (
                    <li key={je.id} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-gray-700">{je.je_number}</span>
                      <StatusBadge status={je.status} />
                    </li>
                  ))}
                </ul>
          )}
        </DashboardCard>
      </div>
    </PageLayout>
  )
}
