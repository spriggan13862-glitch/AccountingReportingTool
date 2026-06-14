from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from app.api.deps import get_db, get_current_user
from app.api.schemas import EntityCreate, EntityOut, Page
from app.models.entity import Entity
from app.models.account import Account
from app.models.import_batch import ImportBatch


def _has_accounting_data(db: Session, entity_id: int) -> list[str]:
    """Return a list of data types that reference this entity (non-empty = cannot delete)."""
    from app.models.journal_entry import JournalEntry
    from app.models.import_batch import ImportBatch
    from app.models.accounting_period import AccountingPeriod

    blockers: list[str] = []
    if db.query(JournalEntry).filter(JournalEntry.entity_id == entity_id).count():
        blockers.append("journal entries")
    if db.query(ImportBatch).filter(ImportBatch.entity_id == entity_id).count():
        blockers.append("import batches")
    if db.query(AccountingPeriod).filter(AccountingPeriod.entity_id == entity_id).count():
        blockers.append("accounting periods")
    return blockers


class EntityUpdate(BaseModel):
    name: str | None = None
    entity_type: str | None = None
    parent_id: int | None = None
    currency: str | None = None
    active: bool | None = None
    fiscal_year_end_month: int | None = None
    fiscal_year_convention: str | None = None

router = APIRouter(prefix="/entities", tags=["entities"])


@router.post("/", response_model=EntityOut, status_code=201)
def create_entity(body: EntityCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    entity = Entity(
        code=body.code,
        name=body.name,
        entity_type=body.entity_type,
        parent_id=body.parent_id,
        currency=body.currency,
        fiscal_year_end_month=body.fiscal_year_end_month,
        fiscal_year_convention=body.fiscal_year_convention,
        organization_id=current_user.organization_id if current_user else None,
    )
    db.add(entity)
    db.flush()
    db.refresh(entity)
    return entity


@router.get("/", response_model=Page[EntityOut])
def list_entities(
    entity_type: str | None = None,
    active: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Entity)
    if current_user is not None:
        q = q.filter(Entity.organization_id == current_user.organization_id)
    if entity_type is not None:
        q = q.filter(Entity.entity_type == entity_type)
    if active is not None:
        q = q.filter(Entity.active == active)
    total = q.count()
    entities = q.offset((page - 1) * page_size).limit(page_size).all()

    entity_ids = [e.id for e in entities]
    account_counts = {
        row.entity_id: row.cnt
        for row in db.query(Account.entity_id, func.count(Account.id).label("cnt"))
        .filter(Account.entity_id.in_(entity_ids))
        .group_by(Account.entity_id)
        .all()
    }
    import_counts = {
        row.entity_id: row.cnt
        for row in db.query(ImportBatch.entity_id, func.count(ImportBatch.id).label("cnt"))
        .filter(ImportBatch.entity_id.in_(entity_ids))
        .group_by(ImportBatch.entity_id)
        .all()
    }

    items = []
    for e in entities:
        out = EntityOut.model_validate(e)
        out.account_count = account_counts.get(e.id, 0)
        out.import_count = import_counts.get(e.id, 0)
        items.append(out)

    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.get("/{entity_id}", response_model=EntityOut)
def get_entity(entity_id: int, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")
    out = EntityOut.model_validate(entity)
    out.account_count = db.query(func.count(Account.id)).filter(Account.entity_id == entity_id).scalar() or 0
    out.import_count = db.query(func.count(ImportBatch.id)).filter(ImportBatch.entity_id == entity_id).scalar() or 0
    return out


@router.patch("/{entity_id}", response_model=EntityOut)
def update_entity(entity_id: int, body: EntityUpdate, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")
    if body.name is not None:
        entity.name = body.name
    if body.entity_type is not None:
        entity.entity_type = body.entity_type
    if body.parent_id is not None:
        entity.parent_id = body.parent_id
    if body.currency is not None:
        entity.currency = body.currency
    if body.active is not None:
        entity.active = body.active
    if body.fiscal_year_end_month is not None:
        entity.fiscal_year_end_month = body.fiscal_year_end_month
    if body.fiscal_year_convention is not None:
        entity.fiscal_year_convention = body.fiscal_year_convention
    db.flush()
    db.refresh(entity)
    db.commit()
    return entity


@router.delete("/{entity_id}", status_code=204)
def delete_entity(entity_id: int, db: Session = Depends(get_db)):
    """
    Permanently delete an entity.
    Blocked if the entity has any journal entries, import batches, or accounting periods.
    Use PATCH active=false to deactivate instead of deleting.
    """
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found")
    blockers = _has_accounting_data(db, entity_id)
    if blockers:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete entity: it has existing {', '.join(blockers)}. "
                   f"Deactivate it instead to preserve history.",
        )
    db.delete(entity)
    db.commit()
