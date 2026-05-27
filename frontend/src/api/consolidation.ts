import api from './client'
import type { TBRow } from '@/types'

const serializeArrayParams = (params: Record<string, unknown>) => {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => parts.push(`${k}=${encodeURIComponent(x)}`))
    else if (v !== undefined && v !== null) parts.push(`${k}=${encodeURIComponent(String(v))}`)
  }
  return parts.join('&')
}

export interface ConsolidatedFsLine {
  line_id: number
  code: string
  name: string
  statement: string
  section: string
  sort_order: number | null
  parent_line_id: number | null
  is_subtotal: boolean
  sign_flip: boolean
  own_balance: number
  total_balance: number
  display_balance: number
}

export interface ConsolidatedTBResult {
  data: TBRow[]
  validation: {
    success: boolean
    errors: Array<{ code: string; severity: string; message: string }>
    warnings: Array<{ code: string; severity: string; message: string }>
    info: Array<{ code: string; severity: string; message: string }>
  }
}

export const consolidationApi = {
  trialBalance: (
    consolidationEntityId: number,
    asOfDate: string,
    operatingScenarioIds: number[] = [],
    elimScenarioIds: number[] = [],
  ): Promise<ConsolidatedTBResult> =>
    api
      .get('/consolidation/trial-balance', {
        params: {
          consolidation_entity_id: consolidationEntityId,
          as_of_date: asOfDate,
          operating_scenario_ids: operatingScenarioIds,
          elim_scenario_ids: elimScenarioIds,
        },
        paramsSerializer: serializeArrayParams,
      })
      .then((r) => r.data),

  balanceSheet: (
    consolidationEntityId: number,
    asOfDate: string,
    operatingScenarioIds: number[] = [],
    elimScenarioIds: number[] = [],
  ): Promise<{ data: ConsolidatedFsLine[] }> =>
    api
      .get('/consolidation/balance-sheet', {
        params: {
          consolidation_entity_id: consolidationEntityId,
          as_of_date: asOfDate,
          operating_scenario_ids: operatingScenarioIds,
          elim_scenario_ids: elimScenarioIds,
        },
        paramsSerializer: serializeArrayParams,
      })
      .then((r) => r.data),

  incomeStatement: (
    consolidationEntityId: number,
    asOfDate: string,
    operatingScenarioIds: number[] = [],
    elimScenarioIds: number[] = [],
  ): Promise<{ data: ConsolidatedFsLine[] }> =>
    api
      .get('/consolidation/income-statement', {
        params: {
          consolidation_entity_id: consolidationEntityId,
          as_of_date: asOfDate,
          operating_scenario_ids: operatingScenarioIds,
          elim_scenario_ids: elimScenarioIds,
        },
        paramsSerializer: serializeArrayParams,
      })
      .then((r) => r.data),
}
