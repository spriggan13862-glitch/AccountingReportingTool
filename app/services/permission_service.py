"""
Permission service.

Design
------
Permissions are hardcoded in ROLE_PERMISSIONS — no DB round-trip required for
the mapping itself.  A DB query is needed only to look up which roles a user
holds (UserRole rows).

Superusers bypass all permission and organization checks.

Permission strings
------------------
  create_journal_entries   — create draft or directly-posted JEs
  post_journal_entries     — post (or transition draft→posted) JEs
  reverse_entries          — reverse posted JEs
  manage_periods           — create, close, and reopen accounting periods
  manage_users             — create users and assign roles
  view_reports             — read trial balance, FS, consolidation reports
  manage_mappings          — create and edit FS line-item account mappings
  run_consolidations       — run group/consolidated reporting

Role defaults
-------------
  admin       — all permissions
  cfo         — everything except manage_users
  accountant  — create_journal_entries, post_journal_entries, view_reports, manage_mappings
  reviewer    — post_journal_entries, reverse_entries, view_reports, run_consolidations
  viewer      — view_reports, run_consolidations   (read-only)
  auditor     — view_reports, run_consolidations   (read-only, separate from viewer for segregation)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from app.models.user import User

ALL_PERMISSIONS: frozenset[str] = frozenset({
    "create_journal_entries",
    "post_journal_entries",
    "reverse_entries",
    "manage_periods",
    "manage_users",
    "view_reports",
    "manage_mappings",
    "run_consolidations",
})

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "admin": ALL_PERMISSIONS,
    "cfo": frozenset({
        "create_journal_entries",
        "post_journal_entries",
        "reverse_entries",
        "manage_periods",
        "view_reports",
        "manage_mappings",
        "run_consolidations",
    }),
    "accountant": frozenset({
        "create_journal_entries",
        "post_journal_entries",
        "view_reports",
        "manage_mappings",
    }),
    "reviewer": frozenset({
        "post_journal_entries",
        "reverse_entries",
        "view_reports",
        "run_consolidations",
    }),
    "viewer":  frozenset({"view_reports", "run_consolidations"}),
    "auditor": frozenset({"view_reports", "run_consolidations"}),
}

DEFAULT_ROLES: list[tuple[str, str]] = [
    ("admin",      "Full access to all operations"),
    ("cfo",        "Full accounting access; cannot manage users"),
    ("accountant", "Create and post journal entries; manage mappings"),
    ("reviewer",   "Post and reverse journal entries; read-only reports"),
    ("viewer",     "Read-only access to reports"),
    ("auditor",    "Read-only access to reports (segregated from viewer)"),
]


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class PermissionDeniedError(PermissionError):
    """Raised when a user lacks the required permission."""


class OrganizationAccessError(PermissionError):
    """Raised when a user attempts to access data from another organization."""


# ---------------------------------------------------------------------------
# Permission helpers
# ---------------------------------------------------------------------------

def get_user_permissions(db: Session, user: "User") -> frozenset[str]:
    """Return the union of all permissions across the user's assigned roles."""
    if user.is_superuser:
        return ALL_PERMISSIONS

    from app.models.role import UserRole
    roles = (
        db.query(UserRole)
        .filter(UserRole.user_id == user.id)
        .all()
    )
    return frozenset().union(
        *(ROLE_PERMISSIONS.get(r.role_name, frozenset()) for r in roles)
    )


def user_has_permission(db: Session, user: "User", permission: str) -> bool:
    """Return True if the user holds the named permission."""
    return permission in get_user_permissions(db, user)


def require_permission(db: Session, user: "User", permission: str) -> None:
    """Raise PermissionDeniedError if the user does not hold the named permission."""
    if not user_has_permission(db, user, permission):
        raise PermissionDeniedError(
            f"User '{user.email}' does not have permission '{permission}'. "
            f"Contact your administrator to have a role assigned."
        )


# ---------------------------------------------------------------------------
# Organization access guard
# ---------------------------------------------------------------------------

def check_entity_org_access(db: Session, user: "User", entity_id: int) -> None:
    """
    Raise OrganizationAccessError if entity_id belongs to a different organization
    than the user's organization.

    If the entity has no organization_id (legacy / unowned data) the check
    is skipped so existing records remain accessible.
    Superusers always pass.
    """
    if user.is_superuser:
        return

    from app.models.entity import Entity
    entity = db.get(Entity, entity_id)
    if entity is None or entity.organization_id is None:
        return

    if entity.organization_id != user.organization_id:
        raise OrganizationAccessError(
            f"User '{user.email}' (org={user.organization_id}) cannot access "
            f"entity {entity_id} (org={entity.organization_id})"
        )
