"""
Rule Execution Engine — Sprint 3.13A

Evaluates DetectionRule JSON structures against a flat metrics dictionary.
The engine is stateless: callers provide a pre-computed metrics dict and
receive evaluation results without database access.

Metric key conventions (match app/data/metric_catalog.py)
----------------------------------------------------------
{metric}              current-period value    e.g. "current_ratio": 0.85
{metric}_pct_change   period-over-period %    e.g. "revenue_pct_change": 40.0
{metric}_trend        "declining"|"increasing"|"stable"
Qualitative flags     truthy = condition exists  e.g. "ghost_vendor_indicators": True

Rule type evaluation
--------------------
threshold   metrics[metric] OP value
pct_change  metrics[{metric}_pct_change] OP value
spread      metrics[{metric}_pct_change] − metrics[{comparison}_pct_change] OP value
ratio       metrics[metric] / metrics[comparison_metric] OP value
existence   bool(metrics.get(metric))
trend       metrics[{metric}_trend] == "declining"|"increasing"
compound    AND/OR of DetectionCondition list
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.data.issue_repository_data import ISSUE_REPOSITORY


# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------

@dataclass
class ConditionResult:
    triggered: bool
    magnitude: float | None = None
    explanation: str = ""


@dataclass
class RuleResult:
    code: str
    name: str
    category: str
    risk_level: str
    rule_type: str
    triggered: bool
    magnitude: float | None = None
    explanation: str = ""
    score: int = 0
    condition_results: list[ConditionResult] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Issue scoring
# ---------------------------------------------------------------------------

_SEVERITY_BASE = {"critical": 80, "high": 60, "moderate": 40, "low": 20}


def score_issue(
    risk_level: str,
    magnitude: float | None,
    rule_type: str,
    triggered: bool,
) -> int:
    """
    Compute 0–100 severity score for an issue.

    Base = risk_level tier (critical=80, high=60, moderate=40, low=20).
    Magnitude bonus: up to +20 for quantitative rule types where magnitude > 0.
    Existence / trend rules receive no bonus (binary, no excess to measure).
    """
    if not triggered:
        return 0
    base = _SEVERITY_BASE.get(risk_level, 40)
    if rule_type in ("threshold", "spread", "pct_change", "ratio", "compound") \
            and magnitude is not None and magnitude > 0:
        bonus = min(20, int(magnitude / 5))
        base = min(100, base + bonus)
    return base


# ---------------------------------------------------------------------------
# Numeric helpers
# ---------------------------------------------------------------------------

def _float(metrics: dict[str, Any], key: str) -> float | None:
    v = metrics.get(key)
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _cmp(actual: float, op: str, threshold: float) -> tuple[bool, float]:
    """Return (triggered, magnitude) for a simple comparison."""
    if op in ("gt", "pct_change_gt", "yoy_gt", "spread_gt", "ratio_gt"):
        return actual > threshold, max(0.0, actual - threshold)
    if op in ("gte",):
        return actual >= threshold, max(0.0, actual - threshold)
    if op in ("lt", "pct_change_lt", "yoy_lt", "spread_lt", "ratio_lt"):
        return actual < threshold, max(0.0, threshold - actual)
    if op in ("lte",):
        return actual <= threshold, max(0.0, threshold - actual)
    if op == "eq":
        triggered = abs(actual - threshold) < 1e-9
        return triggered, 0.0
    if op == "neq":
        triggered = abs(actual - threshold) >= 1e-9
        return triggered, abs(actual - threshold)
    return False, 0.0


# ---------------------------------------------------------------------------
# Condition evaluator
# ---------------------------------------------------------------------------

def evaluate_condition(cond: dict, metrics: dict[str, Any]) -> ConditionResult:
    """Evaluate one DetectionCondition dict against a metrics dict."""
    metric = cond["metric"]
    op = cond["operator"]
    value = cond.get("value")
    comparison = cond.get("comparison_metric")

    # ── existence / absent ───────────────────────────────────────────────────
    if op in ("exists", "absent"):
        present = bool(metrics.get(metric))
        triggered = present if op == "exists" else not present
        label = "present" if present else "absent"
        return ConditionResult(triggered=triggered, explanation=f"{metric} {label}")

    # ── trend ────────────────────────────────────────────────────────────────
    if op in ("declining", "increasing"):
        trend = str(metrics.get(f"{metric}_trend", "")).lower()
        triggered = trend == op
        return ConditionResult(triggered=triggered,
                               explanation=f"{metric}_trend={trend!r}, expected {op!r}")

    threshold = float(value) if value is not None else 0.0

    # ── between ──────────────────────────────────────────────────────────────
    if op == "between":
        value2 = cond.get("value2")
        if value2 is None:
            return ConditionResult(triggered=False, explanation=f"{metric}: between requires value2")
        actual_b = _float(metrics, metric)
        if actual_b is None:
            return ConditionResult(triggered=False, explanation=f"{metric} not provided")
        triggered = threshold <= actual_b <= value2
        mag = actual_b - threshold if triggered else None
        return ConditionResult(triggered=triggered, magnitude=mag,
                               explanation=f"{metric}={actual_b} BETWEEN {threshold} AND {value2}")

    # ── pct_change ───────────────────────────────────────────────────────────
    if op in ("pct_change_gt", "pct_change_lt", "yoy_gt", "yoy_lt"):
        key = f"{metric}_pct_change"
        actual = _float(metrics, key)
        if actual is None:
            return ConditionResult(triggered=False, explanation=f"{key} not provided")
        triggered, mag = _cmp(actual, op, threshold)
        return ConditionResult(triggered=triggered, magnitude=mag,
                               explanation=f"{key}={actual:.2f}% vs {threshold}%")

    # ── spread ───────────────────────────────────────────────────────────────
    if op in ("spread_gt", "spread_lt"):
        k1 = f"{metric}_pct_change"
        k2 = f"{comparison}_pct_change" if comparison else None
        v1 = _float(metrics, k1)
        v2 = _float(metrics, k2) if k2 else None
        if v1 is None or v2 is None:
            missing = k1 if v1 is None else k2
            return ConditionResult(triggered=False, explanation=f"{missing} not provided")
        spread = v1 - v2
        triggered, mag = _cmp(spread, op, threshold)
        return ConditionResult(triggered=triggered, magnitude=mag,
                               explanation=f"{k1}({v1:.1f}%) − {k2}({v2:.1f}%) = {spread:.1f}pp vs {threshold}pp")

    # ── ratio ────────────────────────────────────────────────────────────────
    if op in ("ratio_gt", "ratio_lt"):
        v1 = _float(metrics, metric)
        v2 = _float(metrics, comparison) if comparison else None
        if v1 is None or not v2:
            return ConditionResult(triggered=False,
                                   explanation=f"{metric}/{comparison} not available")
        actual = v1 / v2
        triggered, mag = _cmp(actual, op, threshold)
        return ConditionResult(triggered=triggered, magnitude=mag,
                               explanation=f"{metric}/{comparison}={actual:.3f} vs {threshold}")

    # ── simple threshold ─────────────────────────────────────────────────────
    actual = _float(metrics, metric)
    if actual is None:
        return ConditionResult(triggered=False, explanation=f"{metric} not provided")
    triggered, mag = _cmp(actual, op, threshold)
    return ConditionResult(triggered=triggered, magnitude=mag,
                           explanation=f"{metric}={actual} {op} {threshold}")


# ---------------------------------------------------------------------------
# Rule evaluator
# ---------------------------------------------------------------------------

def evaluate_rule(rule: dict, metrics: dict[str, Any]) -> tuple[bool, float | None, str, list[ConditionResult]]:
    """
    Evaluate a DetectionRule dict against a metrics dict.

    Returns (triggered, magnitude, explanation, condition_results).
    """
    rule_type = rule.get("rule_type")

    if rule_type == "compound":
        logic = rule.get("logic", "AND")
        crs = [evaluate_condition(c, metrics) for c in rule.get("conditions", [])]
        triggered = all(r.triggered for r in crs) if logic == "AND" else any(r.triggered for r in crs)
        mags = [r.magnitude for r in crs if r.triggered and r.magnitude is not None]
        magnitude = max(mags) if mags else None
        explanation = f" {logic} ".join(r.explanation for r in crs)
        return triggered, magnitude, explanation, crs

    cond = {
        "metric": rule.get("metric"),
        "operator": rule.get("operator"),
        "value": rule.get("value"),
        "unit": rule.get("unit"),
        "comparison_metric": rule.get("comparison_metric"),
    }
    cr = evaluate_condition(cond, metrics)
    return cr.triggered, cr.magnitude, cr.explanation, [cr]


# ---------------------------------------------------------------------------
# Batch evaluator
# ---------------------------------------------------------------------------

def evaluate_all_rules(
    metrics: dict[str, Any],
    templates: list[dict] | None = None,
) -> list[RuleResult]:
    """
    Evaluate all repository issue templates against a metrics dict.

    templates defaults to the full ISSUE_REPOSITORY (200 templates).
    Returns all results — callers filter for triggered=True if desired.
    """
    if templates is None:
        templates = ISSUE_REPOSITORY

    results: list[RuleResult] = []
    for tmpl in templates:
        rule = tmpl.get("detection_logic_json")
        if rule is None:
            continue
        if rule.get("enabled") is False:
            continue

        triggered, magnitude, explanation, crs = evaluate_rule(rule, metrics)
        risk_level = tmpl.get("risk_level", "moderate")
        rule_type = rule.get("rule_type", "threshold")
        sc = score_issue(risk_level, magnitude, rule_type, triggered)

        results.append(RuleResult(
            code=tmpl["code"],
            name=tmpl["name"],
            category=tmpl["category"],
            risk_level=risk_level,
            rule_type=rule_type,
            triggered=triggered,
            magnitude=round(magnitude, 3) if magnitude is not None else None,
            explanation=explanation,
            score=sc,
            condition_results=crs,
        ))

    return results


# ---------------------------------------------------------------------------
# Metrics dict validation
# ---------------------------------------------------------------------------

def validate_metrics(metrics: dict[str, Any]) -> dict:
    """
    Check a caller-provided metrics dict against the catalog.

    Returns a summary with unknown keys and a coverage count.
    Unknown keys are keys that are not in the catalog, not derived
    _pct_change / _prior / _trend variants, and not qualitative flags.
    """
    from app.data.metric_catalog import ALL_KNOWN_METRICS

    unknown: list[str] = []
    for k in metrics:
        if k in ALL_KNOWN_METRICS:
            continue
        # allow derived variants
        base = (k.removesuffix("_pct_change")
                 .removesuffix("_prior")
                 .removesuffix("_trend"))
        if base in ALL_KNOWN_METRICS or base != k:
            continue
        unknown.append(k)

    return {
        "provided": len(metrics),
        "unknown_keys": sorted(unknown),
        "warning": f"{len(unknown)} unrecognized metric key(s)" if unknown else None,
    }


# ---------------------------------------------------------------------------
# Convenience: summarize triggered results
# ---------------------------------------------------------------------------

def summarize_triggered(results: list[RuleResult]) -> dict:
    """Return aggregate statistics for a batch evaluation."""
    triggered = [r for r in results if r.triggered]
    by_category: dict[str, int] = {}
    by_risk: dict[str, int] = {}
    for r in triggered:
        by_category[r.category] = by_category.get(r.category, 0) + 1
        by_risk[r.risk_level] = by_risk.get(r.risk_level, 0) + 1

    return {
        "total_evaluated": len(results),
        "total_triggered": len(triggered),
        "by_category": by_category,
        "by_risk_level": by_risk,
        "top_scores": sorted(
            [{"code": r.code, "name": r.name, "score": r.score, "risk_level": r.risk_level}
             for r in triggered],
            key=lambda x: x["score"],
            reverse=True,
        )[:10],
    }
