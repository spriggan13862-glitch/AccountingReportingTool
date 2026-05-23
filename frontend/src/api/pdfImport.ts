import api from './client'
import type {
  PDFImportBatch,
  PDFImportPreview,
  PDFImportValidationReport,
  PDFImportMappingOut,
  PDFLineOut,
  PDFLineUpdateRequest,
  PDFAuditTrail,
} from '@/types'

export interface PDFPreviewLinePatch {
  account_name?: string | null
  section?: string | null
  suggested_taxonomy_code?: string | null
}

export const pdfImportApi = {
  upload: (file: File, entityId?: number): Promise<PDFImportPreview> => {
    const form = new FormData()
    form.append('file', file)
    if (entityId != null) form.append('entity_id', String(entityId))
    return api
      .post<PDFImportPreview>('/pdf-imports/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  apply: (batchId: number): Promise<PDFImportBatch> =>
    api.post<PDFImportBatch>(`/pdf-imports/${batchId}/apply`).then((r) => r.data),

  list: (entityId?: number): Promise<PDFImportBatch[]> =>
    api
      .get<PDFImportBatch[]>('/pdf-imports/', {
        params: entityId != null ? { entity_id: entityId } : {},
      })
      .then((r) => r.data),

  get: (batchId: number): Promise<PDFImportBatch> =>
    api.get<PDFImportBatch>(`/pdf-imports/${batchId}`).then((r) => r.data),

  preview: (batchId: number): Promise<PDFImportPreview> =>
    api.get<PDFImportPreview>(`/pdf-imports/${batchId}/preview`).then((r) => r.data),

  validate: (batchId: number): Promise<PDFImportValidationReport> =>
    api
      .get<PDFImportValidationReport>(`/pdf-imports/${batchId}/validate`)
      .then((r) => r.data),

  mapping: (batchId: number): Promise<PDFImportMappingOut> =>
    api.get<PDFImportMappingOut>(`/pdf-imports/${batchId}/mapping`).then((r) => r.data),

  lines: (batchId: number): Promise<PDFLineOut[]> =>
    api.get<PDFLineOut[]>(`/pdf-imports/${batchId}/lines`).then((r) => r.data),

  updateLine: (batchId: number, lineId: number, patch: PDFLineUpdateRequest): Promise<PDFLineOut> =>
    api.patch<PDFLineOut>(`/pdf-imports/${batchId}/lines/${lineId}`, patch).then((r) => r.data),

  audit: (batchId: number): Promise<PDFAuditTrail> =>
    api.get<PDFAuditTrail>(`/pdf-imports/${batchId}/audit`).then((r) => r.data),

  patchPreviewLine: (batchId: number, lineIndex: number, patch: PDFPreviewLinePatch): Promise<{ line_index: number; updated: Record<string, unknown> }> =>
    api.patch(`/pdf-imports/${batchId}/preview-lines/${lineIndex}`, patch).then((r) => r.data),
}
