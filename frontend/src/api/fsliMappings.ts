import api from './client'

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
}
