"""
Common Reporting Line (CRL) service — CRL-B foundation.

Provides:
  - seed_crl_catalog(): one-shot installer for system CRLs + templates
    + initial CRL → Taxonomy node junctions
  - list_crls() / get_crl() / get_crl_by_code()
  - update_crl(): rename / soft-deactivate (refuses to mutate `code`)
  - assert_crl_code_unchanged(): immutability guard

Per the architecture spec, the `code` field is immutable. Display
`name` and other metadata are editable.

CRL-C will add the resolver (precedence chain) and suggestion service
on top of this foundation.
"""
from __future__ import annotations
from typing import Sequence
from sqlalchemy.orm import Session

from app.models.common_reporting_line import (
    CommonReportingLine,
    CommonReportingLineAlias,
    CommonReportingLineTaxonomyNode,
    ReportingTemplate,
    ReportingTemplateCrl,
)
from app.data.crl_catalog import CRL_CATALOG, TEMPLATE_CATALOG


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class CrlImmutableCodeError(Exception):
    """Raised when caller attempts to mutate CommonReportingLine.code."""


class CrlNotFoundError(Exception):
    pass


class CrlAlreadyExistsError(Exception):
    pass


# ---------------------------------------------------------------------------
# Seeding (idempotent)
# ---------------------------------------------------------------------------

def seed_crl_catalog(db: Session) -> dict:
    """
    Install / re-verify the 72 system CRLs + 8 templates + initial
    CRL → Taxonomy junctions.

    Idempotent: existing system rows (organization_id IS NULL) are
    matched by `code` and updated. Missing rows are created.

    Returns: {crls_inserted, crls_updated, templates_inserted,
              templates_updated, junctions_created, aliases_created}
    """
    stats = {
        "crls_inserted": 0, "crls_updated": 0,
        "templates_inserted": 0, "templates_updated": 0,
        "junctions_created": 0, "aliases_created": 0,
    }

    # Pass 1: parents (parent_code IS NULL) so children can FK them.
    code_to_id: dict[str, int] = {}
    for spec in CRL_CATALOG:
        if spec.parent_code is not None:
            continue
        existing = (
            db.query(CommonReportingLine)
            .filter_by(code=spec.code, organization_id=None)
            .first()
        )
        if existing:
            existing.name = spec.name
            existing.description = spec.description
            existing.statement_type = spec.statement_type
            existing.section = spec.section
            existing.normal_balance = spec.normal_balance
            existing.sort_order = spec.sort_order
            existing.is_mandatory = spec.is_mandatory
            existing.is_active = True
            stats["crls_updated"] += 1
            code_to_id[spec.code] = existing.id
        else:
            row = CommonReportingLine(
                code=spec.code,
                name=spec.name,
                description=spec.description,
                parent_crl_id=None,
                statement_type=spec.statement_type,
                section=spec.section,
                normal_balance=spec.normal_balance,
                sort_order=spec.sort_order,
                is_system=True,
                is_mandatory=spec.is_mandatory,
                is_active=True,
                organization_id=None,
            )
            db.add(row)
            db.flush()
            code_to_id[spec.code] = row.id
            stats["crls_inserted"] += 1

    # Pass 2: children
    for spec in CRL_CATALOG:
        if spec.parent_code is None:
            continue
        parent_id = code_to_id.get(spec.parent_code)
        if parent_id is None:
            # Skip a child whose parent didn't seed. Log via stats.
            continue
        existing = (
            db.query(CommonReportingLine)
            .filter_by(code=spec.code, organization_id=None)
            .first()
        )
        if existing:
            existing.name = spec.name
            existing.parent_crl_id = parent_id
            existing.section = spec.section
            existing.statement_type = spec.statement_type
            existing.normal_balance = spec.normal_balance
            existing.sort_order = spec.sort_order
            existing.is_active = True
            stats["crls_updated"] += 1
            code_to_id[spec.code] = existing.id
        else:
            row = CommonReportingLine(
                code=spec.code,
                name=spec.name,
                description=spec.description,
                parent_crl_id=parent_id,
                statement_type=spec.statement_type,
                section=spec.section,
                normal_balance=spec.normal_balance,
                sort_order=spec.sort_order,
                is_system=True,
                is_mandatory=False,
                is_active=True,
                organization_id=None,
            )
            db.add(row)
            db.flush()
            code_to_id[spec.code] = row.id
            stats["crls_inserted"] += 1

    # Pass 3: CRL → Taxonomy node junctions (one-to-many supported)
    for spec in CRL_CATALOG:
        crl_id = code_to_id.get(spec.code)
        if crl_id is None or not spec.taxonomy_node_codes:
            continue
        for idx, node_code in enumerate(spec.taxonomy_node_codes):
            exists = (
                db.query(CommonReportingLineTaxonomyNode)
                .filter_by(crl_id=crl_id, taxonomy_node_code=node_code)
                .first()
            )
            if exists:
                continue
            db.add(CommonReportingLineTaxonomyNode(
                crl_id=crl_id,
                taxonomy_node_code=node_code,
                is_primary=(idx == 0),
                sort_order=idx * 10,
            ))
            stats["junctions_created"] += 1

    db.flush()

    # Pass 4: templates
    template_id_by_code: dict[str, int] = {}
    for tspec in TEMPLATE_CATALOG:
        existing = (
            db.query(ReportingTemplate)
            .filter_by(code=tspec.code, organization_id=None)
            .first()
        )
        if existing:
            existing.name = tspec.name
            existing.description = tspec.description
            existing.is_active = True
            stats["templates_updated"] += 1
            template_id_by_code[tspec.code] = existing.id
        else:
            t = ReportingTemplate(
                code=tspec.code,
                name=tspec.name,
                description=tspec.description,
                is_system=True,
                is_active=True,
                organization_id=None,
            )
            db.add(t)
            db.flush()
            template_id_by_code[tspec.code] = t.id
            stats["templates_inserted"] += 1

    # Pass 5: template ↔ CRL junctions. Drop & recreate for each template
    # so re-seeding reflects the latest catalog without leaving stale rows.
    for tspec in TEMPLATE_CATALOG:
        template_id = template_id_by_code.get(tspec.code)
        if template_id is None:
            continue
        db.query(ReportingTemplateCrl).filter_by(template_id=template_id).delete()
        for idx, crl_code in enumerate(tspec.crl_codes):
            crl_id = code_to_id.get(crl_code)
            if crl_id is None:
                continue
            db.add(ReportingTemplateCrl(
                template_id=template_id,
                crl_id=crl_id,
                is_visible=True,
                sort_order=idx * 10,
            ))

    db.commit()
    return stats


