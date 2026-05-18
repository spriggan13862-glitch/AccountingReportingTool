import api from './client'
import type {
  TbImportOut,
  ValidationResponse,
  ImportBatch,
  ImportLine,
  ImportIssue,
  ImportTemplate,
  ImportSuggestion,
} from '@/types'

export interface TbImportParams {
  entity_id: number
  scenario_id: number
  as_of_date: string
  je_number: string
  imported_by?: string
  file: File
}

export interface TbValidateParams {
  entity_id: number
  scenario_id: number
  as_of_date: string
  file: File
}

export interface UploadBatchParams {
  entity_id: number
  organization_id: number
  as_of_date: string
  scenario_id?: number
  period_id?: number
  template_id?: number
  file: File
}

function buildFormData(params: Record<string, string | number | File | undefined | null>): FormData {
  const fd = new FormData()
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      fd.append(key, val instanceof File ? val : String(val))
    }
  }
  return fd
}

export const tbImportApi = {
  // Legacy endpoints
  validate: (params: TbValidateParams) => {
    const fd = buildFormData({
      entity_id: params.entity_id,
      scenario_id: params.scenario_id,
      as_of_date: params.as_of_date,
      file: params.file,
    })
    return api
      .post<ValidationResponse>('/tb-imports/validate', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  import: (params: TbImportParams) => {
    const fd = buildFormData({
      entity_id: params.entity_id,
      scenario_id: params.scenario_id,
      as_of_date: params.as_of_date,
      je_number: params.je_number,
      imported_by: params.imported_by,
      file: params.file,
    })
    return api
      .post<TbImportOut>('/tb-imports/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  get: (id: number) => api.get<TbImportOut>(`/tb-imports/${id}`).then((r) => r.data),

  // M23 batch pipeline
  uploadBatch: (params: UploadBatchParams) => {
    const fd = buildFormData({
      entity_id: params.entity_id,
      organization_id: params.organization_id,
      as_of_date: params.as_of_date,
      scenario_id: params.scenario_id,
      period_id: params.period_id,
      template_id: params.template_id,
      file: params.file,
    })
    return api
      .post<ImportBatch>('/tb-imports/batches/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  listBatches: (organizationId: number, entityId?: number, status?: string) => {
    const params: Record<string, string | number> = { organization_id: organizationId }
    if (entityId !== undefined) params.entity_id = entityId
    if (status) params.status = status
    return api.get<ImportBatch[]>('/tb-imports/batches/', { params }).then((r) => r.data)
  },

  getBatch: (batchId: number) =>
    api.get<ImportBatch>(`/tb-imports/batches/${batchId}`).then((r) => r.data),

  getBatchLines: (batchId: number, mappingStatus?: string) => {
    const params = mappingStatus ? { mapping_status: mappingStatus } : {}
    return api
      .get<ImportLine[]>(`/tb-imports/batches/${batchId}/lines`, { params })
      .then((r) => r.data)
  },

  getBatchIssues: (batchId: number, severity?: string) => {
    const params = severity ? { severity } : {}
    return api
      .get<ImportIssue[]>(`/tb-imports/batches/${batchId}/issues`, { params })
      .then((r) => r.data)
  },

  getUnmappedLines: (batchId: number) =>
    api.get<ImportLine[]>(`/tb-imports/batches/${batchId}/unmapped`).then((r) => r.data),

  getSuggestions: (batchId: number) =>
    api.get<ImportSuggestion[]>(`/tb-imports/batches/${batchId}/suggestions`).then((r) => r.data),

  updateColumnMapping: (batchId: number, columnMapping: Record<string, string>) =>
    api
      .put<ImportBatch>(`/tb-imports/batches/${batchId}/column-mapping`, { column_mapping: columnMapping })
      .then((r) => r.data),

  mapLine: (batchId: number, lineId: number, accountId: number) =>
    api
      .post<ImportLine>(`/tb-imports/batches/${batchId}/map-line/${lineId}`, { account_id: accountId })
      .then((r) => r.data),

  skipLine: (batchId: number, lineId: number) =>
    api.post<ImportLine>(`/tb-imports/batches/${batchId}/skip-line/${lineId}`).then((r) => r.data),

  bulkMap: (batchId: number, mappings: Array<{ line_id: number; account_id: number }>) =>
    api
      .post<ImportLine[]>(`/tb-imports/batches/${batchId}/bulk-map`, { mappings })
      .then((r) => r.data),

  createAccountFromLine: (
    batchId: number,
    lineId: number,
    params: { account_number: string; account_name: string; account_type: string; normal_balance: string }
  ) =>
    api
      .post(`/tb-imports/batches/${batchId}/create-account/${lineId}`, params)
      .then((r) => r.data),

  validateBatch: (batchId: number) =>
    api
      .post<ValidationResponse>(`/tb-imports/batches/${batchId}/validate`)
      .then((r) => r.data),

  postBatch: (batchId: number, jeNumber: string, notes?: string) =>
    api
      .post<ImportBatch>(`/tb-imports/batches/${batchId}/post`, { je_number: jeNumber, notes })
      .then((r) => r.data),

  rollbackBatch: (batchId: number, reversalJeNumber?: string) =>
    api
      .post<ImportBatch>(`/tb-imports/batches/${batchId}/rollback`, {
        reversal_je_number: reversalJeNumber,
      })
      .then((r) => r.data),

  listTemplates: (organizationId: number) =>
    api
      .get<ImportTemplate[]>('/tb-imports/templates/', { params: { organization_id: organizationId } })
      .then((r) => r.data),

  createTemplate: (
    organizationId: number,
    body: { name: string; source_format: string; column_mapping: Record<string, string>; description?: string }
  ) =>
    api
      .post<ImportTemplate>(`/tb-imports/templates/?organization_id=${organizationId}`, body)
      .then((r) => r.data),

  deleteTemplate: (templateId: number) =>
    api.delete(`/tb-imports/templates/${templateId}`).then((r) => r.data),
}
