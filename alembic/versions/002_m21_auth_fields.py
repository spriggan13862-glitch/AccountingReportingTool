"""M21 auth fields — add failed_login_attempts and locked_at to users.

Revision ID: 002
Revises: 001
Create Date: 2026-05-18
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_cols = {c["name"] for c in inspector.get_columns("users")}

    if "failed_login_attempts" not in existing_cols:
        op.add_column(
            "users",
            sa.Column(
                "failed_login_attempts",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )
    if "locked_at" not in existing_cols:
        op.add_column(
            "users",
            sa.Column("locked_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("users", "locked_at")
    op.drop_column("users", "failed_login_attempts")
