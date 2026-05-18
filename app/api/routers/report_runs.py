"""Report-run endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_storage
from app.api.schemas import (
    ReportRunCreate,
    ReportRunOut,
    ReportRunValidationOut,
    ReportRunWorkflowOut,
)
from app.services.report_service import (
    ReportRunNotFoundError,
    ReportRunStateError,
    ReportValidationError,
    create_report_run,
    execute_report_run,
    get_report_run_or_raise,
    list_report_runs,
    rerun_report,
)
from app.services.organization_service import get_organization_or_raise

import json

router = APIRouter(tags=["report-runs"])


def _org_slug(db: Session, org_id: int) -> str:
    try:
        org = get_organization_or_raise(db, org_id)
        return org.slug
    except Exception:
        return f"org_{org_id}"


@router.post("/report-runs", response_model=ReportRunOut, status_code=201)
def create_pending_report_run(
    organization_id: int,
    body: ReportRunCreate,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        run = create_report_run(
            db,
            organization_id=organization_id,
            report_type=body.report_type,
            output_format=body.output_format,
            entity_id=body.entity_id,
            accounting_period_id=body.accounting_period_id,
            scenario_ids=body.scenario_ids,
            parameters=body.parameters,
            acting_user=acting_user,
        )
        db.commit()
        db.refresh(run)
        return run
    except ReportValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/report-runs/generate", response_model=ReportRunOut, status_code=201)
def create_and_execute_report_run(
    organization_id: int,
    body: ReportRunCreate,
    db: Session = Depends(get_db),
    storage=Depends(get_storage),
    acting_user=Depends(get_current_user),
):
    try:
        run = create_report_run(
            db,
            organization_id=organization_id,
            report_type=body.report_type,
            output_format=body.output_format,
            entity_id=body.entity_id,
            accounting_period_id=body.accounting_period_id,
            scenario_ids=body.scenario_ids,
            parameters=body.parameters,
            acting_user=acting_user,
        )
        db.flush()
        slug = _org_slug(db, organization_id)
        run = execute_report_run(db, run.id, storage, slug, acting_user=acting_user)
        db.commit()
        db.refresh(run)
        return run
    except ReportValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc))
    except ReportRunStateError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception:
        db.rollback()
        raise


@router.post("/report-runs/{run_id}/execute", response_model=ReportRunOut)
def execute_existing_report_run(
    run_id: int,
    db: Session = Depends(get_db),
    storage=Depends(get_storage),
    acting_user=Depends(get_current_user),
):
    try:
        run = get_report_run_or_raise(db, run_id)
        slug = _org_slug(db, run.organization_id)
        run = execute_report_run(db, run_id, storage, slug, acting_user=acting_user)
        db.commit()
        db.refresh(run)
        return run
    except ReportRunNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ReportRunStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception:
        db.rollback()
        raise


@router.get("/report-runs", response_model=list[ReportRunOut])
def list_all_report_runs(
    organization_id: int,
    report_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    entity_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return list_report_runs(
        db, organization_id,
        report_type=report_type,
        status=status,
        entity_id=entity_id,
    )


@router.get("/report-runs/{run_id}", response_model=ReportRunOut)
def get_report_run(run_id: int, db: Session = Depends(get_db)):
    try:
        return get_report_run_or_raise(db, run_id)
    except ReportRunNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/report-runs/{run_id}/rerun", response_model=ReportRunOut, status_code=201)
def rerun_existing_report(
    run_id: int,
    db: Session = Depends(get_db),
    storage=Depends(get_storage),
    acting_user=Depends(get_current_user),
):
    try:
        original = get_report_run_or_raise(db, run_id)
        slug = _org_slug(db, original.organization_id)
        new_run = rerun_report(db, run_id, storage, slug, acting_user=acting_user)
        db.commit()
        db.refresh(new_run)
        return new_run
    except ReportRunNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        db.rollback()
        raise


@router.get("/report-runs/{run_id}/validation", response_model=ReportRunValidationOut)
def get_report_run_validation(run_id: int, db: Session = Depends(get_db)):
    try:
        run = get_report_run_or_raise(db, run_id)
    except ReportRunNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    summary = json.loads(run.validation_summary_json) if run.validation_summary_json else {}
    return ReportRunValidationOut(run_id=run_id, validation_summary=summary)


@router.get("/report-runs/{run_id}/workflow", response_model=ReportRunWorkflowOut)
def get_report_run_workflow(run_id: int, db: Session = Depends(get_db)):
    try:
        run = get_report_run_or_raise(db, run_id)
    except ReportRunNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    summary = json.loads(run.workflow_summary_json) if run.workflow_summary_json else {}
    return ReportRunWorkflowOut(run_id=run_id, workflow_summary=summary)
