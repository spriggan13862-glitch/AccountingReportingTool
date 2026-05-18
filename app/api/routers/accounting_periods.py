import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import (
    ClosePeriodRequest,
    PeriodCreate,
    PeriodOut,
    PeriodStatusOut,
    ReopenPeriodRequest,
)
from app.services.accounting_period_service import (
    PeriodAlreadyClosedError,
    PeriodNotClosedError,
    PeriodNotFoundError,
    close_period,
    create_period,
    get_period_for_date,
    get_period_or_raise,
    list_periods,
    reopen_period,
)

router = APIRouter(prefix="/accounting-periods", tags=["accounting-periods"])


def _period_out(p) -> PeriodOut:
    return PeriodOut(
        id=p.id,
        entity_id=p.entity_id,
        period_name=p.period_name,
        start_date=p.start_date,
        end_date=p.end_date,
        fiscal_year=p.fiscal_year,
        fiscal_period=p.fiscal_period,
        period_type=p.period_type,
        is_closed=p.is_closed,
        closed_at=p.closed_at,
        closed_by=p.closed_by,
        created_at=p.created_at,
    )


@router.post("/", response_model=PeriodOut, status_code=201)
def create_accounting_period(body: PeriodCreate, db: Session = Depends(get_db)):
    """Create a new accounting period in open status."""
    period = create_period(
        db,
        entity_id=body.entity_id,
        period_name=body.period_name,
        start_date=body.start_date,
        end_date=body.end_date,
        fiscal_year=body.fiscal_year,
        fiscal_period=body.fiscal_period,
        period_type=body.period_type,
    )
    return _period_out(period)


@router.get("/", response_model=list[PeriodOut])
def list_accounting_periods(
    entity_id: int,
    fiscal_year: int | None = None,
    period_type: str | None = None,
    db: Session = Depends(get_db),
):
    """List accounting periods for an entity."""
    periods = list_periods(db, entity_id, fiscal_year=fiscal_year, period_type=period_type)
    return [_period_out(p) for p in periods]


@router.get("/status", response_model=PeriodStatusOut)
def period_status(
    entity_id: int,
    date: datetime.date,
    period_type: str = Query(default="monthly"),
    db: Session = Depends(get_db),
):
    """Return the period (if any) that covers a given date and whether it is closed."""
    period = get_period_for_date(db, entity_id, date, period_type)
    return PeriodStatusOut(
        entity_id=entity_id,
        date=date,
        period=_period_out(period) if period else None,
        is_closed=period.is_closed if period else False,
    )


@router.get("/{period_id}", response_model=PeriodOut)
def get_accounting_period(period_id: int, db: Session = Depends(get_db)):
    """Return an accounting period by id."""
    try:
        period = get_period_or_raise(db, period_id)
    except PeriodNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _period_out(period)


@router.post("/{period_id}/close", response_model=PeriodOut)
def close_accounting_period(
    period_id: int,
    body: ClosePeriodRequest,
    db: Session = Depends(get_db),
):
    """
    Close an accounting period.

    Optionally generates closing journal entries that zero out IS accounts
    and credit/debit the retained earnings account with net income/loss.
    """
    try:
        result = close_period(
            db,
            period_id=period_id,
            re_account_id=body.re_account_id,
            scenario_id=body.scenario_id,
            closing_je_number=body.closing_je_number,
            closed_by=body.closed_by,
            generate_closing_entries=body.generate_closing_entries,
        )
    except PeriodNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PeriodAlreadyClosedError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return _period_out(result.period)


@router.post("/{period_id}/reopen", response_model=PeriodOut)
def reopen_accounting_period(
    period_id: int,
    body: ReopenPeriodRequest,
    db: Session = Depends(get_db),
):
    """
    Reopen a closed accounting period (soft reopen — does not reverse closing entries).
    """
    try:
        period = reopen_period(db, period_id)
    except PeriodNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PeriodNotClosedError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return _period_out(period)
