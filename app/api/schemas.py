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
# Consolidation
# ---------------------------------------------------------------------------

class SubgroupTBRequest(BaseModel):
    entity_ids: list[int]
    as_of_date: datetime.date
    operating_scenario_ids: list[int]
    elim_entity_id: int | None = None
    elim_scenario_ids: list[int] = []
    ownership_pcts: dict[str, Decimal] | None = None   # str(entity_id) → pct
