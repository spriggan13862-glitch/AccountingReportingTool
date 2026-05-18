"""Baseline schema — creates all tables for a fresh installation.

For databases that were already created by Base.metadata.create_all() (i.e.
existing development or staging environments), run:

    alembic stamp 001

That marks the DB as already at this revision without re-running DDL.
New installations run this migration normally via `alembic upgrade head`.

Revision ID: 001
Revises: None
Create Date: 2026-05-18
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables if they do not already exist (idempotent for existing DBs)."""
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = set(inspector.get_table_names())

    # Only create schema on a fresh database. Existing databases should be
    # stamped with `alembic stamp 001` instead of running this upgrade.
    if "users" in existing:
        # Tables already exist — nothing to do. Stamp handles version tracking.
        return

    from app.database import Base
    Base.metadata.create_all(bind)


def downgrade() -> None:
    """Drop all application tables (destructive — use only in development)."""
    from app.database import Base
    bind = op.get_bind()
    Base.metadata.drop_all(bind)
