import api from './client'

export interface ImportRegistryEntry {
  id: string
  source_module: 'pdf_import' | 'tb_import' | 'coa_import'
  source_id: number
  filename: string | null
  entity_id: number | null
  source_entity_name: string | null
  status: string
  line_count: number | null
  description: string
  created_at: string | null
  basis_of_accounting: string | null
  statement_date: string | null
  document_id?: number | null
}

export const importRegistryApi = {
  list: (entityId?: number): Promise<ImportRegistryEntry[]> =>
    api
      .get<ImportRegistryEntry[]>('/import-registry', {
        params: entityId != null ? { entity_id: entityId } : {},
      })
      .then((r) => r.data),
}
