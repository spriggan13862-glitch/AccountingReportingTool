"""
Pydantic schemas for all API request and response bodies.

Response conventions
--------------------
- Normal success: return the typed model directly (FastAPI auto-serializes).
- Operation with warnings: include `warnings` list in the response model.
- Validation failure: ValidationOut with success=False and populated error lists.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class ValidationIssueOut(BaseModel):
    code: str
    severity: str                        # ERROR / WARNING / INFO
    message: str
    source_type: str
    source_id: Any = None
    field_name: str | None = None
    suggested_resolution: str | None = None


class ValidationOut(BaseModel):
    """Standardized validation payload for error and warning responses."""
    success: bool
    errors: list[ValidationIssueOut] = []
    warnings: list[ValidationIssueOut] = []
    info: list[ValidationIssueOut] = []


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


# ---------------------------------------------------------------------------
# Entities
# ---------------------------------------------------------------------------

class EntityCreate(BaseModel):
    code: str
    name: str
    entity_type: str                     # operating/consolidation/elimination/carveout/staging
    parent_id: int | None = None
    currency: str = "USD"
    fiscal_year_end_month: int           # 1=Jan … 12=Dec; required for period governance
    fiscal_year_convention: str          # calendar|52-53-week|retail-454; required


class EntityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    entity_type: str
    parent_id: int | None = None
    currency: str
    active: bool
    fiscal_year_end_month: int | None = None
    fiscal_year_convention: str | None = None
    account_count: int = 0
    import_count: int = 0


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

class AccountCreate(BaseModel):
    entity_id: int | None = None
    account_number: str
    account_name: str
    account_type: str                    # asset/liability/equity/revenue/cogs/expense/other_income/other_expense/tax/intercompany
    normal_balance: str                  # debit/credit
    parent_account_id: int | None = None
    detail_type: str | None = None
    description: str | None = None
    tax_line: str | None = None
    source_system: str | None = None
    reporting_taxonomy_line_id: int | None = None
    account_status: str | None = None
    active: bool | None = None
    is_header: bool = False
    is_postable: bool = True
    fs_sign_convention: int | None = None
    cfs_section: str | None = None
    fs_statement: str | None = None
    fs_section: str | None = None
    fs_line_label: str | None = None
    fs_line_order: int | None = None
    sort_order: int | None = None


class AccountUpdate(BaseModel):
    account_number: str | None = None
    account_name: str | None = None
    account_type: str | None = None
    normal_balance: str | None = None
    detail_type: str | None = None
    description: str | None = None
    tax_line: str | None = None
    account_status: str | None = None     # active/inactive/archived/deprecated
    reporting_taxonomy_line_id: int | None = None
    common_reporting_line_id: int | None = None  # canonical Account→FSLI mapping
    parent_account_id: int | None = None
    active: bool | None = None
    is_header: bool | None = None
    is_postable: bool | None = None
    fs_sign_convention: int | None = None
    cfs_section: str | None = None
    fs_statement: str | None = None
    fs_section: str | None = None
    fs_line_label: str | None = None
    fs_line_order: int | None = None
    sort_order: int | None = None


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    entity_id: int | None = None
    account_number: str
    account_name: str
    account_type: str
    normal_balance: str
    parent_account_id: int | None = None
    active: bool
    detail_type: str | None = None
    account_status: str = "active"
    description: str | None = None
    tax_line: str | None = None
    source_system: str | None = None
    reporting_taxonomy_line_id: int | None = None
    common_reporting_line_id: int | None = None  # canonical Account→FSLI mapping
    crl_state: str = "unclassified"
    is_header: bool = False
    is_postable: bool = True
    fs_sign_convention: int | None = None
    cfs_section: str | None = None
    fs_statement: str | None = None
    fs_section: str | None = None
    fs_line_label: str | None = None
    fs_line_order: int | None = None
    account_path: str | None = None
    depth_level: int | None = None
    sort_order: int | None = None


class AccountBulkUpdate(BaseModel):
    ids: list[int]
    patch: AccountUpdate


class AccountReparentBody(BaseModel):
    parent_account_id: int | None  # null = move to root (outdent)


class AccountReparentResult(BaseModel):
    account_id: int
    account_number: str
    account_name: str
    old_parent_id: int | None = None
    old_parent_number: str | None = None
    old_parent_name: str | None = None
    new_parent_id: int | None = None
    new_parent_number: str | None = None
    new_parent_name: str | None = None


# ---------------------------------------------------------------------------
# Reporting Taxonomy
# ---------------------------------------------------------------------------

class ReportingTaxonomyLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    short_name: str | None = None
    section: str
    statement_type: str | None = None
    sort_order: int
    hierarchy_depth: int = 0
    is_subtotal: bool
    normal_balance: str | None = None
    sign_behavior: str | None = None
    parent_id: int | None = None
    reporting_view_id: int | None = None
    description: str | None = None
    active: bool = True
    editable: bool = True
    system_defined: bool = False
    sec_xbrl_tag: str | None = None


class ReportingTaxonomyLineCreate(BaseModel):
    code: str
    name: str
    short_name: str | None = None
    section: str
    statement_type: str | None = None
    sort_order: int = 0
    is_subtotal: bool = False
    normal_balance: str | None = None
    sign_behavior: str = "positive"
    parent_id: int | None = None
    reporting_view_id: int | None = None
    description: str | None = None
    active: bool = True
    editable: bool = True
    sec_xbrl_tag: str | None = None


class ReportingTaxonomyLineUpdate(BaseModel):
    name: str | None = None
    short_name: str | None = None
    section: str | None = None
    statement_type: str | None = None
    sort_order: int | None = None
    is_subtotal: bool | None = None
    normal_balance: str | None = None
    sign_behavior: str | None = None
    parent_id: int | None = None
    reporting_view_id: int | None = None
    description: str | None = None
    active: bool | None = None
    editable: bool | None = None
    sec_xbrl_tag: str | None = None


class TaxonomyImportRow(BaseModel):
    """One row in a taxonomy import CSV."""
    taxonomy_code: str
    taxonomy_name: str
    statement_type: str | None = None
    parent_line: str | None = None  # code of parent
    display_order: int | None = None
    normal_balance: str | None = None
    active: bool = True
    description: str | None = None
    sign_behavior: str | None = None
    short_name: str | None = None


class TaxonomyImportPreview(BaseModel):
    rows: list[TaxonomyImportRow]
    create_count: int
    update_count: int
    error_count: int
    errors: list[str]


class TaxonomyImportApplyResult(BaseModel):
    created: int
    updated: int
    errors: list[str]


class TaxonomyLineReorderItem(BaseModel):
    id: int
    sort_order: int


class TaxonomyReorderRequest(BaseModel):
    items: list[TaxonomyLineReorderItem]



# Reporting Views

class ReportingTaxonomyViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: str | None = None
    is_default: bool
    is_system_defined: bool
    active: bool


class ReportingTaxonomyViewCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    is_default: bool = False


class ReportingTaxonomyViewUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_default: bool | None = None
    active: bool | None = None


# Presentation Settings

class ReportingPresentationSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    org_id: int | None = None
    display_scaling: str
    decimal_places: int
    negative_format: str
    show_account_numbers: bool
    collapse_subtotals: bool
    show_hierarchy_indent: bool
    show_zero_balance: bool
    hide_inactive: bool
    date_format: str
    currency_symbol: str
    bold_subtotals: bool
    underline_totals: bool
    alternate_row_shading: bool
    default_view_id: int | None = None


class ReportingPresentationSettingsUpdate(BaseModel):
    display_scaling: str | None = None
    decimal_places: int | None = None
    negative_format: str | None = None
    show_account_numbers: bool | None = None
    collapse_subtotals: bool | None = None
    show_hierarchy_indent: bool | None = None
    show_zero_balance: bool | None = None
    hide_inactive: bool | None = None
    date_format: str | None = None
    currency_symbol: str | None = None
    bold_subtotals: bool | None = None
    underline_totals: bool | None = None
    alternate_row_shading: bool | None = None
    default_view_id: int | None = None


# ---------------------------------------------------------------------------
# COA Import
# ---------------------------------------------------------------------------

class COAImportBatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    entity_id: int
    filename: str
    source_system: str | None = None
    row_count: int | None = None
    accounts_created: int | None = None
    accounts_updated: int | None = None
    status: str
    error_message: str | None = None


class COAApplyRequest(BaseModel):
    # row_index (int) → reporting_taxonomy_line_id user override
    overrides: dict[int, int] | None = None


class COAImportPreviewRow(BaseModel):
    row_index: int
    account_number: str
    account_name: str
    raw_type: str
    account_type: str | None
    normal_balance: str
    detail_type: str | None = None
    description: str | None = None
    tax_line: str | None = None
    suggested_reporting_line: str | None = None
    source_evidence: str | None = None
    parent_account_number: str | None = None
    parent_account_name: str | None = None
    hierarchy_depth: int = 0
    indent: int
    parent_row_idx: int | None = None


class COAImportPreview(BaseModel):
    batch_id: int
    entity_id: int
    filename: str
    source_system: str
    detected_columns: dict
    rows: list[COAImportPreviewRow]
    row_count: int
    warnings: list[str]


# ---------------------------------------------------------------------------
# Journal Entries
# ---------------------------------------------------------------------------

class JELineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    line_number: int
    account_id: int
    entity_id: int
    debit: Decimal
    credit: Decimal
    description: str | None = None
    account_number: str | None = None
    account_name: str | None = None


class JEOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    je_number: str
    entry_date: datetime.date
    entity_id: int
    scenario_id: int
    description: str
    source: str
    source_ref: str | None = None
    status: str
    reversal_of_id: int | None = None
    reversal_je_id: int | None = None
    created_by: str | None = None
    posted_by: str | None = None
    created_at: datetime.datetime
    posted_at: datetime.datetime | None = None
    reversed_at: datetime.datetime | None = None
    lines: list[JELineOut] = []
    warnings: list[ValidationIssueOut] = []


class ReverseJERequest(BaseModel):
    reversal_date: datetime.date
    je_number: str
    description: str
    created_by: str | None = None


# ---------------------------------------------------------------------------
# TB Import
# ---------------------------------------------------------------------------

class TbImportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    entity_id: int
    as_of_date: datetime.date
    filename: str
    row_count: int | None = None
    total_debits: Decimal | None = None
    total_credits: Decimal | None = None
    status: str
    error_message: str | None = None
    uploaded_by: str | None = None
    uploaded_at: datetime.datetime


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------

class ScenarioCreate(BaseModel):
    code: str
    name: str
    scenario_type: str           # actual/topside/pro_forma/elimination/carveout/budget/forecast
    description: str | None = None
    organization_id: int | None = None
    active: bool = True


class ScenarioUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    active: bool | None = None


class ScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    scenario_type: str
    description: str | None = None
    active: bool


# ---------------------------------------------------------------------------
# Taxonomy-based Financial Statements
# ---------------------------------------------------------------------------

class TaxonomyFsLineOut(BaseModel):
    """FS line built from ReportingTaxonomyLine + Account.reporting_taxonomy_line_id."""
    taxonomy_id: int
    code: str
    name: str
    section: str
    statement_type: str | None = None
    sort_order: int
    parent_id: int | None = None
    hierarchy_depth: int = 0
    is_subtotal: bool = False
    normal_balance: str | None = None
    sign_flip: bool = False
    own_balance: Decimal = Decimal("0")
    total_balance: Decimal = Decimal("0")
    display_balance: Decimal = Decimal("0")
    account_count: int = 0


# ---------------------------------------------------------------------------
# Trial Balance
# ---------------------------------------------------------------------------

class TBRowOut(BaseModel):
    account_id: int
    account_number: str
    account_name: str
    account_type: str
    normal_balance: str
    total_debit: Decimal
    total_credit: Decimal
    net_debit: Decimal
    signed_balance: Decimal
    beginning_balance: Decimal = Decimal("0")
    period_debit: Decimal = Decimal("0")
    period_credit: Decimal = Decimal("0")
    ending_balance: Decimal = Decimal("0")


# ---------------------------------------------------------------------------
# Financial Statements
# ---------------------------------------------------------------------------

class FsLineOut(BaseModel):
    line_id: int
    code: str
    name: str
    statement: str
    section: str | None = None
    sort_order: int
    parent_line_id: int | None = None
    is_subtotal: bool
    sign_flip: bool
    own_balance: Decimal
    total_balance: Decimal
    display_balance: Decimal


# ---------------------------------------------------------------------------
# Comparative reporting
# ---------------------------------------------------------------------------

class ScenarioStackIn(BaseModel):
    label: str
    scenario_ids: list[int]
    as_of_date: datetime.date


class ComparativeTBRequest(BaseModel):
    entity_id: int
    stacks: list[ScenarioStackIn] = Field(min_length=1)


class ComparativeFSRequest(BaseModel):
    entity_id: int
    stacks: list[ScenarioStackIn] = Field(min_length=1)
    statement: str | None = None         # 'BS', 'IS', 'CF' — None for all


class VarianceOut(BaseModel):
    amount: Decimal
    percentage: Decimal | None = None    # None when base is 0


class ComparativeTBRowOut(BaseModel):
    account_id: int
    account_number: str
    account_name: str
    account_type: str
    normal_balance: str
    columns: dict[str, Decimal]


class ComparativeFsRowOut(BaseModel):
    line_id: int
    code: str
    name: str
    statement: str
    section: str | None = None
    sort_order: int
    parent_line_id: int | None = None
    is_subtotal: bool
    sign_flip: bool
    columns: dict[str, Decimal]
    variances: dict[str, VarianceOut]


# ---------------------------------------------------------------------------
# Accounting Periods
# ---------------------------------------------------------------------------

class PeriodCreate(BaseModel):
    entity_id: int
    period_name: str
    start_date: datetime.date
    end_date: datetime.date
    fiscal_year: int
    fiscal_period: int
    period_type: str = "monthly"    # monthly / quarterly / annual


class PeriodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    entity_id: int
    period_name: str
    start_date: datetime.date
    end_date: datetime.date
    fiscal_year: int
    fiscal_period: int
    period_type: str
    is_closed: bool
    closed_at: datetime.datetime | None = None
    closed_by: str | None = None
    created_at: datetime.datetime


class ClosePeriodRequest(BaseModel):
    re_account_id: int
    scenario_id: int
    closing_je_number: str
    closed_by: str | None = None
    generate_closing_entries: bool = True


class ReopenPeriodRequest(BaseModel):
    """Placeholder — no parameters required for soft reopen."""
    pass


class PeriodStatusOut(BaseModel):
    """Response for the period-status endpoint."""
    entity_id: int
    date: datetime.date
    period: PeriodOut | None = None
    is_closed: bool = False


# ---------------------------------------------------------------------------
# Organizations
# ---------------------------------------------------------------------------

class OrganizationCreate(BaseModel):
    name: str
    slug: str


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    slug: str
    is_active: bool
    created_at: datetime.datetime


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    organization_id: int
    email: str
    full_name: str
    password: str | None = None   # plain-text; hashed by auth_service before storage
    is_active: bool = True
    is_superuser: bool = False


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    email: str
    full_name: str
    is_active: bool
    is_superuser: bool
    created_at: datetime.datetime


class AssignRoleRequest(BaseModel):
    role_name: str
    organization_id: int
    entity_id: int | None = None


class UserRoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    role_name: str
    organization_id: int
    entity_id: int | None = None
    created_at: datetime.datetime


class PermissionsOut(BaseModel):
    user_id: int
    permissions: list[str]


# ---------------------------------------------------------------------------
# Documents and attachments
# ---------------------------------------------------------------------------

class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    uploaded_by_user_id: int | None = None
    file_name: str
    original_file_name: str
    file_extension: str
    mime_type: str
    file_size_bytes: int
    storage_path: str
    document_type: str
    description: str | None = None
    checksum_sha256: str
    uploaded_at: datetime.datetime
    is_deleted: bool


class DocumentLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    document_id: int
    linked_object_type: str
    linked_object_id: int
    created_at: datetime.datetime


class AttachDocumentRequest(BaseModel):
    linked_object_type: str
    linked_object_id: int


class JESupportPackageOut(BaseModel):
    journal_entry_id: int
    documents: list[DocumentOut] = []


class TbImportSupportPackageOut(BaseModel):
    tb_import_id: int
    documents: list[DocumentOut] = []


class PeriodSupportPackageOut(BaseModel):
    accounting_period_id: int
    documents: list[DocumentOut] = []


# ---------------------------------------------------------------------------
# Workflow tasks
# ---------------------------------------------------------------------------

class TaskCreate(BaseModel):
    task_type: str
    title: str
    description: str | None = None
    priority: str = "medium"
    assigned_to_user_id: int | None = None
    due_date: datetime.date | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    task_type: str
    title: str
    description: str | None = None
    status: str
    priority: str
    assigned_to_user_id: int | None = None
    created_by_user_id: int | None = None
    reviewed_by_user_id: int | None = None
    due_date: datetime.date | None = None
    completed_at: datetime.datetime | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime | None = None


class AssignTaskRequest(BaseModel):
    assigned_to_user_id: int


class UpdateTaskStatusRequest(BaseModel):
    new_status: str
    reviewed_by_user_id: int | None = None


# ---------------------------------------------------------------------------
# Review signoffs
# ---------------------------------------------------------------------------

class SignoffCreate(BaseModel):
    object_type: str
    object_id: int
    reviewer_user_id: int
    notes: str | None = None


class SignoffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    object_type: str
    object_id: int
    reviewer_user_id: int
    signoff_status: str
    notes: str | None = None
    signed_at: datetime.datetime | None = None
    created_at: datetime.datetime


class SignoffActionRequest(BaseModel):
    notes: str | None = None


# ---------------------------------------------------------------------------
# Workflow issues
# ---------------------------------------------------------------------------

class IssueCreate(BaseModel):
    issue_code: str
    severity: str
    title: str
    description: str | None = None
    related_object_type: str | None = None
    related_object_id: int | None = None


class IssueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    related_object_type: str | None = None
    related_object_id: int | None = None
    issue_code: str
    severity: str
    title: str
    description: str | None = None
    resolution_notes: str | None = None
    status: str
    opened_by_user_id: int | None = None
    resolved_by_user_id: int | None = None
    opened_at: datetime.datetime
    resolved_at: datetime.datetime | None = None


class ResolveIssueRequest(BaseModel):
    resolution_notes: str | None = None


# ---------------------------------------------------------------------------
# Workflow status views
# ---------------------------------------------------------------------------

class JEWorkflowStatusOut(BaseModel):
    journal_entry_id: int
    je_status: str
    signoffs: list[SignoffOut] = []
    issues: list[IssueOut] = []


class PeriodWorkflowStatusOut(BaseModel):
    period_id: int
    period_name: str
    period_status: str
    has_blocking_issues: bool
    signoffs: list[SignoffOut] = []
    issues: list[IssueOut] = []


# ---------------------------------------------------------------------------
# Consolidation
# ---------------------------------------------------------------------------

class SubgroupTBRequest(BaseModel):
    entity_ids: list[int]
    as_of_date: datetime.date
    operating_scenario_ids: list[int]
    elim_entity_id: int | None = None
    elim_scenario_ids: list[int] = []
    ownership_pcts: dict[str, Decimal] | None = None   # str(entity_id) → pct


# ---------------------------------------------------------------------------
# Report Runs
# ---------------------------------------------------------------------------

class ReportRunCreate(BaseModel):
    report_type: str
    output_format: str = "xlsx"
    entity_id: int | None = None
    accounting_period_id: int | None = None
    scenario_ids: list[int] | None = None
    parameters: dict[str, Any] | None = None


class ReportRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    created_by_user_id: int | None = None
    report_type: str
    output_format: str
    status: str
    entity_id: int | None = None
    accounting_period_id: int | None = None
    scenario_ids_json: str | None = None
    parameters_json: str | None = None
    storage_path: str | None = None
    generated_document_id: int | None = None
    created_at: datetime.datetime
    completed_at: datetime.datetime | None = None


class ReportRunValidationOut(BaseModel):
    run_id: int
    validation_summary: dict[str, Any]


class ReportRunWorkflowOut(BaseModel):
    run_id: int
    workflow_summary: dict[str, Any]


# ---------------------------------------------------------------------------
# Draft Overlay / Preview
# ---------------------------------------------------------------------------

class OverlayCalculateRequest(BaseModel):
    organization_id: int
    entity_id: int
    as_of_date: datetime.date
    scenario_id: int
    preview_type: str = "trial_balance"
    included_je_ids: list[int] | None = None
    overlay_groups: list[str] | None = None
    generated_by: str | None = None
    generated_by_user_id: int | None = None
    include_re_rollforward: bool = True
    is_consolidated: bool = False
    consolidation_entity_id: int | None = None
    period_start: datetime.date | None = None
    create_audit_record: bool = True


class OverlayLineItemOut(BaseModel):
    account_id: int
    account_number: str
    account_name: str
    account_type: str
    normal_balance: str
    official_net_debit: Decimal
    draft_net_debit: Decimal
    preview_net_debit: Decimal
    official_signed_balance: Decimal
    draft_signed_adjustment: Decimal
    preview_signed_balance: Decimal
    source_je_ids: list[int] = []
    overlay_groups_used: list[str] = []
    is_synthetic_re: bool = False


class OverlayResultOut(BaseModel):
    """
    Draft-impact preview result.
    is_preview is always True — this is never official financial data.
    """
    is_preview: bool = True
    label: str
    preview_type: str
    organization_id: int
    entity_id: int
    as_of_date: datetime.date
    scenario_id: int
    generated_at: datetime.datetime
    included_je_count: int
    overlay_groups: list[str]
    line_items: list[OverlayLineItemOut]
    re_rollforward_applied: bool
    re_draft_adjustment: Decimal
    warnings: list[str] = []
    member_entity_ids: list[int] = []
    preview_run_id: int | None = None   # set when audit record was created


class PreviewRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    entity_id: int | None
    generated_by: str | None
    generated_by_user_id: int | None
    generated_at: datetime.datetime
    preview_type: str
    as_of_date: str
    scenario_id: int | None
    included_je_ids: str
    overlay_groups: str | None
    parameters: str | None
    included_je_count: int
    preview_label: str
    is_consolidated: bool
    consolidation_entity_id: int | None


class DraftEntryOut(BaseModel):
    je_id: int
    je_number: str
    entry_date: datetime.date
    description: str
    source: str
    overlay_group: str


class DrilldownEntryOut(BaseModel):
    je_id: int
    je_number: str
    entry_date: str
    debit: float
    credit: float
    description: str | None
    overlay_group: str


class DrilldownResultOut(BaseModel):
    account_id: int
    account_number: str
    account_name: str
    draft_net_debit: Decimal
    entries: list[DrilldownEntryOut]


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------

class ReconciliationCreate(BaseModel):
    organization_id: int
    entity_id: int
    account_id: int
    period_id: int | None = None
    reconciliation_type: str = "manual"
    official_balance: Decimal | None = None
    supporting_balance: Decimal | None = None
    tolerance_amount: Decimal = Decimal("0")
    notes: str | None = None


class ReconciliationUpdateBalances(BaseModel):
    official_balance: Decimal | None = None
    supporting_balance: Decimal | None = None
    variance_explanation: str | None = None
    draft_preview_balance: Decimal | None = None


class ReconciliationTransition(BaseModel):
    target_status: str
    user_id: int | None = None
    comment: str | None = None


class ReconciliationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    entity_id: int
    account_id: int
    period_id: int | None = None
    reconciliation_type: str
    status: str
    preparer_user_id: int | None = None
    reviewer_user_id: int | None = None
    prepared_at: datetime.datetime | None = None
    reviewed_at: datetime.datetime | None = None
    official_balance: Decimal | None = None
    supporting_balance: Decimal | None = None
    variance_amount: Decimal | None = None
    variance_explanation: str | None = None
    draft_preview_balance: Decimal | None = None
    tie_out_status: str
    tolerance_amount: Decimal
    rollforward_opening_balance: Decimal | None = None
    rollforward_adjustments: Decimal | None = None
    rollforward_closing_balance: Decimal | None = None
    notes: str | None = None
    reviewer_comment: str | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime | None = None


class ReconciliationLineCreate(BaseModel):
    description: str | None = None
    source_type: str = "manual"
    source_reference: str | None = None
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")
    is_reconciling_item: bool = False
    reconciling_notes: str | None = None


class ReconciliationLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reconciliation_id: int
    line_number: int
    description: str | None = None
    source_type: str
    source_reference: str | None = None
    debit: Decimal
    credit: Decimal
    balance: Decimal
    is_reconciling_item: bool
    reconciling_notes: str | None = None
    created_at: datetime.datetime


class SupportReferenceCreate(BaseModel):
    reference_type: str
    document_id: int | None = None
    journal_entry_id: int | None = None
    external_ref: str | None = None
    description: str | None = None
    added_by_user_id: int | None = None


class SupportReferenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reconciliation_id: int
    reference_type: str
    document_id: int | None = None
    journal_entry_id: int | None = None
    external_ref: str | None = None
    description: str | None = None
    added_by_user_id: int | None = None
    added_at: datetime.datetime | None = None
    created_at: datetime.datetime


class RollforwardRequest(BaseModel):
    new_period_id: int
    new_official_balance: Decimal | None = None


class RollforwardScheduleLineOut(BaseModel):
    label: str
    amount: Decimal
    is_subtotal: bool


class CashRollforwardRequest(BaseModel):
    opening_balance: Decimal
    inflows: Decimal
    outflows: Decimal


class ReRollforwardRequest(BaseModel):
    beginning_re: Decimal
    net_income: Decimal
    dividends: Decimal = Decimal("0")


class FaRollforwardRequest(BaseModel):
    beginning_balance: Decimal
    additions: Decimal
    disposals: Decimal = Decimal("0")
    depreciation: Decimal = Decimal("0")


class DebtRollforwardRequest(BaseModel):
    beginning_balance: Decimal
    new_borrowings: Decimal
    repayments: Decimal = Decimal("0")


# ---------------------------------------------------------------------------
# Financial Statement Engine — M20
# ---------------------------------------------------------------------------

class CashFlowLineOut(BaseModel):
    label: str
    amount: Decimal
    is_subtotal: bool = False


class CashFlowSectionOut(BaseModel):
    label: str
    lines: list[CashFlowLineOut]
    subtotal: Decimal


class CashFlowResultOut(BaseModel):
    entity_id: int
    period_start: datetime.date
    period_end: datetime.date
    operating: CashFlowSectionOut
    investing: CashFlowSectionOut
    financing: CashFlowSectionOut
    net_change: Decimal
    beginning_cash: Decimal
    ending_cash: Decimal
    tie_difference: Decimal
    warnings: list[str] = []
    is_preview: bool = False


class EquityLineOut(BaseModel):
    account_id: int
    account_number: str
    account_name: str
    opening_balance: Decimal
    net_income_allocation: Decimal
    contributions: Decimal
    distributions: Decimal
    other_changes: Decimal
    closing_balance: Decimal


class EquityStatementOut(BaseModel):
    entity_id: int
    period_start: datetime.date
    period_end: datetime.date
    lines: list[EquityLineOut]
    total_opening: Decimal
    total_net_income: Decimal
    total_contributions: Decimal
    total_distributions: Decimal
    total_closing: Decimal


class FsValidationResultOut(BaseModel):
    is_balanced: bool
    bs_difference: Decimal
    cf_tied: bool
    cf_difference: Decimal
    re_tied: bool
    re_difference: Decimal
    warnings: list[str] = []


class DrilldownJeOut(BaseModel):
    je_id: int
    je_number: str
    entry_date: str
    debit: Decimal
    credit: Decimal
    description: str | None = None
    source: str | None = None
    source_ref: str | None = None
    source_import_id: int | None = None
    source_import_filename: str | None = None
    document_id: int | None = None
    document_name: str | None = None


class DrilldownAccountOut(BaseModel):
    account_id: int
    account_number: str
    account_name: str
    net_debit: Decimal
    signed_balance: Decimal
    journal_entries: list[DrilldownJeOut] = []


class ReportLineDrilldownOut(BaseModel):
    fs_line_code: str
    fs_line_name: str
    total_balance: Decimal
    accounts: list[DrilldownAccountOut] = []


class TrendRowOut(BaseModel):
    account_type: str
    label: str
    periods: dict[str, Decimal]


class TrendReportOut(BaseModel):
    entity_id: int
    period_labels: list[str]
    rows: list[TrendRowOut]


# ---------------------------------------------------------------------------
# Report Definitions
# ---------------------------------------------------------------------------

class ReportDefinitionCreate(BaseModel):
    organization_id: int
    name: str
    report_type: str
    description: str | None = None
    is_template: bool = False


class ReportDefinitionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    name: str
    report_type: str
    description: str | None = None
    is_template: bool
    is_active: bool
    created_at: datetime.datetime


class ReportLineCreate(BaseModel):
    sort_order: int = 0
    indent_level: int = 0
    label: str
    section: str | None = None
    account_ids: list[int] | None = None
    fs_line_codes: list[str] | None = None
    calculation_type: str = "sum"
    sign_flip: bool = False
    is_subtotal: bool = False
    bold: bool = False


class ReportLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_definition_id: int
    sort_order: int
    indent_level: int
    label: str
    section: str | None = None
    account_ids_json: str | None = None
    fs_line_codes_json: str | None = None
    calculation_type: str
    sign_flip: bool
    is_subtotal: bool
    bold: bool


class ReportColumnCreate(BaseModel):
    column_number: int
    label: str
    column_type: str
    scenario_ids: list[int] | None = None
    period_offset: int = 0
    is_variance_column: bool = False
    show_percentage: bool = False


class ReportColumnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_definition_id: int
    column_number: int
    label: str
    column_type: str
    scenario_ids_json: str | None = None
    period_offset: int
    is_variance_column: bool
    show_percentage: bool


# ---------------------------------------------------------------------------
# M23 Import Pipeline
# ---------------------------------------------------------------------------

class ImportBatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    entity_id: int
    period_id: int | None = None
    scenario_id: int | None = None
    filename: str
    source_format: str
    content_hash: str
    column_mapping: dict = {}
    as_of_date: datetime.date
    status: str
    row_count: int | None = None
    mapped_row_count: int | None = None
    unmapped_row_count: int | None = None
    total_debits: Decimal | None = None
    total_credits: Decimal | None = None
    error_message: str | None = None
    notes: str | None = None
    posted_je_id: int | None = None
    reversal_je_id: int | None = None
    uploaded_by_user_id: int | None = None
    reviewed_by_user_id: int | None = None
    uploaded_at: datetime.datetime
    reviewed_at: datetime.datetime | None = None


class ImportLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    batch_id: int
    line_number: int
    raw_account_number: str | None = None
    raw_account_name: str | None = None
    raw_debit: Decimal | None = None
    raw_credit: Decimal | None = None
    raw_balance: Decimal | None = None
    raw_description: str | None = None
    debit: Decimal
    credit: Decimal
    description: str | None = None
    resolved_account_id: int | None = None
    mapping_status: str
    is_manually_mapped: bool
    mapped_by_user_id: int | None = None
    suggested_account_id: int | None = None
    notes: str | None = None
    suggested_fsli_taxonomy_node_id: int | None = None
    suggested_fsli_confidence: Decimal | None = None
    suggested_fsli_reason: str | None = None
    selected_fsli_taxonomy_node_id: int | None = None
    selected_common_reporting_line_id: int | None = None


class ImportIssueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    batch_id: int
    import_line_id: int | None = None
    severity: str
    code: str
    message: str
    field_name: str | None = None
    suggested_resolution: str | None = None
    resolved: bool
    resolved_by_user_id: int | None = None
    created_at: datetime.datetime


class ImportTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    name: str
    description: str | None = None
    source_format: str
    column_mapping: dict = {}
    is_active: bool
    created_by_user_id: int | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class ColumnMappingUpdate(BaseModel):
    column_mapping: dict[str, str]


class BatchPostRequest(BaseModel):
    je_number: str
    notes: str | None = None
    reversal_je_number: str | None = None


class CreateTemplateRequest(BaseModel):
    name: str
    description: str | None = None
    source_format: str = "csv"
    column_mapping: dict[str, str]


class MapLineRequest(BaseModel):
    account_id: int


class BulkMapRequest(BaseModel):
    mappings: list[dict]  # [{"line_id": N, "account_id": M}]


class ExcludeLinesRequest(BaseModel):
    line_ids: list[int]
    reason: str = 'manual'


class AssignParentRequest(BaseModel):
    line_ids: list[int]
    parent_account_id: int


class BulkAssignFsliRequest(BaseModel):
    line_ids: list[int]
    taxonomy_line_id: int
    entity_id: int
    view_id: int


class DetectedTotalRow(BaseModel):
    line_id: int
    reason: str
    confidence: float


class CreateAccountFromLineRequest(BaseModel):
    account_number: str
    account_name: str
    account_type: str
    normal_balance: str
    reporting_taxonomy_line_id: int | None = None


class ImportSuggestionOut(BaseModel):
    line_id: int
    raw_account_number: str | None = None
    raw_account_name: str | None = None
    suggested_account_id: int | None = None
    suggested_account_number: str | None = None
    suggested_account_name: str | None = None


# ---------------------------------------------------------------------------
# M27: Sheet detection + raw preview
# ---------------------------------------------------------------------------

class SheetInfo(BaseModel):
    name: str
    row_count: int
    likely_tb_score: int
    headers: list[str] = []
    preview_rows: list[dict] = []
    raw_rows: list[list[str]] = []
    auto_header_row_idx: int = 0
    detected_mapping: dict[str, str] = {}


class DetectResult(BaseModel):
    source_format: str
    sheets: list[SheetInfo]
    selected_sheet: str | None = None
    headers: list[str]
    detected_mapping: dict[str, str]
    unmapped_headers: list[str]
    preview_rows: list[dict]
    confidence: int


class RawPreviewRow(BaseModel):
    line_number: int
    raw_account_number: str | None = None
    raw_account_name: str | None = None
    raw_debit: str | None = None
    raw_credit: str | None = None
    raw_balance: str | None = None
    raw_description: str | None = None
    debit: str
    credit: str
    mapping_status: str
    resolved_account_id: int | None = None
    suggested_account_id: int | None = None


class RawPreviewOut(BaseModel):
    batch_id: int
    source_format: str
    column_mapping: dict[str, str]
    source_headers: list[str]
    rows: list[RawPreviewRow]
    total_rows: int
    showing: int


class ImportReadinessOut(BaseModel):
    entity_id: int
    coa_available: bool
    coa_account_count: int
    balances_available: bool
    gl_detail_available: bool
    fs_available: bool
    taxonomy_completion_pct: float
    ready_for_statements: bool
    ready_for_bridge: bool
    ready_for_drilldown: bool
    warnings: list[str] = []


class ImportReadinessStatus(BaseModel):
    coa_available: bool
    coa_account_count: int
    tb_available: bool
    tb_has_balances: bool
    gl_available: bool
    fs_available: bool
    taxonomy_mapped_pct: float
    unmapped_account_count: int
    ready_for_accounting_view: bool
    ready_for_fs_presentation: bool
    ready_for_bridge: bool
    ready_for_drilldown: bool
    missing_for_accounting_view: list[str]
    missing_for_fs_presentation: list[str]


# ---------------------------------------------------------------------------
# Sprint C — Account Parsing & Matching Engine
# ---------------------------------------------------------------------------

class ParsedAccountResult(BaseModel):
    raw: str
    account_number: str | None = None
    account_name: str | None = None


class AccountMatchResult(BaseModel):
    line_id: int
    raw: str
    parsed_number: str | None = None
    parsed_name: str | None = None
    match_status: str  # exact/number_only/name_only/parent/conflict/no_match
    matched_account_id: int | None = None
    matched_account_number: str | None = None
    matched_account_name: str | None = None
    conflict_reason: str | None = None
    confidence: float



# ---------------------------------------------------------------------------
# M24: Close Management
# ---------------------------------------------------------------------------

class CloseChecklistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    entity_id: int | None = None
    period_id: int | None = None
    close_type: str
    name: str
    status: str
    target_close_date: datetime.date | None = None
    actual_close_date: datetime.date | None = None
    notes: str | None = None
    created_by_user_id: int | None = None
    approved_by_user_id: int | None = None
    created_at: datetime.datetime
    closed_at: datetime.datetime | None = None


class CloseChecklistCreate(BaseModel):
    organization_id: int
    name: str
    close_type: str = "monthly"
    entity_id: int | None = None
    period_id: int | None = None
    target_close_date: datetime.date | None = None
    notes: str | None = None


class CloseTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    checklist_id: int
    organization_id: int
    entity_id: int | None = None
    task_type: str
    title: str
    description: str | None = None
    status: str
    priority: str
    sort_order: int
    assigned_to_user_id: int | None = None
    reviewer_user_id: int | None = None
    prepared_by_user_id: int | None = None
    reviewed_by_user_id: int | None = None
    due_date: datetime.date | None = None
    started_at: datetime.datetime | None = None
    prepared_at: datetime.datetime | None = None
    submitted_for_review_at: datetime.datetime | None = None
    reviewed_at: datetime.datetime | None = None
    completed_at: datetime.datetime | None = None
    created_at: datetime.datetime
    linked_reconciliation_id: int | None = None
    linked_import_batch_id: int | None = None
    linked_workpaper_id: int | None = None
    blocker_task_ids: list[int] | None = None
    rejection_reason: str | None = None
    notes: str | None = None
    is_required: bool


class CloseTaskCreate(BaseModel):
    title: str
    task_type: str = "manual"
    description: str | None = None
    priority: str = "medium"
    assigned_to_user_id: int | None = None
    reviewer_user_id: int | None = None
    due_date: datetime.date | None = None
    entity_id: int | None = None
    sort_order: int = 0
    notes: str | None = None
    blocker_task_ids: list[int] | None = None
    is_required: bool = True
    linked_reconciliation_id: int | None = None
    linked_import_batch_id: int | None = None


class CloseTaskStatusUpdate(BaseModel):
    new_status: str
    comment: str | None = None


class CloseTaskCommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_id: int
    author_user_id: int | None = None
    comment_text: str
    comment_type: str
    prior_status: str | None = None
    new_status: str | None = None
    created_at: datetime.datetime


class CloseTaskCommentCreate(BaseModel):
    comment_text: str


class CloseTaskAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_id: int
    document_id: int | None = None
    attachment_label: str
    original_filename: str
    version_number: int
    document_category: str
    uploaded_by_user_id: int | None = None
    uploaded_at: datetime.datetime
    is_superseded: bool
    notes: str | None = None


class CloseTaskAttachmentCreate(BaseModel):
    attachment_label: str
    original_filename: str
    document_id: int | None = None
    document_category: str = "support"
    notes: str | None = None


class CloseReadinessOut(BaseModel):
    checklist_id: int
    overall_status: str
    completion_pct: float
    total_tasks: int
    required_tasks: int
    by_status: dict[str, int]
    overdue_count: int
    blocked_count: int
    tasks_under_review: int
    unreviewed_workpapers: int
    issues: list[str]


class WorkpaperOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    entity_id: int | None = None
    period_id: int | None = None
    close_task_id: int | None = None
    title: str
    description: str | None = None
    workpaper_type: str
    status: str
    preparer_user_id: int | None = None
    reviewer_user_id: int | None = None
    reviewed_by_user_id: int | None = None
    reviewer_comment: str | None = None
    prepared_at: datetime.datetime | None = None
    submitted_for_review_at: datetime.datetime | None = None
    reviewed_at: datetime.datetime | None = None
    finalized_at: datetime.datetime | None = None
    created_by_user_id: int | None = None
    created_at: datetime.datetime


class WorkpaperCreate(BaseModel):
    title: str
    workpaper_type: str = "other"
    description: str | None = None
    entity_id: int | None = None
    period_id: int | None = None
    close_task_id: int | None = None
    preparer_user_id: int | None = None
    reviewer_user_id: int | None = None


class WorkpaperReviewRequest(BaseModel):
    approved: bool
    comment: str | None = None


class WorkpaperReferenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workpaper_id: int
    reference_type: str
    reference_id: int
    notes: str | None = None
    added_by_user_id: int | None = None
    added_at: datetime.datetime


class WorkpaperReferenceCreate(BaseModel):
    reference_type: str
    reference_id: int
    notes: str | None = None


class AssignTaskRequest(BaseModel):
    assigned_to_user_id: int | None = None
    reviewer_user_id: int | None = None


class ReviewActionRequest(BaseModel):
    comment: str | None = None


class RejectTaskRequest(BaseModel):
    reason: str


# ---------------------------------------------------------------------------
# M25 Period Governance
# ---------------------------------------------------------------------------

class PeriodGovernanceRequest(BaseModel):
    reason: str | None = None
    actor_user_id: int | None = None


class PeriodGovernanceEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    period_id: int
    event_type: str
    from_status: str
    to_status: str
    actor_user_id: int | None
    reason: str | None
    created_at: datetime.datetime


class PeriodLockSummaryOut(BaseModel):
    period_id: int
    period_name: str
    period_status: str
    is_hard_locked: bool
    is_soft_locked: bool
    posting_allowed: bool


class PeriodStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    period_name: str
    period_status: str
    is_closed: bool
    start_date: datetime.date
    end_date: datetime.date


# ---------------------------------------------------------------------------
# M25 Shadow-Close Validation
# ---------------------------------------------------------------------------

class ShadowCheckResultOut(BaseModel):
    check: str
    status: str          # valid | warning | blocked
    message: str
    detail: dict[str, Any] = {}


class ShadowCloseReportOut(BaseModel):
    period_id: int
    entity_id: int
    scenario_id: int | None
    overall_status: str
    checks: list[ShadowCheckResultOut]
    run_at: str


class ShadowCloseRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    period_id: int
    entity_id: int
    overall_status: str
    run_by_user_id: int | None
    run_at: datetime.datetime
    result_json: list[Any]


class ShadowCloseRequest(BaseModel):
    entity_id: int
    scenario_id: int | None = None
    persist: bool = True


# ---------------------------------------------------------------------------
# M25 Comparative Reports
# ---------------------------------------------------------------------------

class ComparativeReportRequest(BaseModel):
    entity_id: int
    current_period_id: int
    comparison_period_id: int
    report_type: str = "income_statement"
    scenario_id: int | None = None
    materiality_threshold: Decimal = Decimal("1000")


class ComparativeSectionOut(BaseModel):
    section: str
    current_total: str
    prior_total: str
    variance_total: str
    lines: list[dict[str, Any]]


class ComparativeReportOut(BaseModel):
    report_type: str
    entity_id: int
    current_period_id: int
    comparison_period_id: int
    current_period_name: str
    comparison_period_name: str
    scenario_id: int | None
    materiality_threshold: str
    generated_at: str
    sections: list[ComparativeSectionOut]
    material_variances_count: int


# ---------------------------------------------------------------------------
# M36 PDF Import
# ---------------------------------------------------------------------------

class PDFImportBatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    entity_id: int | None
    filename: str
    source_entity_name: str | None
    statement_date: str | None
    basis_of_accounting: str | None
    import_type: str | None = None
    statement_scope: str | None = None
    page_count: int | None
    line_count: int | None
    accounts_created: int | None
    status: str
    error_message: str | None
    created_at: datetime.datetime


class PDFImportPreviewLine(BaseModel):
    temp_account_code: str
    name_hash: str | None = None
    # Proposed accountant-friendly number generated at upload time
    proposed_account_code: str | None = None
    account_name: str
    statement_type: str
    section: str
    amount: str
    is_subtotal: bool
    is_contra: bool
    sort_order: int
    suggested_taxonomy_code: str | None
    mapping_confidence: str | None
    mapping_evidence: str | None
    page_number: int | None
    source_line_text: str | None
    # P1: synthetic presentation line flags
    synthetic_presentation_line: bool = False
    system_managed: bool = False
    locked: bool = False


class PDFPreviewLinePatch(BaseModel):
    account_name: str | None = None
    section: str | None = None
    suggested_taxonomy_code: str | None = None
    proposed_account_code: str | None = None
    amount: str | None = None
    excluded: bool | None = None


class PDFImportPreview(BaseModel):
    batch_id: int
    entity_id: int | None
    filename: str
    source_entity_name: str | None
    statement_date: str | None
    basis_of_accounting: str | None
    import_type: str | None = None
    statement_scope: str | None = None
    page_count: int
    line_count: int
    subtotal_count: int
    lines: list[PDFImportPreviewLine]
    validation: dict[str, Any]
    warnings: list[str]
    # P2: balance sheet tie status
    balance_sheet_variance: str | None = None
    balance_sheet_tied: bool = True
    # UX-DEF-11: net income reconciliation
    net_income_variance: str | None = None
    net_income_reconciled: bool = True
    net_income_in_equity: str | None = None
    pnl_net_income: str | None = None


class PDFValidationCheck(BaseModel):
    key: str
    label: str
    extracted: str
    expected: str
    difference: str
    status: str  # pass | fail


class PDFImportValidationReport(BaseModel):
    batch_id: int
    checks: list[PDFValidationCheck]
    passing: int
    failing: int
    total: int


class PDFMappingBucket(BaseModel):
    taxonomy_code: str
    source_lines: list[dict[str, Any]]
    total_amount: str
    confidence: str
    evidence: str


class PDFImportMappingOut(BaseModel):
    batch_id: int
    buckets: list[PDFMappingBucket]
    unmapped_lines: list[dict[str, Any]]
    bucket_count: int
    unmapped_count: int


# ---------------------------------------------------------------------------
# M36b — Stable codes, mapping layer, audit trail
# ---------------------------------------------------------------------------

class PDFLineOut(BaseModel):
    """A persisted PDF import line with its full mapping layer."""
    id: int
    batch_id: int
    # Layer 1 — source identity
    temp_account_code: str
    name_hash: str | None
    official_account_code: str | None
    account_name: str
    statement_type: str
    section: str
    amount: str
    is_subtotal: bool
    is_contra: bool
    sort_order: int
    # P1: synthetic presentation line flags
    synthetic_presentation_line: bool = False
    system_managed: bool = False
    locked: bool = False
    # Layer 2 — taxonomy (live mapping record values, not just extraction suggestion)
    suggested_taxonomy_code: str | None
    taxonomy_code: str | None
    taxonomy_source: str
    taxonomy_locked: bool
    # P3/P4: taxonomy conflict
    source_taxonomy_code: str | None = None
    taxonomy_conflict: bool = False
    conflict_reason: str | None = None
    conflict_resolution: str | None = None
    # Layer 3 — legal entity
    legal_entity_code: str | None
    # Layer 4 — consolidation
    consolidation_group: str | None
    # Extraction audit
    mapping_confidence: str | None
    mapping_evidence: str | None
    page_number: int | None
    source_line_text: str | None


class PDFLineUpdateRequest(BaseModel):
    """Partial update for a persisted PDF import line."""
    official_account_code: str | None = None
    taxonomy_code: str | None = None
    taxonomy_locked: bool | None = None
    legal_entity_code: str | None = None
    consolidation_group: str | None = None
    mapping_notes: str | None = None
    account_name: str | None = None
    amount: str | None = None


class PDFAuditTrail(BaseModel):
    """Full audit trail linking source document → extracted lines → mapping records."""
    batch_id: int
    filename: str
    source_entity_name: str | None
    statement_date: str | None
    basis_of_accounting: str | None
    status: str
    line_count: int
    lines: list[dict[str, Any]]


class PDFConflictResolutionRequest(BaseModel):
    """Resolve a taxonomy conflict on a PDF line."""
    # keep_source | use_parent | apply_global | create_reclass | create_new | accepted
    resolution: str
    notes: str | None = None


class PDFBalanceSheetValidation(BaseModel):
    """Balance-sheet tie check result."""
    total_assets: str
    total_liabilities: str
    total_equity: str
    total_liabilities_equity: str
    variance: str
    tied: bool
    tolerance: str = "0.01"
    net_income_in_equity: str | None = None
    pnl_net_income: str | None = None
    net_income_variance: str | None = None


# ---------------------------------------------------------------------------
# Adjustment Workspace
# ---------------------------------------------------------------------------

class AdjustmentPackageCreate(BaseModel):
    name: str
    package_type: str = "audit"
    description: str | None = None


class AdjustmentPackageUpdate(BaseModel):
    name: str | None = None
    package_type: str | None = None
    status: str | None = None
    description: str | None = None


class AdjustmentPackageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: str
    name: str
    package_type: str
    status: str
    description: str | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime | None = None
    member_count: int = 0


class AdvisorNoteUpdate(BaseModel):
    issue: str | None = None
    recommendation: str | None = None
    client_response: str | None = None
    resolution_status: str | None = None


class AdvisorNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    journal_entry_id: int
    issue: str | None = None
    recommendation: str | None = None
    client_response: str | None = None
    resolution_status: str
    updated_at: datetime.datetime | None = None
    created_at: datetime.datetime


class MaterialityUpdate(BaseModel):
    materiality: str | None = None  # clearly_trivial|immaterial|material|critical


class AdjustmentImpact(BaseModel):
    ni_impact: Decimal = Decimal("0")
    ebitda_impact: Decimal = Decimal("0")
    asset_impact: Decimal = Decimal("0")
    liability_impact: Decimal = Decimal("0")
    equity_impact: Decimal = Decimal("0")


class AdjustmentListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    je_number: str
    entry_date: datetime.date
    entity_id: int
    scenario_id: int
    description: str
    source: str
    status: str
    overlay_group: str | None = None
    materiality: str | None = None
    total_debit: Decimal = Decimal("0")
    total_credit: Decimal = Decimal("0")
    impact: AdjustmentImpact = AdjustmentImpact()
    package_ids: list[int] = []
    has_advisor_note: bool = False
    advisor_resolution_status: str | None = None
    lines: list[dict] | None = None


class ImpactPreviewRequest(BaseModel):
    journal_entry_ids: list[int]


class RollforwardRow(BaseModel):
    account_id: int
    account_number: str
    account_name: str
    account_type: str
    as_reported: Decimal
    adjustments: Decimal
    adjusted: Decimal


# ---------------------------------------------------------------------------
# Deliverable Workspace schemas (Sprint 3.8)
# ---------------------------------------------------------------------------

class DeliverablePackageCreate(BaseModel):
    name: str
    package_type: str = "custom"
    description: str | None = None
    owner: str | None = None
    reporting_view_id: int | None = None


class DeliverablePackageUpdate(BaseModel):
    name: str | None = None
    package_type: str | None = None
    status: str | None = None
    description: str | None = None
    owner: str | None = None
    reporting_view_id: int | None = None


class DeliverablePackageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: str
    name: str
    package_type: str
    status: str
    description: str | None = None
    owner: str | None = None
    reporting_view_id: int | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime | None = None
    item_count: int = 0
    memo_count: int = 0


class DeliverablePackageItemCreate(BaseModel):
    item_type: str
    item_ref: str
    item_label: str | None = None


class DeliverablePackageItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    package_id: int
    item_type: str
    item_ref: str
    item_label: str | None = None
    added_at: datetime.datetime


class DeliverableMemoCreate(BaseModel):
    issue: str | None = None
    observation: str | None = None
    recommendation: str | None = None
    client_response: str | None = None
    status: str = "open"


class DeliverableMemoUpdate(BaseModel):
    issue: str | None = None
    observation: str | None = None
    recommendation: str | None = None
    client_response: str | None = None
    status: str | None = None


class DeliverableMemoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    package_id: int
    issue: str | None = None
    observation: str | None = None
    recommendation: str | None = None
    client_response: str | None = None
    status: str
    created_at: datetime.datetime
    updated_at: datetime.datetime | None = None


class DeliverableDashboard(BaseModel):
    total_packages: int
    draft_count: int
    internal_review_count: int
    client_review_count: int
    finalized_count: int
    archived_count: int


# ---------------------------------------------------------------------------
# Reporting View — Overrides, Comparison, Impact
# ---------------------------------------------------------------------------

class ViewAccountOverrideCreate(BaseModel):
    taxonomy_line_id: int | None = None
    display_label: str | None = None
    entity_id: int | None = None
    locked: bool = False


class ViewAccountOverrideOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    entity_id: int | None = None
    view_id: int
    account_id: int
    taxonomy_line_id: int | None = None
    display_label: str | None = None
    locked: bool = False
    created_by: str | None = None
    created_at: datetime.datetime


class FsliMappingOut(BaseModel):
    entity_id: int | None
    view_id: int
    account_id: int
    taxonomy_line_id: int | None
    display_label: str | None
    account_number: str
    account_name: str
    taxonomy_line_name: str | None


class FsliMappingUpsert(BaseModel):
    taxonomy_line_id: int | None = None
    locked: bool | None = None


class FsliMigrationResult(BaseModel):
    migrated: int


class FsliEffectiveMapping(BaseModel):
    account_id: int
    account_number: str
    account_name: str
    taxonomy_line_id: int | None
    taxonomy_line_name: str | None
    mapping_source: str  # explicit/parent/grandparent/legacy/none
    inherited_from_account_id: int | None
    inherited_from_account_number: str | None


class FsliPropagateRequest(BaseModel):
    taxonomy_line_id: int
    overwrite_existing: bool = False


class FsliPropagateResult(BaseModel):
    propagated_count: int
    accounts_updated: list[int]


class FsliCopyFromViewResult(BaseModel):
    copied: int


class FsliBulkAssignRequest(BaseModel):
    account_ids: list[int]
    taxonomy_line_id: int


class FsliBulkAssignResult(BaseModel):
    updated: int


class ViewComparisonRow(BaseModel):
    taxonomy_id: int
    code: str
    name: str
    section: str
    hierarchy_depth: int
    is_subtotal: bool
    view1_balance: float
    view2_balance: float
    delta: float


class ViewComparisonResult(BaseModel):
    view1_id: int
    view2_id: int
    entity_id: int
    as_of_date: str
    statement_type: str
    rows: list[ViewComparisonRow]


class ViewImpactAccount(BaseModel):
    account_id: int
    account_code: str
    account_name: str
    default_taxonomy_id: int | None
    default_taxonomy_name: str | None
    override_taxonomy_id: int | None
    override_taxonomy_name: str | None
    display_label: str | None


class ViewImpactResult(BaseModel):
    view_id: int
    entity_id: int
    override_count: int
    accounts: list[ViewImpactAccount]


# ---------------------------------------------------------------------------
# Sprint 3.15 — Advisor Scenario + Package Engine schemas
# ---------------------------------------------------------------------------

ADVISOR_SCENARIO_TYPES = frozenset({
    "as_reported", "management", "management_tax",
    "management_tax_qoe", "sba", "custom",
})

PACKAGE_TYPES_EXTENDED = frozenset({
    "audit", "management", "tax", "qoe",
    "seller", "buyer", "sba", "client_posting",
})


class AdvisorScenarioCreate(BaseModel):
    name: str
    scenario_type: str = "custom"
    description: str | None = None


class AdvisorScenarioUpdate(BaseModel):
    name: str | None = None
    scenario_type: str | None = None
    description: str | None = None


class AdvisorScenarioPackageItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    package_id: int
    package_name: str
    package_type: str
    included: bool
    include_order: int


class AdvisorScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: str
    name: str
    scenario_type: str
    description: str | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime | None = None
    packages: list[AdvisorScenarioPackageItem] = []


class AdvisorScenarioPackageIn(BaseModel):
    package_id: int
    included: bool = True
    include_order: int = 0


class PackageToggleIn(BaseModel):
    included: bool


class ScenarioImpactResult(BaseModel):
    scenario_id: int
    scenario_name: str
    packages: list[str]
    impact: AdjustmentImpact


class ScenarioComparisonResult(BaseModel):
    scenarios: list[ScenarioImpactResult]


# ---------------------------------------------------------------------------
# Sprint K — JE Impact and Bridge schemas
# ---------------------------------------------------------------------------

class JeImpactResult(BaseModel):
    ni_impact: float
    bs_impact: float
    asset_impact: float
    liability_impact: float
    equity_impact: float
    line_details: list[dict]


class BridgeAdjustmentItem(BaseModel):
    je_id: int
    description: str
    amount: float


class BridgeRow(BaseModel):
    taxonomy_line_id: int | None
    line_name: str
    section: str
    as_reported: float
    adjustments: list[BridgeAdjustmentItem]
    total_adj: float
    adjusted: float


class BridgeResponse(BaseModel):
    rows: list[BridgeRow]
    entity_id: int
    period_id: int | None
    net_income_as_reported: float
    total_adjustments_ni: float
    net_income_adjusted: float


# ---------------------------------------------------------------------------
# Budgets
# ---------------------------------------------------------------------------

class BudgetLineCreate(BaseModel):
    account_id: int
    period_id: int | None = None
    amount: Decimal


class BudgetLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    budget_version_id: int
    account_id: int
    period_id: int | None = None
    amount: Decimal
    created_at: datetime.datetime


class BudgetVersionCreate(BaseModel):
    organization_id: int | None = None
    scenario_id: int
    name: str
    description: str | None = None
    status: str = "draft"


class BudgetVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int | None = None
    scenario_id: int
    name: str
    description: str | None = None
    status: str
    created_at: datetime.datetime
    lines: list[BudgetLineOut] = []


# ---------------------------------------------------------------------------
# Sprint D — Balance Engine
# ---------------------------------------------------------------------------

class BalanceComputeResult(BaseModel):
    account_type: str
    debit: float
    credit: float
    normal_balance: str
    accounting_balance: float
    presentation_amount: float
    is_normal: bool
    view: str


class FsLineBalanceOut(BaseModel):
    taxonomy_line_id: int | None = None
    line_name: str
    section: str
    statement_type: str | None = None
    accounting_balance: float
    presentation_amount: float
    account_count: int
    imported_balance: float
    posted_adj: float
    draft_adj: float
    adjusted_balance: float


# ---------------------------------------------------------------------------
# Sprint E — Accounting Working View
# ---------------------------------------------------------------------------

class AwvAccountRow(BaseModel):
    account_id: int
    account_number: str
    account_name: str
    account_type: str
    normal_balance: str
    imported_balance: float
    accounting_balance: float
    awv_display_amount: float
    posted_adj: float
    draft_adj: float
    adjusted_balance: float
    journal_entries: list[dict]


class AwvTaxonomyRow(BaseModel):
    taxonomy_line_id: int | None
    line_name: str
    sort_order: int
    is_subtotal: bool
    accounting_balance: float
    awv_display_amount: float
    imported_balance: float
    posted_adj: float
    draft_adj: float
    adjusted_balance: float
    accounts: list[AwvAccountRow]


class AwvSection(BaseModel):
    section: str
    label: str
    statement_type: str | None
    taxonomy_lines: list[AwvTaxonomyRow]


class AccountingWorkingViewResponse(BaseModel):
    sections: list[AwvSection]
    entity_id: int
    period_id: int | None
    view_id: int | None
    as_of_date: str | None
    net_income: float


# ---------------------------------------------------------------------------
# Sprint F — Financial Statement Presentation View
# ---------------------------------------------------------------------------

class IncomeStatementSummary(BaseModel):
    revenue: float
    cogs: float
    gross_profit: float
    total_expenses: float
    operating_income: float
    other_income: float
    other_expenses: float
    net_income: float


class BalanceSheetSummary(BaseModel):
    total_assets: float
    total_liabilities: float
    total_equity: float
    balanced: bool


class PresentationViewResponse(BaseModel):
    sections: list[AwvSection]
    income_statement: IncomeStatementSummary
    balance_sheet: BalanceSheetSummary
    entity_id: int
    period_id: int | None
    view_id: int | None
    as_of_date: str | None


# ---------------------------------------------------------------------------
# Sprint O3 — Taxonomy Library API
# ---------------------------------------------------------------------------

class TaxonomyOut(BaseModel):
    id: int
    code: str
    name: str
    description: str | None = None
    industry: str | None = None
    version: str | None = None
    is_system: bool
    parent_taxonomy_id: int | None = None
    is_active: bool
    model_config = ConfigDict(from_attributes=True)


class TaxonomyDetailOut(TaxonomyOut):
    node_count: int


class TaxonomyNodeOut(BaseModel):
    id: int
    taxonomy_id: int
    parent_id: int | None = None
    code: str
    name: str
    description: str | None = None
    statement_type: str | None = None
    financial_statement_section: str | None = None
    normal_balance: str | None = None
    sort_order: int
    level: int
    is_active: bool
    is_system: bool
    gaap_reference: str | None = None
    ifrs_reference: str | None = None
    xbrl_tag: str | None = None
    cash_flow_classification: str | None = None
    consolidation_treatment: str | None = None
    kpi_eligible: bool
    industry: str | None = None
    model_config = ConfigDict(from_attributes=True)


class TaxonomyNodeTreeOut(TaxonomyNodeOut):
    children: list["TaxonomyNodeTreeOut"] = []


class TaxonomyNodeCreate(BaseModel):
    parent_id: int | None = None
    code: str
    name: str
    description: str | None = None
    statement_type: str | None = None
    financial_statement_section: str | None = None
    normal_balance: str | None = None
    sort_order: int = 0
    level: int = 0
    gaap_reference: str | None = None
    ifrs_reference: str | None = None
    xbrl_tag: str | None = None
    cash_flow_classification: str | None = None
    consolidation_treatment: str | None = None
    kpi_eligible: bool = False
    industry: str | None = None


class TaxonomyNodeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    statement_type: str | None = None
    financial_statement_section: str | None = None
    normal_balance: str | None = None
    sort_order: int | None = None
    gaap_reference: str | None = None
    ifrs_reference: str | None = None
    xbrl_tag: str | None = None
    cash_flow_classification: str | None = None
    consolidation_treatment: str | None = None
    kpi_eligible: bool | None = None
    industry: str | None = None
    is_active: bool | None = None


class TaxonomyCloneRequest(BaseModel):
    name: str
    code: str | None = None


class AccountTaxonomyMappingOut(BaseModel):
    id: int
    account_id: int
    taxonomy_id: int
    taxonomy_node_id: int
    mapping_type: str
    confidence_score: float | None = None
    mapped_by: int | None = None
    mapping_source: str
    is_primary: bool
    effective_date: datetime.datetime | None = None
    end_date: datetime.datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class AccountTaxonomyMappingCreate(BaseModel):
    account_id: int
    taxonomy_id: int
    taxonomy_node_id: int
    mapping_type: str = "manual"
    mapping_source: str = "user_selected"
    confidence_score: float | None = None
    is_primary: bool = False
    mapped_by: int | None = None


class AccountTaxonomyMappingBulkRequest(BaseModel):
    mappings: list[AccountTaxonomyMappingCreate]


# ---------------------------------------------------------------------------
# Sprint O6 — Mapping Suggestions
# ---------------------------------------------------------------------------

class MappingSuggestionOut(BaseModel):
    taxonomy_id: int
    taxonomy_code: str
    taxonomy_node_id: int
    node_code: str
    node_name: str
    confidence_score: float
    reason: str
    # Agent 2: source account context so the modal never shows internal IDs.
    account_id: int | None = None
    account_number: str | None = None
    account_name: str | None = None


class BulkSuggestRequest(BaseModel):
    account_ids: list[int]
    taxonomy_ids: list[int]


class BulkSuggestResult(BaseModel):
    suggestions: dict[int, list[MappingSuggestionOut]]


class SuggestionToApply(BaseModel):
    account_id: int
    taxonomy_id: int
    taxonomy_node_id: int
    confidence_score: float | None = None


class ApplySuggestionsRequest(BaseModel):
    suggestions: list[SuggestionToApply]
    overwrite_existing: bool = False


class ApplySuggestionsResult(BaseModel):
    applied: int
    skipped: int
