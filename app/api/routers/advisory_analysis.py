"""Advisory Analysis API — EBITDA bridge, QoE, SBA, DSCR."""
from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_db, get_current_user
from app.services import advisory_analysis_service as svc
from sqlalchemy.orm import Session

router = APIRouter(prefix="/advisory-analysis", tags=["advisory-analysis"])


@router.get("/ebitda-bridge")
def ebitda_bridge(
    entity_id: int = Query(...),
    scenario_ids: list[int] = Query(default=[]),
    base_ebitda: Decimal = Query(default=Decimal("0")),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    return svc.compute_ebitda_bridge(db, entity_id, scenario_ids, base_ebitda)


@router.get("/qoe-schedule")
def qoe_schedule(
    entity_id: int = Query(...),
    scenario_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    return svc.compute_qoe_schedule(db, entity_id, scenario_ids)


@router.get("/sba-addback")
def sba_addback(
    entity_id: int = Query(...),
    scenario_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    return svc.compute_sba_addback(db, entity_id, scenario_ids)


@router.get("/dscr")
def dscr(
    entity_id: int = Query(...),
    scenario_ids: list[int] = Query(default=[]),
    base_ebitda: Decimal = Query(default=Decimal("0")),
    annual_debt_service: Decimal = Query(default=Decimal("0")),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    return svc.compute_dscr(db, entity_id, scenario_ids, base_ebitda, annual_debt_service)


@router.get("/export")
def export_analysis(
    entity_id: int = Query(...),
    scenario_ids: list[int] = Query(default=[]),
    base_ebitda: Decimal = Query(default=Decimal("0")),
    annual_debt_service: Decimal = Query(default=Decimal("0")),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    data = svc.export_to_excel(db, entity_id, scenario_ids, base_ebitda, annual_debt_service)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=advisory_analysis.xlsx"},
    )
