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
    entity_type: str                     # operating/consolidation/elimination/carveout
    parent_id: int | None = None
    currency: str = "USD"


class EntityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    entity_type: str
    parent_id: int | None = None
    currency: str
    active: bool


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

class AccountCreate(BaseModel):
    entity_id: int | None = None
    account_number: str
    account_name: str
    account_type: str                    # asset/liability/equity/revenue/expense
    normal_balance: str                  # debit/credit
    parent_account_id: int | None = None


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
