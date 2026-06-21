"""
CRL-E API surface — list CRLs + list reporting templates.

The wizard's step 4 picker pulls from here. Filters honor the active
reporting template so a Healthcare client doesn't see SaaS-only sub-lines
unless they explicitly switch templates.
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_required_user
from app.models.common_reporting_line import (
    CommonReportingLine,
    ReportingTemplate,
    ReportingTemplateCrl,
)


router = APIRouter()


# ---------------------------------------------------------------------------
# GET /common-reporting-lines
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[dict])
def list_crls(
    organization_id: int | None = Query(None),
    template_id: int | None = Query(None),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> list[dict]:
    """
    Return CRLs visible to a given org/template.

    Behavior:
      - organization_id=None: system catalog only
      - organization_id=N: system catalog UNION org-specific clones
      - template_id=N: filter to CRLs exposed by that template (with
        per-template display_label override and sort_order)
    """
    if template_id is not None:
        return _list_via_template(db, template_id, organization_id, include_inactive)
    return _list_full_catalog(db, organization_id, include_inactive)


def _list_via_template(
    db: Session,
    template_id: int,
    organization_id: int | None,
    include_inactive: bool,
) -> list[dict]:
    rows = (
        db.query(ReportingTemplateCrl, CommonReportingLine)
        .join(CommonReportingLine, CommonReportingLine.id == ReportingTemplateCrl.crl_id)
        .filter(ReportingTemplateCrl.template_id == template_id)
    )
    if not include_inactive:
        rows = rows.filter(
            ReportingTemplateCrl.is_visible.is_(True),
            CommonReportingLine.is_active.is_(True),
        )
    rows = rows.order_by(ReportingTemplateCrl.sort_order, CommonReportingLine.sort_order)
    out: list[dict] = []
    seen_codes: set[str] = set()
    # Prefer org clone over system row when both visible.
    for tc, crl in rows.all():
        if crl.code in seen_codes:
            continue
        if crl.organization_id is None and organization_id is not None:
            clone = (
                db.query(CommonReportingLine)
                .filter_by(code=crl.code, organization_id=organization_id)
                .first()
            )
            if clone is not None:
                crl = clone
        seen_codes.add(crl.code)
        out.append(_to_dict(crl, override_label=tc.display_label))
    return out


def _list_full_catalog(
    db: Session,
    organization_id: int | None,
    include_inactive: bool,
) -> list[dict]:
    q = db.query(CommonReportingLine)
    if organization_id is None:
        q = q.filter(CommonReportingLine.organization_id.is_(None))
    else:
        q = q.filter(
            (CommonReportingLine.organization_id == organization_id)
            | (CommonReportingLine.organization_id.is_(None))
        )
    if not include_inactive:
        q = q.filter(CommonReportingLine.is_active.is_(True))
    rows = q.order_by(CommonReportingLine.sort_order, CommonReportingLine.id).all()

    # Dedupe: if both system + org clone exist for same code, prefer org clone.
    by_code: dict[str, CommonReportingLine] = {}
    for r in rows:
        if r.code not in by_code or r.organization_id is not None:
            by_code[r.code] = r
    return [_to_dict(r) for r in sorted(by_code.values(), key=lambda c: (c.sort_order, c.id))]


def _to_dict(crl: CommonReportingLine, override_label: str | None = None) -> dict:
    return {
        "id": crl.id,
        "code": crl.code,
        "name": override_label or crl.name,
        "description": crl.description,
        "parent_crl_id": crl.parent_crl_id,
        "section": crl.section,
        "statement_type": crl.statement_type,
        "normal_balance": crl.normal_balance,
        "sort_order": crl.sort_order,
        "is_system": crl.is_system,
        "is_mandatory": crl.is_mandatory,
        "organization_id": crl.organization_id,
    }


# ---------------------------------------------------------------------------
# GET /reporting-templates
# ---------------------------------------------------------------------------

@router.get("/templates", response_model=list[dict])
def list_templates(
    organization_id: int | None = Query(None),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> list[dict]:
    q = db.query(ReportingTemplate)
    if organization_id is None:
        q = q.filter(ReportingTemplate.organization_id.is_(None))
    else:
        q = q.filter(
            (ReportingTemplate.organization_id == organization_id)
            | (ReportingTemplate.organization_id.is_(None))
        )
    if not include_inactive:
        q = q.filter(ReportingTemplate.is_active.is_(True))
    rows = q.order_by(ReportingTemplate.code).all()
    return [
        {
            "id": r.id,
            "code": r.code,
            "name": r.name,
            "description": r.description,
            "is_system": r.is_system,
            "is_active": r.is_active,
            "organization_id": r.organization_id,
        }
        for r in rows
    ]
