"""User and role-assignment service."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from app.models.role import UserRole
from app.models.user import User
from app.services.permission_service import (
    ROLE_PERMISSIONS,
    OrganizationAccessError,
    PermissionDeniedError,
    get_user_permissions,
    require_permission,
)

if TYPE_CHECKING:
    pass


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class UserNotFoundError(LookupError):
    pass


class RoleNotFoundError(LookupError):
    pass


# ---------------------------------------------------------------------------
# User CRUD
# ---------------------------------------------------------------------------

def create_user(
    db: Session,
    organization_id: int,
    email: str,
    full_name: str,
    hashed_password: str | None = None,
    is_active: bool = True,
    is_superuser: bool = False,
    acting_user: User | None = None,
) -> User:
    """
    Create a user within an organization.

    Requires `manage_users` permission when acting_user is supplied.
    The acting_user must belong to the same organization (superusers exempt).
    """
    if acting_user is not None:
        require_permission(db, acting_user, "manage_users")
        if not acting_user.is_superuser and acting_user.organization_id != organization_id:
            raise OrganizationAccessError(
                f"User '{acting_user.email}' cannot create users in org {organization_id}"
            )

    user = User(
        organization_id=organization_id,
        email=email,
        full_name=full_name,
        hashed_password=hashed_password,
        is_active=is_active,
        is_superuser=is_superuser,
    )
    db.add(user)
    db.flush()
    db.refresh(user)
    return user


def get_user_or_raise(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise UserNotFoundError(f"User id={user_id} not found")
    return user


def list_users(
    db: Session,
    organization_id: int,
    acting_user: User | None = None,
) -> list[User]:
    """List users within an organization."""
    if acting_user is not None:
        require_permission(db, acting_user, "manage_users")
        if not acting_user.is_superuser and acting_user.organization_id != organization_id:
            raise OrganizationAccessError(
                f"User '{acting_user.email}' cannot list users in org {organization_id}"
            )
    return (
        db.query(User)
        .filter(User.organization_id == organization_id)
        .order_by(User.id)
        .all()
    )


# ---------------------------------------------------------------------------
# Role assignment
# ---------------------------------------------------------------------------

def assign_role(
    db: Session,
    user_id: int,
    role_name: str,
    organization_id: int,
    entity_id: int | None = None,
    acting_user: User | None = None,
) -> UserRole:
    """
    Assign a named role to a user within an organization.

    role_name must be one of the known roles in ROLE_PERMISSIONS.
    Requires `manage_users` permission when acting_user is supplied.
    """
    if role_name not in ROLE_PERMISSIONS:
        raise RoleNotFoundError(
            f"Unknown role '{role_name}'. "
            f"Valid roles: {sorted(ROLE_PERMISSIONS.keys())}"
        )

    if acting_user is not None:
        require_permission(db, acting_user, "manage_users")
        if not acting_user.is_superuser and acting_user.organization_id != organization_id:
            raise OrganizationAccessError(
                f"User '{acting_user.email}' cannot assign roles in org {organization_id}"
            )

    # Return existing assignment if it already exists (idempotent)
    existing = (
        db.query(UserRole)
        .filter(
            UserRole.user_id == user_id,
            UserRole.role_name == role_name,
            UserRole.organization_id == organization_id,
            UserRole.entity_id == entity_id,
        )
        .first()
    )
    if existing:
        return existing

    ur = UserRole(
        user_id=user_id,
        role_name=role_name,
        organization_id=organization_id,
        entity_id=entity_id,
    )
    db.add(ur)
    db.flush()
    db.refresh(ur)
    return ur


def remove_role(
    db: Session,
    user_role_id: int,
    acting_user: User | None = None,
) -> None:
    """Remove a role assignment."""
    ur = db.get(UserRole, user_role_id)
    if ur is None:
        return

    if acting_user is not None:
        require_permission(db, acting_user, "manage_users")
        if not acting_user.is_superuser and acting_user.organization_id != ur.organization_id:
            raise OrganizationAccessError(
                f"User '{acting_user.email}' cannot remove roles in org {ur.organization_id}"
            )

    db.delete(ur)
    db.flush()
