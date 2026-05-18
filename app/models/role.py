from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class Role(Base):
    """
    Catalogue of named roles.  Permissions are defined in code (permission_service)
    rather than stored in the DB, keeping them fast and auditable in version control.
    """
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    name = Column(String(50), nullable=False, unique=True)
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class UserRole(Base):
    """
    Assignment of a role to a user within an organization.

    entity_id is optional: when set the role applies only to that entity;
    when NULL it applies org-wide.  Permission checks union all of a user's
    UserRole records regardless of entity scope.
    """
    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "role_name", "organization_id", "entity_id",
            name="uq_user_role_org_entity",
        ),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role_name = Column(String(50), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
