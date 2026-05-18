import api from './client'
import type {
  DraftEntry,
  OverlayCalculateRequest,
  OverlayResult,
  PreviewRun,
} from '@/types'

export const overlayApi = {
  calculate: (req: OverlayCalculateRequest) =>
    api.post<OverlayResult>('/preview/calculate', req).then((r) => r.data),

  export: (req: OverlayCalculateRequest) =>
    api.post('/preview/export', req, { responseType: 'blob' }).then((r) => r.data as Blob),

  listRuns: (organizationId: number, entityId?: number) =>
    api
      .get<PreviewRun[]>('/preview/runs', {
        params: { organization_id: organizationId, entity_id: entityId },
      })
      .then((r) => r.data),

  getRun: (runId: number) =>
    api.get<PreviewRun>(`/preview/runs/${runId}`).then((r) => r.data),

  listDraftEntries: (params: {
    entity_id: number
    scenario_id: number
    as_of_date: string
    organization_id: number
  }) =>
    api.get<DraftEntry[]>('/preview/draft-entries', { params }).then((r) => r.data),

  getDrilldown: (params: {
    account_id: number
    entity_id: number
    scenario_id: number
    as_of_date: string
    included_je_ids?: number[]
  }) =>
    api.get('/preview/drilldown', { params }).then((r) => r.data),
}

export function downloadPreviewExport(blob: Blob, previewType: string, asOfDate: string) {
  const safe = asOfDate.replace(/-/g, '')
  const name = `DRAFT_PREVIEW_${previewType.toUpperCase()}_${safe}.xlsx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
