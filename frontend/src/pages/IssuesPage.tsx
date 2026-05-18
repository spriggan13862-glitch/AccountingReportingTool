import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowApi } from '@/api/workflow'
import { useOrg } from '@/providers/OrgProvider'
import { PageLayout } from '@/components/ui/PageLayout'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { SeverityBadge, StatusBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import type { WorkflowIssue } from '@/types'

export function IssuesPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const queryClient = useQueryClient()

  const [actionError, setActionError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '',
    issue_code: '',
    severity: 'warning',
    description: '',
    entity_id: '',
  })

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['issues', orgId, 'all'],
    queryFn: () => workflowApi.listIssues(orgId),
    enabled: orgId > 0,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      workflowApi.createIssue(orgId, {
        title: createForm.title,
        issue_code: createForm.issue_code,
        severity: createForm.severity,
        description: createForm.description || null,
      }),
    onSuccess: () => {
      setShowCreateForm(false)
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['issues', orgId] })
    },
    onError: (err: Error) => setActionError(err.message),
  })

  const resolveMutation = useMutation({
    mutationFn: (issueId: number) => workflowApi.resolveIssue(issueId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['issues', orgId] }),
    onError: (err: Error) => setActionError(err.message),
  })

  const dismissMutation = useMutation({
    mutationFn: (issueId: number) => workflowApi.dismissIssue(issueId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['issues', orgId] }),
    onError: (err: Error) => setActionError(err.message),
  })

  const columns: Column<WorkflowIssue>[] = [
    { key: 'id', header: 'ID', render: (i) => <span className="text-gray-400">#{i.id}</span> },
    { key: 'code', header: 'Code', render: (i) => <span className="font-mono text-xs">{i.issue_code}</span> },
    { key: 'title', header: 'Title', render: (i) => <span className="font-medium">{i.title}</span> },
    { key: 'severity', header: 'Severity', render: (i) => <SeverityBadge severity={i.severity} /> },
    { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
    { key: 'object', header: 'Object', render: (i) => i.related_object_type ? `${i.related_object_type} #${i.related_object_id}` : '—' },
    { key: 'opened_at', header: 'Opened', render: (i) => i.opened_at.slice(0, 10) },
    {
      key: 'actions',
      header: '',
      render: (i) =>
        i.status === 'open' ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => resolveMutation.mutate(i.id)}
              disabled={resolveMutation.isPending}
              data-testid={`resolve-issue-${i.id}`}
              className="rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
            >
              Resolve
            </button>
            <button
              type="button"
              onClick={() => dismissMutation.mutate(i.id)}
              disabled={dismissMutation.isPending}
              data-testid={`dismiss-issue-${i.id}`}
              className="rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        ) : null,
    },
  ]

  return (
    <PageLayout
      title="Issues"
      subtitle="Workflow issues and blockers"
      actions={
        org ? (
          <button
            type="button"
            onClick={() => setShowCreateForm((s) => !s)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            {showCreateForm ? 'Cancel' : '+ New Issue'}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4 max-w-4xl">
        {actionError && <ErrorBanner message={actionError} />}

        {showCreateForm && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3" data-testid="create-issue-form">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">New Issue</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input
                label="Title"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                placeholder="Issue title"
                required
              />
              <Input
                label="Issue Code"
                value={createForm.issue_code}
                onChange={(e) => setCreateForm({ ...createForm, issue_code: e.target.value })}
                placeholder="MISSING_SIGNOFF"
                required
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Severity</label>
                <select
                  value={createForm.severity}
                  onChange={(e) => setCreateForm({ ...createForm, severity: e.target.value })}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {['info', 'warning', 'error', 'critical'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <Input
                label="Description"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="optional"
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
              disabled={createMutation.isPending || !createForm.title || !createForm.issue_code}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create Issue'}
            </button>
          </div>
        )}

        {!org && <p className="text-sm text-gray-500">Select an organization to view issues.</p>}
        {isLoading && <LoadingState />}
        {isError && <ErrorState message={(error as Error).message} />}
        {data && data.length === 0 && <EmptyState title="No issues" description="No open issues found." />}
        {data && data.length > 0 && (
          <DataTable columns={columns} data={data} rowKey={(i) => i.id} />
        )}
      </div>
    </PageLayout>
  )
}
