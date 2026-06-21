"""
CRL-D: migration validation report + safe backfill executor.

Per architecture v2 §7 + §9 step 0:

The executor refuses to write to accounts.common_reporting_line_id /
accounts.crl_state until an admin has acknowledged a matching report.

Categorization:

  ready_to_assign            single unambiguous CRL → auto-assign
  ambiguous                  taxonomy node maps to multiple CRLs → CRL_NEEDS_REVIEW
  no_canonical_crl           existing taxonomy mapping but no CRL covers it
                             → CRL_UNCLASSIFIED (taxonomy link preserved)
  classification_change      ready_to_assign + the new CRL's name differs
                             from the legacy label (diagnostic flag only;
                             still auto-assigns)
  unmapped                   no existing mapping at all → CRL_UNCLASSIFIED
  already_migrated           account already has common_reporting_line_id

The hash is SHA-256 over a deterministic JSON projection of the report
(no timestamps, no IDs that would drift across runs).
"""
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.common_reporting_line import (
    CommonReportingLine,
    CommonReportingLineTaxonomyNode,
)
from app.models.crl_migration_acknowledgment import CrlMigrationAcknowledgment
from app.models.entity import Entity
from app.models.reporting_taxonomy import ReportingTaxonomyLine
from app.models.taxonomy import AccountTaxonomyMapping, TaxonomyNode


# ---------------------------------------------------------------------------
# Categorization
# ---------------------------------------------------------------------------

CAT_READY = "ready_to_assign"
CAT_AMBIGUOUS = "ambiguous"
CAT_NO_CANONICAL = "no_canonical_crl"
CAT_CLASSIFICATION_CHANGE = "classification_change"
CAT_UNMAPPED = "unmapped"
CAT_ALREADY_MIGRATED = "already_migrated"


@dataclass
class AccountCategorization:
    account_id: int
    account_number: str
    account_name: str
    category: str
    candidate_crl_codes: list[str] = field(default_factory=list)
    via_taxonomy_node_code: str | None = None
    legacy_label: str | None = None
    proposed_label: str | None = None
    reason: str = ""


class CrlMigrationError(Exception):
    pass


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_validation_report(db: Session, organization_id: int) -> dict:
    """
    Build the per-organization CRL migration report. Read-only.
    Returns a dict matching the architecture spec §7 format, plus a
    stable `report_hash` field for acknowledgment.
    """
    accounts = _accounts_for_org(db, organization_id)

    categorized: list[AccountCategorization] = []
    for account in accounts:
        categorized.append(_categorize(db, account, organization_id))

    by_cat: dict[str, list[AccountCategorization]] = {}
    for c in categorized:
        by_cat.setdefault(c.category, []).append(c)

    summary = {
        "total_accounts": len(accounts),
        "already_migrated": len(by_cat.get(CAT_ALREADY_MIGRATED, [])),
        "ready_to_assign": len(by_cat.get(CAT_READY, [])),
        "ambiguous": len(by_cat.get(CAT_AMBIGUOUS, [])),
        "no_canonical_crl": len(by_cat.get(CAT_NO_CANONICAL, [])),
        "classification_change": len(by_cat.get(CAT_CLASSIFICATION_CHANGE, [])),
        "unmapped": len(by_cat.get(CAT_UNMAPPED, [])),
    }

    report = {
        "organization_id": organization_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "ready_to_assign": [_to_dict(c) for c in by_cat.get(CAT_READY, [])],
        "ambiguous_accounts": [_to_dict(c) for c in by_cat.get(CAT_AMBIGUOUS, [])],
        "no_canonical_crl_accounts": [_to_dict(c) for c in by_cat.get(CAT_NO_CANONICAL, [])],
        "classification_changes": [_to_dict(c) for c in by_cat.get(CAT_CLASSIFICATION_CHANGE, [])],
        "unmapped_accounts": [_to_dict(c) for c in by_cat.get(CAT_UNMAPPED, [])],
        "already_migrated_accounts": [_to_dict(c) for c in by_cat.get(CAT_ALREADY_MIGRATED, [])],
    }
    report["report_hash"] = _hash_report(report)
    return report


def acknowledge_report(
    db: Session,
    organization_id: int,
    report_hash: str,
    acked_by_user_id: int | None = None,
    notes: str | None = None,
) -> CrlMigrationAcknowledgment:
    """
    Record admin acknowledgment that they've reviewed the report and
    authorize the executor to run against this exact state.
    """
    ack = CrlMigrationAcknowledgment(
        organization_id=organization_id,
        report_hash=report_hash,
        acked_by_user_id=acked_by_user_id,
        notes=notes,
    )
    db.add(ack)
    db.commit()
    db.refresh(ack)
    return ack


