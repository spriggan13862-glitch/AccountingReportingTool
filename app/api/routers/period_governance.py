"""Period Governance API — M25"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.schemas import (
    PeriodGovernanceRequest,
    PeriodGovernanceEventOut,
    PeriodLockSummaryOut,
    PeriodStatusOut,
)
from app.services import period_governance_service as gov
from app.models.accounting_period import AccountingPeriod

router = APIRouter(prefix="/period-governance", tags=["period-governance"])


def _not_found(detail: str):
    raise HTTPException(status_code=404, detail=detail)


def _conflict(detail: str):
    raise HTTPException(status_code=409, detail=detail)


def _unprocessable(detail: str):
    raise HTTPException(status_code=422, detail=detail)


def _handle(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except gov.PeriodNotFoundError as e:
        _not_found(str(e))
    except gov.PeriodLockedError as e:
        _conflict(str(e))
    except gov.PeriodGovernanceError as e:
        _unprocessable(str(e))


# ---------------------------------------------------------------------------
# Period status
# ---------------------------------------------------------------------------

@router.get("/periods/{period_id}/status", response_model=PeriodStatusOut)
def get_period_status(period_id: int, db: Session = Depends(get_db)):
    period = db.get(AccountingPeriod, period_id)
    if period is None:
        _not_found(f"Period {period_id} not found")
    return period


@router.get("/periods/{period_id}/lock-summary", response_model=PeriodLockSummaryOut)
def get_lock_summary(period_id: int, db: Session = Depends(get_db)):
    return _handle(gov.get_lock_summary, db, period_id)


# ---------------------------------------------------------------------------
# Governance actions
# ---------------------------------------------------------------------------

@router.post("/periods/{period_id}/soft-close", response_model=PeriodStatusOut)
def soft_close(period_id: int, body: PeriodGovernanceRequest, db: Session = Depends(get_db)):
    period = _handle(gov.soft_close_period, db, period_id, body.actor_user_id, body.reason)
    db.commit()
    db.refresh(period)
    return period


@router.post("/periods/{period_id}/hard-close", response_model=PeriodStatusOut)
def hard_close(period_id: int, body: PeriodGovernanceRequest, db: Session = Depends(get_db)):
    period = _handle(gov.hard_close_period, db, period_id, body.actor_user_id, body.reason)
    db.commit()
    db.refresh(period)
    return period


@router.post("/periods/{period_id}/reopen", response_model=PeriodStatusOut)
def reopen(period_id: int, body: PeriodGovernanceRequest, db: Session = Depends(get_db)):
    period = _handle(gov.reopen_period, db, period_id, body.actor_user_id, body.reason)
    db.commit()
    db.refresh(period)
    return period


# ---------------------------------------------------------------------------
# Governance history
# ---------------------------------------------------------------------------

@router.get("/periods/{period_id}/history", response_model=list[PeriodGovernanceEventOut])
def get_history(period_id: int, db: Session = Depends(get_db)):
    return gov.get_governance_history(db, period_id)
