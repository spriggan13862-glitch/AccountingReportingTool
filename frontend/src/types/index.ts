// Core domain types matching the backend Pydantic schemas

// ---------------------------------------------------------------------------
// Request / mutation types
// ---------------------------------------------------------------------------

export interface JELineCreate {
  line_number: number
  account_id: number
  entity_id: number
  debit: string   // Decimal as string
  credit: string
  description?: string | null
}

export interface JECreate {
  je_number: string
  entry_date: string
  entity_id: number
  scenario_id: number
  description: string
  source: string
  source_ref?: string | null
  lines: JELineCreate[]
}

export interface ReverseJERequest {
  reversal_date: string
  je_number: string
  description: string
  created_by?: string | null
}

export interface TbImportOut {
  id: number
  entity_id: number
  as_of_date: string
  filename: string
  row_count: number | null
  total_debits: string | null
  total_credits: string | null
  status: string
  error_message: string | null
  uploaded_by: string | null
  uploaded_at: string
}

export interface PeriodCreate {
  entity_id: number
  period_name: string
  start_date: string
  end_date: string
  fiscal_year: number
  fiscal_period: number
  period_type?: string
}

export interface ClosePeriodRequest {
  re_account_id: number
  scenario_id: number
  closing_je_number: string
  closed_by?: string | null
  generate_closing_entries?: boolean
}

export interface PagedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface Entity {
  id: number
  code: string
  name: string
  entity_type: string
  parent_id: number | null
  currency: string
  active: boolean
  fiscal_year_end_month: number | null
  fiscal_year_convention: string | null
  account_count: number
  import_count: number
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
  detail_type: string | null
  account_status: string
  description: string | null
  tax_line: string | null
  source_system: string | null
  reporting_taxonomy_line_id: number | null
  is_header: boolean
  is_postable: boolean
  fs_sign_convention: number | null
  cfs_section: string | null
  fs_statement: string | null
  fs_section: string | null
  fs_line_label: string | null
  fs_line_order: number | null
  account_path: string | null
  depth_level: number | null
  sort_order: number | null
}

export interface AccountNode extends Account {
  children: AccountNode[]
}

export interface ReportingTaxonomyLine {
  id: number
  code: string
  name: string
  short_name: string | null
  section: string
  statement_type: string | null
  sort_order: number
  hierarchy_depth: number
  is_subtotal: boolean
  normal_balance: string | null
  sign_behavior: string | null
  parent_id: number | null
  description: string | null
  active: boolean
  editable: boolean
  system_defined: boolean
  sec_xbrl_tag: string | null
}

export interface ReportingTaxonomyView {
  id: number
  code: string
  name: string
  description: string | null
  is_default: boolean
  is_system_defined: boolean
  active: boolean
}

export interface ReportingPresentationSettings {
  id: number
  org_id: number | null
  display_scaling: string
  decimal_places: number
  negative_format: string
  show_account_numbers: boolean
  collapse_subtotals: boolean
  show_hierarchy_indent: boolean
  show_zero_balance: boolean
  hide_inactive: boolean
  date_format: string
  currency_symbol: string
  bold_subtotals: boolean
  underline_totals: boolean
  alternate_row_shading: boolean
  default_view_id: number | null
}

export interface TaxonomyImportPreview {
  rows: TaxonomyImportRow[]
  create_count: number
  update_count: number
  error_count: number
  errors: string[]
}

export interface TaxonomyImportRow {
  taxonomy_code: string
  taxonomy_name: string
  statement_type: string | null
  parent_line: string | null
  display_order: number | null
  normal_balance: string | null
  active: boolean
  description: string | null
  sign_behavior: string | null
  short_name: string | null
}

export interface COAImportBatch {
  id: number
  entity_id: number
  filename: string
  source_system: string | null
  row_count: number | null
  accounts_created: number | null
  accounts_updated: number | null
  status: string
  error_message: string | null
}

export interface COAImportPreviewRow {
  row_index: number
  account_number: string
  account_name: string
  raw_type: string
  account_type: string | null
  normal_balance: string
  detail_type: string | null
  description: string | null
  tax_line: string | null
  suggested_reporting_line: string | null
  source_evidence: string | null
  parent_account_number: string | null
  parent_account_name: string | null
  hierarchy_depth: number
  indent: number
  parent_row_idx: number | null
}

