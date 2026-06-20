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

export interface ConsolidatedStatementsResult {
  entity_balances: Record<number, Record<string, number>>
  consolidated: Record<string, number>
  eliminated: Record<string, number>
}

export const consolidationApi = {
  statements: (params: {
    entity_ids: number[]
    period_id: number
    view_id: number
    include_eliminations?: boolean
  }): Promise<ConsolidatedStatementsResult> =>
    api
      .get('/consolidation/statements', {
        params: {
          entity_ids: params.entity_ids.join(','),
          period_id: params.period_id,
          view_id: params.view_id,
          include_eliminations: params.include_eliminations ?? true,
        },
      })
      .then((r) => r.data),

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
