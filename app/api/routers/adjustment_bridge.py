"""Adjustment Bridge — pivot/data-cube workpaper (Tier 1.9 skeleton).

Endpoints:
  GET  /adjustment-bridge/compute?entity_id=N&period_end=YYYY-MM-DD&scenario_id=N
       Build or refresh bridge rows from accounts + JEs + imported balances.
  GET  /adjustment-bridge/rows?entity_id=N&period_end=&scenario_id=&account_type=&taxonomy_category=
       Return cube rows with optional slicers.
  GET  /adjustment-bridge/views?entity_id=N
       List saved views for an entity.
  POST /adjustment-bridge/views
       Create a saved view.
  PATCH /adjustment-bridge/views/{view_id}
       Update a saved view.
  DELETE /adjustment-bridge/views/{view_id}
       Delete a saved view.
"""
from __future__ import annotations

import json
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db

router = APIRouter(prefix="/adjustment-bridge", tags=["adjustment-bridge"])

# ---------------------------------------------------------------------------
# Schemas (inline — no circular import risk)
# ---------------------------------------------------------------------------

class AdjustmentBridgeRowOut(BaseModel):
    id: int
    entity_id: int
    period_end: str
    scenario_id: int | None
    account_id: int | None
    account_number: str | None
    account_name: str | None
    account_type: str | None
    taxonomy_category: str | None
    fs_line: str | None
    adjustment_type: str | None
    is_posted: bool
    is_included: bool
    source: str | None
    consolidation_group: str | None
    imported_balance: str | None
    posted_adjustments: str | None
    draft_adjustments: str | None
    excluded_adjustments: str | None
    adjusted_balance: str | None
    variance: str | None
    prior_period_balance: str | None
    budget_placeholder: str | None
    notes: str | None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_row(cls, row) -> "AdjustmentBridgeRowOut":
        def dec(v) -> str | None:
            return str(v) if v is not None else None
        return cls(
            id=row.id,
            entity_id=row.entity_id,
            period_end=row.period_end,
            scenario_id=row.scenario_id,
            account_id=row.account_id,
            account_number=row.account_number,
            account_name=row.account_name,
            account_type=row.account_type,
            taxonomy_category=row.taxonomy_category,
            fs_line=row.fs_line,
            adjustment_type=row.adjustment_type,
            is_posted=row.is_posted,
            is_included=row.is_included,
            source=row.source,
            consolidation_group=row.consolidation_group,
            imported_balance=dec(row.imported_balance),
            posted_adjustments=dec(row.posted_adjustments),
            draft_adjustments=dec(row.draft_adjustments),
            excluded_adjustments=dec(row.excluded_adjustments),
            adjusted_balance=dec(row.adjusted_balance),
            variance=dec(row.variance),
            prior_period_balance=dec(row.prior_period_balance),
            budget_placeholder=dec(row.budget_placeholder),
            notes=row.notes,
        )


class AdjustmentBridgeViewCreate(BaseModel):
    entity_id: int
    name: str
    description: str | None = None
    is_default: bool = False
    row_dimensions: list[str] | None = None
    column_dimensions: list[str] | None = None
    slicer_config: dict | None = None
    sort_config: list[dict] | None = None
    visible_measures: list[str] | None = None


class AdjustmentBridgeViewUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_default: bool | None = None
    row_dimensions: list[str] | None = None
    column_dimensions: list[str] | None = None
    slicer_config: dict | None = None
    sort_config: list[dict] | None = None
    visible_measures: list[str] | None = None


class AdjustmentBridgeViewOut(BaseModel):
    id: int
    entity_id: int
    name: str
    description: str | None
    is_default: bool
    row_dimensions: list[str] | None
    column_dimensions: list[str] | None
    slicer_config: dict | None
    sort_config: list[dict] | None
    visible_measures: list[str] | None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_view(cls, v) -> "AdjustmentBridgeViewOut":
        return cls(
            id=v.id,
            entity_id=v.entity_id,
            name=v.name,
            description=v.description,
            is_default=v.is_default,
            row_dimensions=json.loads(v.row_dimensions) if v.row_dimensions else None,
            column_dimensions=json.loads(v.column_dimensions) if v.column_dimensions else None,
            slicer_config=json.loads(v.slicer_config) if v.slicer_config else None,
            sort_config=json.loads(v.sort_config) if v.sort_config else None,
            visible_measures=json.loads(v.visible_measures) if v.visible_measures else None,
        )


class ComputeResult(BaseModel):
    entity_id: int
    period_end: str
    scenario_id: int | None
    rows_computed: int
    message: str


# ---------------------------------------------------------------------------
# Compute endpoint
# ---------------------------------------------------------------------------

