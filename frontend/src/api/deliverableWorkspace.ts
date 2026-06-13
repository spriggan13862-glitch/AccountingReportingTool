import api from './client'

export interface DeliverablePackage {
  id: number
  organization_id: string
  name: string
  package_type: string
  status: string
  description: string | null
  owner: string | null
  created_at: string
  updated_at: string | null
  item_count: number
  memo_count: number
}

export interface DeliverablePackageItem {
  id: number
  package_id: number
  item_type: string
  item_ref: string
  item_label: string | null
  added_at: string
}

export interface DeliverableMemo {
  id: number
  package_id: number
  issue: string | null
  observation: string | null
  recommendation: string | null
  client_response: string | null
  status: string
  created_at: string
  updated_at: string | null
}

export interface DeliverableDashboard {
  total_packages: number
  draft_count: number
  internal_review_count: number
  client_review_count: number
  finalized_count: number
  archived_count: number
}

export interface DeliverablePackageCreate {
  name: string
  package_type?: string
  description?: string | null
  owner?: string | null
}

export interface DeliverablePackageUpdate {
  name?: string
  package_type?: string
  status?: string
  description?: string | null
  owner?: string | null
}

export interface DeliverableMemoCreate {
  issue?: string | null
  observation?: string | null
  recommendation?: string | null
  client_response?: string | null
  status?: string
}

export interface DeliverableMemoUpdate {
  issue?: string | null
  observation?: string | null
  recommendation?: string | null
  client_response?: string | null
  status?: string | null
}

export interface DeliverableSnapshot {
  id: number
  package_id: number
  snapshot_name: string
  entity_id: number | null
  as_of_date: string | null
  scenario_ids: string | null
  data_view: string
  created_by: string | null
  created_at: string
  notes: string | null
}

export interface DeliverableSnapshotCreate {
  snapshot_name: string
  entity_id?: number
  as_of_date?: string
  scenario_ids?: number[]
  data_view?: string
  notes?: string
}

const BASE = '/deliverable-workspace'

export const deliverableWorkspaceApi = {
  getDashboard: (): Promise<DeliverableDashboard> =>
    api.get(`${BASE}/dashboard`).then((r) => r.data),

  listPackages: (params?: { status?: string; package_type?: string }): Promise<DeliverablePackage[]> =>
    api.get(`${BASE}/packages`, { params }).then((r) => r.data),

  createPackage: (body: DeliverablePackageCreate): Promise<DeliverablePackage> =>
    api.post(`${BASE}/packages`, body).then((r) => r.data),

  updatePackage: (id: number, body: DeliverablePackageUpdate): Promise<DeliverablePackage> =>
    api.put(`${BASE}/packages/${id}`, body).then((r) => r.data),

  deletePackage: (id: number): Promise<void> =>
    api.delete(`${BASE}/packages/${id}`).then(() => undefined),

  clonePackage: (id: number): Promise<DeliverablePackage> =>
    api.post(`${BASE}/packages/${id}/clone`).then((r) => r.data),

  listItems: (packageId: number): Promise<DeliverablePackageItem[]> =>
    api.get(`${BASE}/packages/${packageId}/items`).then((r) => r.data),

  addItem: (packageId: number, body: { item_type: string; item_ref: string; item_label?: string }): Promise<DeliverablePackageItem> =>
    api.post(`${BASE}/packages/${packageId}/items`, body).then((r) => r.data),

  removeItem: (packageId: number, itemId: number): Promise<void> =>
    api.delete(`${BASE}/packages/${packageId}/items/${itemId}`).then(() => undefined),

  listMemos: (packageId: number): Promise<DeliverableMemo[]> =>
    api.get(`${BASE}/packages/${packageId}/memos`).then((r) => r.data),

  createMemo: (packageId: number, body: DeliverableMemoCreate): Promise<DeliverableMemo> =>
    api.post(`${BASE}/packages/${packageId}/memos`, body).then((r) => r.data),

  updateMemo: (packageId: number, memoId: number, body: DeliverableMemoUpdate): Promise<DeliverableMemo> =>
    api.put(`${BASE}/packages/${packageId}/memos/${memoId}`, body).then((r) => r.data),

  deleteMemo: (packageId: number, memoId: number): Promise<void> =>
    api.delete(`${BASE}/packages/${packageId}/memos/${memoId}`).then(() => undefined),

  exportPackageExcel: (packageId: number): string =>
    `/api/v1/deliverable-workspace/packages/${packageId}/export/excel`,

  exportAdjustmentListingExcel: (entityId?: number): string => {
    const qs = entityId ? `?entity_id=${entityId}` : ''
    return `/api/v1/deliverable-workspace/exports/adjustment-listing/excel${qs}`
  },

  createSnapshot: (pkgId: number, body: DeliverableSnapshotCreate): Promise<DeliverableSnapshot> =>
    api.post(`${BASE}/packages/${pkgId}/snapshot`, body).then((r) => r.data),

  listSnapshots: (pkgId: number): Promise<DeliverableSnapshot[]> =>
    api.get(`${BASE}/packages/${pkgId}/snapshots`).then((r) => r.data),
}
