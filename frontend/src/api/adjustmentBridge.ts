import api from './client'

export interface JeImpactResult {
  ni_impact: number
  bs_impact: number
  asset_impact: number
  liability_impact: number
  equity_impact: number
  line_details: Array<{
    account_id: number
    account_number: string
    account_name: string
    account_type: string
    debit: number
    credit: number
    accounting_balance: number
    presentation_amount: number
  }>
}

export interface AdjustmentBridgeRow {
  id: number
  entity_id: number
  period_end: string
  scenario_id: number | null
  account_id: number | null
  account_number: string | null
  account_name: string | null
  account_type: string | null
  taxonomy_category: string | null
  fs_line: string | null
  adjustment_type: string | null
  is_posted: boolean
  is_included: boolean
  source: string | null
  consolidation_group: string | null
  imported_balance: string | null
  posted_adjustments: string | null
  draft_adjustments: string | null
  excluded_adjustments: string | null
  adjusted_balance: string | null
  variance: string | null
  prior_period_balance: string | null
  budget_placeholder: string | null
  notes: string | null
}

export interface AdjustmentBridgeView {
  id: number
  entity_id: number
  name: string
  description: string | null
  is_default: boolean
  row_dimensions: string[] | null
  column_dimensions: string[] | null
  slicer_config: Record<string, unknown> | null
  sort_config: Array<{ field: string; dir: string }> | null
  visible_measures: string[] | null
}

export interface ComputeResult {
  entity_id: number
  period_end: string
  scenario_id: number | null
  rows_computed: number
  message: string
}

export interface CPABridgeColumn {
  je_id: number
  je_number: string
  description: string
  entry_date: string
}

export interface CPABridgeRow {
  account_id: number
  account_number: string
  account_name: string
  account_type: string
  account_sort: number
  as_reported: number
  ajes: Record<string, number>
  total_ajes: number
  adjusted: number
}

export interface CPABridgeResult {
  entity_id: number
  period_end: string
  scenario_id: number | null
  columns: CPABridgeColumn[]
  rows: CPABridgeRow[]
  totals: {
    as_reported: number
    ajes: Record<string, number>
    total_ajes: number
    adjusted: number
  }
}

export interface BridgeAdjustment {
  id: number
  je_number: string
  sequence: number
  entry_date: string
  description: string
  status: string
  total_debit: number
  total_credit: number
}

export interface BridgeRow {
  row_type: 'section' | 'account'
  level: number
  label: string
  account_id: number | null
  account_number: string | null
  account_name: string | null
  account_type: string | null
  as_reported: number
  adjustment_impacts: Record<string, number>
  total_ajes: number
  adjusted_balance: number
}

export interface BridgeResult {
  entity_id: number
  period_end: string
  scenario_id: number | null
  reporting_basis: string
  adjustments: BridgeAdjustment[]
  rows: BridgeRow[]
  totals: {
    as_reported: number
    adjustment_impacts: Record<string, number>
    total_ajes: number
    adjusted_balance: number
  }
}

export const adjustmentBridgeApi = {
  compute: (entityId: number, periodEnd: string, scenarioId?: number): Promise<ComputeResult> =>
    api.get<ComputeResult>('/adjustment-bridge/compute', {
      params: { entity_id: entityId, period_end: periodEnd, scenario_id: scenarioId },
    }).then((r) => r.data),

  rows: (params: {
    entity_id: number
    period_end?: string
    scenario_id?: number
    account_type?: string
    taxonomy_category?: string
  }): Promise<AdjustmentBridgeRow[]> =>
    api.get<AdjustmentBridgeRow[]>('/adjustment-bridge/rows', { params }).then((r) => r.data),

  listViews: (entityId: number): Promise<AdjustmentBridgeView[]> =>
    api.get<AdjustmentBridgeView[]>('/adjustment-bridge/views', { params: { entity_id: entityId } }).then((r) => r.data),

  createView: (body: Partial<AdjustmentBridgeView> & { entity_id: number; name: string }): Promise<AdjustmentBridgeView> =>
    api.post<AdjustmentBridgeView>('/adjustment-bridge/views', body).then((r) => r.data),

  updateView: (viewId: number, body: Partial<AdjustmentBridgeView>): Promise<AdjustmentBridgeView> =>
    api.patch<AdjustmentBridgeView>(`/adjustment-bridge/views/${viewId}`, body).then((r) => r.data),

  deleteView: (viewId: number): Promise<void> =>
    api.delete(`/adjustment-bridge/views/${viewId}`).then(() => undefined),

  cpaBridge: (params: {
    entity_id: number
    period_end: string
    scenario_id?: number
  }): Promise<CPABridgeResult> =>
    api.get<CPABridgeResult>('/adjustment-bridge/cpa-bridge', { params }).then((r) => r.data),

  bridge: (params: {
    entity_id: number
    period_end: string
    scenario_id?: number
    reporting_basis?: string
  }): Promise<BridgeResult> =>
    api.get<BridgeResult>('/adjustment-bridge/bridge', { params }).then((r) => r.data),

  exportBridgeCsv: (entityId: number, periodEnd: string, scenarioId?: number, reportingBasis = 'adjusted'): Promise<Blob> =>
    api.get('/adjustment-bridge/bridge/export-csv', {
      params: { entity_id: entityId, period_end: periodEnd, scenario_id: scenarioId, reporting_basis: reportingBasis },
      responseType: 'blob',
    }).then((r) => r.data),

  getJeImpact: (jeId: number): Promise<JeImpactResult> =>
    api.get<JeImpactResult>(`/adjustment-workspace/journal-entries/${jeId}/impact`).then((r) => r.data),
}
