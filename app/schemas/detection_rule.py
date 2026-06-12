"""
Structured Detection Rule schema — Sprint 3.14

Every IssueTemplate carries two detection logic representations:
  detection_logic      → human-readable text (existing field)
  detection_logic_json → machine-parseable DetectionRule (this schema)

A DetectionRule expresses one primary assertion about financial data.
Simple rules use flat fields (metric, operator, value, unit).
Compound rules carry a conditions list combined by AND/OR logic.

Rule types
----------
threshold   metric op value                      e.g. current_ratio < 1.0
pct_change  metric changed by N% vs prior        e.g. revenue pct_change > 15%
spread      pct_change(metric) - pct_change(comparison_metric) op value pp
ratio       metric / comparison_metric op value  e.g. capex / depreciation < 0.5
existence   qualitative condition present/absent (metric = condition name)
trend       metric moving in a direction N periods (declining/increasing)
compound    AND/OR of DetectionCondition list

Operators
---------
gt gte lt lte              — absolute comparison
pct_change_gt pct_change_lt — period-over-period % change vs prior period
spread_gt spread_lt        — pct_change(metric) − pct_change(comparison_metric)
ratio_gt ratio_lt          — metric / comparison_metric vs value
exists absent              — qualitative existence check (no value required)
declining increasing       — trend over N periods (value = N periods)

Units
-----
percent  ratio  days  amount  pp  count  flag  score  multiple
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, field_validator, model_validator

RULE_TYPES = frozenset({
    "threshold", "ratio", "pct_change", "spread",
    "existence", "trend", "compound",
})

OPERATORS = frozenset({
    "gt", "lt", "gte", "lte",
    "pct_change_gt", "pct_change_lt",
    "spread_gt", "spread_lt",
    "ratio_gt", "ratio_lt",
    "exists", "absent",
    "declining", "increasing",
})

UNITS = frozenset({
    "percent", "ratio", "days", "amount",
    "pp", "count", "flag", "score", "multiple",
})


class DetectionCondition(BaseModel):
    """One leaf assertion inside a compound rule."""
    metric: str
    operator: str
    value: float | None = None
    unit: str
    comparison_metric: str | None = None
    description: str | None = None

    @field_validator("operator")
    @classmethod
    def _op(cls, v: str) -> str:
        if v not in OPERATORS:
            raise ValueError(f"operator must be one of {sorted(OPERATORS)}, got {v!r}")
        return v

    @field_validator("unit")
    @classmethod
    def _unit(cls, v: str) -> str:
        if v not in UNITS:
            raise ValueError(f"unit must be one of {sorted(UNITS)}, got {v!r}")
        return v


class DetectionRule(BaseModel):
    """
    Structured detection rule attached to an IssueTemplate.

    Serialised as JSON and stored in issue_templates.detection_logic_json.
    Always version-stamped so the schema can evolve without breaking readers.
    """
    version: Literal["1.0"] = "1.0"
    rule_type: str

    # ── simple rule fields ────────────────────────────────────────────────
    metric: str | None = None
    operator: str | None = None
    value: float | None = None
    unit: str | None = None
    comparison_metric: str | None = None   # spread / ratio second operand

    # ── compound rule ─────────────────────────────────────────────────────
    conditions: list[DetectionCondition] = []
    logic: Literal["AND", "OR"] = "AND"

    # ── optional context ──────────────────────────────────────────────────
    notes: str | None = None

    @field_validator("rule_type")
    @classmethod
    def _rule_type(cls, v: str) -> str:
        if v not in RULE_TYPES:
            raise ValueError(f"rule_type must be one of {sorted(RULE_TYPES)}, got {v!r}")
        return v

    @field_validator("operator")
    @classmethod
    def _op(cls, v: str | None) -> str | None:
        if v is not None and v not in OPERATORS:
            raise ValueError(f"operator must be one of {sorted(OPERATORS)}, got {v!r}")
        return v

    @field_validator("unit")
    @classmethod
    def _unit(cls, v: str | None) -> str | None:
        if v is not None and v not in UNITS:
            raise ValueError(f"unit must be one of {sorted(UNITS)}, got {v!r}")
        return v

    @model_validator(mode="after")
    def _structure(self) -> "DetectionRule":
        if self.rule_type == "compound":
            if not self.conditions:
                raise ValueError("compound rules require at least one condition")
        else:
            if not self.metric:
                raise ValueError(f"rule_type '{self.rule_type}' requires metric")
            if not self.operator:
                raise ValueError(f"rule_type '{self.rule_type}' requires operator")
            if self.rule_type not in ("existence", "trend") and self.value is None:
                raise ValueError(f"rule_type '{self.rule_type}' requires value")
            if not self.unit:
                raise ValueError(f"rule_type '{self.rule_type}' requires unit")
        return self

    def to_dict(self) -> dict:
        return self.model_dump(exclude_none=True, exclude_defaults=False)
