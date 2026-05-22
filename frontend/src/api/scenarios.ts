import api from './client'
import type { Scenario } from '@/types'

export const scenariosApi = {
  list: (params?: { organization_id?: number; active?: boolean; scenario_type?: string }) =>
    api.get<Scenario[]>('/scenarios/', { params }).then((r) => r.data),

  get: (id: number) =>
    api.get<Scenario>(`/scenarios/${id}`).then((r) => r.data),

  create: (body: { code: string; name: string; scenario_type: string; description?: string; organization_id?: number }) =>
    api.post<Scenario>('/scenarios/', body).then((r) => r.data),

  update: (id: number, body: { name?: string; description?: string; active?: boolean }) =>
    api.patch<Scenario>(`/scenarios/${id}`, body).then((r) => r.data),

  deactivate: (id: number) =>
    api.delete(`/scenarios/${id}`),
}
