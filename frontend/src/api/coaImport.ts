import api from './client'
import type { COAImportBatch, COAImportPreview } from '@/types'

export const coaImportApi = {
  upload: (entityId: number, file: File): Promise<COAImportPreview> => {
    const form = new FormData()
    form.append('entity_id', String(entityId))
    form.append('file', file)
    return api.post<COAImportPreview>('/coa-imports/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },

  apply: (batchId: number, overrides?: Record<number, number>): Promise<COAImportBatch> =>
    api.post<COAImportBatch>(
      `/coa-imports/${batchId}/apply`,
      overrides && Object.keys(overrides).length > 0 ? { overrides } : undefined,
    ).then((r) => r.data),

  list: (entityId?: number): Promise<COAImportBatch[]> =>
    api.get<COAImportBatch[]>('/coa-imports/', { params: entityId ? { entity_id: entityId } : {} })
      .then((r) => r.data),

  get: (batchId: number): Promise<COAImportBatch> =>
    api.get<COAImportBatch>(`/coa-imports/${batchId}`).then((r) => r.data),

  preview: (batchId: number): Promise<COAImportPreview> =>
    api.get<COAImportPreview>(`/coa-imports/${batchId}/preview`).then((r) => r.data),

  deleteBatch: (batchId: number): Promise<void> =>
    api.delete(`/coa-imports/${batchId}`).then(() => undefined),
}
