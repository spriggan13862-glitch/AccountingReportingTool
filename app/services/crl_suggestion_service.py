"""
CRL Suggestion Service — wizard step 4 backbone.

Pipeline:
  raw account # + name + type
    -> taxonomy_mapping_rules.suggest_mapping_from_strings()   (existing engine)
       returns a TaxonomyNode candidate
    -> reverse-lookup CRL via common_reporting_line_taxonomy_nodes
    -> if template_id provided, filter to CRLs visible under that template

Returns one CrlSuggestion per ImportLine (or None for no-match).
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Sequence
from sqlalchemy.orm import Session

from app.models.import_line import ImportLine
from app.models.import_batch import ImportBatch
from app.models.common_reporting_line import (
    CommonReportingLine,
    CommonReportingLineTaxonomyNode,
    ReportingTemplate,
    ReportingTemplateCrl,
)
from app.models.taxonomy import Taxonomy
from app.services.taxonomy_mapping_rules import suggest_mapping_from_strings
from app.services.import_batch_service import guess_account_type_and_normal


@dataclass
class CrlSuggestion:
    line_id: int
    crl_id: int | None
    crl_code: str | None
    crl_name: str | None
    crl_section: str | None
    confidence: float | None
    reason: str | None
    # Diagnostic — what taxonomy node the engine matched, if any.
    via_taxonomy_node_code: str | None = None


def suggest_crls_for_batch(
    db: Session,
    batch: ImportBatch,
    *,
    taxonomy_id: int,
    template_id: int | None = None,
    organization_id: int | None = None,
) -> list[CrlSuggestion]:
    """
    Run the rule engine against every ImportLine in the batch and
    reverse-lookup the resulting taxonomy node to a CRL.

    Optionally filter to CRLs visible under template_id. If a suggestion
    targets a CRL not in the template, returns None for that line — the
    user picks manually via the wizard's dropdown.
    """
    taxonomy = db.query(Taxonomy).filter_by(id=taxonomy_id).first()
    if taxonomy is None:
        return []

    template_crl_ids: set[int] | None = None
    if template_id is not None:
        rows = (
            db.query(ReportingTemplateCrl)
            .filter_by(template_id=template_id, is_visible=True)
            .all()
        )
        template_crl_ids = {r.crl_id for r in rows}

    lines = db.query(ImportLine).filter_by(batch_id=batch.id).all()
    out: list[CrlSuggestion] = []
    for line in lines:
        suggestion = _suggest_crl_for_line(
            db, line, taxonomy,
            template_crl_ids=template_crl_ids,
            organization_id=organization_id,
        )
        out.append(suggestion)
    return out


def _suggest_crl_for_line(
    db: Session,
    line: ImportLine,
    taxonomy: Taxonomy,
    *,
    template_crl_ids: set[int] | None,
    organization_id: int | None,
) -> CrlSuggestion:
    acct_type, _ = guess_account_type_and_normal(line.raw_account_number, line.raw_account_name)
    rule_match = suggest_mapping_from_strings(
        line.raw_account_number, line.raw_account_name, acct_type, taxonomy, db,
    )
    if rule_match is None:
        return CrlSuggestion(
            line_id=line.id, crl_id=None, crl_code=None, crl_name=None,
            crl_section=None, confidence=None, reason=None,
            via_taxonomy_node_code=None,
        )

    # Reverse-lookup CRL by node_code via the one-to-many junction.
    junction_rows = (
        db.query(CommonReportingLineTaxonomyNode, CommonReportingLine)
        .join(
            CommonReportingLine,
            CommonReportingLine.id == CommonReportingLineTaxonomyNode.crl_id,
        )
        .filter(
            CommonReportingLineTaxonomyNode.taxonomy_node_code == rule_match.node_code,
            CommonReportingLine.is_active.is_(True),
        )
        .all()
    )

    if not junction_rows:
        # No CRL covers this taxonomy node yet (advanced/industry-only node).
        return CrlSuggestion(
            line_id=line.id, crl_id=None, crl_code=None, crl_name=None,
            crl_section=None, confidence=rule_match.confidence_score,
            reason=f"{rule_match.reason} (no CRL covers taxonomy node {rule_match.node_code})",
            via_taxonomy_node_code=rule_match.node_code,
        )

    # Prefer: org-clone matching organization_id > is_primary system > first system
    candidate = _pick_best_junction(junction_rows, organization_id)
    crl = candidate

    # Filter to template
    if template_crl_ids is not None and crl.id not in template_crl_ids:
        return CrlSuggestion(
            line_id=line.id, crl_id=None, crl_code=None, crl_name=None,
            crl_section=None, confidence=rule_match.confidence_score,
            reason=(
                f"{rule_match.reason} (suggested {crl.code} is not exposed by the "
                f"active reporting template)"
            ),
            via_taxonomy_node_code=rule_match.node_code,
        )

    return CrlSuggestion(
        line_id=line.id,
        crl_id=crl.id,
        crl_code=crl.code,
        crl_name=crl.name,
        crl_section=crl.section,
        confidence=rule_match.confidence_score,
        reason=rule_match.reason,
        via_taxonomy_node_code=rule_match.node_code,
    )


def _pick_best_junction(
    junction_rows: list[tuple],  # list of (CommonReportingLineTaxonomyNode, CommonReportingLine)
    organization_id: int | None,
) -> CommonReportingLine:
    # Org clone is_primary > org clone any > system is_primary > system any
    if organization_id is not None:
        for junction, crl in junction_rows:
            if crl.organization_id == organization_id and junction.is_primary:
                return crl
        for junction, crl in junction_rows:
            if crl.organization_id == organization_id:
                return crl
    for junction, crl in junction_rows:
        if junction.is_primary and crl.organization_id is None:
            return crl
    for junction, crl in junction_rows:
        if crl.organization_id is None:
            return crl
    return junction_rows[0][1]


# ---------------------------------------------------------------------------
# Apply / save helpers (used by the wizard endpoints)
# ---------------------------------------------------------------------------

def apply_crl_suggestions_to_lines(
    db: Session,
    batch: ImportBatch,
    suggestions: Sequence[CrlSuggestion],
    *,
    mode: str,
    line_ids: list[int] | None = None,
) -> dict:
    """
    Promote suggested CRL ids onto ImportLine.selected_common_reporting_line_id.

    mode:
      blank_only — only set on lines whose selected_* is NULL (default)
      replace    — overwrite any existing selection with the suggestion
      preserve   — never overwrite (alias of blank_only, kept for clarity)

    Returns: {applied, skipped, skipped_existing, skipped_no_suggestion,
              skipped_reason | None}
    """
    if mode not in {"blank_only", "replace", "preserve"}:
        raise ValueError(f"Unknown mode {mode!r}")

    target_ids = None
    if line_ids:
        target_ids = set(line_ids)

    by_line_id = {s.line_id: s for s in suggestions}
    lines = db.query(ImportLine).filter_by(batch_id=batch.id).all()

    applied = 0
    skipped_existing = 0
    skipped_no_suggestion = 0
    for line in lines:
        if target_ids is not None and line.id not in target_ids:
            continue
        s = by_line_id.get(line.id)
        if s is None or s.crl_id is None:
            skipped_no_suggestion += 1
            continue
        if line.selected_common_reporting_line_id is not None and mode != "replace":
            skipped_existing += 1
            continue
        line.selected_common_reporting_line_id = s.crl_id
        applied += 1

    db.commit()

    skipped_reason: str | None = None
    if applied == 0 and skipped_existing > 0:
        skipped_reason = (
            f"All {skipped_existing} selected accounts already have a Reporting "
            f"Line assignment. Choose 'Replace existing' to overwrite."
        )
    elif applied == 0 and skipped_no_suggestion > 0:
        skipped_reason = (
            f"None of the {skipped_no_suggestion} selected lines had a "
            f"system-suggested Reporting Line under the active template. "
            f"Pick manually via the inline dropdown."
        )

    return {
        "applied": applied,
        "skipped": skipped_existing + skipped_no_suggestion,
        "skipped_existing": skipped_existing,
        "skipped_no_suggestion": skipped_no_suggestion,
        "skipped_reason": skipped_reason,
    }


def save_explicit_crl_selections(
    db: Session,
    batch: ImportBatch,
    selections: Sequence[dict],
) -> int:
    """
    Per-line override write path (mirror of save-fsli-selections).

    selections = [{"line_id": int, "crl_id": int | None}]
    Returns: count saved.
    """
    saved = 0
    for sel in selections:
        line_id = sel.get("line_id")
        crl_id = sel.get("crl_id")
        if line_id is None:
            continue
        line = db.query(ImportLine).filter_by(id=line_id, batch_id=batch.id).first()
        if line is None:
            continue
        line.selected_common_reporting_line_id = crl_id
        saved += 1
    db.commit()
    return saved
