"""Accounting Intelligence Engine API — Sprint 3.12 / 3.13 / 3.13A"""

from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import accounting_intelligence_service as svc
from app.services import issue_template_service as tmpl_svc
from app.services import rule_engine

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


@router.get("/repository/validate-rules")
def validate_repository_rules():
    """
    Validate all structured detection rules against the DetectionRule schema.
    Returns validation summary: valid count, errors per code, coverage %.
    """
    return tmpl_svc.validate_repository_rules()


@router.get("/repository")
def list_repository(
    category: str | None = Query(default=None),
    issue_type: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    rule_type: str | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    List issue templates with optional filtering.
    Seeds the repository on first call if not yet populated.
    rule_type filters by detection_logic_json.rule_type (threshold, ratio, etc.).
    """
    tmpl_svc.seed_issue_templates(db)
    return tmpl_svc.list_templates(
        db,
        category=category,
        issue_type=issue_type,
        risk_level=risk_level,
        rule_type=rule_type,
        search=search,
    )


# ---------------------------------------------------------------------------
# Sprint 3.13A — Rule Execution Engine endpoints
# ---------------------------------------------------------------------------

@router.post("/evaluate-rules")
def evaluate_rules(
    body: dict[str, Any] = Body(...),
):
    """
    Rule testing harness: evaluate all 200 repository rules against a
    caller-provided flat metrics dictionary.

    Input:  { "metrics": { "current_ratio": 0.8, "revenue_pct_change": 40.0, ... } }
    Output: triggered issues with scores, full evaluation summary.

    Metric key conventions:
      {metric}             current-period value
      {metric}_pct_change  period-over-period % change
      qualitative flags    boolean True/False
    """
    metrics: dict[str, Any] = body.get("metrics", {})
    validation = rule_engine.validate_metrics(metrics)
    results = rule_engine.evaluate_all_rules(metrics)
    summary = rule_engine.summarize_triggered(results)

    triggered = [
        {
            "code": r.code,
            "name": r.name,
            "category": r.category,
            "risk_level": r.risk_level,
            "rule_type": r.rule_type,
            "triggered": r.triggered,
            "magnitude": r.magnitude,
            "explanation": r.explanation,
            "score": r.score,
        }
        for r in results if r.triggered
    ]

    return {
        "total_evaluated": summary["total_evaluated"],
        "total_triggered": summary["total_triggered"],
        "triggered_issues": triggered,
        "summary": summary,
        "metrics_validation": validation,
    }


@router.get("/metric-catalog")
def get_metric_catalog():
    """Return the full metric catalog and qualitative flag registry."""
    from app.data.metric_catalog import METRIC_CATALOG, QUALITATIVE_FLAGS
    return {
        "quantitative_metrics": {
            k: v for k, v in sorted(METRIC_CATALOG.items())
        },
        "qualitative_flags": sorted(QUALITATIVE_FLAGS),
        "total_quantitative": len(METRIC_CATALOG),
        "total_qualitative": len(QUALITATIVE_FLAGS),
    }


# ---------------------------------------------------------------------------
# Sprint 3.13A — Repository administration endpoints
# ---------------------------------------------------------------------------

@router.post("/repository")
def create_repository_template(
    body: dict[str, Any] = Body(...),
    organization_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Create a new custom issue template.
    Required body fields: code, category, name, description.
    System templates (is_system=True) are read-only; new templates are org-scoped.
    """
    tmpl_svc.seed_issue_templates(db)
    required = {"code", "category", "name", "description"}
    missing = required - body.keys()
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing required fields: {missing}")
    try:
        return tmpl_svc.create_template(db, body, organization_id=organization_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.put("/repository/{code}")
def update_repository_template(
    code: str,
    body: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Update editable fields of an existing template by code."""
    tmpl_svc.seed_issue_templates(db)
    try:
        return tmpl_svc.update_template(db, code, body)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/repository/{code}/clone")
def clone_repository_template(
    code: str,
    new_code: str = Query(..., description="Code for the cloned template"),
    organization_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Clone an existing template under a new code."""
    tmpl_svc.seed_issue_templates(db)
    try:
        return tmpl_svc.clone_template(db, code, new_code, organization_id=organization_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.patch("/repository/{code}/archive")
def archive_repository_template(code: str, db: Session = Depends(get_db)):
    """Archive (deactivate) a template by code."""
    tmpl_svc.seed_issue_templates(db)
    try:
        return tmpl_svc.archive_template(db, code)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/repository/export")
def export_repository(
    category: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Export templates as portable JSON suitable for re-import."""
    tmpl_svc.seed_issue_templates(db)
    templates = tmpl_svc.export_templates(db, category=category)
    return {"total": len(templates), "templates": templates}


@router.post("/repository/import")
def import_repository(
    body: dict[str, Any] = Body(...),
    organization_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Bulk-import template dicts.

    Input: { "templates": [ { "code": "CUSTOM_001", ... }, ... ] }
    Existing codes are skipped. Returns added/skipped/error counts.
    """
    tmpl_svc.seed_issue_templates(db)
    templates = body.get("templates", [])
    if not isinstance(templates, list):
        raise HTTPException(status_code=422, detail="body.templates must be a list")
    return tmpl_svc.import_templates(db, templates, organization_id=organization_id)
