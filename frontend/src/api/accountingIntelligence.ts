import api from './client'

export type IssueSeverity = 'informational' | 'low' | 'moderate' | 'high' | 'critical'
export type IssueStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed'

export interface DetectedIssue {
  id?: number
  run_id: string
  entity_id: number
  current_period_id: number
  comparison_period_id: number | null
  issue_code: string
  category: string
  severity: IssueSeverity
  title: string
  description: string
  detection_trigger: string | null
  affected_account_ids: number[]
  supporting_metrics: Record<string, string>
  suggested_procedures: string | null
  suggested_ajes: string | null
  status: IssueStatus
  created_at: string | null
  acknowledged_at: string | null
  resolved_at: string | null
}

export interface DetectionRunResult {
  entity_id: number
  current_period_id: number
  comparison_period_id: number
  total_issues: number
  issues: DetectedIssue[]
}

export interface IssueListResult {
  entity_id: number
  total: number
  issues: DetectedIssue[]
}

export interface DiagnosticsResult {
  period_id: number
  period_name: string
  revenue: string
  cogs: string
  gross_profit: string
  gross_margin_pct: string | null
  total_expenses: string
  net_income: string
  cash: string
  accounts_receivable: string
  inventory: string
  total_current_assets: string
  total_assets: string
  total_current_liabilities: string
  total_liabilities: string
  total_equity: string
  total_debt: string
  working_capital: string
  current_ratio: string | null
  debt_to_equity: string | null
  roa: string | null
  balance_check: {
    assets: string
    liabilities_plus_equity: string
    balanced: boolean
  }
}

export interface IssueLibraryEntry {
  issue_code: string
  category: string
  name: string
  description: string
  default_severity: IssueSeverity
  threshold_type: string
  default_threshold: string
}

export interface DetectionThreshold {
  id: number
  entity_id: number
  issue_code: string
  threshold_type: string
  threshold_value: string
  is_active: boolean
}

export async function runDetection(params: {
  entity_id: number
  current_period_id: number
  comparison_period_id: number
  scenario_id?: number | null
  materiality_threshold?: number
}): Promise<DetectionRunResult> {
  const p = new URLSearchParams({
    entity_id: String(params.entity_id),
    current_period_id: String(params.current_period_id),
    comparison_period_id: String(params.comparison_period_id),
    materiality_threshold: String(params.materiality_threshold ?? 1000),
  })
  if (params.scenario_id != null) p.set('scenario_id', String(params.scenario_id))
  const res = await api.post(`/accounting-intelligence/run-detection?${p}`)
  return res.data
}

export async function listDetectedIssues(params: {
  entity_id: number
  current_period_id?: number
  severity?: IssueSeverity
  category?: string
  status?: IssueStatus
}): Promise<IssueListResult> {
  const p = new URLSearchParams({ entity_id: String(params.entity_id) })
  if (params.current_period_id != null) p.set('current_period_id', String(params.current_period_id))
  if (params.severity) p.set('severity', params.severity)
  if (params.category) p.set('category', params.category)
  if (params.status) p.set('status', params.status)
  const res = await api.get(`/accounting-intelligence/issues?${p}`)
  return res.data
}

export async function updateIssueStatus(issueId: number, status: IssueStatus): Promise<DetectedIssue> {
  const res = await api.patch(`/accounting-intelligence/issues/${issueId}/status?status=${status}`)
  return res.data
}

export async function getDiagnostics(params: {
  entity_id: number
  current_period_id: number
  scenario_id?: number | null
}): Promise<DiagnosticsResult> {
  const p = new URLSearchParams({
    entity_id: String(params.entity_id),
    current_period_id: String(params.current_period_id),
  })
  if (params.scenario_id != null) p.set('scenario_id', String(params.scenario_id))
  const res = await api.get(`/accounting-intelligence/diagnostics?${p}`)
  return res.data
}

export async function getIssueLibrary(): Promise<{ issues: IssueLibraryEntry[]; total: number }> {
  const res = await api.get('/accounting-intelligence/issue-library')
  return res.data
}

export async function listThresholds(entity_id: number): Promise<{ entity_id: number; thresholds: DetectionThreshold[] }> {
  const res = await api.get(`/accounting-intelligence/thresholds?entity_id=${entity_id}`)
  return res.data
}

export async function upsertThreshold(params: {
  entity_id: number
  issue_code: string
  threshold_type: string
  threshold_value: string
}): Promise<DetectionThreshold> {
  const p = new URLSearchParams({
    entity_id: String(params.entity_id),
    issue_code: params.issue_code,
    threshold_type: params.threshold_type,
    threshold_value: params.threshold_value,
  })
  const res = await api.put(`/accounting-intelligence/thresholds?${p}`)
  return res.data
}

// ---------------------------------------------------------------------------
// Sprint 3.13 — Issue Template Repository
// ---------------------------------------------------------------------------

export type IssueRiskLevel = 'low' | 'moderate' | 'high' | 'critical'
export type IssueType = 'financial_analytics' | 'balance_sheet' | 'audit' | 'qoe' | 'sba' | 'fraud' | 'disclosure' | 'presentation'

export interface IssueTemplate {
  id: number
  code: string
  category: string
  subcategory: string | null
  issue_type: IssueType
  name: string
  description: string
  risk_level: IssueRiskLevel
  materiality_note: string | null
  detection_logic: string | null
  potential_causes: string[]
  suggested_procedures: string[]
  suggested_ajes: string[]
  management_questions: string[]
  affected_account_types: string[]
  affected_statements: string[]
  audit_assertions: string[]
  references: string[]
  sort_order: number
  is_active: boolean
  is_system: boolean
  organization_id: number | null
}

export interface RepositoryCategory {
  category: string
  count: number
}

export async function listRepositoryCategories(): Promise<RepositoryCategory[]> {
  const res = await api.get('/accounting-intelligence/repository/categories')
  return res.data
}

export async function listRepository(params?: {
  category?: string
  issue_type?: string
  risk_level?: string
  search?: string
}): Promise<IssueTemplate[]> {
  const p = new URLSearchParams()
  if (params?.category) p.set('category', params.category)
  if (params?.issue_type) p.set('issue_type', params.issue_type)
  if (params?.risk_level) p.set('risk_level', params.risk_level)
  if (params?.search) p.set('search', params.search)
  const res = await api.get(`/accounting-intelligence/repository?${p}`)
  return res.data
}

export async function getRepositoryTemplate(code: string): Promise<IssueTemplate> {
  const res = await api.get(`/accounting-intelligence/repository/${code}`)
  return res.data
}
