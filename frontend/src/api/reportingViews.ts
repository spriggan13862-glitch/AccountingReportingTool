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

export interface ViewAccountOverride {
  id: number
  view_id: number
  account_id: number
  taxonomy_line_id: number | null
  display_label: string | null
  created_by: string | null
  created_at: string
}

export interface ViewAccountOverrideCreate {
  taxonomy_line_id: number | null
  display_label?: string | null
}

export interface ViewComparisonRow {
  taxonomy_id: number
  code: string
  name: string
  section: string
  hierarchy_depth: number
  is_subtotal: boolean
  view1_balance: number
  view2_balance: number
  delta: number
}

export interface ViewComparisonResult {
  view1_id: number
  view2_id: number
  entity_id: number
  as_of_date: string
  statement_type: string
  rows: ViewComparisonRow[]
}

export interface ViewImpactAccount {
  account_id: number
  account_code: string
  account_name: string
  default_taxonomy_id: number | null
  default_taxonomy_name: string | null
  override_taxonomy_id: number | null
  override_taxonomy_name: string | null
  display_label: string | null
}

export interface ViewImpactResult {
  view_id: number
  entity_id: number
  override_count: number
  accounts: ViewImpactAccount[]
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

  listOverrides: (viewId: number) =>
    api.get<ViewAccountOverride[]>(`/reporting-views/${viewId}/overrides`).then((r) => r.data),

  setOverride: (viewId: number, accountId: number, body: ViewAccountOverrideCreate) =>
    api
      .put<ViewAccountOverride>(`/reporting-views/${viewId}/overrides/${accountId}`, body)
      .then((r) => r.data),

  deleteOverride: (viewId: number, accountId: number) =>
    api.delete(`/reporting-views/${viewId}/overrides/${accountId}`),

  compare: (params: {
    view1_id: number
    view2_id: number
    entity_id: number
    as_of_date: string
    statement_type?: string
    scenario_ids?: number[]
  }) =>
    api
      .get<ViewComparisonResult>('/reporting-views/compare', { params })
      .then((r) => r.data),

  impact: (viewId: number, entityId: number) =>
    api
      .get<ViewImpactResult>(`/reporting-views/${viewId}/impact`, { params: { entity_id: entityId } })
      .then((r) => r.data),
}
