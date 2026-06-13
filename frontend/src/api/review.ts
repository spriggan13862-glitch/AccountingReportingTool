import api from './client'
import type { FsLine } from '@/types'

export interface VarianceRow {
  code: string
  name: string
  statement: string
  current_balance: number
  prior_balance: number
  amount_delta: number
  pct_delta: number | null
  flag: boolean
}

export interface CheckResult {
  name: string
  passed: boolean
  detail: string
}

export interface ReviewStatementsResponse {
  current: FsLine[]
  prior: FsLine[]
  variance: VarianceRow[]
  checks: CheckResult[]
}

export const reviewApi = {
  getStatements: (params: {
    entity_id: number
    as_of_date: string
    prior_as_of_date?: string
    scenario_ids?: number[]
    data_view?: string
    statement?: string
    include_checks?: boolean
  }) => {
    const { scenario_ids, ...rest } = params
    const searchParams = new URLSearchParams()
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) searchParams.append(k, String(v))
    }
    for (const id of scenario_ids ?? []) {
      searchParams.append('scenario_ids', String(id))
    }
    return api
      .get<ReviewStatementsResponse>(`/review/statements?${searchParams}`)
      .then((r) => r.data)
  },
}
