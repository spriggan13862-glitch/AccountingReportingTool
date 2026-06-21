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
  is_active: boolean
  organization_id: number | null
}

export interface TemplateCrlRow {
  id: number
  template_id: number
  crl_id: number
  is_visible: boolean
  sort_order: number
  display_label: string | null
}

export interface TemplateCrlSelection {
  crl_id: number
  is_visible: boolean
  sort_order: number
  display_label?: string | null
}

export interface CrlCreatePayload {
  code: string
  name: string
  section: string
  statement_type: string
  organization_id: number
  description?: string | null
  parent_crl_id?: number | null
  normal_balance?: string | null
  sort_order?: number
}

export interface CrlUpdatePayload {
  name?: string
  description?: string | null
  parent_crl_id?: number | null
  sort_order?: number
  normal_balance?: string | null
  is_active?: boolean
  organization_id?: number
}

export interface TemplateCreatePayload {
  code: string
  name: string
  organization_id: number
  description?: string | null
}

export interface TemplateUpdatePayload {
  name?: string
  description?: string | null
  is_active?: boolean
  organization_id?: number
}

// ── CRL-G / P5 reporting types ────────────────────────────────────────────
export interface CrlStatementRow {
  crl_id: number
  crl_code: string
  crl_name: string
  section: string
  statement_type: string
  parent_crl_id: number | null
  normal_balance: string | null
  sort_order: number
  is_mandatory: boolean
  is_system: boolean
  depth: number
  account_count: number
  own_signed_balance: string
  total_signed_balance: string
  display_balance: string
}

export interface CrlStatementResponse {
  rows: CrlStatementRow[]
  sections: string[]
  total_accounts: number
  classified_accounts: number
  unclassified_accounts: number
  needs_review_accounts: number
  accounts_outside_template: number
  template_id: number | null
  statement_type: string | null
}

export interface CrlStatementParams {
  entity_id: number
  as_of_date: string
  scenario_ids?: number[]
  organization_id?: number
  template_id?: number
  data_view?: 'as_reported' | 'adjusted' | 'pro_forma'
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

  // ── CRL-F admin mutations ─────────────────────────────────────────────
  create: (body: CrlCreatePayload): Promise<CommonReportingLine> =>
    api.post<CommonReportingLine>('/common-reporting-lines/', body).then((r) => r.data),

  update: (id: number, body: CrlUpdatePayload): Promise<CommonReportingLine> =>
    api.patch<CommonReportingLine>(`/common-reporting-lines/${id}`, body).then((r) => r.data),

  delete: (id: number): Promise<CommonReportingLine> =>
    api.delete<CommonReportingLine>(`/common-reporting-lines/${id}`).then((r) => r.data),

  createTemplate: (body: TemplateCreatePayload): Promise<ReportingTemplate> =>
    api.post<ReportingTemplate>('/common-reporting-lines/templates', body).then((r) => r.data),

  updateTemplate: (id: number, body: TemplateUpdatePayload): Promise<ReportingTemplate> =>
    api.patch<ReportingTemplate>(`/common-reporting-lines/templates/${id}`, body).then((r) => r.data),

  deleteTemplate: (id: number): Promise<ReportingTemplate> =>
    api.delete<ReportingTemplate>(`/common-reporting-lines/templates/${id}`).then((r) => r.data),

  listTemplateCrls: (templateId: number): Promise<TemplateCrlRow[]> =>
    api.get<TemplateCrlRow[]>(`/common-reporting-lines/templates/${templateId}/crls`).then((r) => r.data),

  setTemplateCrls: (
    templateId: number,
    body: { selections: TemplateCrlSelection[]; organization_id?: number },
  ): Promise<{ template_id: number; added: number; removed: number; updated: number }> =>
    api.put<{ template_id: number; added: number; removed: number; updated: number }>(
      `/common-reporting-lines/templates/${templateId}/crls`,
      body,
    ).then((r) => r.data),

  // ── CRL-G / P5: reporting reads through the CRL layer ────────────────
  trialBalance: (params: CrlStatementParams): Promise<CrlStatementResponse> =>
    api.get<CrlStatementResponse>('/financial-statements/crl/trial-balance', { params })
      .then((r) => r.data),

  balanceSheet: (params: CrlStatementParams): Promise<CrlStatementResponse> =>
    api.get<CrlStatementResponse>('/financial-statements/crl/balance-sheet', { params })
      .then((r) => r.data),

  incomeStatement: (params: CrlStatementParams): Promise<CrlStatementResponse> =>
    api.get<CrlStatementResponse>('/financial-statements/crl/income-statement', { params })
      .then((r) => r.data),

  cashFlow: (params: CrlStatementParams): Promise<CrlStatementResponse> =>
    api.get<CrlStatementResponse>('/financial-statements/crl/cash-flow', { params })
      .then((r) => r.data),
}
