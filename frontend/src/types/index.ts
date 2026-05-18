// Core domain types matching the backend Pydantic schemas

export interface Entity {
  id: number
  code: string
  name: string
  entity_type: string
  parent_id: number | null
  currency: string
  active: boolean
}

export interface Account {
  id: number
  entity_id: number | null
  account_number: string
  account_name: string
  account_type: string
  normal_balance: string
  parent_account_id: number | null
  active: boolean
}

export interface JELine {
  id: number
  line_number: number
  account_id: number
  entity_id: number
  debit: string
  credit: string
  description: string | null
}

export interface ValidationIssue {
  code: string
  severity: string
  message: string
  source_type: string
  source_id: unknown
  field_name: string | null
  suggested_resolution: string | null
}

export interface JournalEntry {
  id: number
  je_number: string
  entry_date: string
  entity_id: number
  scenario_id: number
  description: string
  source: string
  source_ref: string | null
  status: 'draft' | 'posted' | 'reversed'
  reversal_of_id: number | null
  reversal_je_id: number | null
  created_by: string | null
  posted_by: string | null
  created_at: string
  posted_at: string | null
  reversed_at: string | null
  lines: JELine[]
  warnings: ValidationIssue[]
}

export interface WorkflowTask {
  id: number
  organization_id: number
  task_type: string
  title: string
  description: string | null
  status: 'open' | 'in_progress' | 'blocked' | 'review' | 'completed' | 'rejected'
  priority: 'low' | 'medium' | 'high' | 'critical'
  assigned_to_user_id: number | null
  created_by_user_id: number | null
  reviewed_by_user_id: number | null
  due_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string | null
}

export interface Signoff {
  id: number
  organization_id: number
  object_type: string
  object_id: number
  reviewer_user_id: number
  signoff_status: 'pending' | 'approved' | 'rejected'
  notes: string | null
  signed_at: string | null
  created_at: string
}

export interface WorkflowIssue {
  id: number
  organization_id: number
  related_object_type: string | null
  related_object_id: number | null
  issue_code: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  title: string
  description: string | null
  resolution_notes: string | null
  status: 'open' | 'investigating' | 'resolved' | 'dismissed'
  opened_by_user_id: number | null
  resolved_by_user_id: number | null
  opened_at: string
  resolved_at: string | null
}

export interface ReportRun {
  id: number
  organization_id: number
  created_by_user_id: number | null
  report_type: string
  output_format: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  entity_id: number | null
  accounting_period_id: number | null
  scenario_ids_json: string | null
  parameters_json: string | null
  storage_path: string | null
  generated_document_id: number | null
  created_at: string
  completed_at: string | null
}

export interface Document {
  id: number
  organization_id: number
  uploaded_by_user_id: number | null
  file_name: string
  original_file_name: string
  file_extension: string
  mime_type: string
  file_size_bytes: number
  storage_path: string
  document_type: string
  description: string | null
  checksum_sha256: string
  uploaded_at: string
  is_deleted: boolean
}

export interface AccountingPeriod {
  id: number
  entity_id: number
  period_name: string
  start_date: string
  end_date: string
  fiscal_year: number
  fiscal_period: number
  period_type: string
  is_closed: boolean
  closed_at: string | null
  closed_by: string | null
  created_at: string
}

export interface Organization {
  id: number
  name: string
  slug: string
  is_active: boolean
  created_at: string
}

export interface User {
  id: number
  organization_id: number
  email: string
  full_name: string
  is_active: boolean
  is_superuser: boolean
  created_at: string
}

export interface ValidationResponse {
  success: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  info: ValidationIssue[]
}

// API error shape
export interface ApiError {
  detail: string
  validation?: ValidationResponse
}
