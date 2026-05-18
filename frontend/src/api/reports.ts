import api from './client'
import type { ReportRun } from '@/types'

export const reportsApi = {
  list: (organizationId: number, params?: { report_type?: string; status?: string }) =>
    api
      .get<ReportRun[]>('/report-runs', { params: { organization_id: organizationId, ...params } })
      .then((r) => r.data),
  get: (id: number) => api.get<ReportRun>(`/report-runs/${id}`).then((r) => r.data),
  getValidation: (id: number) =>
    api.get<{ run_id: number; validation_summary: Record<string, unknown> }>(
      `/report-runs/${id}/validation`,
    ).then((r) => r.data),
  getWorkflow: (id: number) =>
    api.get<{ run_id: number; workflow_summary: Record<string, unknown> }>(
      `/report-runs/${id}/workflow`,
    ).then((r) => r.data),
}
