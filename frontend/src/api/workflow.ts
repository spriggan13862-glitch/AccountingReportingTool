import api from './client'
import type { WorkflowTask, WorkflowIssue, Signoff } from '@/types'

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

export interface CreateTaskRequest {
  task_type: string
  title: string
  description?: string | null
  priority?: string
  assigned_to_user_id?: number | null
  due_date?: string | null
}

export interface CreateIssueRequest {
  issue_code: string
  severity: string
  title: string
  description?: string | null
  related_object_type?: string | null
  related_object_id?: number | null
}

export interface CreateSignoffRequest {
  object_type: string
  object_id: number
  reviewer_user_id: number
  notes?: string | null
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const workflowApi = {
  // Queries
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

  // Task mutations
  createTask: (organizationId: number, data: CreateTaskRequest) =>
    api
      .post<WorkflowTask>('/workflow/tasks', data, { params: { organization_id: organizationId } })
      .then((r) => r.data),

  assignTask: (taskId: number, assignedToUserId: number) =>
    api
      .put<WorkflowTask>(`/workflow/tasks/${taskId}/assign`, { assigned_to_user_id: assignedToUserId })
      .then((r) => r.data),

  updateTaskStatus: (taskId: number, newStatus: string, reviewedByUserId?: number) =>
    api
      .put<WorkflowTask>(`/workflow/tasks/${taskId}/status`, {
        new_status: newStatus,
        reviewed_by_user_id: reviewedByUserId ?? null,
      })
      .then((r) => r.data),

  completeTask: (taskId: number) =>
    api.put<WorkflowTask>(`/workflow/tasks/${taskId}/complete`).then((r) => r.data),

  rejectTask: (taskId: number) =>
    api.put<WorkflowTask>(`/workflow/tasks/${taskId}/reject`).then((r) => r.data),

  // Issue mutations
  createIssue: (organizationId: number, data: CreateIssueRequest) =>
    api
      .post<WorkflowIssue>('/workflow/issues', data, { params: { organization_id: organizationId } })
      .then((r) => r.data),

  resolveIssue: (issueId: number, resolutionNotes?: string) =>
    api
      .put<WorkflowIssue>(`/workflow/issues/${issueId}/resolve`, { resolution_notes: resolutionNotes ?? null })
      .then((r) => r.data),

  dismissIssue: (issueId: number) =>
    api.put<WorkflowIssue>(`/workflow/issues/${issueId}/dismiss`).then((r) => r.data),

  // Signoff mutations
  createSignoff: (organizationId: number, data: CreateSignoffRequest) =>
    api
      .post<Signoff>('/workflow/signoffs', data, { params: { organization_id: organizationId } })
      .then((r) => r.data),

  approveSignoff: (signoffId: number, notes?: string) =>
    api
      .put<Signoff>(`/workflow/signoffs/${signoffId}/approve`, { notes: notes ?? null })
      .then((r) => r.data),

  rejectSignoff: (signoffId: number, notes?: string) =>
    api
      .put<Signoff>(`/workflow/signoffs/${signoffId}/reject`, { notes: notes ?? null })
      .then((r) => r.data),
}
