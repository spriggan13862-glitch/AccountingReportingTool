"""
Import Intelligence Engine (Sprint P4).

Wraps the legacy boolean readiness flags from import_source_logic into a
weighted Readiness Score (0-100) and explicit capability rollup, so the
UI can show users exactly what reporting paths their import set unlocks
and what they need to import next.

The legacy get_readiness_status() function is preserved and called as the
underlying data source; this service is purely additive.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
from sqlalchemy.orm import Session

from app.services.import_source_logic import (
    get_readiness_status,
    IMPORT_SOURCE_CAPABILITIES,
)


# ---------------------------------------------------------------------------
# Capability definitions
# ---------------------------------------------------------------------------

# Each capability has a weight (contribution to the 0-100 score), required
# data flags (booleans from get_readiness_status), and a label for the UI.

@dataclass(frozen=True)
class Capability:
    key: str
    label: str
    weight: int                 # Points contributed when ready (sum across all caps = 100)
    requires: tuple[str, ...]   # Keys from get_readiness_status() that must be True
    threshold: dict[str, float] = field(default_factory=dict)  # Optional minimums (e.g. taxonomy_mapped_pct >= 80)
    missing_explanation: str = ""


CAPABILITIES: tuple[Capability, ...] = (
    Capability(
        key="mapping",
        label="Account mapping",
        weight=10,
        requires=("coa_available",),
        missing_explanation="Upload a Chart of Accounts to enable taxonomy mapping.",
    ),
    Capability(
        key="financial_statements",
        label="Financial statement generation",
        weight=25,
        requires=("coa_available", "tb_has_balances"),
        threshold={"taxonomy_mapped_pct": 80.0},
        missing_explanation="Need posted Trial Balance plus 80%+ taxonomy coverage to render statements.",
    ),
    Capability(
        key="comparative_reports",
        label="Comparative reporting (period over period)",
        weight=10,
        requires=("coa_available", "tb_has_balances"),
        missing_explanation="Comparatives require at least one posted Trial Balance.",
    ),
    Capability(
        key="drilldown",
        label="Transaction-level drilldown",
        weight=15,
        requires=("gl_available",),
        missing_explanation="Drilldown requires an imported General Ledger.",
    ),
    Capability(
        key="rollforwards",
        label="Account rollforwards",
        weight=10,
        requires=("gl_available",),
        missing_explanation="Rollforwards derive from GL transaction activity.",
    ),
    Capability(
        key="reconciliations",
        label="Account reconciliations",
        weight=10,
        requires=("gl_available", "tb_has_balances"),
        missing_explanation="Reconciliation requires both GL transactions and TB balances.",
    ),
    Capability(
        key="consolidation",
        label="Multi-entity consolidation",
        weight=5,
        requires=("coa_available", "tb_has_balances"),
        missing_explanation="Consolidation requires at least COA + TB for each entity to combine.",
    ),
    Capability(
        key="draft_impact",
        label="Adjustment / draft impact view",
        weight=10,
        requires=("coa_available", "tb_has_balances"),
        missing_explanation="Draft impact requires a posted TB baseline to overlay adjustments against.",
    ),
    Capability(
        key="bridge",
        label="Adjustment bridge (as-reported → adjusted)",
        weight=5,
        requires=("coa_available", "tb_has_balances"),
        missing_explanation="The bridge view requires posted TB to compare against adjustments.",
    ),
)


# ---------------------------------------------------------------------------
# Status / Score model
# ---------------------------------------------------------------------------

@dataclass
class CapabilityStatus:
    key: str
    label: str
    weight: int
    ready: bool
    partial: bool
    missing: list[str] = field(default_factory=list)


@dataclass
class ReadinessScore:
    score: int                                      # 0-100, weighted
    grade: str                                      # 'empty' / 'limited' / 'workable' / 'strong' / 'complete'
    capabilities: list[CapabilityStatus]
    imports_available: dict[str, bool]              # which import types have data
    missing_data: list[str]                         # canonical list of missing inputs
    recommended_next_import: Optional[str]          # which import type to do next
    can_generate_financial_statements: bool
    can_drilldown: bool
    can_rollforward: bool
    can_reconcile: bool
    can_consolidate: bool
    can_draft_impact: bool

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "grade": self.grade,
            "capabilities": [
                {
                    "key": c.key, "label": c.label, "weight": c.weight,
                    "ready": c.ready, "partial": c.partial, "missing": c.missing,
                } for c in self.capabilities
            ],
            "imports_available": self.imports_available,
            "missing_data": self.missing_data,
            "recommended_next_import": self.recommended_next_import,
            "can_generate_financial_statements": self.can_generate_financial_statements,
            "can_drilldown": self.can_drilldown,
            "can_rollforward": self.can_rollforward,
            "can_reconcile": self.can_reconcile,
            "can_consolidate": self.can_consolidate,
            "can_draft_impact": self.can_draft_impact,
        }


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

def _grade(score: int) -> str:
    if score == 0:
        return "empty"
    if score < 35:
        return "limited"
    if score < 65:
        return "workable"
    if score < 90:
        return "strong"
    return "complete"


def _check_capability(cap: Capability, status: dict) -> CapabilityStatus:
    missing: list[str] = []
    ready = True
    partial = False
    for req in cap.requires:
        if not status.get(req, False):
            ready = False
            missing.append(f"missing: {req}")
    for key, minimum in cap.threshold.items():
        actual = float(status.get(key, 0))
        if actual < minimum:
            ready = False
            partial = True
            missing.append(f"{key} = {actual:.0f}%, need {minimum:.0f}%")
    if not ready and cap.missing_explanation:
        missing.append(cap.missing_explanation)
    return CapabilityStatus(
        key=cap.key, label=cap.label, weight=cap.weight,
        ready=ready, partial=partial, missing=missing,
    )


def _recommend_next(status: dict) -> Optional[str]:
    """Largest-impact next import for the user."""
    if not status.get("coa_available"):
        return "coa"
    if not status.get("tb_has_balances"):
        return "tb"
    if not status.get("gl_available"):
        return "gl"
    if status.get("taxonomy_mapped_pct", 0) < 80:
        return "taxonomy_mapping"
    return None


def compute_readiness_score(entity_id: int, period_id: int | None, db: Session) -> ReadinessScore:
    """
    Build the full readiness assessment for an entity (+ optional period).

    The score is a weighted sum across CAPABILITIES — a capability contributes
    its full `weight` only when ready; partial-ready capabilities contribute
    nothing to the score (but show up as partial in the breakdown).
    """
    status = get_readiness_status(entity_id, period_id, db)

    cap_statuses = [_check_capability(c, status) for c in CAPABILITIES]
    score = sum(c.weight for c in cap_statuses if c.ready)

    imports_available = {
        "coa": bool(status.get("coa_available")),
        "tb": bool(status.get("tb_has_balances")),
        "gl": bool(status.get("gl_available")),
        "fs": bool(status.get("fs_available")),
    }
    missing_data: list[str] = []
    if not imports_available["coa"]:
        missing_data.append("chart_of_accounts")
    if not imports_available["tb"]:
        missing_data.append("trial_balance")
    if not imports_available["gl"]:
        missing_data.append("general_ledger")
    if status.get("taxonomy_mapped_pct", 0) < 80:
        missing_data.append(f"taxonomy_mapping_to_80pct (currently {status.get('taxonomy_mapped_pct', 0):.0f}%)")

    by_key = {c.key: c for c in cap_statuses}
    return ReadinessScore(
        score=score,
        grade=_grade(score),
        capabilities=cap_statuses,
        imports_available=imports_available,
        missing_data=missing_data,
        recommended_next_import=_recommend_next(status),
        can_generate_financial_statements=by_key["financial_statements"].ready,
        can_drilldown=by_key["drilldown"].ready,
        can_rollforward=by_key["rollforwards"].ready,
        can_reconcile=by_key["reconciliations"].ready,
        can_consolidate=by_key["consolidation"].ready,
        can_draft_impact=by_key["draft_impact"].ready,
    )


# ---------------------------------------------------------------------------
# Import-type metadata (extends IMPORT_SOURCE_CAPABILITIES with intelligence info)
# ---------------------------------------------------------------------------

IMPORT_TYPE_INTELLIGENCE: dict[str, dict] = {
    "coa": {
        "label": "Chart of Accounts",
        "unlocks": ["mapping"],
        "highest_intelligence_level": False,
    },
    "tb": {
        "label": "Trial Balance",
        "unlocks": ["financial_statements", "comparative_reports", "consolidation", "draft_impact", "bridge"],
        "highest_intelligence_level": False,
    },
    "gl": {
        "label": "General Ledger",
        "unlocks": ["drilldown", "rollforwards", "reconciliations"],
        "highest_intelligence_level": True,
    },
    "je": {
        "label": "Journal Entries",
        "unlocks": ["draft_impact", "bridge"],
        "highest_intelligence_level": False,
    },
    "fs": {
        "label": "Financial Statement Import (PDF/Excel)",
        "unlocks": ["comparative_reports"],
        "highest_intelligence_level": False,
        "limitation": "Statement-line only; no account-level support.",
    },
    "bank": {
        "label": "Bank Transactions",
        "unlocks": [],
        "highest_intelligence_level": False,
        "limitation": "Categorization + preliminary balances only; review required before statement generation.",
    },
    "subledger": {
        "label": "Subledger (AR/AP/etc.)",
        "unlocks": ["drilldown", "reconciliations"],
        "highest_intelligence_level": False,
    },
}
