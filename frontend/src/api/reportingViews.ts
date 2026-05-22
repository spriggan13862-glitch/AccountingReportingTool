import api from './client'
import type { ReportingTaxonomyView } from '@/types'

export interface ViewCreate {
  code: string
  name: string
  description?: string | null
  is_default?: boolean
}

export interface ViewUpdate {
  name?: string
  description?: string | null
  is_default?: boolean
  active?: boolean
}

export const reportingViewsApi = {
  list: () =>
    api.get<ReportingTaxonomyView[]>('/reporting-views/').then((r) => r.data),

  get: (id: number) =>
    api.get<ReportingTaxonomyView>(`/reporting-views/${id}`).then((r) => r.data),

  create: (body: ViewCreate) =>
    api.post<ReportingTaxonomyView>('/reporting-views/', body).then((r) => r.data),

  update: (id: number, body: ViewUpdate) =>
    api.patch<ReportingTaxonomyView>(`/reporting-views/${id}`, body).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/reporting-views/${id}`),

  clone: (id: number) =>
    api.post<ReportingTaxonomyView>(`/reporting-views/${id}/clone`).then((r) => r.data),
}
