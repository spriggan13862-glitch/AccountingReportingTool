import { useQuery } from '@tanstack/react-query'
import { workflowApi } from '@/api/workflow'
import { useOrg } from '@/providers/OrgProvider'
import { PageLayout } from '@/components/ui/PageLayout'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import type { WorkflowTask } from '@/types'

const taskColumns: Column<WorkflowTask>[] = [
  { key: 'id', header: 'ID', render: (t) => <span className="text-gray-400">#{t.id}</span> },
  { key: 'title', header: 'Title', render: (t) => <span className="font-medium">{t.title}</span> },
  { key: 'type', header: 'Type', render: (t) => t.task_type.replace(/_/g, ' ') },
  { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
  { key: 'priority', header: 'Priority', render: (t) => <PriorityBadge priority={t.priority} /> },
  { key: 'due_date', header: 'Due', render: (t) => t.due_date ?? '—' },
  { key: 'assigned', header: 'Assigned To', render: (t) => t.assigned_to_user_id ? `#${t.assigned_to_user_id}` : '—' },
]

export function WorkflowPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tasks', orgId, 'all'],
    queryFn: () => workflowApi.listTasks(orgId),
    enabled: orgId > 0,
  })

  return (
    <PageLayout title="Workflow Tasks" subtitle="All tasks across this organization">
      {!org && <p className="text-sm text-gray-500">Select an organization to view tasks.</p>}
      {isLoading && <LoadingState />}
      {isError && <ErrorState message={(error as Error).message} />}
      {data && data.length === 0 && <EmptyState title="No tasks" description="Create tasks via the API or during close workflows." />}
      {data && data.length > 0 && (
        <DataTable columns={taskColumns} data={data} rowKey={(t) => t.id} />
      )}
    </PageLayout>
  )
}
