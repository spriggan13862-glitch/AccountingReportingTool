"""Accounting Intelligence Engine API — Sprint 3.12 / 3.13"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import accounting_intelligence_service as svc
from app.services import issue_template_service as tmpl_svc

router = APIRouter(prefix="/accounting-intelligence", tags=["accounting-intelligence"])


@router.post("/run-detection")
def run_detection(
    entity_id: int = Query(...),
    current_period_id: int = Query(...),
    comparison_period_id: int = Query(...),
    scenario_id: int | None = Query(default=None),
    materiality_threshold: float = Query(default=1000.0),
    db: Session = Depends(get_db),
):
    """
    Run all detection rules against current vs. comparison period.
    Persists results as DetectedIssue rows and returns the detected issues.
    """
    try:
        issues = svc.run_detection(
            db,
            entity_id=entity_id,
            current_period_id=current_period_id,
            comparison_period_id=comparison_period_id,
            scenario_id=scenario_id,
            materiality_threshold=Decimal(str(materiality_threshold)),
            persist=True,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {
        "entity_id": entity_id,
        "current_period_id": current_period_id,
        "comparison_period_id": comparison_period_id,
        "total_issues": len(issues),
        "issues": issues,
    }


@router.get("/issues")
def list_issues(
    entity_id: int = Query(...),
    current_period_id: int | None = Query(default=None),
    severity: str | None = Query(default=None),
    category: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """List detected issues for an entity, with optional filters."""
    issues = svc.list_detected_issues(
        db,
        entity_id=entity_id,
        current_period_id=current_period_id,
        severity=severity,
        category=category,
        status=status,
    )
    return {"entity_id": entity_id, "total": len(issues), "issues": issues}


@router.patch("/issues/{issue_id}/status")
def update_issue_status(
    issue_id: int,
    status: str = Query(..., description="open|acknowledged|resolved|dismissed"),
    db: Session = Depends(get_db),
):
    """Update the status of a detected issue."""
    valid = {"open", "acknowledged", "resolved", "dismissed"}
    if status not in valid:
        raise HTTPException(status_code=422, detail=f"status must be one of {valid}")
    try:
        return svc.update_issue_status(db, issue_id, status)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/diagnostics")
def get_diagnostics(
    entity_id: int = Query(...),
    current_period_id: int = Query(...),
    scenario_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Compute financial ratios and diagnostics for the given period.
    Returns balance validation, ratios, and key metrics.
    """
    try:
        return svc.compute_diagnostics(db, entity_id, current_period_id, scenario_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/issue-library")
def get_issue_library():
    """Return the full library of issue definitions with metadata."""
    return {"issues": svc.ISSUE_LIBRARY, "total": len(svc.ISSUE_LIBRARY)}


@router.get("/thresholds")
def list_thresholds(
    entity_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """List all active detection thresholds for an entity."""
    return {"entity_id": entity_id, "thresholds": svc.list_thresholds(db, entity_id)}


@router.put("/thresholds")
def upsert_threshold(
    entity_id: int = Query(...),
    issue_code: str = Query(...),
    threshold_type: str = Query(...),
    threshold_value: str = Query(...),
    db: Session = Depends(get_db),
):
    """Create or update a detection threshold for an entity."""
    valid_types = {"pct_change", "absolute", "ratio", "pp_change"}
    if threshold_type not in valid_types:
        raise HTTPException(status_code=422, detail=f"threshold_type must be one of {valid_types}")
    try:
        Decimal(threshold_value)
    except Exception:
        raise HTTPException(status_code=422, detail="threshold_value must be a valid decimal")

    return svc.upsert_threshold(db, entity_id, issue_code, threshold_type, threshold_value)


# ---------------------------------------------------------------------------
# Sprint 3.13 — Issue Template Repository endpoints
# ---------------------------------------------------------------------------

@router.get("/repository/categories")
def get_repository_categories(db: Session = Depends(get_db)):
    """List all repository categories with template counts."""
    tmpl_svc.seed_issue_templates(db)
    return tmpl_svc.list_categories(db)


@router.get("/repository/{code}")
def get_repository_template(code: str, db: Session = Depends(get_db)):
    """Fetch a single issue template by code (e.g. REV_001)."""
    tmpl_svc.seed_issue_templates(db)
    row = tmpl_svc.get_template(db, code.upper())
    if not row:
        raise HTTPException(status_code=404, detail=f"Template {code} not found")
    return row


@router.get("/repository")
def list_repository(
    category: str | None = Query(default=None),
    issue_type: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    List issue templates with optional filtering.
    Seeds the repository on first call if not yet populated.
    """
    tmpl_svc.seed_issue_templates(db)
    return tmpl_svc.list_templates(
        db,
        category=category,
        issue_type=issue_type,
        risk_level=risk_level,
        search=search,
    )