def execute_backfill(
    db: Session,
    organization_id: int,
    *,
    require_ack: bool = True,
) -> dict:
    """
    Run the safe backfill against the current state of the org's accounts.

    Refuses to proceed if no acknowledgment exists for the CURRENT report
    state (regenerated and hashed inline). This prevents an admin from
    acknowledging an old report and then sneaking a destructive change
    through against a different account set.

    Returns: {ready_assigned, ambiguous_to_needs_review, no_canonical_to_unclassified,
              unmapped_to_unclassified, already_migrated, total_touched}
    """
    report = generate_validation_report(db, organization_id)

    if require_ack:
        ack = (
            db.query(CrlMigrationAcknowledgment)
            .filter_by(organization_id=organization_id, report_hash=report["report_hash"])
            .order_by(CrlMigrationAcknowledgment.acked_at.desc())
            .first()
        )
        if ack is None:
            raise CrlMigrationError(
                f"No acknowledgment found for organization {organization_id} "
                f"matching the current report hash {report['report_hash'][:12]}…. "
                f"Generate the report, review it, then call acknowledge_report "
                f"before running the executor."
            )

    code_to_crl = _load_crl_lookup(db, organization_id)
    nr_id = code_to_crl["CRL_NEEDS_REVIEW"].id
    uc_id = code_to_crl["CRL_UNCLASSIFIED"].id

    stats = {
        "ready_assigned": 0,
        "ambiguous_to_needs_review": 0,
        "no_canonical_to_unclassified": 0,
        "unmapped_to_unclassified": 0,
        "already_migrated": 0,
        "total_touched": 0,
    }

    # Re-pull accounts (the report has detail; we walk again for the write
    # so we never trust a stale in-memory snapshot).
    accounts = _accounts_for_org(db, organization_id)
    account_by_id = {a.id: a for a in accounts}

    # READY + CLASSIFICATION_CHANGE: assign the candidate CRL
    for entry in report["ready_to_assign"] + report["classification_changes"]:
        a = account_by_id.get(entry["account_id"])
        if a is None or not entry["candidate_crl_codes"]:
            continue
        target = code_to_crl.get(entry["candidate_crl_codes"][0])
        if target is None:
            continue
        a.common_reporting_line_id = target.id
        a.crl_state = "assigned"
        stats["ready_assigned"] += 1
        stats["total_touched"] += 1

    # AMBIGUOUS: park on NEEDS_REVIEW sentinel
    for entry in report["ambiguous_accounts"]:
        a = account_by_id.get(entry["account_id"])
        if a is None:
            continue
        a.common_reporting_line_id = nr_id
        a.crl_state = "needs_review"
        stats["ambiguous_to_needs_review"] += 1
        stats["total_touched"] += 1

    # NO_CANONICAL: park on UNCLASSIFIED sentinel (taxonomy link preserved)
    for entry in report["no_canonical_crl_accounts"]:
        a = account_by_id.get(entry["account_id"])
        if a is None:
            continue
        a.common_reporting_line_id = uc_id
        a.crl_state = "unclassified"
        stats["no_canonical_to_unclassified"] += 1
        stats["total_touched"] += 1

    # UNMAPPED: park on UNCLASSIFIED sentinel
    for entry in report["unmapped_accounts"]:
        a = account_by_id.get(entry["account_id"])
        if a is None:
            continue
        a.common_reporting_line_id = uc_id
        a.crl_state = "unclassified"
        stats["unmapped_to_unclassified"] += 1
        stats["total_touched"] += 1

    stats["already_migrated"] = report["summary"]["already_migrated"]
    db.commit()
    return stats


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _accounts_for_org(db: Session, organization_id: int) -> list[Account]:
    """All Account rows for entities under this org."""
    rows = (
        db.query(Account)
        .join(Entity, Entity.id == Account.entity_id)
        .filter(Entity.organization_id == organization_id)
        .order_by(Account.id)
        .all()
    )
    return rows


