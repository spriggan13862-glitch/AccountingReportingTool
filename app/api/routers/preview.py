"""
Draft Overlay / Preview API

ALL endpoints in this router return preview data only.
Official financial statements are served by reporting.py and fs_reporting.py.
"""

import io
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.schemas import (
    DraftEntryOut,
    DrilldownResultOut,
    OverlayCalculateRequest,
    OverlayLineItemOut,
    OverlayResultOut,
    PreviewRunOut,
)
from app.models.preview_run import PreviewRun
from app.services.draft_overlay_service import (
    OverlayParams,
    OverlayValidationError,
    calculate_overlay,
    create_preview_run,
    get_overlay_drilldown,
    list_available_drafts,
)
from app.services.export_service import build_preview_workbook, workbook_to_bytes

router = APIRouter(prefix="/preview", tags=["preview"])


def _params_from_request(req: OverlayCalculateRequest) -> OverlayParams:
    return OverlayParams(
        organization_id=req.organization_id,
        entity_id=req.entity_id,
        as_of_date=req.as_of_date,
        scenario_id=req.scenario_id,
        preview_type=req.preview_type,
        included_je_ids=req.included_je_ids,
        overlay_groups=req.overlay_groups,
        generated_by=req.generated_by,
        generated_by_user_id=req.generated_by_user_id,
        include_re_rollforward=req.include_re_rollforward,
        is_consolidated=req.is_consolidated,
        consolidation_entity_id=req.consolidation_entity_id,
        period_start=req.period_start,
    )


def _result_to_out(result, preview_run_id: int | None = None) -> OverlayResultOut:
    return OverlayResultOut(
        is_preview=True,
        label=result.label,
        preview_type=result.preview_type,
        organization_id=result.organization_id,
        entity_id=result.entity_id,
        as_of_date=result.as_of_date,
        scenario_id=result.scenario_id,
        generated_at=result.generated_at,
        included_je_count=result.included_je_count,
        overlay_groups=result.overlay_groups,
        line_items=[
            OverlayLineItemOut(
                account_id=item.account_id,
                account_number=item.account_number,
                account_name=item.account_name,
                account_type=item.account_type,
                normal_balance=item.normal_balance,
                official_net_debit=item.official_net_debit,
                draft_net_debit=item.draft_net_debit,
                preview_net_debit=item.preview_net_debit,
                official_signed_balance=item.official_signed_balance,
                draft_signed_adjustment=item.draft_signed_adjustment,
                preview_signed_balance=item.preview_signed_balance,
                source_je_ids=item.source_je_ids,
                overlay_groups_used=item.overlay_groups_used,
                is_synthetic_re=item.is_synthetic_re,
            )
            for item in result.line_items
        ],
        re_rollforward_applied=result.re_rollforward_applied,
        re_draft_adjustment=result.re_draft_adjustment,
        warnings=result.warnings,
        member_entity_ids=result.member_entity_ids,
        preview_run_id=preview_run_id,
    )


@router.post("/calculate", response_model=OverlayResultOut)
def calculate_overlay_endpoint(
    req: OverlayCalculateRequest,
    db: Session = Depends(get_db),
) -> OverlayResultOut:
    """
    Calculate a draft-impact preview overlay.
    Returns preview data only — NEVER persists balance figures.
    Optionally creates a PreviewRun audit record.
    """
    try:
        params = _params_from_request(req)
        result = calculate_overlay(db, params)
    except OverlayValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    preview_run_id = None
    if req.create_audit_record:
        run = create_preview_run(db, params, result)
        preview_run_id = run.id

    return _result_to_out(result, preview_run_id)


@router.post("/export")
def export_overlay_endpoint(
    req: OverlayCalculateRequest,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Export a draft-impact preview to Excel.
    Filename always includes DRAFT_PREVIEW to prevent confusion with official reports.
    """
    try:
        params = _params_from_request(req)
        result = calculate_overlay(db, params)
    except OverlayValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if req.create_audit_record:
        create_preview_run(db, params, result)

    wb = build_preview_workbook(result)
    data = workbook_to_bytes(wb)

    safe_date = str(result.as_of_date).replace("-", "")
    filename = f"DRAFT_PREVIEW_{result.preview_type.upper()}_{safe_date}.xlsx"

    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/runs", response_model=list[PreviewRunOut])
def list_preview_runs(
    organization_id: int = Query(...),
    entity_id: int | None = Query(None),
    db: Session = Depends(get_db),
) -> list[PreviewRunOut]:
    q = db.query(PreviewRun).filter(PreviewRun.organization_id == organization_id)
    if entity_id is not None:
        q = q.filter(PreviewRun.entity_id == entity_id)
    return q.order_by(PreviewRun.generated_at.desc()).all()


@router.get("/runs/{run_id}", response_model=PreviewRunOut)
def get_preview_run(run_id: int, db: Session = Depends(get_db)) -> PreviewRunOut:
    run = db.query(PreviewRun).filter(PreviewRun.id == run_id).first()
    if run is None:
        raise HTTPException(status_code=404, detail=f"PreviewRun {run_id} not found.")
    return run


@router.get("/draft-entries", response_model=list[DraftEntryOut])
def get_draft_entries(
    entity_id: int = Query(...),
    scenario_id: int = Query(...),
    as_of_date: str = Query(...),
    organization_id: int = Query(...),
    db: Session = Depends(get_db),
) -> list[DraftEntryOut]:
    """List draft JEs available for overlay selection."""
    import datetime as dt
    try:
        date = dt.date.fromisoformat(as_of_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid as_of_date format.")

    drafts = list_available_drafts(db, entity_id, scenario_id, date, organization_id)
    return [
        DraftEntryOut(
            je_id=d["je_id"],
            je_number=d["je_number"],
            entry_date=d["entry_date"],
            description=d["description"],
            source=d["source"],
            overlay_group=d["overlay_group"],
        )
        for d in drafts
    ]


@router.get("/drilldown", response_model=DrilldownResultOut)
def get_drilldown(
    account_id: int = Query(...),
    entity_id: int = Query(...),
    scenario_id: int = Query(...),
    as_of_date: str = Query(...),
    included_je_ids: list[int] | None = Query(None),
    db: Session = Depends(get_db),
) -> DrilldownResultOut:
    """Return source draft JE lines contributing to a specific account's overlay adjustment."""
    import datetime as dt
    try:
        date = dt.date.fromisoformat(as_of_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid as_of_date format.")

    try:
        result = get_overlay_drilldown(db, account_id, entity_id, scenario_id, date, included_je_ids)
    except OverlayValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return DrilldownResultOut(
        account_id=result.account_id,
        account_number=result.account_number,
        account_name=result.account_name,
        draft_net_debit=result.draft_net_debit,
        entries=[
            {
                "je_id": e["je_id"],
                "je_number": e["je_number"],
                "entry_date": e["entry_date"],
                "debit": e["debit"],
                "credit": e["credit"],
                "description": e["description"],
                "overlay_group": e["overlay_group"],
            }
            for e in result.entries
        ],
    )
