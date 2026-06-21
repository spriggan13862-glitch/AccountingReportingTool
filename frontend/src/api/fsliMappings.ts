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
    opts?: { allowFsliChange?: boolean; organizationId?: number },
  ): Promise<FsliMapping> =>
    api
      .put<FsliMapping>(`/fsli-mappings/${entityId}/${viewId}/${accountId}`, {
        taxonomy_line_id: taxonomyLineId,
        allow_fsli_change: opts?.allowFsliChange ?? false,
        organization_id: opts?.organizationId,
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
    opts?: { allowFsliChange?: boolean; organizationId?: number },
  ): Promise<FsliPropagateResult> =>
    api
      .post<FsliPropagateResult>(
        `/fsli-mappings/${entityId}/${viewId}/propagate/${parentAccountId}`,
        {
          taxonomy_line_id: taxonomyLineId,
          overwrite_existing: overwriteExisting,
          allow_fsli_change: opts?.allowFsliChange ?? false,
          organization_id: opts?.organizationId,
        },
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

  bulkAssign: (
    entityId: number,
    viewId: number,
    accountIds: number[],
    taxonomyLineId: number,
    opts?: { allowFsliChange?: boolean; organizationId?: number },
  ): Promise<{ updated: number }> =>
    api
      .post<{ updated: number }>(`/fsli-mappings/${entityId}/${viewId}/bulk-assign`, {
        account_ids: accountIds,
        taxonomy_line_id: taxonomyLineId,
        allow_fsli_change: opts?.allowFsliChange ?? false,
        organization_id: opts?.organizationId,
      })
      .then((r) => r.data),
}

// Structured 409 body the backend returns when an advanced override would
// change an account's existing canonical FSLI. The UI can pattern-match
// on err.response.data.detail.code to render a confirmation dialog.
export interface FsliChangeConfirmationDetail {
  code: 'FSLI_CHANGE_REQUIRES_CONFIRMATION'
  message: string
  account_id: number
  current_crl_id: number
  current_crl_name: string
  new_crl_id: number
  new_crl_name: string
  remedy: string
}

export function isFsliChangeConfirmation(
  err: unknown,
): FsliChangeConfirmationDetail | null {
  const detail = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response?.data?.detail
  if (
    detail
    && typeof detail === 'object'
    && (detail as { code?: string }).code === 'FSLI_CHANGE_REQUIRES_CONFIRMATION'
  ) {
    return detail as FsliChangeConfirmationDetail
  }
  return null
}