# ---------------------------------------------------------------------------
# Read accessors
# ---------------------------------------------------------------------------

def list_crls(
    db: Session,
    organization_id: int | None = None,
    section: str | None = None,
    include_inactive: bool = False,
) -> list[CommonReportingLine]:
    """List CRLs visible to a given org. NULL org sees system catalog only."""
    q = db.query(CommonReportingLine)
    if organization_id is None:
        q = q.filter(CommonReportingLine.organization_id.is_(None))
    else:
        q = q.filter(
            (CommonReportingLine.organization_id == organization_id)
            | (CommonReportingLine.organization_id.is_(None))
        )
    if section is not None:
        q = q.filter(CommonReportingLine.section == section)
    if not include_inactive:
        q = q.filter(CommonReportingLine.is_active.is_(True))
    return q.order_by(CommonReportingLine.sort_order, CommonReportingLine.id).all()


def get_crl(db: Session, crl_id: int) -> CommonReportingLine:
    row = db.query(CommonReportingLine).filter_by(id=crl_id).first()
    if not row:
        raise CrlNotFoundError(f"CRL id={crl_id} not found")
    return row


def get_crl_by_code(
    db: Session,
    code: str,
    organization_id: int | None = None,
) -> CommonReportingLine | None:
    """Resolve a CRL by immutable code. Falls back to system row if org has no override."""
    if organization_id is not None:
        org_row = (
            db.query(CommonReportingLine)
            .filter_by(code=code, organization_id=organization_id)
            .first()
        )
        if org_row:
            return org_row
    return (
        db.query(CommonReportingLine)
        .filter_by(code=code, organization_id=None)
        .first()
    )


# ---------------------------------------------------------------------------
# Mutation — immutability guard
# ---------------------------------------------------------------------------

def assert_crl_code_unchanged(existing: CommonReportingLine, payload: dict) -> None:
    """
    Refuse any attempt to mutate the `code` field. Code is the immutable
    identifier that every downstream system references; renaming would
    break report logic, migrations, templates, rollups, consolidations.
    """
    if "code" in payload and payload["code"] != existing.code:
        raise CrlImmutableCodeError(
            f"CRL code is immutable. Refusing to change "
            f"{existing.code!r} → {payload['code']!r}."
        )


# Fields that user/admin may update on a CRL (display label, hierarchy
# placement, activation). `code` is intentionally NOT in this list.
_EDITABLE_FIELDS = {
    "name", "description", "parent_crl_id", "sort_order",
    "normal_balance", "is_active",
}


def update_crl(db: Session, crl_id: int, payload: dict) -> CommonReportingLine:
    """
    Update editable CRL fields. Raises CrlImmutableCodeError if payload
    tries to change `code`. Silently ignores other non-editable fields
    (id, is_system, is_mandatory, organization_id, timestamps).
    """
    row = get_crl(db, crl_id)
    assert_crl_code_unchanged(row, payload)
    for key, value in payload.items():
        if key in _EDITABLE_FIELDS:
            setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Aliases (for the rule-engine keyword layer used by CRL-C)
# ---------------------------------------------------------------------------

def add_aliases(db: Session, crl_id: int, aliases: Sequence[str], weight: float = 1.0) -> int:
    crl = get_crl(db, crl_id)
    inserted = 0
    for a in aliases:
        exists = (
            db.query(CommonReportingLineAlias)
            .filter_by(crl_id=crl.id, alias=a.lower().strip())
            .first()
        )
        if exists:
            continue
        db.add(CommonReportingLineAlias(crl_id=crl.id, alias=a.lower().strip(), weight=weight))
        inserted += 1
    db.commit()
    return inserted