export interface COAImportPreview {
  batch_id: number
  entity_id: number
  filename: string
  source_system: string
  detected_columns: Record<string, string | null>
  rows: COAImportPreviewRow[]
  row_count: number
  warnings: string[]
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

// ---------------------------------------------------------------------------
// Authentication (M21)
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number  // seconds
}

export interface CurrentUser {
  id: number
  organization_id: number
  email: string
  full_name: string
  is_active: boolean
  is_superuser: boolean
  created_at: string
}

export type UserRole = 'admin' | 'controller' | 'accountant' | 'reviewer' | 'viewer' | 'auditor'

// ---------------------------------------------------------------------------
// Draft Overlay / Preview
// ---------------------------------------------------------------------------

export interface OverlayLineItem {
  account_id: number
  account_number: string
  account_name: string
  account_type: string
  normal_balance: string
  official_net_debit: string
  draft_net_debit: string
  preview_net_debit: string
  official_signed_balance: string
  draft_signed_adjustment: string
  preview_signed_balance: string
  source_je_ids: number[]
  overlay_groups_used: string[]
  is_synthetic_re: boolean
}

export interface OverlayResult {
  is_preview: true
  label: string
  preview_type: string
  organization_id: number
  entity_id: number
  as_of_date: string
  scenario_id: number
  generated_at: string
  included_je_count: number
  overlay_groups: string[]
  line_items: OverlayLineItem[]
  re_rollforward_applied: boolean
  re_draft_adjustment: string
  warnings: string[]
  member_entity_ids: number[]
  preview_run_id: number | null
}

export interface OverlayCalculateRequest {
  organization_id: number
  entity_id: number
  as_of_date: string
  scenario_id: number
  preview_type: string
  included_je_ids?: number[] | null
  overlay_groups?: string[] | null
  generated_by?: string | null
  generated_by_user_id?: number | null
  include_re_rollforward: boolean
  is_consolidated: boolean
  consolidation_entity_id?: number | null
  period_start?: string | null
  create_audit_record: boolean
}

export interface DraftEntry {
  je_id: number
  je_number: string
  entry_date: string
  description: string
  source: string
  overlay_group: string
}

