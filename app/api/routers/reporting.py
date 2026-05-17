import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import (
    ComparativeFSRequest,
    ComparativeFsRowOut,
    ComparativeTBRequest,
    ComparativeTBRowOut,
    TBRowOut,
    VarianceOut,
)
from app.services.comparative_service import (
    ScenarioStack,
    get_comparative_fs_statement,
    get_comparative_trial_balance,
)
from app.services.reporting_service import get_trial_balance

router = APIRouter(prefix="/reporting", tags=["reporting"])


# ---------------------------------------------------------------------------
# Trial balance
# ---------------------------------------------------------------------------

@router.get("/trial-balance", response_model=list[TBRowOut])
def trial_balance(
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    rows = get_trial_balance(db, entity_id, as_of_date, scenario_ids)
    return [
        TBRowOut(
            account_id=r.account_id,
            account_number=r.account_number,
            account_name=r.account_name,
            account_type=r.account_type,
            normal_balance=r.normal_balance,
            total_debit=r.total_debit,
            total_credit=r.total_credit,
            net_debit=r.net_debit,
            signed_balance=r.signed_balance,
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Comparative trial balance  (POST — body carries the stacks array)
# ---------------------------------------------------------------------------

@router.post("/comparative-trial-balance", response_model=list[ComparativeTBRowOut])
def comparative_trial_balance(body: ComparativeTBRequest, db: Session = Depends(get_db)):
    stacks = [
        ScenarioStack(
            label=s.label,
            scenario_ids=s.scenario_ids,
            as_of_date=s.as_of_date,
        )
        for s in body.stacks
    ]
    rows = get_comparative_trial_balance(db, body.entity_id, stacks)
    return [
        ComparativeTBRowOut(
            account_id=r.account_id,
            account_number=r.account_number,
            account_name=r.account_name,
            account_type=r.account_type,
            normal_balance=r.normal_balance,
            columns=dict(r.columns),
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Comparative FS  (POST)
# ---------------------------------------------------------------------------

@router.post("/comparative-financial-statement", response_model=list[ComparativeFsRowOut])
def comparative_fs(body: ComparativeFSRequest, db: Session = Depends(get_db)):
    stacks = [
        ScenarioStack(
            label=s.label,
            scenario_ids=s.scenario_ids,
            as_of_date=s.as_of_date,
        )
        for s in body.stacks
    ]
    rows = get_comparative_fs_statement(db, body.entity_id, stacks, body.statement)
    return [
        ComparativeFsRowOut(
            line_id=r.line_id,
            code=r.code,
            name=r.name,
            statement=r.statement,
            section=r.section,
            sort_order=r.sort_order,
            parent_line_id=r.parent_line_id,
            is_subtotal=r.is_subtotal,
            sign_flip=r.sign_flip,
            columns=dict(r.columns),
            variances={
                k: VarianceOut(amount=v.amount, percentage=v.percentage)
                for k, v in r.variances.items()
            },
        )
        for r in rows
    ]
