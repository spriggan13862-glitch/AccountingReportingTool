import api from './client'
import type { Entity } from '@/types'

export const entitiesApi = {
  list: () => api.get<Entity[]>('/entities/').then((r) => r.data),
  get: (id: number) => api.get<Entity>(`/entities/${id}`).then((r) => r.data),
}
