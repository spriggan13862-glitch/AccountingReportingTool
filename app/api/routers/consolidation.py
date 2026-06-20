import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import FsLineOut, SubgroupTBRequest, TBRowOut, ValidationIssueOut
from app.services.consolidation_service import (
    build_consolidated_statements,
    get_consolidated_fs_statement,
    get_consolidated_trial_balance,
    get_subgroup_trial_balance,
    validate_consolidated_tb,
)

router = APIRouter(prefix="/consolidation", tags=["consolidation"])


def _tb_out(row) -> TBRowOut:
    return TBRowOut(
        account_id=row.account_id,
        account_number=row.account_number,
        account_name=row.account_name,
        account_type=row.account_type,
        normal_balance=row.normal_balance,
        total_debit=row.total_debit,
        total_credit=row.total_credit,
        net_debit=row.net_debit,
        signed_balance=row.signed_balance,
    )


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


# ---------------------------------------------------------------------------
# Consolidated trial balance
# ---------------------------------------------------------------------------

@router.get("/trial-balance")
def consolidated_trial_balance(
    consolidation_entity_id: int,
    as_of_date: datetime.date,
    operating_scenario_ids: list[int] = Query(default=[]),
    elim_scenario_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    rows = get_consolidated_trial_balance(
        db, consolidation_entity_id, as_of_date,
        operating_scenario_ids, elim_scenario_ids,
    )
    val = validate_consolidated_tb(rows)
    return {
        "data": [_tb_out(r) for r in rows],
        "validation": {
            "success": not val.has_errors,
            "errors": [_issue_out(i) for i in val.errors],
            "warnings": [_issue_out(i) for i in val.warnings],
            "info": [_issue_out(i) for i in val.infos],
        },
    }


# ---------------------------------------------------------------------------
# Consolidated FS endpoints
# ---------------------------------------------------------------------------

@router.get("/balance-sheet")
def consolidated_balance_sheet(
    consolidation_entity_id: int,
    as_of_date: datetime.date,
    operating_scenario_ids: list[int] = Query(default=[]),
    elim_scenario_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    rows = get_consolidated_fs_statement(
        db, consolidation_entity_id, as_of_date,
        operating_scenario_ids, elim_scenario_ids,
        statement="BS",
    )
    return {"data": [_fs_out(r) for r in rows]}


@router.get("/income-statement")
def consolidated_income_statement(
    consolidation_entity_id: int,
    as_of_date: datetime.date,
    operating_scenario_ids: list[int] = Query(default=[]),
    elim_scenario_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    rows = get_consolidated_fs_statement(
        db, consolidation_entity_id, as_of_date,
        operating_scenario_ids, elim_scenario_ids,
        statement="IS",
    )
    return {"data": [_fs_out(r) for r in rows]}


# ---------------------------------------------------------------------------
# Subgroup trial balance  (POST — caller provides arbitrary entity list)
# ---------------------------------------------------------------------------

@router.get("/statements")
def consolidated_statements(
    entity_ids: str = Query(..., description="Comma-separated entity IDs"),
    period_id: int = Query(...),
    view_id: int = Query(...),
    include_eliminations: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    parsed_entity_ids = [int(x.strip()) for x in entity_ids.split(",") if x.strip()]
    return build_consolidated_statements(
        entity_ids=parsed_entity_ids,
        period_id=period_id,
        view_id=view_id,
        db=db,
        include_eliminations=include_eliminations,
    )


@router.post("/subgroup-trial-balance", response_model=list[TBRowOut])
def subgroup_trial_balance(body: SubgroupTBRequest, db: Session = Depends(get_db)):
    pcts = (
        {int(k): v for k, v in body.ownership_pcts.items()}
        if body.ownership_pcts
        else None
    )
    rows = get_subgroup_trial_balance(
        db,
        entity_ids=body.entity_ids,
        as_of_date=body.as_of_date,
        operating_scenario_ids=body.operating_scenario_ids,
        elim_entity_id=body.elim_entity_id,
        elim_scenario_ids=body.elim_scenario_ids,
        ownership_pcts=pcts,
    )
    return [_tb_out(r) for r in rows]
