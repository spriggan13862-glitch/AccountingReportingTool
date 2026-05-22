import api from './client'
import type { Account, AccountNode } from '@/types'

export interface AccountCreate {
  entity_id?: number | null
  account_number: string
  account_name: string
  account_type: string
  normal_balance: string
  parent_account_id?: number | null
  detail_type?: string | null
  description?: string | null
  tax_line?: string | null
  source_system?: string | null
  reporting_taxonomy_line_id?: number | null
}

export interface AccountUpdate {
  account_name?: string
  account_type?: string
  normal_balance?: string
  detail_type?: string | null
  description?: string | null
  tax_line?: string | null
  account_status?: string
  reporting_taxonomy_line_id?: number | null
  parent_account_id?: number | null
  active?: boolean
}

interface AccountPage {
  items: Account[]
  total: number
  page: number
  page_size: number
  pages: number
}

export const accountsApi = {
  list: (entityId?: number, search?: string, accountStatus?: string) => {
    const params: Record<string, string | number> = {}
    if (entityId !== undefined) params.entity_id = entityId
    if (search) params.search = search
    if (accountStatus) params.account_status = accountStatus
    return api.get<AccountPage | Account[]>('/accounts/', { params }).then((r) =>
      Array.isArray(r.data) ? r.data : (r.data as AccountPage).items ?? []
    )
  },

  listPaged: (entityId?: number, search?: string, page = 1, pageSize = 100) => {
    const params: Record<string, string | number> = { page, page_size: pageSize }
    if (entityId !== undefined) params.entity_id = entityId
    if (search) params.search = search
    return api.get<AccountPage>('/accounts/', { params }).then((r) => r.data)
  },

  tree: (entityId: number) =>
    api.get<AccountNode[]>('/accounts/tree', { params: { entity_id: entityId } }).then((r) => r.data),

  get: (id: number) => api.get<Account>(`/accounts/${id}`).then((r) => r.data),

  create: (body: AccountCreate) =>
    api.post<Account>('/accounts/', body).then((r) => r.data),

  update: (id: number, body: AccountUpdate) =>
    api.patch<Account>(`/accounts/${id}`, body).then((r) => r.data),

  reparent: (id: number, parentAccountId: number | null) =>
    api.post<AccountReparentResult>(`/accounts/${id}/reparent`, { parent_account_id: parentAccountId }).then((r) => r.data),

  bulkUpdate: (ids: number[], patch: AccountUpdate) =>
    api.patch<Account[]>('/accounts/bulk', { ids, patch }).then((r) => r.data),
}

export interface AccountReparentResult {
  account_id: number
  account_number: string
  account_name: string
  old_parent_id: number | null
  old_parent_number: string | null
  old_parent_name: string | null
  new_parent_id: number | null
  new_parent_number: string | null
  new_parent_name: string | null
}
