import api from './client'
import type { ReportingTaxonomyLine, TaxonomyImportPreview } from '@/types'

export interface TaxonomyLineCreate {
  code: string
  name: string
  short_name?: string | null
  section: string
  statement_type?: string | null
  sort_order?: number
  is_subtotal?: boolean
  normal_balance?: string | null
  sign_behavior?: string
  parent_id?: number | null
  description?: string | null
  active?: boolean
  editable?: boolean
  sec_xbrl_tag?: string | null
}

export interface TaxonomyLineUpdate {
  name?: string
  short_name?: string | null
  section?: string
  statement_type?: string | null
  sort_order?: number
  is_subtotal?: boolean
  normal_balance?: string | null
  sign_behavior?: string | null
  parent_id?: number | null
  description?: string | null
  active?: boolean
  editable?: boolean
  sec_xbrl_tag?: string | null
}

export const reportingTaxonomyApi = {
  list: (activeOnly = true, statementType?: string) => {
    const params: Record<string, string | boolean> = { active_only: activeOnly }
    if (statementType) params.statement_type = statementType
    return api.get<ReportingTaxonomyLine[]>('/reporting-taxonomy/', { params }).then((r) => r.data)
  },

  get: (id: number) =>
    api.get<ReportingTaxonomyLine>(`/reporting-taxonomy/${id}`).then((r) => r.data),

  create: (body: TaxonomyLineCreate) =>
    api.post<ReportingTaxonomyLine>('/reporting-taxonomy/', body).then((r) => r.data),

  update: (id: number, body: TaxonomyLineUpdate) =>
    api.patch<ReportingTaxonomyLine>(`/reporting-taxonomy/${id}`, body).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/reporting-taxonomy/${id}`),

  exportCsv: () => {
    window.open('/api/v1/reporting-taxonomy/export.csv', '_blank')
  },

  previewImport: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<TaxonomyImportPreview>('/reporting-taxonomy/import/preview', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },

  applyImport: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ created: number; updated: number; errors: string[] }>(
      '/reporting-taxonomy/import/apply', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    ).then((r) => r.data)
  },

  reseed: () =>
    api.post<{ seeded: boolean; total_lines: number }>('/reporting-taxonomy/seed').then((r) => r.data),
}
