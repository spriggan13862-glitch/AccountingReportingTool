import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import FsLineOut, ValidationIssueOut
from app.services.fs_reporting_service import get_fs_statement, validate_fs_mappings

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
