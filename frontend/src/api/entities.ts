import api from './client'
import type { Entity } from '@/types'

export interface EntityCreate {
  code: string
  name: string
  entity_type: string
  parent_id?: number | null
  currency?: string
  fiscal_year_end_month?: number | null
  fiscal_year_convention?: string | null
}

export interface EntityUpdate {
  name?: string
  entity_type?: string
  parent_id?: number | null
  currency?: string
  active?: boolean
  fiscal_year_end_month?: number | null
  fiscal_year_convention?: string | null
}

// The backend returns Page[EntityOut]; unwrap .items here so callers get Entity[].
interface EntityPage {
  items: Entity[]
  total: number
  page: number
  page_size: number
  pages: number
}

export const entitiesApi = {
  list: () =>
    api.get<EntityPage>('/entities/').then((r) =>
      Array.isArray(r.data) ? r.data : (r.data as EntityPage).items ?? [],
    ),
  get: (id: number) => api.get<Entity>(`/entities/${id}`).then((r) => r.data),
  create: (body: EntityCreate) => api.post<Entity>('/entities/', body).then((r) => r.data),
  update: (id: number, body: EntityUpdate) => api.patch<Entity>(`/entities/${id}`, body).then((r) => r.data),
  delete: (id: number) => api.delete(`/entities/${id}`),
}
