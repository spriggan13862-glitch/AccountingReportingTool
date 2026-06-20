import api from './client'
import type { FsliEffectiveMapping } from '@/types'

export interface FsliMapping {
  entity_id: number | null
  view_id: number
  account_id: number
  taxonomy_line_id: number | null
  display_label: string | null
  account_number: string
  account_name: string
  taxonomy_line_name: string | null
}

export interface FsliPropagateResult {
  propagated_count: number
  accounts_updated: number[]
}

export const fsliMappingsApi = {
  list: (entityId: number, viewId: number): Promise<FsliMapping[]> =>
    api
      .get<FsliMapping[]>('/fsli-mappings/', { params: { entity_id: entityId, view_id: viewId } })
      .then((r) => r.data),

  upsert: (
    entityId: number,
    viewId: number,
    accountId: number,
    taxonomyLineId: number | null,
  ): Promise<FsliMapping> =>
    api
      .put<FsliMapping>(`/fsli-mappings/${entityId}/${viewId}/${accountId}`, {
        taxonomy_line_id: taxonomyLineId,
      })
      .then((r) => r.data),

  delete: (entityId: number, viewId: number, accountId: number): Promise<void> =>
    api.delete(`/fsli-mappings/${entityId}/${viewId}/${accountId}`).then(() => undefined),

  migrateFromAccounts: (
    entityId: number,
    viewId: number,
  ): Promise<{ migrated: number }> =>
    api
      .post<{ migrated: number }>(`/fsli-mappings/${entityId}/${viewId}/migrate-from-accounts`)
      .then((r) => r.data),

  listWithInheritance: (entityId: number, viewId: number): Promise<FsliEffectiveMapping[]> =>
    api
      .get<FsliEffectiveMapping[]>(`/fsli-mappings/${entityId}/${viewId}/with-inheritance`)
      .then((r) => r.data),

  propagateToChildren: (
    entityId: number,
    viewId: number,
    parentAccountId: number,
    taxonomyLineId: number,
    overwriteExisting: boolean = false,
  ): Promise<FsliPropagateResult> =>
    api
      .post<FsliPropagateResult>(
        `/fsli-mappings/${entityId}/${viewId}/propagate/${parentAccountId}`,
        { taxonomy_line_id: taxonomyLineId, overwrite_existing: overwriteExisting },
      )
      .then((r) => r.data),

  toggleLock: (entityId: number, viewId: number, accountId: number, locked: boolean): Promise<FsliMapping> =>
    api
      .put<FsliMapping>(`/fsli-mappings/${entityId}/${viewId}/${accountId}`, { locked })
      .then((r) => r.data),

  copyFromView: (entityId: number, targetViewId: number, sourceViewId: number): Promise<{ copied: number }> =>
    api
      .post<{ copied: number }>(`/fsli-mappings/${entityId}/${targetViewId}/copy-from/${sourceViewId}`)
      .then((r) => r.data),

  bulkAssign: (entityId: number, viewId: number, accountIds: number[], taxonomyLineId: number): Promise<{ updated: number }> =>
    api
      .post<{ updated: number }>(`/fsli-mappings/${entityId}/${viewId}/bulk-assign`, {
        account_ids: accountIds,
        taxonomy_line_id: taxonomyLineId,
      })
      .then((r) => r.data),
}
