from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import EntityCreate, EntityOut, Page
from app.models.entity import Entity

router = APIRouter(prefix="/entities", tags=["entities"])


@router.post("/", response_model=EntityOut, status_code=201)
def create_entity(body: EntityCreate, db: Session = Depends(get_db)):
    entity = Entity(
        code=body.code,
        name=body.name,
        entity_type=body.entity_type,
        parent_id=body.parent_id,
        currency=body.currency,
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
):
    q = db.query(Entity)
    if entity_type is not None:
        q = q.filter(Entity.entity_type == entity_type)
    if active is not None:
        q = q.filter(Entity.active == active)
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
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
    return entity
