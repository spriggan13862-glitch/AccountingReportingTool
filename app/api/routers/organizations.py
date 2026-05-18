"""Organizations router."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import EntityOut, OrganizationCreate, OrganizationOut
from app.services.organization_service import (
    create_organization,
    get_org_entities,
    get_organization_or_raise,
    list_organizations,
)

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("/", response_model=OrganizationOut, status_code=201)
def create_org(body: OrganizationCreate, db: Session = Depends(get_db)):
    return create_organization(db, name=body.name, slug=body.slug)


@router.get("/", response_model=list[OrganizationOut])
def list_orgs(db: Session = Depends(get_db)):
    return list_organizations(db)


@router.get("/{org_id}", response_model=OrganizationOut)
def get_org(org_id: int, db: Session = Depends(get_db)):
    return get_organization_or_raise(db, org_id)


@router.get("/{org_id}/entities", response_model=list[EntityOut])
def get_entities_for_org(org_id: int, db: Session = Depends(get_db)):
    get_organization_or_raise(db, org_id)  # 404 if not found
    return get_org_entities(db, org_id)
