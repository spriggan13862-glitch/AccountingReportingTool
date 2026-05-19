"""Shadow-Close Validation API — M25"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.schemas import ShadowCloseReportOut, ShadowCloseRunOut, ShadowCloseRequest
from app.services import shadow_close_service as svc

router = APIRouter(prefix="/shadow-close", tags=["shadow-close"])


@router.post("/periods/{period_id}/validate", response_model=ShadowCloseReportOut)
def run_validation(
    period_id: int,
    body: ShadowCloseRequest,
    db: Session = Depends(get_db),
):
    try:
        report = svc.run_shadow_close_validation(
            db,
            period_id=period_id,
            entity_id=body.entity_id,
            scenario_id=body.scenario_id,
            persist=body.persist,
        )
        if body.persist:
            db.commit()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return ShadowCloseReportOut(
        period_id=report.period_id,
        entity_id=report.entity_id,
        scenario_id=report.scenario_id,
        overall_status=report.overall_status,
        checks=[
            {"check": c.check, "status": c.status, "message": c.message, "detail": c.detail}
            for c in report.checks
        ],
        run_at=report.run_at,
    )


@router.get("/periods/{period_id}/history", response_model=list[ShadowCloseRunOut])
def get_history(
    period_id: int,
    entity_id: int,
    db: Session = Depends(get_db),
):
    return svc.get_shadow_close_history(db, period_id, entity_id)
