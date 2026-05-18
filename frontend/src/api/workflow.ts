import api from './client'
import type { WorkflowTask, WorkflowIssue, Signoff } from '@/types'

export const workflowApi = {
  listTasks: (organizationId: number, params?: { status?: string; task_type?: string }) =>
    api
      .get<WorkflowTask[]>('/workflow/tasks', { params: { organization_id: organizationId, ...params } })
      .then((r) => r.data),

  listIssues: (organizationId: number, params?: { status?: string; severity?: string }) =>
    api
      .get<WorkflowIssue[]>('/workflow/issues', { params: { organization_id: organizationId, ...params } })
      .then((r) => r.data),

  listSignoffs: (objectType: string, objectId: number) =>
    api
      .get<Signoff[]>(`/workflow/signoffs/${objectType}/${objectId}`)
      .then((r) => r.data),
}
