import api from './client'

export interface CommonReportingLine {
  id: number
  code: string
  name: string
  description: string | null
  parent_crl_id: number | null
  section: string
  statement_type: string
  normal_balance: string | null
  sort_order: number
  is_system: boolean
  is_mandatory: boolean
  organization_id: number | null
}

export interface ReportingTemplate {
  id: number
  code: string
  name: string
  description: string | null
  is_system: boolean
  is_active: boolean
  organization_id: number | null
}

export interface CrlSuggestion {
  line_id: number
  crl_id: number | null
  crl_code: string | null
  crl_name: string | null
  crl_section: string | null
  confidence: number | null
  reason: string | null
  via_taxonomy_node_code: string | null
}

export interface SuggestCrlResponse {
  suggestions: CrlSuggestion[]
  matched: number
  unmatched: number
  taxonomy_id: number
  template_id: number | null
}

export interface ApplyCrlResponse {
  applied: number
  skipped: number
  skipped_existing: number
  skipped_no_suggestion: number
  skipped_reason: string | null
  next_action: string | null
}

export const commonReportingLinesApi = {
  list: (params?: {
    organization_id?: number
    template_id?: number
    include_inactive?: boolean
  }): Promise<CommonReportingLine[]> =>
    api.get<CommonReportingLine[]>('/common-reporting-lines/', { params }).then((r) => r.data),

  listTemplates: (params?: {
    organization_id?: number
    include_inactive?: boolean
  }): Promise<ReportingTemplate[]> =>
    api.get<ReportingTemplate[]>('/common-reporting-lines/templates', { params }).then((r) => r.data),

  suggestForBatch: (
    batchId: number,
    body: { taxonomy_id: number; template_id?: number | null },
  ): Promise<SuggestCrlResponse> =>
    api.post<SuggestCrlResponse>(
      `/tb-imports/batches/${batchId}/suggest-crl`,
      body,
    ).then((r) => r.data),

  applyForBatch: (
    batchId: number,
    body: {
      taxonomy_id: number
      template_id?: number | null
      line_ids: number[] | 'all'
      mode: 'blank_only' | 'replace' | 'preserve'
    },
  ): Promise<ApplyCrlResponse> =>
    api.post<ApplyCrlResponse>(
      `/tb-imports/batches/${batchId}/apply-crl-suggestions`,
      body,
    ).then((r) => r.data),

  saveSelections: (
    batchId: number,
    body: { selections: Array<{ line_id: number; crl_id: number | null }> },
  ): Promise<{ saved: number }> =>
    api.post<{ saved: number }>(
      `/tb-imports/batches/${batchId}/save-crl-selections`,
      body,
    ).then((r) => r.data),
}
