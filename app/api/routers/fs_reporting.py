import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import FsLineOut, TaxonomyFsLineOut, ValidationIssueOut
from app.services.fs_reporting_service import get_fs_statement, validate_fs_mappings
from app.services.taxonomy_reporting_service import (
    get_taxonomy_fs_statement,
    propagate_taxonomy_to_children,
)
from app.services.reporting_taxonomy_service import get_or_seed

router = APIRouter(prefix="/financial-statements", tags=["financial-statements"])


def _fs_out(row) -> FsLineOut:
    return FsLineOut(
        line_id=row.line_id,
        code=row.code,
        name=row.name,
        statement=row.statement,
        section=row.section,
        sort_order=row.sort_order,
        parent_line_id=row.parent_line_id,
        is_subtotal=row.is_subtotal,
        sign_flip=row.sign_flip,
        own_balance=row.own_balance,
        total_balance=row.total_balance,
        display_balance=row.display_balance,
    )


def _issue_out(issue) -> ValidationIssueOut:
    return ValidationIssueOut(
        code=issue.code,
        severity=issue.severity.value,
        message=issue.message,
        source_type=issue.source_type,
        source_id=issue.source_id,
        field_name=issue.field_name,
        suggested_resolution=issue.suggested_resolution,
    )


@router.get("/balance-sheet")
def balance_sheet(
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: list[int] = Query(default=[]),
    include_warnings: bool = False,
    db: Session = Depends(get_db),
):
    """
    Return balance sheet line items for an entity.
    Set include_warnings=true to receive unmapped-account warnings alongside the data.
    """
    rows = get_fs_statement(db, entity_id, as_of_date, scenario_ids, statement="BS")
    response: dict = {"data": [_fs_out(r) for r in rows]}
    if include_warnings:
        warn_result = validate_fs_mappings(db, entity_id, as_of_date, scenario_ids)
        response["warnings"] = [_issue_out(w) for w in warn_result.warnings]
    return response


@router.get("/income-statement")
def income_statement(
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: list[int] = Query(default=[]),
    include_warnings: bool = False,
    db: Session = Depends(get_db),
):
    """
    Return income statement line items for an entity.
    Set include_warnings=true to receive unmapped-account warnings alongside the data.
    """
    rows = get_fs_statement(db, entity_id, as_of_date, scenario_ids, statement="IS")
    response: dict = {"data": [_fs_out(r) for r in rows]}
    if include_warnings:
        warn_result = validate_fs_mappings(db, entity_id, as_of_date, scenario_ids)
        response["warnings"] = [_issue_out(w) for w in warn_result.warnings]
    return response


def _tax_fs_out(row) -> TaxonomyFsLineOut:
    return TaxonomyFsLineOut(
        taxonomy_id=row.taxonomy_id,
        code=row.code,
        name=row.name,
        section=row.section,
        statement_type=row.statement_type,
        sort_order=row.sort_order,
        parent_id=row.parent_id,
        hierarchy_depth=row.hierarchy_depth,
        is_subtotal=row.is_subtotal,
        normal_balance=row.normal_balance,
        sign_flip=row.sign_flip,
        own_balance=row.own_balance,
        total_balance=row.total_balance,
        display_balance=row.display_balance,
        account_count=row.account_count,
    )


@router.get("/taxonomy/balance-sheet", response_model=list[TaxonomyFsLineOut])
def taxonomy_balance_sheet(
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    """Balance sheet using ReportingTaxonomyLine hierarchy (COA-import path).
    Auto-seeds taxonomy if the table is empty (new installation or fresh test DB).
    """
    get_or_seed(db)
    rows = get_taxonomy_fs_statement(
        db, entity_id, as_of_date, scenario_ids, statement_type="balance_sheet"
    )
    return [_tax_fs_out(r) for r in rows]


@router.get("/taxonomy/income-statement", response_model=list[TaxonomyFsLineOut])
def taxonomy_income_statement(
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    """Income statement using ReportingTaxonomyLine hierarchy (COA-import path).
    Auto-seeds taxonomy if the table is empty (new installation or fresh test DB).
    """
    get_or_seed(db)
    rows = get_taxonomy_fs_statement(
        db, entity_id, as_of_date, scenario_ids, statement_type="income_statement"
    )
    return [_tax_fs_out(r) for r in rows]


@router.post("/taxonomy/inherit", status_code=200)
def inherit_taxonomy(
    entity_id: int,
    db: Session = Depends(get_db),
):
    """
    Propagate taxonomy_line_id from parent accounts to children that have none.
    Safe to call multiple times (idempotent for already-set accounts).
    """
    result = propagate_taxonomy_to_children(entity_id, db)
    return result
