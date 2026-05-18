import api from './client'
import type { TbImportOut, ValidationResponse } from '@/types'

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

function buildFormData(params: Record<string, string | number | File | undefined>): FormData {
  const fd = new FormData()
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      fd.append(key, val instanceof File ? val : String(val))
    }
  }
  return fd
}

export const tbImportApi = {
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
}
