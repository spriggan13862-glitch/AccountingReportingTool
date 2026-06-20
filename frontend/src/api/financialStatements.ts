import apiClient from './client'
import type {
  CashFlowResult,
  EquityStatementResult,
  FsValidationResult,
  ReportLineDrilldown,
  TrendRow,
  ReportDefinition,
  ReportDefinitionCreate,
  AccountingWorkingViewResponse,
} from '@/types'
import type { AwvSection } from '@/types'

export interface IncomeStatementSummary {
  revenue: number
  cogs: number
  gross_profit: number
  total_expenses: number
  operating_income: number
  other_income: number
  other_expenses: number
  net_income: number
}

export interface BalanceSheetSummary {
  total_assets: number
  total_liabilities: number
  total_equity: number
  balanced: boolean
}

export interface PresentationViewResponse {
  sections: AwvSection[]
  income_statement: IncomeStatementSummary
  balance_sheet: BalanceSheetSummary
  entity_id: number
  period_id: number | null
  view_id: number | null
  as_of_date: string | null
}

export const financialStatementsApi = {
  getCashFlow: (entityId: number, periodStart: string, periodEnd: string, scenarioIds: number[]) =>
    apiClient.get<CashFlowResult>('/financial-statements/cash-flow', {
      params: { entity_id: entityId, period_start: periodStart, period_end: periodEnd, scenario_ids: scenarioIds.join(',') },
    }),

  getEquityStatement: (entityId: number, periodStart: string, periodEnd: string, scenarioIds: number[]) =>
    apiClient.get<EquityStatementResult>('/financial-statements/equity', {
      params: { entity_id: entityId, period_start: periodStart, period_end: periodEnd, scenario_ids: scenarioIds.join(',') },
    }),

  validateStatements: (entityId: number, asOfDate: string, scenarioIds: number[], periodStart: string) =>
    apiClient.get<FsValidationResult>('/financial-statements/validate', {
      params: { entity_id: entityId, as_of_date: asOfDate, scenario_ids: scenarioIds.join(','), period_start: periodStart },
    }),

  getDrilldown: (entityId: number, asOfDate: string, scenarioIds: number[], fsLineCode: string) =>
    apiClient.get<ReportLineDrilldown>('/financial-statements/drilldown', {
      params: { entity_id: entityId, as_of_date: asOfDate, scenario_ids: scenarioIds.join(','), fs_line_code: fsLineCode },
    }),

  getTrendReport: (entityId: number, periods: Array<{ label: string; as_of_date: string; scenario_ids: number[] }>) =>
    apiClient.post<TrendRow[]>('/financial-statements/trend', { entity_id: entityId, periods }),

  getDefinitions: (orgId: number) =>
    apiClient.get<ReportDefinition[]>('/financial-statements/definitions', { params: { organization_id: orgId } }),

  createDefinition: (data: ReportDefinitionCreate & { organization_id: number }) =>
    apiClient.post<ReportDefinition>('/financial-statements/definitions', data),

  getClosePackageUrl: (entityId: number, asOfDate: string, scenarioIds: number[], label = 'Close Package', watermark = 'DRAFT') => {
    const params = new URLSearchParams({
      entity_id: String(entityId),
      as_of_date: asOfDate,
      scenario_ids: scenarioIds.join(','),
      label,
      watermark,
    })
    return `/api/v1/financial-statements/export/close-package?${params}`
  },

  getAccountingWorkingView: (params: {
    entityId: number
    periodId?: number
    viewId?: number
    scenarioIds?: number[]
  }): Promise<AccountingWorkingViewResponse> => {
    const qp: Record<string, string> = {
      entity_id: String(params.entityId),
    }
    if (params.periodId !== undefined) qp.period_id = String(params.periodId)
    if (params.viewId !== undefined) qp.view_id = String(params.viewId)
    if (params.scenarioIds && params.scenarioIds.length > 0) {
      qp.scenario_ids = params.scenarioIds.join(',')
    }
    return apiClient.get<AccountingWorkingViewResponse>('/financial-statements/accounting-view', { params: qp })
      .then((r) => r.data)
  },

  getPresentationView: (params: {
    entityId: number
    periodId?: number
    viewId?: number
    scenarioIds?: number[]
  }): Promise<PresentationViewResponse> => {
    const qp: Record<string, string> = {
      entity_id: String(params.entityId),
    }
    if (params.periodId !== undefined) qp.period_id = String(params.periodId)
    if (params.viewId !== undefined) qp.view_id = String(params.viewId)
    if (params.scenarioIds && params.scenarioIds.length > 0) {
      qp.scenario_ids = params.scenarioIds.join(',')
    }
    return apiClient.get<PresentationViewResponse>('/financial-statements/presentation-view', { params: qp })
      .then((r) => r.data)
  },
}
