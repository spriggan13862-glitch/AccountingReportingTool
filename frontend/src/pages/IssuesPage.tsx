import { useQuery } from '@tanstack/react-query'
import { workflowApi } from '@/api/workflow'
import { useOrg } from '@/providers/OrgProvider'
import { PageLayout } from '@/components/ui/PageLayout'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { SeverityBadge, StatusBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import type { WorkflowIssue } from '@/types'

const columns: Column<WorkflowIssue>[] = [
  { key: 'id', header: 'ID', render: (i) => <span className="text-gray-400">#{i.id}</span> },
  { key: 'code', header: 'Code', render: (i) => <span className="font-mono text-xs">{i.issue_code}</span> },
  { key: 'title', header: 'Title', render: (i) => <span className="font-medium">{i.title}</span> },
  { key: 'severity', header: 'Severity', render: (i) => <SeverityBadge severity={i.severity} /> },
  { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
  { key: 'object', header: 'Object', render: (i) => i.related_object_type ? `${i.related_object_type} #${i.related_object_id}` : '—' },
  { key: 'opened_at', header: 'Opened', render: (i) => i.opened_at.slice(0, 10) },
]

export function IssuesPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['issues', orgId, 'all'],
    queryFn: () => workflowApi.listIssues(orgId),
    enabled: orgId > 0,
  })

  return (
    <PageLayout title="Issues" subtitle="Workflow issues and blockers">
      {!org && <p className="text-sm text-gray-500">Select an organization to view issues.</p>}
      {isLoading && <LoadingState />}
      {isError && <ErrorState message={(error as Error).message} />}
      {data && data.length === 0 && <EmptyState title="No issues" description="No open issues found." />}
      {data && data.length > 0 && (
        <DataTable columns={columns} data={data} rowKey={(i) => i.id} />
      )}
    </PageLayout>
  )
}
