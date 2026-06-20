import api from './client'

export interface Taxonomy {
  id: number
  code: string
  name: string
  description: string | null
  industry: string | null
  version: string | null
  is_system: boolean
  parent_taxonomy_id: number | null
  is_active: boolean
}

export interface TaxonomyDetail extends Taxonomy {
  node_count: number
}

export interface TaxonomyNode {
  id: number
  taxonomy_id: number
  parent_id: number | null
  code: string
  name: string
  description: string | null
  statement_type: string | null
  financial_statement_section: string | null
  normal_balance: string | null
  sort_order: number
  level: number
  is_active: boolean
  is_system: boolean
  gaap_reference: string | null
  ifrs_reference: string | null
  xbrl_tag: string | null
  cash_flow_classification: string | null
  consolidation_treatment: string | null
  kpi_eligible: boolean
  industry: string | null
}

export interface TaxonomyNodeTree extends TaxonomyNode {
  children: TaxonomyNodeTree[]
}

export interface AccountTaxonomyMapping {
  id: number
  account_id: number
  taxonomy_id: number
  taxonomy_node_id: number
  mapping_type: string
  confidence_score: number | null
  mapping_source: string
  is_primary: boolean
}

export interface MappingSuggestion {
  taxonomy_id: number
  taxonomy_code: string
  taxonomy_node_id: number
  node_code: string
  node_name: string
  confidence_score: number
  reason: string
}

export const taxonomyLibraryApi = {
  list: (includeInactive = false): Promise<Taxonomy[]> =>
    api.get<Taxonomy[]>('/taxonomies', { params: { include_inactive: includeInactive } }).then((r) => r.data),

  get: (id: number): Promise<TaxonomyDetail> =>
    api.get<TaxonomyDetail>(`/taxonomies/${id}`).then((r) => r.data),

  tree: (id: number): Promise<TaxonomyNodeTree[]> =>
    api.get<TaxonomyNodeTree[]>(`/taxonomies/${id}/tree`).then((r) => r.data),

  nodes: (id: number, params?: { search?: string; statement_type?: string }): Promise<TaxonomyNode[]> =>
    api.get<TaxonomyNode[]>(`/taxonomies/${id}/nodes`, { params }).then((r) => r.data),

  clone: (id: number, body: { name: string; code?: string }): Promise<Taxonomy> =>
    api.post<Taxonomy>(`/taxonomies/${id}/clone`, body).then((r) => r.data),

  createNode: (id: number, body: Partial<TaxonomyNode>): Promise<TaxonomyNode> =>
    api.post<TaxonomyNode>(`/taxonomies/${id}/nodes`, body).then((r) => r.data),

  updateNode: (nodeId: number, body: Partial<TaxonomyNode>): Promise<TaxonomyNode> =>
    api.patch<TaxonomyNode>(`/taxonomies/nodes/${nodeId}`, body).then((r) => r.data),

  deactivateNode: (nodeId: number): Promise<TaxonomyNode> =>
    api.post<TaxonomyNode>(`/taxonomies/nodes/${nodeId}/deactivate`).then((r) => r.data),

  exportCsv: (id: number): Promise<Blob> =>
    api.get(`/taxonomies/${id}/export/csv`, { responseType: 'blob' }).then((r) => r.data),

  exportExcel: (id: number): Promise<Blob> =>
    api.get(`/taxonomies/${id}/export/excel`, { responseType: 'blob' }).then((r) => r.data),

  exportJson: (id: number): Promise<Blob> =>
    api.get(`/taxonomies/${id}/export/json`, { responseType: 'blob' }).then((r) => r.data),

  mapAccount: (body: {
    account_id: number
    taxonomy_id: number
    taxonomy_node_id: number
    mapping_source?: string
    is_primary?: boolean
  }): Promise<AccountTaxonomyMapping> =>
    api.post<AccountTaxonomyMapping>('/taxonomies/mappings', body).then((r) => r.data),

  getAccountMappings: (accountId: number): Promise<AccountTaxonomyMapping[]> =>
    api.get<AccountTaxonomyMapping[]>(`/taxonomies/mappings/account/${accountId}`).then((r) => r.data),

  deleteMapping: (mappingId: number): Promise<void> =>
    api.delete(`/taxonomies/mappings/${mappingId}`).then(() => undefined),

  suggest: (accountId: number, taxonomyIds: number[]): Promise<MappingSuggestion[]> =>
    api
      .get<MappingSuggestion[]>(`/taxonomies/suggest/${accountId}`, {
        params: { taxonomy_ids: taxonomyIds.join(',') },
      })
      .then((r) => r.data),

  bulkSuggest: (body: {
    account_ids: number[]
    taxonomy_ids: number[]
  }): Promise<{ suggestions: Record<number, MappingSuggestion[]> }> =>
    api.post('/taxonomies/suggest/bulk', body).then((r) => r.data),

  applySuggestions: (body: {
    suggestions: Array<{
      account_id: number
      taxonomy_id: number
      taxonomy_node_id: number
      confidence_score?: number
    }>
    overwrite_existing?: boolean
  }): Promise<{ applied: number; skipped: number }> =>
    api.post('/taxonomies/suggest/apply', body).then((r) => r.data),
}
