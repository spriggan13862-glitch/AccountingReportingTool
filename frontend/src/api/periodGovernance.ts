import api from './client'
import type { PeriodGovernanceEvent, PeriodLockSummary, ShadowCloseReport, ShadowCloseRun, ComparativeReport } from '@/types'

const GOV = '/period-governance'
const SHADOW = '/shadow-close'
const COMP = '/comparative-reports'

export const periodGovernanceApi = {
  getStatus: (periodId: number) =>
    api.get(`${GOV}/periods/${periodId}/status`).then((r) => r.data),

  getLockSummary: (periodId: number): Promise<PeriodLockSummary> =>
    api.get(`${GOV}/periods/${periodId}/lock-summary`).then((r) => r.data),

  softClose: (periodId: number, reason?: string, actorUserId?: number) =>
    api.post(`${GOV}/periods/${periodId}/soft-close`, { reason, actor_user_id: actorUserId }).then((r) => r.data),

  hardClose: (periodId: number, reason?: string, actorUserId?: number) =>
    api.post(`${GOV}/periods/${periodId}/hard-close`, { reason, actor_user_id: actorUserId }).then((r) => r.data),

  reopen: (periodId: number, reason?: string, actorUserId?: number) =>
    api.post(`${GOV}/periods/${periodId}/reopen`, { reason, actor_user_id: actorUserId }).then((r) => r.data),

  getHistory: (periodId: number): Promise<PeriodGovernanceEvent[]> =>
    api.get(`${GOV}/periods/${periodId}/history`).then((r) => r.data),

  // Shadow-close validation
  runValidation: (periodId: number, entityId: number, scenarioId?: number, persist = true): Promise<ShadowCloseReport> =>
    api.post(`${SHADOW}/periods/${periodId}/validate`, {
      entity_id: entityId,
      scenario_id: scenarioId ?? null,
      persist,
    }).then((r) => r.data),

  getValidationHistory: (periodId: number, entityId: number): Promise<ShadowCloseRun[]> =>
    api.get(`${SHADOW}/periods/${periodId}/history`, { params: { entity_id: entityId } }).then((r) => r.data),

  // Comparative reports
  buildComparativeReport: (params: {
    entity_id: number
    current_period_id: number
    comparison_period_id: number
    report_type?: string
    scenario_id?: number
    materiality_threshold?: string
  }): Promise<ComparativeReport> =>
    api.post(`${COMP}/`, params).then((r) => r.data),

  findComparablePeriod: (entityId: number, periodId: number, comparisonType = 'prior_month') =>
    api.get(`${COMP}/comparable-period`, {
      params: { entity_id: entityId, period_id: periodId, comparison_type: comparisonType },
    }).then((r) => r.data),
}
