import api from './client'

export interface AdjustmentImpact {
  ni_impact: number
  ebitda_impact: number
  asset_impact: number
  liability_impact: number
  equity_impact: number
}

export interface AdjustmentListItem {
  id: number
  je_number: string
  entry_date: string
  entity_id: number
  scenario_id: number
  description: string
  source: string
  status: string
  overlay_group: string | null
  materiality: string | null
  total_debit: number
  impact: AdjustmentImpact
  package_ids: number[]
  has_advisor_note: boolean
  advisor_resolution_status: string | null
}

export interface AdjustmentPackage {
  id: number
  organization_id: string
  name: string
  package_type: string
  status: string
  description: string | null
  created_at: string
  updated_at: string | null
  member_count: number
}

export interface AdvisorNote {
  id: number
  journal_entry_id: number
  issue: string | null
  recommendation: string | null
  client_response: string | null
  resolution_status: string
  updated_at: string | null
  created_at: string
}

export interface RollforwardRow {
  account_id: number
  account_number: string
  account_name: string
  account_type: string
  as_reported: number
  adjustments: number
  adjusted: number
}

export interface AdjustmentFilters {
  entity_id?: number
  scenario_id?: number
  status?: string
  overlay_group?: string
  materiality?: string
  package_id?: number
  search?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}

export const adjustmentWorkspaceApi = {
  listAdjustments: (filters?: AdjustmentFilters) =>
    api.get<AdjustmentListItem[]>('/adjustment-workspace/adjustments', { params: filters }).then((r) => r.data),

  setMateriality: (jeId: number, materiality: string | null) =>
    api.patch<{ id: number; materiality: string | null }>(`/adjustment-workspace/adjustments/${jeId}/materiality`, { materiality }).then((r) => r.data),

  listPackages: () =>
    api.get<AdjustmentPackage[]>('/adjustment-workspace/packages').then((r) => r.data),

  createPackage: (data: { name: string; package_type?: string; description?: string }) =>
    api.post<AdjustmentPackage>('/adjustment-workspace/packages', data).then((r) => r.data),

  updatePackage: (id: number, data: Partial<{ name: string; package_type: string; status: string; description: string }>) =>
    api.put<AdjustmentPackage>(`/adjustment-workspace/packages/${id}`, data).then((r) => r.data),

  deletePackage: (id: number) =>
    api.delete(`/adjustment-workspace/packages/${id}`).then(() => undefined),

  addMember: (packageId: number, journalEntryId: number) =>
    api.post<{ package_id: number; journal_entry_id: number; added: boolean }>(`/adjustment-workspace/packages/${packageId}/members`, { journal_entry_id: journalEntryId }).then((r) => r.data),

  removeMember: (packageId: number, jeId: number) =>
    api.delete(`/adjustment-workspace/packages/${packageId}/members/${jeId}`).then(() => undefined),

  getNotes: (jeId: number) =>
    api.get<AdvisorNote | null>(`/adjustment-workspace/adjustments/${jeId}/notes`).then((r) => r.data),

  upsertNotes: (jeId: number, data: Partial<{ issue: string; recommendation: string; client_response: string; resolution_status: string }>) =>
    api.put<AdvisorNote>(`/adjustment-workspace/adjustments/${jeId}/notes`, data).then((r) => r.data),

  impactPreview: (ids: number[]) =>
    api.post<AdjustmentImpact>('/adjustment-workspace/impact-preview', { journal_entry_ids: ids }).then((r) => r.data),

  rollforward: (entityId: number, scenarioId?: number) =>
    api.get<RollforwardRow[]>('/adjustment-workspace/rollforward', { params: { entity_id: entityId, scenario_id: scenarioId } }).then((r) => r.data),
}