@router.get("/compute", response_model=ComputeResult)
def compute_bridge(
    entity_id: int,
    period_end: str,
    scenario_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Compute Adjustment Bridge rows for entity/period/scenario.

    Skeleton: builds rows from Chart of Accounts + journal entries.
    Full multi-period prior-balance lookback is deferred to Tier 2.
    """
    import datetime
    from app.models.entity import Entity
    from app.models.scenario import Scenario
    from app.models.adjustment_bridge import AdjustmentBridgeRow
    from app.models.account import Account
    from app.models.journal_entry import JournalEntry
    from app.models.journal_entry_line import JournalEntryLine
    from app.models.reporting_taxonomy import ReportingTaxonomyLine

    # Input validations
    if entity_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid entity_id")

    entity = db.get(Entity, entity_id)
    if not entity:
        raise HTTPException(status_code=400, detail=f"Entity {entity_id} not found")

    try:
        datetime.date.fromisoformat(period_end)
    except ValueError:
        raise HTTPException(status_code=400, detail="period_end must be in YYYY-MM-DD format")

    if scenario_id is not None:
        scenario = db.get(Scenario, scenario_id)
        if not scenario:
            raise HTTPException(status_code=400, detail=f"Scenario {scenario_id} not found")

    # Delete existing rows for this slice
    db.query(AdjustmentBridgeRow).filter(
        AdjustmentBridgeRow.entity_id == entity_id,
        AdjustmentBridgeRow.period_end == period_end,
        AdjustmentBridgeRow.scenario_id == scenario_id,
    ).delete(synchronize_session=False)

    accounts = db.query(Account).filter(
        Account.entity_id == entity_id,
        Account.account_status == "active",
    ).all()

    # Build taxonomy lookup
    taxonomy_map: dict[int, str] = {}
    for acct in accounts:
        if acct.reporting_taxonomy_line_id:
            tax = db.get(ReportingTaxonomyLine, acct.reporting_taxonomy_line_id)
            if tax:
                taxonomy_map[acct.id] = tax.code

    # Aggregate JE balances per account
    posted_by_account: dict[int, Decimal] = {}
    draft_by_account: dict[int, Decimal] = {}

    je_q = db.query(JournalEntry).filter(
        JournalEntry.entity_id == entity_id,
        JournalEntry.entry_date <= period_end,
    )
    if scenario_id is not None:
        je_q = je_q.filter(JournalEntry.scenario_id == scenario_id)

    for je in je_q.all():
        for jel in db.query(JournalEntryLine).filter(JournalEntryLine.journal_entry_id == je.id).all():
            net = (jel.debit or Decimal("0")) - (jel.credit or Decimal("0"))
            if je.status == "posted":
                posted_by_account[jel.account_id] = posted_by_account.get(jel.account_id, Decimal("0")) + net
            else:
                draft_by_account[jel.account_id] = draft_by_account.get(jel.account_id, Decimal("0")) + net

    rows_created = 0
    for acct in accounts:
        posted = posted_by_account.get(acct.id, Decimal("0"))
        draft = draft_by_account.get(acct.id, Decimal("0"))
        adjusted = posted + draft

        row = AdjustmentBridgeRow(
            entity_id=entity_id,
            period_end=period_end,
            scenario_id=scenario_id,
            account_id=acct.id,
            account_number=acct.account_number,
            account_name=acct.account_name,
            account_type=acct.account_type,
            taxonomy_category=taxonomy_map.get(acct.id),
            fs_line=acct.account_name,
            adjustment_type=None,
            is_posted=False,
            is_included=True,
            source="coa_import",
            consolidation_group=None,
            imported_balance=Decimal("0"),
            posted_adjustments=posted,
            draft_adjustments=draft,
            excluded_adjustments=Decimal("0"),
            adjusted_balance=adjusted,
            variance=adjusted - Decimal("0"),
            prior_period_balance=None,
            budget_placeholder=None,
        )
        db.add(row)
        rows_created += 1

    db.flush()
    db.commit()

    return ComputeResult(
        entity_id=entity_id,
        period_end=period_end,
        scenario_id=scenario_id,
        rows_computed=rows_created,
        message=f"Computed {rows_created} bridge rows for entity {entity_id} as of {period_end}",
    )


# ---------------------------------------------------------------------------
# Row query endpoint (with slicers)
# ---------------------------------------------------------------------------

@router.get("/rows", response_model=list[AdjustmentBridgeRowOut])
def get_bridge_rows(
    entity_id: int,
    period_end: str | None = None,
    scenario_id: int | None = None,
    account_type: str | None = None,
    taxonomy_category: str | None = None,
    adjustment_type: str | None = None,
    source: str | None = None,
    is_posted: bool | None = None,
    is_included: bool | None = None,
    consolidation_group: str | None = None,
    db: Session = Depends(get_db),
):
    """Return cube rows with optional dimension slicers."""
    from app.models.adjustment_bridge import AdjustmentBridgeRow

    q = db.query(AdjustmentBridgeRow).filter(AdjustmentBridgeRow.entity_id == entity_id)
    if period_end:
        q = q.filter(AdjustmentBridgeRow.period_end == period_end)
    if scenario_id is not None:
        q = q.filter(AdjustmentBridgeRow.scenario_id == scenario_id)
    if account_type:
        q = q.filter(AdjustmentBridgeRow.account_type == account_type)
    if taxonomy_category:
        q = q.filter(AdjustmentBridgeRow.taxonomy_category == taxonomy_category)
    if adjustment_type:
        q = q.filter(AdjustmentBridgeRow.adjustment_type == adjustment_type)
    if source:
        q = q.filter(AdjustmentBridgeRow.source == source)
    if is_posted is not None:
        q = q.filter(AdjustmentBridgeRow.is_posted == is_posted)
    if is_included is not None:
        q = q.filter(AdjustmentBridgeRow.is_included == is_included)
    if consolidation_group:
        q = q.filter(AdjustmentBridgeRow.consolidation_group == consolidation_group)

    rows = q.order_by(AdjustmentBridgeRow.account_type, AdjustmentBridgeRow.account_name).all()
    return [AdjustmentBridgeRowOut.from_orm_row(r) for r in rows]


# ---------------------------------------------------------------------------
# Views CRUD
# ---------------------------------------------------------------------------

@router.get("/views", response_model=list[AdjustmentBridgeViewOut])
def list_bridge_views(entity_id: int, db: Session = Depends(get_db)):
    from app.models.adjustment_bridge import AdjustmentBridgeView
    views = db.query(AdjustmentBridgeView).filter(AdjustmentBridgeView.entity_id == entity_id).all()
    return [AdjustmentBridgeViewOut.from_orm_view(v) for v in views]


@router.post("/views", response_model=AdjustmentBridgeViewOut, status_code=201)
def create_bridge_view(body: AdjustmentBridgeViewCreate, db: Session = Depends(get_db)):
    from app.models.adjustment_bridge import AdjustmentBridgeView

    if body.is_default:
        db.query(AdjustmentBridgeView).filter(
            AdjustmentBridgeView.entity_id == body.entity_id,
            AdjustmentBridgeView.is_default == True,
        ).update({"is_default": False})

    view = AdjustmentBridgeView(
        entity_id=body.entity_id,
        name=body.name,
        description=body.description,
        is_default=body.is_default,
        row_dimensions=json.dumps(body.row_dimensions) if body.row_dimensions else None,
        column_dimensions=json.dumps(body.column_dimensions) if body.column_dimensions else None,
        slicer_config=json.dumps(body.slicer_config) if body.slicer_config else None,
        sort_config=json.dumps(body.sort_config) if body.sort_config else None,
        visible_measures=json.dumps(body.visible_measures) if body.visible_measures else None,
    )
    db.add(view)
    db.flush()
    db.refresh(view)
    return AdjustmentBridgeViewOut.from_orm_view(view)


@router.patch("/views/{view_id}", response_model=AdjustmentBridgeViewOut)
def update_bridge_view(view_id: int, body: AdjustmentBridgeViewUpdate, db: Session = Depends(get_db)):
    from app.models.adjustment_bridge import AdjustmentBridgeView
    view = db.get(AdjustmentBridgeView, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail=f"View {view_id} not found")

    if body.name is not None:
        view.name = body.name
    if body.description is not None:
        view.description = body.description
    if body.is_default is not None:
        if body.is_default:
            db.query(AdjustmentBridgeView).filter(
                AdjustmentBridgeView.entity_id == view.entity_id,
                AdjustmentBridgeView.is_default == True,
                AdjustmentBridgeView.id != view_id,
            ).update({"is_default": False})
        view.is_default = body.is_default
    if body.row_dimensions is not None:
        view.row_dimensions = json.dumps(body.row_dimensions)
    if body.column_dimensions is not None:
        view.column_dimensions = json.dumps(body.column_dimensions)
    if body.slicer_config is not None:
        view.slicer_config = json.dumps(body.slicer_config)
    if body.sort_config is not None:
        view.sort_config = json.dumps(body.sort_config)
    if body.visible_measures is not None:
        view.visible_measures = json.dumps(body.visible_measures)

    db.flush()
    db.refresh(view)
    return AdjustmentBridgeViewOut.from_orm_view(view)


@router.delete("/views/{view_id}", status_code=204)
def delete_bridge_view(view_id: int, db: Session = Depends(get_db)):
    from app.models.adjustment_bridge import AdjustmentBridgeView
    view = db.get(AdjustmentBridgeView, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail=f"View {view_id} not found")
    db.delete(view)
    db.flush()
