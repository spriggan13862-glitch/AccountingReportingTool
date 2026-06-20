"""
ReportingView service (Sprint P2).

CRUD + clone for the presentation-only ReportingView model. This service
does NOT classify accounts and does NOT compute balances — it only manages
view configuration. Resolving a view against actual numbers is the job of
the (future) reporting engine in Sprint P5.
"""
from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.reporting_view import ReportingView, ReportingViewRow
from app.models.taxonomy import Taxonomy


class ReportingViewNotFoundError(Exception):
    pass


class ReportingViewImmutableError(Exception):
    """Raised when a user attempts to edit a system ReportingView directly."""


def list_views(db: Session, taxonomy_id: int | None = None, include_inactive: bool = False) -> list[ReportingView]:
    q = db.query(ReportingView)
    if taxonomy_id is not None:
        q = q.filter(ReportingView.taxonomy_id == taxonomy_id)
    if not include_inactive:
        q = q.filter(ReportingView.is_active.is_(True))
    return q.order_by(ReportingView.is_system.desc(), ReportingView.name).all()


def get_view(db: Session, view_id: int) -> ReportingView:
    v = db.query(ReportingView).filter_by(id=view_id).first()
    if not v:
        raise ReportingViewNotFoundError(f"ReportingView {view_id} not found")
    return v


def create_view(db: Session, payload: dict) -> ReportingView:
    """Create a non-system view. Rows can be provided as a list of dicts."""
    rows_payload = payload.pop("rows", [])
    view = ReportingView(
        is_system=False,
        is_active=True,
        **{k: v for k, v in payload.items() if hasattr(ReportingView, k)},
    )
    db.add(view)
    db.flush()
    for r in rows_payload:
        db.add(ReportingViewRow(view_id=view.id, **{k: v for k, v in r.items() if hasattr(ReportingViewRow, k)}))
    db.commit()
    db.refresh(view)
    return view


def _assert_editable(view: ReportingView) -> None:
    if view.is_system:
        raise ReportingViewImmutableError(
            f"ReportingView '{view.name}' is system-owned. Clone it before editing."
        )


def update_view(db: Session, view_id: int, payload: dict) -> ReportingView:
    view = get_view(db, view_id)
    _assert_editable(view)
    for k, v in payload.items():
        if hasattr(ReportingView, k) and k not in ("id", "is_system", "taxonomy_id"):
            setattr(view, k, v)
    view.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(view)
    return view


def clone_view(db: Session, source_view_id: int, new_name: str, new_code: str | None = None) -> ReportingView:
    """Clone a (typically system) view into a user-editable copy with all rows."""
    source = get_view(db, source_view_id)
    code = new_code or _derive_clone_code(db, source.code)
    if db.query(ReportingView).filter_by(code=code).first():
        raise ValueError(f"ReportingView code {code} already in use")
    clone = ReportingView(
        code=code,
        name=new_name,
        description=source.description,
        taxonomy_id=source.taxonomy_id,
        is_system=False,
        is_active=True,
        is_default=False,
        parent_view_id=source.id,
        column_config=source.column_config,
        format_config=source.format_config,
        comparative_config=source.comparative_config,
    )
    db.add(clone)
    db.flush()
    for r in source.rows:
        db.add(ReportingViewRow(
            view_id=clone.id,
            sort_order=r.sort_order,
            section_label=r.section_label,
            row_type=r.row_type,
            label=r.label,
            taxonomy_node_id=r.taxonomy_node_id,
            formula=r.formula,
            indent_level=r.indent_level,
            is_bold=r.is_bold,
            is_italic=r.is_italic,
            underline_style=r.underline_style,
            sign_behavior=r.sign_behavior,
        ))
    db.commit()
    db.refresh(clone)
    return clone


def _derive_clone_code(db: Session, source_code: str) -> str:
    base = f"{source_code}_custom"
    code = base
    suffix = 1
    while db.query(ReportingView).filter_by(code=code).first():
        suffix += 1
        code = f"{base}_{suffix}"
    return code


def add_row(db: Session, view_id: int, payload: dict) -> ReportingViewRow:
    view = get_view(db, view_id)
    _assert_editable(view)
    row = ReportingViewRow(view_id=view.id, **{k: v for k, v in payload.items() if hasattr(ReportingViewRow, k)})
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_row(db: Session, row_id: int, payload: dict) -> ReportingViewRow:
    row = db.query(ReportingViewRow).filter_by(id=row_id).first()
    if not row:
        raise ReportingViewNotFoundError(f"ReportingViewRow {row_id} not found")
    view = get_view(db, row.view_id)
    _assert_editable(view)
    for k, v in payload.items():
        if hasattr(ReportingViewRow, k) and k not in ("id", "view_id"):
            setattr(row, k, v)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def delete_row(db: Session, row_id: int) -> None:
    row = db.query(ReportingViewRow).filter_by(id=row_id).first()
    if not row:
        return
    view = get_view(db, row.view_id)
    _assert_editable(view)
    db.delete(row)
    db.commit()