def _categorize(db: Session, account: Account, organization_id: int) -> AccountCategorization:
    base = AccountCategorization(
        account_id=account.id,
        account_number=account.account_number or "",
        account_name=account.account_name or "",
        category=CAT_UNMAPPED,
    )

    # Already migrated?
    if account.common_reporting_line_id is not None:
        crl = (
            db.query(CommonReportingLine)
            .filter_by(id=account.common_reporting_line_id)
            .first()
        )
        base.category = CAT_ALREADY_MIGRATED
        base.candidate_crl_codes = [crl.code] if crl else []
        return base

    # Step 1: try Sprint O AccountTaxonomyMapping
    sprint_o = db.query(AccountTaxonomyMapping).filter_by(account_id=account.id).first()
    taxonomy_node_code = None
    legacy_label = None

    if sprint_o is not None:
        node = db.query(TaxonomyNode).filter_by(id=sprint_o.taxonomy_node_id).first()
        if node is not None:
            taxonomy_node_code = node.code

    # Step 2: legacy fallback
    if taxonomy_node_code is None and account.reporting_taxonomy_line_id is not None:
        legacy = db.query(ReportingTaxonomyLine).filter_by(
            id=account.reporting_taxonomy_line_id
        ).first()
        if legacy is not None:
            taxonomy_node_code = legacy.code
            legacy_label = legacy.name

    if taxonomy_node_code is None:
        base.category = CAT_UNMAPPED
        base.reason = "Account has no existing reporting mapping; will land in Unclassified."
        return base

    # Reverse-lookup: which CRLs cover this taxonomy node?
    junction_rows = (
        db.query(CommonReportingLineTaxonomyNode, CommonReportingLine)
        .join(
            CommonReportingLine,
            CommonReportingLine.id == CommonReportingLineTaxonomyNode.crl_id,
        )
        .filter(
            CommonReportingLineTaxonomyNode.taxonomy_node_code == taxonomy_node_code,
            CommonReportingLine.is_active.is_(True),
        )
        .all()
    )
    candidates = [crl for _junction, crl in junction_rows]
    candidate_codes = sorted({c.code for c in candidates})

    base.via_taxonomy_node_code = taxonomy_node_code
    base.legacy_label = legacy_label
    base.candidate_crl_codes = candidate_codes

    if not candidates:
        base.category = CAT_NO_CANONICAL
        base.reason = (
            f"Taxonomy node {taxonomy_node_code!r} has no CRL coverage "
            f"(likely an advanced/industry-only node). Lands in Unclassified."
        )
        return base

    if len(candidate_codes) > 1:
        base.category = CAT_AMBIGUOUS
        base.reason = (
            f"Taxonomy node {taxonomy_node_code!r} maps to multiple CRLs: "
            f"{candidate_codes}. Lands in Needs Review."
        )
        return base

    # Exactly one unambiguous candidate.
    primary = candidates[0]
    base.proposed_label = primary.name

    # Is this a classification change relative to the legacy label?
    if legacy_label and legacy_label.strip().lower() != primary.name.strip().lower():
        base.category = CAT_CLASSIFICATION_CHANGE
        base.reason = (
            f"Will auto-assign {primary.code} ({primary.name!r}), changing "
            f"reporting label from {legacy_label!r}."
        )
    else:
        base.category = CAT_READY
        base.reason = f"Unambiguous match to {primary.code}."

    return base


def _to_dict(c: AccountCategorization) -> dict:
    return {
        "account_id": c.account_id,
        "account_number": c.account_number,
        "account_name": c.account_name,
        "candidate_crl_codes": c.candidate_crl_codes,
        "via_taxonomy_node_code": c.via_taxonomy_node_code,
        "legacy_label": c.legacy_label,
        "proposed_label": c.proposed_label,
        "reason": c.reason,
    }


def _hash_report(report: dict) -> str:
    """SHA-256 over a deterministic projection (excludes timestamp)."""
    projection = {
        "organization_id": report["organization_id"],
        "summary": report["summary"],
        # Account-level: only the deterministic identifiers + category. Excludes
        # human-readable `reason` text that could vary between runs.
        "ready_to_assign": _account_id_set(report["ready_to_assign"]),
        "ambiguous_accounts": _account_id_set(report["ambiguous_accounts"]),
        "no_canonical_crl_accounts": _account_id_set(report["no_canonical_crl_accounts"]),
        "classification_changes": _account_id_set(report["classification_changes"]),
        "unmapped_accounts": _account_id_set(report["unmapped_accounts"]),
    }
    payload = json.dumps(projection, sort_keys=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _account_id_set(entries: list[dict]) -> list[list]:
    """Stable [account_id, candidate_codes_sorted] tuples for hashing."""
    return sorted(
        [[e["account_id"], sorted(e["candidate_crl_codes"])] for e in entries]
    )


def _load_crl_lookup(db: Session, organization_id: int | None) -> dict[str, CommonReportingLine]:
    """All visible CRLs keyed by code (org-clone takes precedence over system)."""
    system_rows = (
        db.query(CommonReportingLine)
        .filter(CommonReportingLine.organization_id.is_(None))
        .all()
    )
    by_code: dict[str, CommonReportingLine] = {row.code: row for row in system_rows}
    if organization_id is not None:
        org_rows = (
            db.query(CommonReportingLine)
            .filter(CommonReportingLine.organization_id == organization_id)
            .all()
        )
        for row in org_rows:
            by_code[row.code] = row
    return by_code
