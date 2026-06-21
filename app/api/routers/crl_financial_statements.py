"""
CRL-G / P5 — financial-statement endpoints that read through the Common
Reporting Line layer.

These complement the existing /financial-statements/* endpoints (which
read through the taxonomy hierarchy directly). The CRL endpoints are the
canonical reporting boundary: every account → CRL → rendered statement,
which is the architecture v2 spec.

Mount path: /api/v1/financial-statements/crl
"""
from __future__ import annotations
import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_required_user
from app.services.crl_reporting_service import (
    CrlStatement,
    CrlStatementRow,
    STATEMENT_TYPE_BALANCE_SHEET,
    STATEMENT_TYPE_CASH_FLOW,
    STATEMENT_TYPE_INCOME_STATEMENT,
    get_crl_statement,
)


router = APIRouter()


AS_REPORTED_SOURCES = ["tb_import", "pdf_import", "opening_balance"]


def _source_filter_for(data_view: str) -> list[str] | None:
    if data_view == "as_reported":
        return AS_REPORTED_SOURCES
    return None


def _row_to_dict(r: CrlStatementRow) -> dict:
    return {
        "crl_id": r.crl_id,
        "crl_code": r.crl_code,
        "crl_name": r.crl_name,
        "section": r.section,
        "statement_type": r.statement_type,
        "parent_crl_id": r.parent_crl_id,
        "normal_balance": r.normal_balance,
        "sort_order": r.sort_order,
        "is_mandatory": r.is_mandatory,
        "is_system": r.is_system,
        "depth": r.depth,
        "account_count": r.account_count,
        "own_signed_balance": str(r.own_signed_balance),
        "total_signed_balance": str(r.total_signed_balance),
        "display_balance": str(r.display_balance),
    }


def _statement_to_dict(s: CrlStatement) -> dict:
    return {
        "rows": [_row_to_dict(r) for r in s.rows],
        "sections": s.sections,
        "total_accounts": s.total_accounts,
        "classified_accounts": s.classified_accounts,
        "unclassified_accounts": s.unclassified_accounts,
        "needs_review_accounts": s.needs_review_accounts,
        "accounts_outside_template": s.accounts_outside_template,
        "template_id": s.template_id,
        "statement_type": s.statement_type,
    }


# ---------------------------------------------------------------------------
# /financial-statements/crl/trial-balance — full statement (BS+IS+CF)
# ---------------------------------------------------------------------------

@router.get("/trial-balance", response_model=dict)
def crl_trial_balance(
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: list[int] = Query(default=[]),
    organization_id: int | None = Query(default=None),
    template_id: int | None = Query(default=None),
    data_view: str = Query(default="adjusted"),
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """Trial balance rolled up to the CRL layer (all statements)."""
    stmt = get_crl_statement(
        db,
        entity_id=entity_id,
        as_of_date=as_of_date,
        scenario_ids=scenario_ids,
        statement_type=None,
        organization_id=organization_id,
        template_id=template_id,
        source_filter=_source_filter_for(data_view),
    )
    return _statement_to_dict(stmt)


# ---------------------------------------------------------------------------
# /financial-statements/crl/balance-sheet
# ---------------------------------------------------------------------------

@router.get("/balance-sheet", response_model=dict)
def crl_balance_sheet(
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: list[int] = Query(default=[]),
    organization_id: int | None = Query(default=None),
    template_id: int | None = Query(default=None),
    data_view: str = Query(default="adjusted"),
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """Balance sheet rolled up to the CRL layer."""
    stmt = get_crl_statement(
        db,
        entity_id=entity_id,
        as_of_date=as_of_date,
        scenario_ids=scenario_ids,
        statement_type=STATEMENT_TYPE_BALANCE_SHEET,
        organization_id=organization_id,
        template_id=template_id,
        source_filter=_source_filter_for(data_view),
    )
    return _statement_to_dict(stmt)


# ---------------------------------------------------------------------------
# /financial-statements/crl/income-statement
# ---------------------------------------------------------------------------

@router.get("/income-statement", response_model=dict)
def crl_income_statement(
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: list[int] = Query(default=[]),
    organization_id: int | None = Query(default=None),
    template_id: int | None = Query(default=None),
    data_view: str = Query(default="adjusted"),
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """Income statement rolled up to the CRL layer."""
    stmt = get_crl_statement(
        db,
        entity_id=entity_id,
        as_of_date=as_of_date,
        scenario_ids=scenario_ids,
        statement_type=STATEMENT_TYPE_INCOME_STATEMENT,
        organization_id=organization_id,
        template_id=template_id,
        source_filter=_source_filter_for(data_view),
    )
    return _statement_to_dict(stmt)


# ---------------------------------------------------------------------------
# /financial-statements/crl/cash-flow
# ---------------------------------------------------------------------------

@router.get("/cash-flow", response_model=dict)
def crl_cash_flow(
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: list[int] = Query(default=[]),
    organization_id: int | None = Query(default=None),
    template_id: int | None = Query(default=None),
    data_view: str = Query(default="adjusted"),
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """Cash flow rolled up to the CRL layer."""
    stmt = get_crl_statement(
        db,
        entity_id=entity_id,
        as_of_date=as_of_date,
        scenario_ids=scenario_ids,
        statement_type=STATEMENT_TYPE_CASH_FLOW,
        organization_id=organization_id,
        template_id=template_id,
        source_filter=_source_filter_for(data_view),
    )
    return _statement_to_dict(stmt)
