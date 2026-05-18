import api from './client'
import type { AccountingPeriod, ClosePeriodRequest, PeriodCreate } from '@/types'

export const periodsApi = {
  list: (entityId: number, params?: { fiscal_year?: number; period_type?: string }) =>
    api
      .get<AccountingPeriod[]>('/accounting-periods/', { params: { entity_id: entityId, ...params } })
      .then((r) => r.data),

  get: (id: number) =>
    api.get<AccountingPeriod>(`/accounting-periods/${id}`).then((r) => r.data),

  create: (data: PeriodCreate) =>
    api.post<AccountingPeriod>('/accounting-periods/', data).then((r) => r.data),

  close: (id: number, data: ClosePeriodRequest) =>
    api.post<AccountingPeriod>(`/accounting-periods/${id}/close`, data).then((r) => r.data),

  reopen: (id: number) =>
    api.post<AccountingPeriod>(`/accounting-periods/${id}/reopen`, {}).then((r) => r.data),
}
