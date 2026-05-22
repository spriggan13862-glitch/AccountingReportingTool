import api from './client'
import type { ReportingPresentationSettings } from '@/types'

export type SettingsUpdate = Partial<Omit<ReportingPresentationSettings, 'id' | 'org_id'>>

export const reportingSettingsApi = {
  get: (orgId?: number) => {
    const params = orgId ? { org_id: orgId } : {}
    return api.get<ReportingPresentationSettings>('/reporting-settings/', { params }).then((r) => r.data)
  },

  update: (body: SettingsUpdate, orgId?: number) => {
    const params = orgId ? { org_id: orgId } : {}
    return api.put<ReportingPresentationSettings>('/reporting-settings/', body, { params }).then((r) => r.data)
  },
}
