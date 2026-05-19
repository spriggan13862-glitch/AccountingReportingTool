"""Comparative Reports API — M25"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.schemas import ComparativeReportRequest, ComparativeReportOut
from app.services import comparative_report_service as svc

router = APIRouter(prefix="/comparative-reports", tags=["comparative-reports"])


@router.post("/", response_model=ComparativeReportOut)
def build_comparative_report(
    body: ComparativeReportRequest,
    db: Session = Depends(get_db),
):
    try:
        report = svc.build_comparative_report(
            db,
            entity_id=body.entity_id,
            current_period_id=body.current_period_id,
            comparison_period_id=body.comparison_period_id,
            report_type=body.report_type,
            scenario_id=body.scenario_id,
            materiality_threshold=body.materiality_threshold,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return svc.build_variance_summary(report)


@router.get("/comparable-period", response_model=dict)
def find_comparable_period(
    entity_id: int = Query(...),
    period_id: int = Query(...),
    comparison_type: str = Query("prior_month"),
    db: Session = Depends(get_db),
):
    comparable = svc.get_comparable_periods(db, entity_id, period_id, comparison_type)
    if comparable is None:
        return {"found": False, "comparable_period": None}
    return {
        "found": True,
        "comparable_period": {
            "id": comparable.id,
            "period_name": comparable.period_name,
            "start_date": str(comparable.start_date),
            "end_date": str(comparable.end_date),
        },
    }
