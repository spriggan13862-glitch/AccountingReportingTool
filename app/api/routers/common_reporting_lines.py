"""
CRL-E + CRL-F API surface — list CRLs and templates (read), and admin
mutations for the Settings → Reporting Lines / Reporting Templates UI.

The wizard's step 4 picker pulls from the list endpoints. Filters honor
the active reporting template so a Healthcare client doesn't see SaaS-only
sub-lines unless they explicitly switch templates.

The admin endpoints enforce:
  - code immutability on both CRLs and templates
  - clone-on-edit for system catalog rows
  - protection of mandatory CRLs (Unclassified, Needs Review) from delete
    and from is_active=false
  - protection of system templates (organization_id IS NULL) from any
    mutation through this surface
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_required_user
from app.models.common_reporting_line import (
    CommonReportingLine,
    ReportingTemplate,
    ReportingTemplateCrl,
)
from app.services.crl_service import (
    CrlAlreadyExistsError,
    CrlImmutableCodeError,
    CrlMandatoryRowProtectedError,
    CrlNotFoundError,
    CrlSystemRowProtectedError,
    TemplateNotFoundError,
    TemplateSystemRowProtectedError,
    create_crl,
    create_template,
    delete_crl,
    delete_template,
    get_crl,
    get_template,
    set_template_crls,
    update_or_clone_crl,
    update_template,
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
        "is_active": crl.is_active,
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
    return [_template_to_dict(r) for r in rows]


def _template_to_dict(t: ReportingTemplate) -> dict:
    return {
        "id": t.id,
        "code": t.code,
        "name": t.name,
        "description": t.description,
        "is_system": t.is_system,
        "is_active": t.is_active,
        "organization_id": t.organization_id,
    }


# ---------------------------------------------------------------------------
# CRL-F — admin Pydantic schemas
# ---------------------------------------------------------------------------

class CrlCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(..., min_length=5, max_length=80)
    name: str = Field(..., min_length=1, max_length=200)
    section: str = Field(..., min_length=1, max_length=50)
    statement_type: str = Field(..., min_length=1, max_length=40)
    organization_id: int
    description: str | None = None
    parent_crl_id: int | None = None
    normal_balance: str | None = None
    sort_order: int = 0


class CrlUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # `code` deliberately omitted — immutable.
    name: str | None = None
    description: str | None = None
    parent_crl_id: int | None = None
    sort_order: int | None = None
    normal_balance: str | None = None
    is_active: bool | None = None
    organization_id: int | None = None  # query param mirror for clone-on-edit


class TemplateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=200)
    organization_id: int
    description: str | None = None


class TemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    organization_id: int | None = None


class TemplateCrlSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    crl_id: int
    is_visible: bool = True
    sort_order: int = 0
    display_label: str | None = None


class TemplateCrlBulkSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    selections: list[TemplateCrlSelection]
    organization_id: int | None = None


# ---------------------------------------------------------------------------
# CRL-F — admin endpoints (CRLs)
# ---------------------------------------------------------------------------

@router.post("/", response_model=dict, status_code=201)
def create_crl_endpoint(
    body: CrlCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """Create an org-specific custom CRL. Code must start with CRL_."""
    try:
        row = create_crl(
            db,
            code=body.code,
            name=body.name,
            section=body.section,
            statement_type=body.statement_type,
            organization_id=body.organization_id,
            description=body.description,
            parent_crl_id=body.parent_crl_id,
            normal_balance=body.normal_balance,
            sort_order=body.sort_order,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except CrlAlreadyExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _to_dict(row)


@router.patch("/{crl_id}", response_model=dict)
def update_crl_endpoint(
    crl_id: int,
    body: CrlUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """
    Update editable CRL fields with clone-on-edit semantics. System catalog
    rows require an organization_id to clone into; without one, returns 409.
    """
    payload = body.model_dump(exclude_unset=True)
    org_id = payload.pop("organization_id", None)
    try:
        row = update_or_clone_crl(db, crl_id, payload, org_id)
    except CrlNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except CrlImmutableCodeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except CrlSystemRowProtectedError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except CrlMandatoryRowProtectedError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _to_dict(row)


@router.delete("/{crl_id}", response_model=dict)
def delete_crl_endpoint(
    crl_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """Soft-delete (is_active=false). System + mandatory rows protected."""
    try:
        row = delete_crl(db, crl_id)
    except CrlNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except CrlSystemRowProtectedError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except CrlMandatoryRowProtectedError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _to_dict(row)


# ---------------------------------------------------------------------------
# CRL-F — admin endpoints (Templates)
# ---------------------------------------------------------------------------

@router.post("/templates", response_model=dict, status_code=201)
def create_template_endpoint(
    body: TemplateCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    try:
        row = create_template(
            db,
            code=body.code,
            name=body.name,
            organization_id=body.organization_id,
            description=body.description,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except CrlAlreadyExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _template_to_dict(row)


@router.patch("/templates/{template_id}", response_model=dict)
def update_template_endpoint(
    template_id: int,
    body: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    payload = body.model_dump(exclude_unset=True)
    org_id = payload.pop("organization_id", None)
    try:
        row = update_template(db, template_id, payload, org_id)
    except TemplateNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except CrlImmutableCodeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except TemplateSystemRowProtectedError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _template_to_dict(row)


@router.delete("/templates/{template_id}", response_model=dict)
def delete_template_endpoint(
    template_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    try:
        row = delete_template(db, template_id)
    except TemplateNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except TemplateSystemRowProtectedError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _template_to_dict(row)


@router.get("/templates/{template_id}/crls", response_model=list[dict])
def list_template_crls_endpoint(
    template_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> list[dict]:
    """Membership for a single template — used by the admin matrix editor."""
    try:
        tpl = get_template(db, template_id)
    except TemplateNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    rows = (
        db.query(ReportingTemplateCrl)
        .filter_by(template_id=tpl.id)
        .order_by(ReportingTemplateCrl.sort_order)
        .all()
    )
    return [
        {
            "id": r.id,
            "template_id": r.template_id,
            "crl_id": r.crl_id,
            "is_visible": r.is_visible,
            "sort_order": r.sort_order,
            "display_label": r.display_label,
        }
        for r in rows
    ]


@router.put("/templates/{template_id}/crls", response_model=dict)
def set_template_crls_endpoint(
    template_id: int,
    body: TemplateCrlBulkSet,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
) -> dict:
    """Bulk replace a template's CRL membership."""
    try:
        result = set_template_crls(
            db,
            template_id,
            [s.model_dump() for s in body.selections],
            body.organization_id,
        )
    except TemplateNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except TemplateSystemRowProtectedError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return result
