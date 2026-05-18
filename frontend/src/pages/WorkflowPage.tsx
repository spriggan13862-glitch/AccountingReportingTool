import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowApi } from '@/api/workflow'
import { useOrg } from '@/providers/OrgProvider'
import { PageLayout } from '@/components/ui/PageLayout'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import type { WorkflowTask } from '@/types'

export function WorkflowPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const queryClient = useQueryClient()

  const [actionError, setActionError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '',
    task_type: 'review',
    priority: 'medium',
    due_date: '',
    entity_id: '',
  })

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tasks', orgId, 'all'],
    queryFn: () => workflowApi.listTasks(orgId),
    enabled: orgId > 0,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      workflowApi.createTask(orgId, {
        title: createForm.title,
        task_type: createForm.task_type,
        priority: createForm.priority,
        due_date: createForm.due_date || null,
      }),
    onSuccess: () => {
      setShowCreateForm(false)
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['tasks', orgId] })
    },
    onError: (err: Error) => setActionError(err.message),
  })

  const completeMutation = useMutation({
    mutationFn: (taskId: number) => workflowApi.completeTask(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', orgId] }),
    onError: (err: Error) => setActionError(err.message),
  })

  const rejectMutation = useMutation({
    mutationFn: (taskId: number) => workflowApi.rejectTask(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', orgId] }),
    onError: (err: Error) => setActionError(err.message),
  })

  const taskColumns: Column<WorkflowTask>[] = [
    { key: 'id', header: 'ID', render: (t) => <span className="text-gray-400">#{t.id}</span> },
    { key: 'title', header: 'Title', render: (t) => <span className="font-medium">{t.title}</span> },
    { key: 'type', header: 'Type', render: (t) => t.task_type.replace(/_/g, ' ') },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
    { key: 'priority', header: 'Priority', render: (t) => <PriorityBadge priority={t.priority} /> },
    { key: 'due_date', header: 'Due', render: (t) => t.due_date ?? '—' },
    { key: 'assigned', header: 'Assigned To', render: (t) => t.assigned_to_user_id ? `#${t.assigned_to_user_id}` : '—' },
    {
      key: 'actions',
      header: '',
      render: (t) =>
        t.status === 'open' || t.status === 'in_progress' ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => completeMutation.mutate(t.id)}
              disabled={completeMutation.isPending}
              data-testid={`complete-task-${t.id}`}
              className="rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
            >
              Complete
            </button>
            <button
              type="button"
              onClick={() => rejectMutation.mutate(t.id)}
              disabled={rejectMutation.isPending}
              data-testid={`reject-task-${t.id}`}
              className="rounded px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        ) : null,
    },
  ]

  return (
    <PageLayout
      title="Workflow Tasks"
      subtitle="All tasks across this organization"
      actions={
        org ? (
          <button
            type="button"
            onClick={() => setShowCreateForm((s) => !s)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            {showCreateForm ? 'Cancel' : '+ New Task'}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4 max-w-4xl">
        {actionError && <ErrorBanner message={actionError} />}

        {showCreateForm && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3" data-testid="create-task-form">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">New Task</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input
                label="Title"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                placeholder="Task title"
                required
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Task Type</label>
                <select
                  value={createForm.task_type}
                  onChange={(e) => setCreateForm({ ...createForm, task_type: e.target.value })}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {['review', 'approve', 'close_period', 'reconcile', 'other'].map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Priority</label>
                <select
                  value={createForm.priority}
                  onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {['low', 'medium', 'high', 'critical'].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <Input
                label="Due Date"
                type="date"
                value={createForm.due_date}
                onChange={(e) => setCreateForm({ ...createForm, due_date: e.target.value })}
              />
              <Input
                label="Entity ID"
                type="number"
                value={createForm.entity_id}
                onChange={(e) => setCreateForm({ ...createForm, entity_id: e.target.value })}
                placeholder="optional"
              />
            </div>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !createForm.title}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        )}

        {!org && <p className="text-sm text-gray-500">Select an organization to view tasks.</p>}
        {isLoading && <LoadingState />}
        {isError && <ErrorState message={(error as Error).message} />}
        {data && data.length === 0 && <EmptyState title="No tasks" description="Create tasks via the form above or during close workflows." />}
        {data && data.length > 0 && (
          <DataTable columns={taskColumns} data={data} rowKey={(t) => t.id} />
        )}
      </div>
    </PageLayout>
  )
}
