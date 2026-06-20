"""Sprint A: Domain model correction — entity-scoped FSLI mappings

Adds entity_id to view_account_overrides and reporting_view_id to
reporting_taxonomy_lines so FSLI mapping is per-entity+view rather than
globally stored on the account.

Revision ID: sprint_a_domain_model_fsli_mapping
Revises: ('2026_06_17_add_audit_logs', '2026_06_17_merge_heads')
Create Date: 2026-06-19 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "sprint_a_domain_model_fsli_mapping"
down_revision: Union[str, Sequence[str]] = (
    "2026_06_17_add_audit_logs",
    "2026_06_17_merge_heads",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- view_account_overrides: add entity_id ---
    op.add_column(
        "view_account_overrides",
        sa.Column(
            "entity_id",
            sa.Integer(),
            sa.ForeignKey("entities.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )

    # Back-populate entity_id from the account's entity_id for existing rows
    op.execute(
        """
        UPDATE view_account_overrides
        SET entity_id = (
            SELECT a.entity_id
            FROM accounts a
            WHERE a.id = view_account_overrides.account_id
        )
        """
    )

    # Drop old unique constraint and replace with entity-scoped one
    op.drop_constraint("uq_vao_view_account", "view_account_overrides", type_="unique")
    op.create_unique_constraint(
        "uq_vao_entity_view_account",
        "view_account_overrides",
        ["entity_id", "view_id", "account_id"],
    )

    # --- reporting_taxonomy_lines: add reporting_view_id ---
    op.add_column(
        "reporting_taxonomy_lines",
        sa.Column(
            "reporting_view_id",
            sa.Integer(),
            sa.ForeignKey("reporting_taxonomy_views.id"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("reporting_taxonomy_lines", "reporting_view_id")

    op.drop_constraint("uq_vao_entity_view_account", "view_account_overrides", type_="unique")
    op.create_unique_constraint(
        "uq_vao_view_account",
        "view_account_overrides",
        ["view_id", "account_id"],
    )

    op.drop_column("view_account_overrides", "entity_id")
