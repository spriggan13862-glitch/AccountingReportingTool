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


class CrlSystemRowProtectedError(Exception):
    """Raised when caller attempts to mutate / delete a system catalog row."""


class CrlMandatoryRowProtectedError(Exception):
    """Raised when caller attempts to deactivate / delete a mandatory CRL."""


class TemplateNotFoundError(Exception):
    pass


class TemplateSystemRowProtectedError(Exception):
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


# ---------------------------------------------------------------------------
# CRL-F — admin mutation helpers (create / clone-on-edit / delete / templates)
# ---------------------------------------------------------------------------

def create_crl(
    db: Session,
    *,
    code: str,
    name: str,
    section: str,
    statement_type: str,
    organization_id: int,
    description: str | None = None,
    parent_crl_id: int | None = None,
    normal_balance: str | None = None,
    sort_order: int = 0,
) -> CommonReportingLine:
    """
    Create an org-specific custom CRL. System catalog rows are seeded via
    seed_crl_catalog; this path is for custom rows the user adds in the
    Settings → Reporting Lines admin.

    Enforces:
      - code MUST start with CRL_ to keep the convention consistent
      - code MUST be unique within (organization_id, code)
      - organization_id is required (no anonymous custom CRLs)
    """
    if not code or not code.startswith("CRL_"):
        raise ValueError(f"Custom CRL code must start with 'CRL_'; got {code!r}")
    if organization_id is None:
        raise ValueError("organization_id is required for custom CRLs")
    existing = (
        db.query(CommonReportingLine)
        .filter_by(code=code, organization_id=organization_id)
        .first()
    )
    if existing:
        raise CrlAlreadyExistsError(
            f"CRL {code!r} already exists for organization {organization_id}"
        )
    row = CommonReportingLine(
        code=code,
        name=name,
        description=description,
        parent_crl_id=parent_crl_id,
        statement_type=statement_type,
        section=section,
        normal_balance=normal_balance,
        sort_order=sort_order,
        is_system=False,
        is_mandatory=False,
        is_active=True,
        organization_id=organization_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def clone_crl_for_org(
    db: Session,
    system_crl_id: int,
    organization_id: int,
) -> CommonReportingLine:
    """
    Clone-on-edit. Used by the admin UI when a user edits a system CRL:
    we never mutate the shared system row, we create an org-specific copy
    that shadows the system row in resolution lookups.

    If an org clone already exists for the same code, returns it.
    """
    system_row = get_crl(db, system_crl_id)
    if system_row.organization_id is not None:
        raise ValueError(
            f"CRL {system_row.code!r} is already org-specific "
            f"(organization_id={system_row.organization_id}); nothing to clone"
        )
    existing = (
        db.query(CommonReportingLine)
        .filter_by(code=system_row.code, organization_id=organization_id)
        .first()
    )
    if existing:
        return existing
    clone = CommonReportingLine(
        code=system_row.code,
        name=system_row.name,
        description=system_row.description,
        parent_crl_id=system_row.parent_crl_id,
        statement_type=system_row.statement_type,
        section=system_row.section,
        normal_balance=system_row.normal_balance,
        sort_order=system_row.sort_order,
        is_system=False,
        is_mandatory=system_row.is_mandatory,
        is_active=True,
        organization_id=organization_id,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    return clone


def update_or_clone_crl(
    db: Session,
    crl_id: int,
    payload: dict,
    organization_id: int | None,
) -> CommonReportingLine:
    """
    Settings admin write path.

    Branch:
      - row is org-specific (organization_id matches caller): mutate in place
      - row is system AND caller has an org context: clone-on-edit + mutate
      - row is system AND caller has no org context: refuse (system rows
        are seeded via seed_crl_catalog, not edited through the UI)
    """
    row = get_crl(db, crl_id)
    assert_crl_code_unchanged(row, payload)

    is_system_row = row.organization_id is None
    if is_system_row:
        if organization_id is None:
            raise CrlSystemRowProtectedError(
                f"CRL {row.code!r} is a system catalog row. Provide an "
                f"organization_id to clone-on-edit, or update seed_crl_catalog."
            )
        row = clone_crl_for_org(db, row.id, organization_id)
    elif organization_id is not None and row.organization_id != organization_id:
        raise CrlSystemRowProtectedError(
            f"CRL id={crl_id} belongs to organization {row.organization_id}; "
            f"caller is in organization {organization_id}"
        )

    # Mandatory rows can be renamed but not deactivated.
    if row.is_mandatory and payload.get("is_active") is False:
        raise CrlMandatoryRowProtectedError(
            f"CRL {row.code!r} is mandatory and cannot be deactivated."
        )

    for key, value in payload.items():
        if key in _EDITABLE_FIELDS:
            setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_crl(db: Session, crl_id: int) -> CommonReportingLine:
    """
    Soft-delete (is_active=False). Refuses:
      - system catalog rows (organization_id IS NULL)
      - mandatory rows (Unclassified, Needs Review) — even org clones
    """
    row = get_crl(db, crl_id)
    if row.organization_id is None:
        raise CrlSystemRowProtectedError(
            f"CRL {row.code!r} is a system catalog row and cannot be deleted."
        )
    if row.is_mandatory:
        raise CrlMandatoryRowProtectedError(
            f"CRL {row.code!r} is mandatory and cannot be deleted."
        )
    row.is_active = False
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

def get_template(db: Session, template_id: int) -> ReportingTemplate:
    row = db.query(ReportingTemplate).filter_by(id=template_id).first()
    if not row:
        raise TemplateNotFoundError(f"Template id={template_id} not found")
    return row


def create_template(
    db: Session,
    *,
    code: str,
    name: str,
    organization_id: int,
    description: str | None = None,
) -> ReportingTemplate:
    """Create an org-specific reporting template. System templates seed-only."""
    if organization_id is None:
        raise ValueError("organization_id is required for custom templates")
    existing = (
        db.query(ReportingTemplate)
        .filter_by(code=code, organization_id=organization_id)
        .first()
    )
    if existing:
        raise CrlAlreadyExistsError(
            f"Template {code!r} already exists for organization {organization_id}"
        )
    row = ReportingTemplate(
        code=code,
        name=name,
        description=description,
        is_system=False,
        is_active=True,
        organization_id=organization_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


_TEMPLATE_EDITABLE_FIELDS = {"name", "description", "is_active"}


def update_template(
    db: Session,
    template_id: int,
    payload: dict,
    organization_id: int | None,
) -> ReportingTemplate:
    """
    Update editable template fields. System templates (organization_id IS NULL)
    are read-only through the admin UI — they're managed via seed_crl_catalog.

    `code` is treated as immutable (same convention as CRL.code).
    """
    row = get_template(db, template_id)
    if "code" in payload and payload["code"] != row.code:
        raise CrlImmutableCodeError(
            f"Template code is immutable. Refusing to change "
            f"{row.code!r} → {payload['code']!r}."
        )
    if row.organization_id is None:
        raise TemplateSystemRowProtectedError(
            f"Template {row.code!r} is a system template and cannot be edited."
        )
    if organization_id is not None and row.organization_id != organization_id:
        raise TemplateSystemRowProtectedError(
            f"Template id={template_id} belongs to organization "
            f"{row.organization_id}; caller is in organization {organization_id}"
        )
    for key, value in payload.items():
        if key in _TEMPLATE_EDITABLE_FIELDS:
            setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_template(db: Session, template_id: int) -> ReportingTemplate:
    """Soft-delete a custom template. System templates protected."""
    row = get_template(db, template_id)
    if row.organization_id is None:
        raise TemplateSystemRowProtectedError(
            f"Template {row.code!r} is a system template and cannot be deleted."
        )
    row.is_active = False
    db.commit()
    db.refresh(row)
    return row


def set_template_crls(
    db: Session,
    template_id: int,
    selections: Sequence[dict],
    organization_id: int | None,
) -> dict:
    """
    Replace a template's CRL membership with the given selections.

    Each selection: {"crl_id": int, "is_visible": bool, "sort_order": int,
                     "display_label": str | None}

    System templates (organization_id IS NULL) are write-protected — clone
    a system template into an org template first if you need to customize.

    Returns: {"template_id": int, "added": int, "removed": int, "updated": int}
    """
    row = get_template(db, template_id)
    if row.organization_id is None:
        raise TemplateSystemRowProtectedError(
            f"Template {row.code!r} is a system template; clone it first."
        )
    if organization_id is not None and row.organization_id != organization_id:
        raise TemplateSystemRowProtectedError(
            f"Template id={template_id} belongs to organization "
            f"{row.organization_id}; caller is in organization {organization_id}"
        )

    existing_by_crl: dict[int, ReportingTemplateCrl] = {
        tc.crl_id: tc for tc in row.template_crls
    }
    incoming_ids = {int(s["crl_id"]) for s in selections}

    added = 0
    updated = 0
    removed = 0

    # Remove rows the new selection no longer references.
    for crl_id, tc in list(existing_by_crl.items()):
        if crl_id not in incoming_ids:
            db.delete(tc)
            removed += 1

    # Upsert each incoming selection.
    for sel in selections:
        crl_id = int(sel["crl_id"])
        is_visible = bool(sel.get("is_visible", True))
        sort_order = int(sel.get("sort_order", 0))
        display_label = sel.get("display_label")
        tc = existing_by_crl.get(crl_id)
        if tc is None:
            db.add(ReportingTemplateCrl(
                template_id=template_id,
                crl_id=crl_id,
                is_visible=is_visible,
                sort_order=sort_order,
                display_label=display_label,
            ))
            added += 1
        else:
            changed = (
                tc.is_visible != is_visible
                or tc.sort_order != sort_order
                or tc.display_label != display_label
            )
            tc.is_visible = is_visible
            tc.sort_order = sort_order
            tc.display_label = display_label
            if changed:
                updated += 1

    db.commit()
    return {
        "template_id": template_id,
        "added": added,
        "removed": removed,
        "updated": updated,
    }
