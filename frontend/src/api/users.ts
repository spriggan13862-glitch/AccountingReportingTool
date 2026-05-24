import api from './client'
import type { User } from '@/types'

export const usersApi = {
  list: (organizationId: number) =>
    api.get<User[]>('/users/', { params: { organization_id: organizationId } }).then((r) => r.data),
}