export interface PreviewRun {
  id: number
  organization_id: number
  entity_id: number | null
  generated_by: string | null
  generated_by_user_id: number | null
  generated_at: string
  preview_type: string
  as_of_date: string
  scenario_id: number | null
  included_je_ids: string
  overlay_groups: string | null
  parameters: string | null
  included_je_count: number
  preview_label: string
  is_consolidated: boolean
  consolidation_entity_id: number | null
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export type ReconciliationStatus =
  | 'not_started'
  | 'in_progress'
  | 'prepared'
  | 'reviewed'
  | 'rejected'
  | 'rolled_forward'

export type TieOutStatus = 'untested' | 'in_tolerance' | 'out_of_tolerance' | 'tied'

export interface Reconciliation {
  id: number
  organization_id: number
  entity_id: number
  account_id: number
  period_id: number | null
  reconciliation_type: string
  status: ReconciliationStatus
  preparer_user_id: number | null
  reviewer_user_id: number | null
  prepared_at: string | null
  reviewed_at: string | null
  official_balance: string | null
  supporting_balance: string | null
  variance_amount: string | null
  variance_explanation: string | null
  draft_preview_balance: string | null
  tie_out_status: TieOutStatus
  tolerance_amount: string
  rollforward_opening_balance: string | null
  rollforward_adjustments: string | null
  rollforward_closing_balance: string | null
  notes: string | null
  reviewer_comment: string | null
  created_at: string
  updated_at: string | null
}

export interface ReconciliationLine {
  id: number
  reconciliation_id: number
  line_number: number
  description: string | null
  source_type: string
  source_reference: string | null
  debit: string
  credit: string
  balance: string
  is_reconciling_item: boolean
  reconciling_notes: string | null
  created_at: string
}

export interface SupportReference {
  id: number
  reconciliation_id: number
  reference_type: string
  document_id: number | null
  journal_entry_id: number | null
  external_ref: string | null
  description: string | null
  added_by_user_id: number | null
  added_at: string | null
  created_at: string
}

export interface ReconciliationCreate {
  organization_id: number
  entity_id: number
  account_id: number
  period_id?: number | null
  reconciliation_type?: string
  official_balance?: string | null
  supporting_balance?: string | null
  tolerance_amount?: string
  notes?: string | null
}

export interface ReconciliationUpdateBalances {
  official_balance?: string | null
  supporting_balance?: string | null
  variance_explanation?: string | null
  draft_preview_balance?: string | null
}

export interface RollforwardScheduleLine {
  label: string
  amount: string
  is_subtotal: boolean
}

export const OVERLAY_GROUPS = [
  'audit_adjustments',
  'management_adjustments',
  'lender_adjustments',
  'qoe_adjustments',
  'acquisition_adjustments',
  'close_adjustments',
  'tax_adjustments',
  'eliminations',
  'consolidation_adjustments',
  'pro_forma_adjustments',
  'reclasses',
  'accruals',
  'topsides',
] as const

export type OverlayGroup = typeof OVERLAY_GROUPS[number]

// M20: Financial Statement Engine

export interface CashFlowLine {
  label: string
  amount: string
  account_ids: number[]
  is_subtotal: boolean
}

export interface CashFlowSection {
  label: string
  lines: CashFlowLine[]
  subtotal: string
}

export interface CashFlowResult {
  entity_id: number
  period_start: string
  period_end: string
  scenario_ids: number[]
  operating: CashFlowSection
  investing: CashFlowSection
  financing: CashFlowSection
  net_change: string
  beginning_cash: string
  ending_cash: string
  tie_difference: string
  warnings: string[]
  is_preview: boolean
}

export interface EquityLine {
  account_id: number
  account_number: string
  account_name: string
  opening_balance: string
  net_income_allocation: string
  contributions: string
  distributions: string
  other_changes: string
  closing_balance: string
}

export interface EquityStatementResult {
  entity_id: number
  period_start: string
  period_end: string
  lines: EquityLine[]
  total_opening: string
  total_net_income: string
  total_contributions: string
  total_distributions: string
  total_closing: string
}

export interface FsLine {
  line_id: number
  code: string
  name: string
  statement: string
  section: string | null
  sort_order: number
  parent_line_id: number | null
  is_subtotal: boolean
  sign_flip: boolean
  own_balance: string
  total_balance: string
  display_balance: string
}

export interface FsValidationResult {
  is_balanced: boolean
  bs_difference: string
  cf_tied: boolean
  cf_difference: string | null
  re_tied: boolean
  re_difference: string | null
  cons_tied: boolean
  issues: string[]
}

export interface DrilldownJournalEntry {
  je_id: number
  je_number: string
  entry_date: string
  debit: string
  credit: string
  description: string
  net_debit?: string
  source?: string | null
  source_ref?: string | null
  source_import_id?: number | null
  source_import_filename?: string | null
  document_id?: number | null
  document_name?: string | null
}

export interface DrilldownAccount {
  account_id: number
  account_number: string
  account_name: string
  net_debit: string
  signed_balance: string
  journal_entries: DrilldownJournalEntry[]
}

export interface ReportLineDrilldown {
  fs_line_code: string
  fs_line_name: string
  total_balance: string
  accounts: DrilldownAccount[]
}

export interface TrendRow {
  account_id: number
  account_number: string
  account_name: string
  account_type: string
  periods: Record<string, string>
}

export interface ReportDefinition {
  id: number
  organization_id: number
  name: string
  report_type: string
  description: string | null
  is_template: boolean
  is_active: boolean
}

export interface ReportDefinitionCreate {
  name: string
  report_type: string
  description?: string
  is_template?: boolean
}

export interface Variance {
  amount: string
  percentage: string | null
}

// ---------------------------------------------------------------------------
// M23: Import Batch Pipeline
// ---------------------------------------------------------------------------

export type ImportBatchStatus =
  | 'uploaded'
  | 'parsing'
  | 'mapping_required'
  | 'validating'
  | 'validation_failed'
  | 'ready_to_post'
  | 'posted'
  | 'rolled_back'
  | 'rejected'

export type ImportLineStatus = 'unmapped' | 'mapped' | 'skipped' | 'rejected'

export interface ImportBatch {
  id: number
  organization_id: number
  entity_id: number
  period_id: number | null
  scenario_id: number | null
  filename: string
  source_format: string
  content_hash: string
  column_mapping: Record<string, string>
  as_of_date: string
  status: ImportBatchStatus
  row_count: number | null
  mapped_row_count: number | null
  unmapped_row_count: number | null
  total_debits: string | null
  total_credits: string | null
  error_message: string | null
  notes: string | null
  posted_je_id: number | null
  reversal_je_id: number | null
  uploaded_by_user_id: number | null
  reviewed_by_user_id: number | null
  uploaded_at: string
  reviewed_at: string | null
}

export interface ImportLine {
  id: number
  batch_id: number
  line_number: number
  raw_account_number: string | null
  raw_account_name: string | null
  raw_debit: string | null
  raw_credit: string | null
  raw_balance: string | null
  raw_description: string | null
  debit: string
  credit: string
  description: string | null
  resolved_account_id: number | null
  mapping_status: ImportLineStatus
  is_manually_mapped: boolean
  mapped_by_user_id: number | null
  mapped_at: string | null
  suggested_account_id: number | null
  notes: string | null
}

export interface ImportIssue {
  id: number
  batch_id: number
  import_line_id: number | null
  severity: 'ERROR' | 'WARNING' | 'INFO'
  code: string
  message: string
  field_name: string | null
  suggested_resolution: string | null
  resolved: boolean
  created_at: string
}

export interface ImportTemplate {
  id: number
  organization_id: number
  name: string
  description: string | null
  source_format: string
  column_mapping: Record<string, string>
  is_active: boolean
  created_by_user_id: number | null
  created_at: string
  updated_at: string
}

export interface ImportSuggestion {
  line_id: number
  raw_account_number: string | null
  raw_account_name: string | null
  suggested_account_id: number | null
  suggested_account_number: string | null
  suggested_account_name: string | null
}

// ---------------------------------------------------------------------------
// M27: Sheet detection + raw preview
// ---------------------------------------------------------------------------

export interface SheetInfo {
  name: string
  row_count: number
  likely_tb_score: number
}

export interface DetectResult {
  source_format: string
  sheets: SheetInfo[]
  selected_sheet: string | null
  headers: string[]
  detected_mapping: Record<string, string>
  unmapped_headers: string[]
  preview_rows: Record<string, string>[]
  confidence: number
}

export interface RawPreviewRow {
  line_number: number
  raw_account_number: string | null
  raw_account_name: string | null
  raw_debit: string | null
  raw_credit: string | null
  raw_balance: string | null
  raw_description: string | null
  debit: string
  credit: string
  mapping_status: string
  resolved_account_id: number | null
  suggested_account_id: number | null
}

export interface RawPreview {
  batch_id: number
  source_format: string
  column_mapping: Record<string, string>
  source_headers: string[]
  rows: RawPreviewRow[]
  total_rows: number
  showing: number
}

// ---------------------------------------------------------------------------
// M24: Close Management
// ---------------------------------------------------------------------------

export type CloseChecklistStatus = 'open' | 'in_progress' | 'review' | 'approved' | 'closed'
export type CloseTaskStatus =
  | 'not_started' | 'in_progress' | 'blocked' | 'prepared'
  | 'under_review' | 'completed' | 'rejected'
export type WorkpaperStatus = 'draft' | 'prepared' | 'reviewed' | 'finalized'

export interface CloseChecklist {
  id: number
  organization_id: number
  entity_id: number | null
  period_id: number | null
  close_type: string
  name: string
  status: CloseChecklistStatus
  target_close_date: string | null
  actual_close_date: string | null
  notes: string | null
  created_by_user_id: number | null
  approved_by_user_id: number | null
  created_at: string
  closed_at: string | null
}

export interface CloseTask {
  id: number
  checklist_id: number
  organization_id: number
  entity_id: number | null
  task_type: string
  title: string
  description: string | null
  status: CloseTaskStatus
  priority: string
  sort_order: number
  assigned_to_user_id: number | null
  reviewer_user_id: number | null
  prepared_by_user_id: number | null
  reviewed_by_user_id: number | null
  due_date: string | null
  started_at: string | null
  prepared_at: string | null
  submitted_for_review_at: string | null
  reviewed_at: string | null
  completed_at: string | null
  created_at: string
  linked_reconciliation_id: number | null
  linked_import_batch_id: number | null
  linked_workpaper_id: number | null
  blocker_task_ids: number[] | null
  rejection_reason: string | null
  notes: string | null
  is_required: boolean
}

export interface CloseTaskComment {
  id: number
  task_id: number
  author_user_id: number | null
  comment_text: string
  comment_type: string
  prior_status: string | null
  new_status: string | null
  created_at: string
}

export interface CloseTaskAttachment {
  id: number
  task_id: number
  document_id: number | null
  attachment_label: string
  original_filename: string
  version_number: number
  document_category: string
  uploaded_by_user_id: number | null
  uploaded_at: string
  is_superseded: boolean
  notes: string | null
}

export interface CloseReadiness {
  checklist_id: number
  overall_status: string
  completion_pct: number
  total_tasks: number
  required_tasks: number
  by_status: Record<string, number>
  overdue_count: number
  blocked_count: number
  tasks_under_review: number
  unreviewed_workpapers: number
  issues: string[]
}

export interface Workpaper {
  id: number
  organization_id: number
  entity_id: number | null
  period_id: number | null
  close_task_id: number | null
  title: string
  description: string | null
  workpaper_type: string
  status: WorkpaperStatus
  preparer_user_id: number | null
  reviewer_user_id: number | null
  reviewed_by_user_id: number | null
  reviewer_comment: string | null
  prepared_at: string | null
  submitted_for_review_at: string | null
  reviewed_at: string | null
  finalized_at: string | null
  created_by_user_id: number | null
  created_at: string
}

export interface WorkpaperReference {
  id: number
  workpaper_id: number
  reference_type: string
  reference_id: number
  notes: string | null
  added_by_user_id: number | null
  added_at: string
}

// ---------------------------------------------------------------------------
// M25: Period Governance & Shadow-Close
// ---------------------------------------------------------------------------

export type PeriodStatus = 'open' | 'soft_closed' | 'hard_closed' | 'reopened'

export interface PeriodGovernanceEvent {
  id: number
  period_id: number
  event_type: string
  from_status: string
  to_status: string
  actor_user_id: number | null
  reason: string | null
  created_at: string
}

export interface PeriodLockSummary {
  period_id: number
  period_name: string
  period_status: PeriodStatus
  is_hard_locked: boolean
  is_soft_locked: boolean
  posting_allowed: boolean
}

export interface ShadowCheckResult {
  check: string
  status: 'valid' | 'warning' | 'blocked'
  message: string
  detail: Record<string, unknown>
}

export interface ShadowCloseReport {
  period_id: number
  entity_id: number
  scenario_id: number | null
  overall_status: 'valid' | 'warning' | 'blocked'
  checks: ShadowCheckResult[]
  run_at: string
}

export interface ShadowCloseRun {
  id: number
  period_id: number
  entity_id: number
  overall_status: string
  run_by_user_id: number | null
  run_at: string
  result_json: ShadowCheckResult[]
}

export interface ComparativeLine {
  account_id: number
  account_number: string
  account_name: string
  current_amount: string
  prior_amount: string
  amount_variance: string
  pct_variance: string | null
  is_material: boolean
}

export interface ComparativeSection {
  section: string
  current_total: string
  prior_total: string
  variance_total: string
  lines: ComparativeLine[]
}

export interface ComparativeReport {
  report_type: string
  entity_id: number
  current_period_id: number
  comparison_period_id: number
  current_period_name: string
  comparison_period_name: string
  scenario_id: number | null
  materiality_threshold: string
  generated_at: string
  sections: ComparativeSection[]
  material_variances_count: number
}

export interface Scenario {
  id: number
  code: string
  name: string
  scenario_type: string
  description: string | null
  active: boolean
}

export interface TBRow {
  account_id: number
  account_number: string
  account_name: string
  account_type: string
  normal_balance: string
  total_debit: string
  total_credit: string
  net_debit: string
  signed_balance: string
  beginning_balance: string
  period_debit: string
  period_credit: string
  ending_balance: string
}

export interface TaxonomyFsLine {
  taxonomy_id: number
  code: string
  name: string
  section: string
  statement_type: string | null
  sort_order: number
  parent_id: number | null
  hierarchy_depth: number
  is_subtotal: boolean
  normal_balance: string | null
  sign_flip: boolean
  own_balance: string
  total_balance: string
  display_balance: string
  account_count: number
}

// ---------------------------------------------------------------------------
// M36 PDF Import
// ---------------------------------------------------------------------------

export interface PDFImportBatch {
  id: number
  entity_id: number | null
  filename: string
  source_entity_name: string | null
  statement_date: string | null
  basis_of_accounting: string | null
  import_type: string | null
  statement_scope: string | null
  page_count: number | null
  line_count: number | null
  accounts_created: number | null
  status: string
  error_message: string | null
  created_at: string
}

export interface PDFImportPreviewLine {
  temp_account_code: string
  name_hash: string | null
  proposed_account_code: string | null
  account_name: string
  statement_type: string
  section: string
  amount: string
  is_subtotal: boolean
  is_contra: boolean
  sort_order: number
  suggested_taxonomy_code: string | null
  mapping_confidence: string | null
  mapping_evidence: string | null
  page_number: number | null
  source_line_text: string | null
  // P1: synthetic line flags
  synthetic_presentation_line: boolean
  system_managed: boolean
  locked: boolean
  // P4: user-excluded from apply
  excluded?: boolean
}

export interface PDFImportPreview {
  batch_id: number
  entity_id: number | null
  filename: string
  source_entity_name: string | null
  statement_date: string | null
  basis_of_accounting: string | null
  import_type: string | null
  statement_scope: string | null
  page_count: number
  line_count: number
  subtotal_count: number
  lines: PDFImportPreviewLine[]
  validation: PDFImportValidation
  warnings: string[]
  // P2: balance sheet tie check
  balance_sheet_variance: string | null
  balance_sheet_tied: boolean
  // UX-DEF-11: net income reconciliation
  net_income_variance: string | null
  net_income_reconciled: boolean
  net_income_in_equity: string | null
  pnl_net_income: string | null
}

export interface PDFValidationCheck {
  key: string
  label: string
  extracted: string
  expected: string
  difference: string
  status: 'pass' | 'fail'
}

export interface PDFImportValidation {
  checks: PDFValidationCheck[]
  passing: number
  failing: number
  total: number
}

export interface PDFImportValidationReport {
  batch_id: number
  checks: PDFValidationCheck[]
  passing: number
  failing: number
  total: number
}

export interface PDFMappingSourceLine {
  temp_account_code: string
  account_name: string
  amount: string
  statement_type: string
  section: string
  confidence: string
  evidence: string
}

export interface PDFMappingBucket {
  taxonomy_code: string
  source_lines: PDFMappingSourceLine[]
  total_amount: string
  confidence: string
  evidence: string
}

export interface PDFImportMappingOut {
  batch_id: number
  buckets: PDFMappingBucket[]
  unmapped_lines: PDFMappingSourceLine[]
  bucket_count: number
  unmapped_count: number
}

export interface PDFLineOut {
  id: number
  batch_id: number
  temp_account_code: string
  name_hash: string | null
  official_account_code: string | null
  account_name: string
  statement_type: string
  section: string
  amount: string
  is_subtotal: boolean
  is_contra: boolean
  sort_order: number
  // P1: synthetic flags
  synthetic_presentation_line: boolean
  system_managed: boolean
  locked: boolean
  suggested_taxonomy_code: string | null
  taxonomy_code: string | null
  taxonomy_source: string | null
  taxonomy_locked: boolean
  // P3/P4: taxonomy conflict
  source_taxonomy_code: string | null
  taxonomy_conflict: boolean
  conflict_reason: string | null
  conflict_resolution: string | null
  legal_entity_code: string | null
  consolidation_group: string | null
  mapping_confidence: string | null
  mapping_evidence: string | null
  page_number: number | null
  source_line_text: string | null
}

export interface PDFLineUpdateRequest {
  official_account_code?: string | null
  taxonomy_code?: string | null
  taxonomy_locked?: boolean
  legal_entity_code?: string | null
  consolidation_group?: string | null
  mapping_notes?: string | null
  account_name?: string | null
  amount?: string | null
}

export interface PDFConflictResolutionRequest {
  resolution: 'keep_source' | 'use_parent' | 'apply_global' | 'create_reclass' | 'create_new' | 'accepted'
  notes?: string | null
}

export interface PDFAuditTrail {
  batch_id: number
  filename: string
  source_entity_name: string | null
  statement_date: string | null
  basis_of_accounting: string | null
  status: string
  line_count: number
  lines: PDFLineOut[]
}
