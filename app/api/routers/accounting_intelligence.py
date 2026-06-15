"""Accounting Intelligence Engine API — Sprint 3.12 / 3.13 / 3.13A / 3.14"""

from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import accounting_intelligence_service as svc
from app.services import issue_template_service as tmpl_svc
from app.services import rule_engine
from app.services import quarterly_review_service as qr_svc

router = APIRouter(prefix="/accounting-intelligence", tags=["accounting-intelligence"])


@router.post("/run-detection")
def run_detection(
    entity_id: int = Query(...),
    current_period_id: int = Query(...),
    comparison_period_id: int | None = Query(default=None),
    scenario_id: int | None = Query(default=None),
    materiality_threshold: float = Query(default=1000.0),
    db: Session = Depends(get_db),
):
    """
    Run all detection rules against current period (and optionally a comparison period).
    When comparison_period_id is omitted, runs single-period and repository rules only.
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


# ---------------------------------------------------------------------------
# Sprint 3.14 — Quarterly Review Generator endpoints
# ---------------------------------------------------------------------------

@router.post("/quarterly-review")
def generate_quarterly_review(
    entity_id: int = Query(...),
    current_period_id: int = Query(...),
    comparison_period_id: int = Query(...),
    scenario_id: int | None = Query(default=None),
    materiality_threshold: float = Query(default=1000.0),
    db: Session = Depends(get_db),
):
    """
    Generate a complete 8-section quarterly review report.

    Runs the detection engine, computes diagnostics for both periods,
    enriches issues with repository template content, and assembles
    the full structured report. No AI generation — deterministic templates.
    """
    try:
        report = qr_svc.generate_review(
            db,
            entity_id=entity_id,
            current_period_id=current_period_id,
            comparison_period_id=comparison_period_id,
            scenario_id=scenario_id,
            materiality_threshold=Decimal(str(materiality_threshold)),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return report


@router.get("/quarterly-review/export")
def export_quarterly_review(
    format: str = Query(..., description="markdown|excel"),
    entity_id: int = Query(...),
    current_period_id: int = Query(...),
    comparison_period_id: int = Query(...),
    scenario_id: int | None = Query(default=None),
    materiality_threshold: float = Query(default=1000.0),
    db: Session = Depends(get_db),
):
    """Download a quarterly review as Markdown or Excel."""
    valid_formats = {"markdown", "excel"}
    if format not in valid_formats:
        raise HTTPException(status_code=422, detail=f"format must be one of {valid_formats}")
    try:
        report = qr_svc.generate_review(
            db,
            entity_id=entity_id,
            current_period_id=current_period_id,
            comparison_period_id=comparison_period_id,
            scenario_id=scenario_id,
            materiality_threshold=Decimal(str(materiality_threshold)),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    entity_slug = report["metadata"]["entity_name"].replace(" ", "_").lower()
    period_slug = report["metadata"]["current_period"]["name"].replace(" ", "_").lower()

    if format == "markdown":
        md = qr_svc.export_markdown(report)
        return Response(
            content=md.encode("utf-8"),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="qr_{entity_slug}_{period_slug}.md"'},
        )

    xlsx_bytes = qr_svc.export_excel(report)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="qr_{entity_slug}_{period_slug}.xlsx"'},
    )


# ---------------------------------------------------------------------------
# Materiality
# ---------------------------------------------------------------------------

@router.get("/materiality")
def get_materiality_profile(
    entity_id: int,
    period_id: int,
    db: Session = Depends(get_db),
):
    """Compute materiality profile for an entity/period pair."""
    from app.services.materiality_engine import MaterialityEngine
    from app.services.accounting_intelligence_service import _compute_metrics
    from app.models.accounting_period import AccountingPeriod

    period = db.query(AccountingPeriod).filter(AccountingPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")

    try:
        metrics = _compute_metrics(db, entity_id, period, scenario_id=None)
    except Exception:
        metrics = None

    rev = float(metrics.revenue) if metrics else 0.0
    assets = float(metrics.total_assets) if metrics else 0.0
    eq = float(metrics.total_equity) if metrics else 0.0
    ni = float(metrics.net_income) if metrics else None
    ebitda = max(rev * 0.10, ni or 0.0)

    profile = MaterialityEngine.compute(
        revenue=rev,
        total_assets=assets,
        equity=eq,
        ebitda=ebitda,
        net_income=ni,
    )

    return {
        "entity_id": entity_id,
        "period_id": period_id,
        "overall": round(profile.overall, 2),
        "performance": round(profile.performance, 2),
        "trivial": round(profile.trivial, 2),
        "basis_used": profile.basis_used,
        "rationale": profile.rationale,
        "revenue_basis": round(profile.revenue_basis, 2),
        "asset_basis": round(profile.asset_basis, 2),
        "equity_basis": round(profile.equity_basis, 2),
        "ebitda_basis": round(profile.ebitda_basis, 2),
        "ni_basis": round(profile.ni_basis, 2) if profile.ni_basis else None,
        "thresholds": {
            "critical": round(profile.critical_threshold, 2),
            "high": round(profile.high_threshold, 2),
            "moderate": round(profile.moderate_threshold, 2),
            "low": round(profile.low_threshold, 2),
        },
    }


# ---------------------------------------------------------------------------
# Trends
# ---------------------------------------------------------------------------

@router.get("/trends")
def get_trends(
    entity_id: int,
    period_ids: str,  # comma-separated list of period IDs, chronological
    db: Session = Depends(get_db),
):
    """Multi-period trend analysis for an entity."""
    from app.services.trend_engine import TrendEngine
    from app.services.accounting_intelligence_service import _compute_metrics
    from app.models.accounting_period import AccountingPeriod

    try:
        ids = [int(x.strip()) for x in period_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=422, detail="period_ids must be comma-separated integers")

    if len(ids) < 2:
        raise HTTPException(status_code=422, detail="Provide at least 2 period IDs for trend analysis")

    periods = db.query(AccountingPeriod).filter(AccountingPeriod.id.in_(ids)).all()
    period_map = {p.id: p for p in periods}

    ordered_periods = [period_map[pid] for pid in ids if pid in period_map]
    if len(ordered_periods) < 2:
        raise HTTPException(status_code=404, detail="One or more period IDs not found")

    metrics_list = []
    period_names = []
    valid_ids = []
    for period in ordered_periods:
        try:
            m = _compute_metrics(db, entity_id, period, scenario_id=None)
            metrics_list.append(m)
            period_names.append(period.period_name)
            valid_ids.append(period.id)
        except Exception:
            pass

    report = TrendEngine.compute(
        period_metrics_list=metrics_list,
        period_ids=valid_ids,
        period_names=period_names,
        entity_id=entity_id,
    )

    return {
        "entity_id": report.entity_id,
        "periods_analyzed": report.periods_analyzed,
        "period_names": report.period_names,
        "has_sufficient_data": report.has_sufficient_data,
        "key_concerns": report.key_concerns,
        "trends": [
            {
                "metric": t.metric,
                "label": t.label,
                "unit": t.unit,
                "direction": t.direction,
                "pct_change_yoy": round(t.pct_change_yoy, 1) if t.pct_change_yoy is not None else None,
                "pct_change_recent": round(t.pct_change_recent, 1) if t.pct_change_recent is not None else None,
                "is_concerning": t.is_concerning,
                "concern_reason": t.concern_reason,
                "points": [
                    {"period_id": p.period_id, "period_name": p.period_name, "value": p.value}
                    for p in t.points
                ],
            }
            for t in report.trends
        ],
    }


# ---------------------------------------------------------------------------
# Adjustment Analysis
# ---------------------------------------------------------------------------

@router.get("/adjustment-analysis")
def get_adjustment_analysis(
    entity_id: int,
    as_of_date: str,
    materiality: float = 0.0,
    db: Session = Depends(get_db),
):
    """Analyze AJE patterns and concentrations for an entity/period."""
    from app.services.adjustment_analysis_service import AdjustmentAnalysisService

    report = AdjustmentAnalysisService.analyze(
        db=db,
        entity_id=entity_id,
        as_of_date=as_of_date,
        materiality=materiality,
    )

    return {
        "entity_id": report.entity_id,
        "as_of_date": report.as_of_date,
        "summary": {
            "total_draft": report.total_draft,
            "total_posted": report.total_posted,
            "total_amount_draft": round(report.total_amount_draft, 2),
            "total_amount_posted": round(report.total_amount_posted, 2),
        },
        "patterns": [
            {
                "code": p.code,
                "title": p.title,
                "severity": p.severity,
                "description": p.description,
                "count": p.count,
                "total_amount": round(p.total_amount, 2),
                "affected_je_ids": p.affected_je_ids,
            }
            for p in report.patterns
        ],
        "large_revenue_ajes": [
            {
                "je_id": s.je_id,
                "je_number": s.je_number,
                "description": s.description,
                "entry_date": s.entry_date,
                "status": s.status,
                "amount": round(s.amount, 2),
            }
            for s in report.large_revenue_ajes
        ],
        "large_ajes": [
            {
                "je_id": s.je_id,
                "je_number": s.je_number,
                "description": s.description,
                "entry_date": s.entry_date,
                "status": s.status,
                "amount": round(s.amount, 2),
            }
            for s in report.large_ajes
        ],
        "concentration_warning": report.concentration_warning,
        "materiality_notes": report.materiality_notes,
    }


# ---------------------------------------------------------------------------
# Review Package (combined intelligence snapshot)
# ---------------------------------------------------------------------------

@router.get("/review-package")
def get_review_package(
    entity_id: int,
    current_period_id: int,
    comparison_period_id: int | None = None,
    materiality_threshold: float | None = None,
    db: Session = Depends(get_db),
):
    """
    Full intelligence review package: findings + materiality + adjustment analysis.
    Combines run_detection results with materiality and AJE analysis in one call.
    """
    from app.services.accounting_intelligence_service import _compute_metrics
    from app.services.materiality_engine import MaterialityEngine
    from app.services.adjustment_analysis_service import AdjustmentAnalysisService
    from app.models.accounting_period import AccountingPeriod

    period = db.query(AccountingPeriod).filter(AccountingPeriod.id == current_period_id).first()
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")

    # Run detection only when a comparison period is available
    findings: list = []
    if comparison_period_id is not None:
        try:
            findings = svc.run_detection(
                db,
                entity_id=entity_id,
                current_period_id=current_period_id,
                comparison_period_id=comparison_period_id,
                materiality_threshold=Decimal(str(materiality_threshold or 1000.0)),
                persist=True,
            )
        except Exception:
            findings = []

    # Compute materiality
    try:
        metrics = _compute_metrics(db, entity_id, period, scenario_id=None)
        ebitda_approx = max(float(metrics.revenue) * 0.10, float(metrics.net_income))
        mat_profile = MaterialityEngine.compute(
            revenue=float(metrics.revenue),
            total_assets=float(metrics.total_assets),
            equity=float(metrics.total_equity),
            ebitda=ebitda_approx,
            net_income=float(metrics.net_income),
        )
    except Exception:
        mat_profile = MaterialityEngine.compute()

    # Adjustment analysis
    try:
        adj_report = AdjustmentAnalysisService.analyze(
            db=db,
            entity_id=entity_id,
            as_of_date=str(period.end_date),
            materiality=mat_profile.overall,
        )
        adj_summary = {
            "total_draft": adj_report.total_draft,
            "total_posted": adj_report.total_posted,
            "patterns": [
                {"code": p.code, "title": p.title, "severity": p.severity, "description": p.description}
                for p in adj_report.patterns
            ],
            "concentration_warning": adj_report.concentration_warning,
        }
    except Exception:
        adj_summary = {}

    sev_counts = {"critical": 0, "high": 0, "moderate": 0, "low": 0, "informational": 0}
    for f in findings:
        sev = f.get("severity", "informational") if isinstance(f, dict) else getattr(f, "severity", "informational")
        sev_counts[sev] = sev_counts.get(sev, 0) + 1

    return {
        "entity_id": entity_id,
        "period_id": current_period_id,
        "period_name": period.period_name,
        "generated_at": __import__("datetime").datetime.utcnow().isoformat(),
        "severity_summary": sev_counts,
        "materiality": {
            "overall": round(mat_profile.overall, 2),
            "performance": round(mat_profile.performance, 2),
            "basis_used": mat_profile.basis_used,
        },
        "adjustment_summary": adj_summary,
        "finding_count": len(findings),
    }
