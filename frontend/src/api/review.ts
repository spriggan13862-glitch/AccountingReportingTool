import api from './client'
import type { FsLine } from '@/types'

export interface RatioMetric {
  name: string
  value: number | null
  unit: string
  status: 'good' | 'warning' | 'critical' | 'na'
  description: string
  interpretation: string
  benchmark_low: number | null
  benchmark_ok: number | null
}

export interface AnalysisFlag {
  code: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  suggested_procedures: string
}

export interface IntelligenceFinding {
  issue_code: string
  category: string
  severity: string
  title: string
  description: string
  detection_trigger: string
  suggested_procedures: string
  suggested_ajes: string
  supporting_metrics: Record<string, string>
}

export interface RatioAnalysisResponse {
  as_of_date: string
  entity_id: number
  liquidity: RatioMetric[]
  leverage: RatioMetric[]
  profitability: RatioMetric[]
  flags: AnalysisFlag[]
  intelligence_findings: IntelligenceFinding[]
  summary: string
  has_data: boolean
}

export interface VarianceRow {
  code: string
  name: string
  statement: string
  current_balance: number
  prior_balance: number
  amount_delta: number
  pct_delta: number | null
  flag: boolean
  is_subtotal?: boolean
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

export interface BridgeRow {
  code: string
  name: string
  statement: string
  section: string | null
  sort_order: number
  as_reported: number
  posted_ajes: number
  net_adjusted: number
  pro_forma_ajes: number
  pro_forma: number
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

  getBridge: (params: {
    entity_id: number
    as_of_date: string
    scenario_ids?: number[]
    statement?: string
  }) => {
    const { scenario_ids, ...rest } = params
    const searchParams = new URLSearchParams()
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) searchParams.append(k, String(v))
    }
    for (const id of scenario_ids ?? []) {
      searchParams.append('scenario_ids', String(id))
    }
    return api.get<BridgeRow[]>(`/review/bridge?${searchParams}`).then((r) => r.data)
  },

  getAnalysis: (params: {
    entity_id: number
    as_of_date: string
    scenario_ids?: number[]
    data_view?: string
  }) => {
    const { scenario_ids, ...rest } = params
    const searchParams = new URLSearchParams()
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) searchParams.append(k, String(v))
    }
    for (const id of scenario_ids ?? []) {
      searchParams.append('scenario_ids', String(id))
    }
    return api.get<RatioAnalysisResponse>(`/review/analysis?${searchParams}`).then((r) => r.data)
  },
}
