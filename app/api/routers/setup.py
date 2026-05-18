"""
First-run setup endpoint.

Available ONLY when the users table is empty (no users exist).
Returns HTTP 409 once any user has been created.

This allows a fresh deployment to bootstrap the first admin without needing
shell access — useful for Docker-based alpha deployments.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.logging_config import get_logger
from app.core.security import hash_password

router = APIRouter(prefix="/setup", tags=["setup"])
logger = get_logger(__name__)


class FirstAdminCreate(BaseModel):
    organization_name: str
    admin_email: str
    admin_full_name: str = "Administrator"
    admin_password: str


class SetupStatusOut(BaseModel):
    setup_complete: bool
    user_count: int


@router.get("/status", response_model=SetupStatusOut)
def setup_status(db: Session = Depends(get_db)):
    """Check whether first-admin setup has been completed."""
    from app.models.user import User
    count = db.query(User).count()
    return SetupStatusOut(setup_complete=count > 0, user_count=count)


@router.post("/admin", status_code=201)
def create_first_admin(body: FirstAdminCreate, db: Session = Depends(get_db)):
    """
    Create the first organization and admin user.

    Returns HTTP 409 if any users already exist (setup already completed).
    Returns HTTP 400 if the password is too short (< 8 characters).
    """
    from app.models.user import User
    from app.services.organization_service import create_organization, seed_default_roles
    from app.services.user_service import create_user, assign_role

    existing = db.query(User).count()
    if existing > 0:
        raise HTTPException(
            status_code=409,
            detail="Setup already completed. Users exist. Use the admin panel to manage users.",
        )

    if len(body.admin_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    slug = (
        body.organization_name.lower()
        .replace(" ", "-")
        .replace(".", "")[:30]
    )

    org = create_organization(db, name=body.organization_name, slug=slug)
    seed_default_roles(db)

    admin = create_user(
        db,
        organization_id=org.id,
        email=body.admin_email.lower().strip(),
        full_name=body.admin_full_name,
        hashed_password=hash_password(body.admin_password),
        is_superuser=True,
    )
    assign_role(db, user_id=admin.id, role_name="admin", organization_id=org.id)

    logger.info(
        "first_admin_created org=%s email=%s user_id=%d",
        org.name, admin.email, admin.id,
    )

    return {
        "detail": "Setup complete.",
        "organization_id": org.id,
        "organization_name": org.name,
        "admin_user_id": admin.id,
        "admin_email": admin.email,
    }
