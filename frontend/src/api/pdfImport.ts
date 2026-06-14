import api from './client'
import type {
  PDFImportBatch,
  PDFImportPreview,
  PDFImportValidationReport,
  PDFImportMappingOut,
  PDFLineOut,
  PDFLineUpdateRequest,
  PDFAuditTrail,
  PDFConflictResolutionRequest,
} from '@/types'

export interface PDFPreviewLinePatch {
  account_name?: string | null
  section?: string | null
  suggested_taxonomy_code?: string | null
  proposed_account_code?: string | null
  amount?: string | null
  excluded?: boolean | null
}

export interface PDFUploadOptions {
  entityId?: number
  importType?: string
  statementScope?: string
  basisOverride?: string
  statementDate?: string
}

export const pdfImportApi = {
  upload: (file: File, options: PDFUploadOptions | number = {}): Promise<PDFImportPreview> => {
    const form = new FormData()
    form.append('file', file)
    // Support legacy call signature: upload(file, entityId)
    const opts: PDFUploadOptions = typeof options === 'number' ? { entityId: options } : options
    if (opts.entityId != null) form.append('entity_id', String(opts.entityId))
    if (opts.importType) form.append('import_type', opts.importType)
    if (opts.statementScope) form.append('statement_scope', opts.statementScope)
    if (opts.basisOverride) form.append('basis_override', opts.basisOverride)
    if (opts.statementDate) form.append('statement_date', opts.statementDate)
    return api
      .post<PDFImportPreview>('/pdf-imports/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  apply: (batchId: number, forceApply = false): Promise<PDFImportBatch> =>
    api
      .post<PDFImportBatch>(`/pdf-imports/${batchId}/apply`, null, {
        params: forceApply ? { force_apply: true } : {},
      })
      .then((r) => r.data),

  resolveConflict: (batchId: number, lineId: number, body: PDFConflictResolutionRequest): Promise<PDFLineOut> =>
    api.post<PDFLineOut>(`/pdf-imports/${batchId}/lines/${lineId}/resolve-conflict`, body).then((r) => r.data),

  bulkResolveConflicts: (
    batchId: number,
    resolution: 'keep_source' | 'apply_global' | 'accepted',
    conflictReason?: string,
  ): Promise<{ resolved: number }> =>
    api
      .post<{ resolved: number }>(`/pdf-imports/${batchId}/conflicts/bulk-resolve`, {
        resolution,
        conflict_reason: conflictReason ?? null,
      })
      .then((r) => r.data),

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

  previewDiff: (batchId: number): Promise<{
    batch_id: number
    total_lines: number
    changed_count: number
    excluded_count: number
    diff: Array<{
      line_index: number
      temp_account_code: string
      account_name: string
      changed: boolean
      excluded: boolean
      changes: string[]
      original: Record<string, unknown>
      current: Record<string, unknown>
    }>
  }> =>
    api.get(`/pdf-imports/${batchId}/preview-diff`).then((r) => r.data),

  deleteBatch: (batchId: number): Promise<void> =>
    api.delete(`/pdf-imports/${batchId}`).then(() => undefined),
}
