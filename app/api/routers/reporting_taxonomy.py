"""
Reporting Taxonomy — full CRUD, export/import, views, and presentation settings.
"""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import (
    ReportingTaxonomyLineOut,
    ReportingTaxonomyLineCreate,
    ReportingTaxonomyLineUpdate,
    TaxonomyImportPreview,
    TaxonomyImportApplyResult,
    TaxonomyImportRow,
    ReportingTaxonomyViewOut,
    ReportingTaxonomyViewCreate,
    ReportingTaxonomyViewUpdate,
    ReportingPresentationSettingsOut,
    ReportingPresentationSettingsUpdate,
)
from app.models.reporting_taxonomy import (
    ReportingTaxonomyLine,
    ReportingTaxonomyView,
    ReportingPresentationSettings,
)
from app.services.reporting_taxonomy_service import (
    get_or_seed,
    seed_views,
    get_or_seed_settings,
)

router = APIRouter(prefix="/reporting-taxonomy", tags=["reporting-taxonomy"])
views_router = APIRouter(prefix="/reporting-views", tags=["reporting-views"])
settings_router = APIRouter(prefix="/reporting-settings", tags=["reporting-settings"])

# ---------------------------------------------------------------------------
# Taxonomy Lines
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[ReportingTaxonomyLineOut])
def list_taxonomy(
    active_only: bool = Query(True),
    statement_type: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Return taxonomy lines, optionally filtered."""
    lines = get_or_seed(db)
    if active_only:
        lines = [l for l in lines if l.active]
    if statement_type:
        lines = [l for l in lines if l.statement_type == statement_type or l.section in _section_for_stmt(statement_type)]
    return lines


def _section_for_stmt(stmt_type: str) -> list[str]:
    mapping = {
        "balance_sheet":    ["assets", "liabilities", "equity"],
        "income_statement": ["revenue", "other_income", "cogs", "expense", "other_expense"],
    }
    return mapping.get(stmt_type, [])


@router.post("/", response_model=ReportingTaxonomyLineOut, status_code=201)
def create_taxonomy_line(body: ReportingTaxonomyLineCreate, db: Session = Depends(get_db)):
    existing = db.query(ReportingTaxonomyLine).filter_by(code=body.code).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Taxonomy code '{body.code}' already exists")
    line = ReportingTaxonomyLine(**body.model_dump())
    db.add(line)
    db.commit()
    db.refresh(line)
    return line


@router.get("/export.csv")
def export_taxonomy_csv(db: Session = Depends(get_db)):
    """Download all taxonomy lines as a CSV template."""
    lines = db.query(ReportingTaxonomyLine).order_by(ReportingTaxonomyLine.sort_order).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "taxonomy_code", "taxonomy_name", "short_name", "statement_type",
        "parent_line", "display_order", "normal_balance", "active",
        "is_subtotal", "sign_behavior", "description", "sec_xbrl_tag",
    ])
    code_map = {l.id: l.code for l in lines}
    for l in lines:
        writer.writerow([
            l.code, l.name, l.short_name or "", l.statement_type or l.section,
            code_map.get(l.parent_id, "") if l.parent_id else "",
            l.sort_order, l.normal_balance or "",
            "1" if l.active else "0",
            "1" if l.is_subtotal else "0",
            l.sign_behavior or "positive",
            l.description or "",
            l.sec_xbrl_tag or "",
        ])
    content = buf.getvalue()
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="taxonomy_template.csv"'},
    )


@router.post("/import/preview", response_model=TaxonomyImportPreview)
async def preview_taxonomy_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Parse a CSV taxonomy import and return a preview (no writes)."""
    content = await file.read()
    return _parse_taxonomy_csv(content, db, apply=False)


@router.post("/import/apply", response_model=TaxonomyImportApplyResult)
async def apply_taxonomy_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Parse and apply a CSV taxonomy import."""
    content = await file.read()
    result = _parse_taxonomy_csv(content, db, apply=True)
    return TaxonomyImportApplyResult(
        created=result.create_count,
        updated=result.update_count,
        errors=result.errors,
    )


def _parse_taxonomy_csv(
    content: bytes, db: Session, apply: bool
) -> TaxonomyImportPreview:
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows: list[TaxonomyImportRow] = []
    errors: list[str] = []
    create_count = 0
    update_count = 0

    # Build existing code→id map
    existing = {l.code: l for l in db.query(ReportingTaxonomyLine).all()}

    # Validate and collect rows
    seen_codes: set[str] = set()
    pending: list[tuple[TaxonomyImportRow, bool]] = []  # (row, is_create)

    for i, raw in enumerate(reader, start=2):
        code = (raw.get("taxonomy_code") or "").strip()
        name = (raw.get("taxonomy_name") or "").strip()
        if not code:
            errors.append(f"Row {i}: missing taxonomy_code")
            continue
        if not name:
            errors.append(f"Row {i}: missing taxonomy_name")
            continue
        if code in seen_codes:
            errors.append(f"Row {i}: duplicate code '{code}' in import file")
            continue
        seen_codes.add(code)

        parent_code = (raw.get("parent_line") or "").strip() or None

        try:
            display_order = int(raw.get("display_order") or 0)
        except ValueError:
            display_order = 0

        row = TaxonomyImportRow(
            taxonomy_code=code,
            taxonomy_name=name,
            short_name=(raw.get("short_name") or "").strip() or None,
            statement_type=(raw.get("statement_type") or "").strip() or None,
            parent_line=parent_code,
            display_order=display_order,
            normal_balance=(raw.get("normal_balance") or "").strip() or None,
            active=(raw.get("active") or "1").strip() != "0",
            description=(raw.get("description") or "").strip() or None,
            sign_behavior=(raw.get("sign_behavior") or "positive").strip() or "positive",
        )
        rows.append(row)
        is_create = code not in existing
        if is_create:
            create_count += 1
        else:
            update_count += 1
        pending.append((row, is_create))

    # Validate parent references
    all_codes = set(existing.keys()) | seen_codes
    for row in rows:
        if row.parent_line and row.parent_line not in all_codes:
            errors.append(f"Code '{row.taxonomy_code}': parent_line '{row.parent_line}' not found")

    # Circular hierarchy check (simple: no code can be its own ancestor)
    for row in rows:
        if row.parent_line == row.taxonomy_code:
            errors.append(f"Code '{row.taxonomy_code}': self-referential parent")

    if apply and not errors:
        # Resolve parent codes → ids first pass (existing)
        code_to_id: dict[str, int] = {l.code: l.id for l in existing.values()}

        # First pass: create/update without parents
        for row, is_create in pending:
            if is_create:
                obj = ReportingTaxonomyLine(
                    code=row.taxonomy_code, name=row.taxonomy_name,
                    short_name=row.short_name,
                    section=row.statement_type or "expense",
                    statement_type=row.statement_type,
                    sort_order=row.display_order or 0,
                    normal_balance=row.normal_balance,
                    active=row.active,
                    description=row.description,
                    sign_behavior=row.sign_behavior,
                )
                db.add(obj)
                db.flush()
                code_to_id[row.taxonomy_code] = obj.id
            else:
                obj = existing[row.taxonomy_code]
                obj.name = row.taxonomy_name
                if row.short_name:
                    obj.short_name = row.short_name
                if row.statement_type:
                    obj.statement_type = row.statement_type
                obj.sort_order = row.display_order or obj.sort_order
                if row.normal_balance:
                    obj.normal_balance = row.normal_balance
                obj.active = row.active
                if row.description:
                    obj.description = row.description
                if row.sign_behavior:
                    obj.sign_behavior = row.sign_behavior
                db.flush()

        # Second pass: link parents
        for row, _ in pending:
            if row.parent_line:
                parent_id = code_to_id.get(row.parent_line)
                if parent_id:
                    obj = db.query(ReportingTaxonomyLine).filter_by(code=row.taxonomy_code).first()
                    if obj:
                        obj.parent_id = parent_id
        db.commit()

    return TaxonomyImportPreview(
        rows=rows,
        create_count=create_count,
        update_count=update_count,
        error_count=len(errors),
        errors=errors,
    )


@router.get("/{line_id}", response_model=ReportingTaxonomyLineOut)
def get_taxonomy_line(line_id: int, db: Session = Depends(get_db)):
    line = db.query(ReportingTaxonomyLine).get(line_id)
    if not line:
        raise HTTPException(status_code=404, detail="Taxonomy line not found")
    return line


@router.patch("/{line_id}", response_model=ReportingTaxonomyLineOut)
def update_taxonomy_line(
    line_id: int,
    body: ReportingTaxonomyLineUpdate,
    db: Session = Depends(get_db),
):
    line = db.query(ReportingTaxonomyLine).get(line_id)
    if not line:
        raise HTTPException(status_code=404, detail="Taxonomy line not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(line, field, value)
    db.commit()
    db.refresh(line)
    return line


@router.delete("/{line_id}", status_code=204)
def delete_taxonomy_line(line_id: int, db: Session = Depends(get_db)):
    line = db.query(ReportingTaxonomyLine).get(line_id)
    if not line:
        raise HTTPException(status_code=404, detail="Taxonomy line not found")
    if line.system_defined:
        # Soft delete only for system-defined lines
        line.active = False
        db.commit()
    else:
        # Check if any accounts reference this line
        from app.models.account import Account
        refs = db.query(Account).filter_by(reporting_taxonomy_line_id=line_id).count()
        if refs:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot delete: {refs} account(s) reference this taxonomy line. Deactivate instead."
            )
        db.delete(line)
        db.commit()


@router.post("/seed", status_code=200)
def reseed_taxonomy(db: Session = Depends(get_db)):
    """Re-seed standard taxonomy lines (idempotent — updates existing, adds missing)."""
    from app.services.reporting_taxonomy_service import seed_taxonomy
    seed_taxonomy(db)
    seed_views(db)
    count = db.query(ReportingTaxonomyLine).count()
    return {"seeded": True, "total_lines": count}


# ---------------------------------------------------------------------------
# Reporting Views
# ---------------------------------------------------------------------------

@views_router.get("/", response_model=list[ReportingTaxonomyViewOut])
def list_views(db: Session = Depends(get_db)):
    seed_views(db)
    return db.query(ReportingTaxonomyView).filter_by(active=True).order_by(
        ReportingTaxonomyView.is_default.desc(),
        ReportingTaxonomyView.name
    ).all()


@views_router.post("/", response_model=ReportingTaxonomyViewOut, status_code=201)
def create_view(body: ReportingTaxonomyViewCreate, db: Session = Depends(get_db)):
    existing = db.query(ReportingTaxonomyView).filter_by(code=body.code).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"View code '{body.code}' already exists")
    if body.is_default:
        db.query(ReportingTaxonomyView).filter_by(is_default=True).update({"is_default": False})
    view = ReportingTaxonomyView(**body.model_dump())
    db.add(view)
    db.commit()
    db.refresh(view)
    return view


@views_router.get("/{view_id}", response_model=ReportingTaxonomyViewOut)
def get_view(view_id: int, db: Session = Depends(get_db)):
    view = db.query(ReportingTaxonomyView).get(view_id)
    if not view:
        raise HTTPException(status_code=404, detail="Reporting view not found")
    return view


@views_router.patch("/{view_id}", response_model=ReportingTaxonomyViewOut)
def update_view(view_id: int, body: ReportingTaxonomyViewUpdate, db: Session = Depends(get_db)):
    view = db.query(ReportingTaxonomyView).get(view_id)
    if not view:
        raise HTTPException(status_code=404, detail="Reporting view not found")
    if body.is_default:
        db.query(ReportingTaxonomyView).filter_by(is_default=True).update({"is_default": False})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(view, field, value)
    db.commit()
    db.refresh(view)
    return view


@views_router.delete("/{view_id}", status_code=204)
def delete_view(view_id: int, db: Session = Depends(get_db)):
    view = db.query(ReportingTaxonomyView).get(view_id)
    if not view:
        raise HTTPException(status_code=404, detail="Reporting view not found")
    if view.is_system_defined:
        view.active = False
    else:
        db.delete(view)
    db.commit()


@views_router.post("/{view_id}/clone", response_model=ReportingTaxonomyViewOut, status_code=201)
def clone_view(view_id: int, db: Session = Depends(get_db)):
    source = db.query(ReportingTaxonomyView).get(view_id)
    if not source:
        raise HTTPException(status_code=404, detail="Reporting view not found")
    new_code = f"{source.code}_copy"
    suffix = 1
    while db.query(ReportingTaxonomyView).filter_by(code=new_code).first():
        new_code = f"{source.code}_copy{suffix}"
        suffix += 1
    cloned = ReportingTaxonomyView(
        code=new_code,
        name=f"{source.name} (Copy)",
        description=source.description,
        is_default=False,
        is_system_defined=False,
        active=True,
    )
    db.add(cloned)
    db.commit()
    db.refresh(cloned)
    return cloned


# ---------------------------------------------------------------------------
# Presentation Settings
# ---------------------------------------------------------------------------

@settings_router.get("/", response_model=ReportingPresentationSettingsOut)
def get_settings(org_id: int | None = Query(None), db: Session = Depends(get_db)):
    return get_or_seed_settings(org_id, db)


@settings_router.put("/", response_model=ReportingPresentationSettingsOut)
def update_settings(
    body: ReportingPresentationSettingsUpdate,
    org_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    settings_obj = get_or_seed_settings(org_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(settings_obj, field, value)
    db.commit()
    db.refresh(settings_obj)
    return settings_obj
