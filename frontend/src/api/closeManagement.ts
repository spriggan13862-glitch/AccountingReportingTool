import api from './client'
import type {
  CloseChecklist,
  CloseTask,
  CloseTaskComment,
  CloseTaskAttachment,
  CloseReadiness,
  Workpaper,
  WorkpaperReference,
} from '@/types'

const BASE = '/close'

export const closeApi = {
  // Checklists
  createChecklist: (body: {
    organization_id: number
    name: string
    close_type?: string
    entity_id?: number | null
    period_id?: number | null
    target_close_date?: string | null
    notes?: string | null
  }) => api.post<CloseChecklist>(`${BASE}/checklists/`, body).then((r) => r.data),

  listChecklists: (organizationId: number, params?: { entity_id?: number; period_id?: number; status?: string }) =>
    api.get<CloseChecklist[]>(`${BASE}/checklists/`, { params: { organization_id: organizationId, ...params } }).then((r) => r.data),

  getChecklist: (id: number) =>
    api.get<CloseChecklist>(`${BASE}/checklists/${id}`).then((r) => r.data),

  updateChecklistStatus: (id: number, new_status: string, comment?: string) =>
    api.patch<CloseChecklist>(`${BASE}/checklists/${id}/status`, { new_status, comment }).then((r) => r.data),

  // Tasks
  createTask: (checklistId: number, body: {
    title: string
    task_type?: string
    description?: string | null
    priority?: string
    assigned_to_user_id?: number | null
    reviewer_user_id?: number | null
    due_date?: string | null
    sort_order?: number
    notes?: string | null
    blocker_task_ids?: number[] | null
    is_required?: boolean
    linked_reconciliation_id?: number | null
    linked_import_batch_id?: number | null
  }) => api.post<CloseTask>(`${BASE}/checklists/${checklistId}/tasks/`, body).then((r) => r.data),

  listTasks: (checklistId: number, params?: { status?: string; assigned_to?: number }) =>
    api.get<CloseTask[]>(`${BASE}/checklists/${checklistId}/tasks/`, { params }).then((r) => r.data),

  getTask: (taskId: number) =>
    api.get<CloseTask>(`${BASE}/tasks/${taskId}`).then((r) => r.data),

  assignTask: (taskId: number, assigned_to_user_id?: number | null, reviewer_user_id?: number | null) =>
    api.put<CloseTask>(`${BASE}/tasks/${taskId}/assign`, { assigned_to_user_id, reviewer_user_id }).then((r) => r.data),

  transitionTask: (taskId: number, new_status: string, comment?: string) =>
    api.post<CloseTask>(`${BASE}/tasks/${taskId}/transition`, { new_status, comment }).then((r) => r.data),

  submitForReview: (taskId: number, comment?: string) =>
    api.post<CloseTask>(`${BASE}/tasks/${taskId}/submit-review`, { comment }).then((r) => r.data),

  approveTask: (taskId: number, comment?: string) =>
    api.post<CloseTask>(`${BASE}/tasks/${taskId}/approve`, { comment }).then((r) => r.data),

  rejectTask: (taskId: number, reason: string) =>
    api.post<CloseTask>(`${BASE}/tasks/${taskId}/reject`, { reason }).then((r) => r.data),

  // Comments
  addComment: (taskId: number, comment_text: string) =>
    api.post<CloseTaskComment>(`${BASE}/tasks/${taskId}/comments/`, { comment_text }).then((r) => r.data),

  listComments: (taskId: number) =>
    api.get<CloseTaskComment[]>(`${BASE}/tasks/${taskId}/comments/`).then((r) => r.data),

  // Attachments
  addAttachment: (taskId: number, body: {
    attachment_label: string
    original_filename: string
    document_id?: number | null
    document_category?: string
    notes?: string | null
  }) => api.post<CloseTaskAttachment>(`${BASE}/tasks/${taskId}/attachments/`, body).then((r) => r.data),

  listAttachments: (taskId: number, include_superseded?: boolean) =>
    api.get<CloseTaskAttachment[]>(`${BASE}/tasks/${taskId}/attachments/`, {
      params: { include_superseded: include_superseded ?? false }
    }).then((r) => r.data),

  // Readiness / Export
  getReadiness: (checklistId: number) =>
    api.get<CloseReadiness>(`${BASE}/checklists/${checklistId}/readiness`).then((r) => r.data),

  exportBinder: (checklistId: number) =>
    api.get<Record<string, unknown>>(`${BASE}/checklists/${checklistId}/export`).then((r) => r.data),

  // Workpapers
  createWorkpaper: (organizationId: number, body: {
    title: string
    workpaper_type?: string
    description?: string | null
    entity_id?: number | null
    period_id?: number | null
    close_task_id?: number | null
    preparer_user_id?: number | null
    reviewer_user_id?: number | null
  }) => api.post<Workpaper>(`${BASE}/workpapers/?organization_id=${organizationId}`, body).then((r) => r.data),

  listWorkpapers: (organizationId: number, params?: { entity_id?: number; period_id?: number; status?: string }) =>
    api.get<Workpaper[]>(`${BASE}/workpapers/`, { params: { organization_id: organizationId, ...params } }).then((r) => r.data),

  getWorkpaper: (wpId: number) =>
    api.get<Workpaper>(`${BASE}/workpapers/${wpId}`).then((r) => r.data),

  submitWorkpaper: (wpId: number) =>
    api.post<Workpaper>(`${BASE}/workpapers/${wpId}/submit`).then((r) => r.data),

  reviewWorkpaper: (wpId: number, approved: boolean, comment?: string) =>
    api.post<Workpaper>(`${BASE}/workpapers/${wpId}/review`, { approved, comment }).then((r) => r.data),

  finalizeWorkpaper: (wpId: number) =>
    api.post<Workpaper>(`${BASE}/workpapers/${wpId}/finalize`).then((r) => r.data),

  addReference: (wpId: number, reference_type: string, reference_id: number, notes?: string) =>
    api.post<WorkpaperReference>(`${BASE}/workpapers/${wpId}/references/`, { reference_type, reference_id, notes }).then((r) => r.data),

  listReferences: (wpId: number) =>
    api.get<WorkpaperReference[]>(`${BASE}/workpapers/${wpId}/references/`).then((r) => r.data),
}
