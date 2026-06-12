import api from './client'
import type { TaxonomyFsLine, TBRow } from '@/types'

const serializeArrayParams = (params: Record<string, unknown>) => {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => parts.push(`${k}=${encodeURIComponent(x)}`))
    else if (v !== undefined && v !== null) parts.push(`${k}=${encodeURIComponent(String(v))}`)
  }
  return parts.join('&')
}

export const reportingApi = {
  trialBalance: (entityId: number, asOfDate: string, scenarioIds: number[] = [], fromDate?: string) =>
    api
      .get<TBRow[]>('/reporting/trial-balance', {
        params: {
          entity_id: entityId,
          as_of_date: asOfDate,
          scenario_ids: scenarioIds,
          ...(fromDate ? { from_date: fromDate } : {}),
        },
        paramsSerializer: serializeArrayParams,
      })
      .then((r) => r.data),

  taxonomyBalanceSheet: (entityId: number, asOfDate: string, scenarioIds: number[] = [], viewId?: number) =>
    api
      .get<TaxonomyFsLine[]>('/financial-statements/taxonomy/balance-sheet', {
        params: { entity_id: entityId, as_of_date: asOfDate, scenario_ids: scenarioIds, ...(viewId ? { view_id: viewId } : {}) },
        paramsSerializer: serializeArrayParams,
      })
      .then((r) => r.data),

  taxonomyIncomeStatement: (entityId: number, asOfDate: string, scenarioIds: number[] = [], viewId?: number) =>
    api
      .get<TaxonomyFsLine[]>('/financial-statements/taxonomy/income-statement', {
        params: { entity_id: entityId, as_of_date: asOfDate, scenario_ids: scenarioIds, ...(viewId ? { view_id: viewId } : {}) },
        paramsSerializer: serializeArrayParams,
      })
      .then((r) => r.data),

  inheritTaxonomy: (entityId: number) =>
    api.post<{ updated: number; already_set: number; no_ancestor: number }>(
      '/financial-statements/taxonomy/inherit',
      null,
      { params: { entity_id: entityId } }
    ).then((r) => r.data),
}
