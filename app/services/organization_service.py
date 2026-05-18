"""Organization and entity-ownership service."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.entity import Entity
from app.models.organization import Organization
from app.models.role import Role
from app.services.permission_service import DEFAULT_ROLES


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class OrganizationNotFoundError(LookupError):
    pass


# ---------------------------------------------------------------------------
# Organization CRUD
# ---------------------------------------------------------------------------

def create_organization(db: Session, name: str, slug: str) -> Organization:
    """Create a new organization. Slug must be globally unique."""
    org = Organization(name=name, slug=slug, is_active=True)
    db.add(org)
    db.flush()
    db.refresh(org)
    return org


def get_organization_or_raise(db: Session, org_id: int) -> Organization:
    org = db.get(Organization, org_id)
    if org is None:
        raise OrganizationNotFoundError(f"Organization id={org_id} not found")
    return org


def list_organizations(db: Session) -> list[Organization]:
    return db.query(Organization).order_by(Organization.id).all()


# ---------------------------------------------------------------------------
# Entity helpers
# ---------------------------------------------------------------------------

def get_org_entities(db: Session, org_id: int) -> list[Entity]:
    """Return all entities owned by the organization."""
    return (
        db.query(Entity)
        .filter(Entity.organization_id == org_id)
        .order_by(Entity.code)
        .all()
    )


# ---------------------------------------------------------------------------
# Role seeding
# ---------------------------------------------------------------------------

def seed_default_roles(db: Session) -> list[Role]:
    """
    Ensure all default roles exist in the database.
    Safe to call multiple times (idempotent — skips existing names).
    """
    created: list[Role] = []
    for name, description in DEFAULT_ROLES:
        existing = db.query(Role).filter(Role.name == name).first()
        if existing is None:
            role = Role(name=name, description=description)
            db.add(role)
            created.append(role)
    db.flush()
    return created
