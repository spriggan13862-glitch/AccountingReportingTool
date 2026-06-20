import type { ImportReadinessStatus } from '@/types'

export const importReadinessApi = {
  get: (entityId: number, periodId?: number): Promise<ImportReadinessStatus> =>
    fetch(
      `/api/v1/import-readiness/?entity_id=${entityId}${periodId ? `&period_id=${periodId}` : ''}`
    ).then(r => r.json()),
}
