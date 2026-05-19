import api from './client'
import type { Account } from '@/types'

export const accountsApi = {
  list: (entityId?: number, search?: string) => {
    const params: Record<string, string | number> = {}
    if (entityId !== undefined) params.entity_id = entityId
    if (search) params.search = search
    return api.get<Account[]>('/accounts/', { params }).then((r) => r.data)
  },
}
