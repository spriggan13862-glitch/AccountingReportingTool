"""Tier 1.9 — Adjustment Bridge skeleton tables

Creates:
  - adjustment_bridge_rows   (pivot/cube workpaper data)
  - adjustment_bridge_views  (saved view configurations)

Revision ID: 012
Revises: 011
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "adjustment_bridge_rows" not in existing_tables:
        op.create_table(
            "adjustment_bridge_rows",
            sa.Column("id", sa.Integer, primary_key=True),
            # Core dimensions
            sa.Column("entity_id", sa.Integer, sa.ForeignKey("entities.id"), nullable=False),
            sa.Column("period_end", sa.String(20), nullable=False),
            sa.Column("scenario_id", sa.Integer, sa.ForeignKey("scenarios.id"), nullable=True),
            sa.Column("account_id", sa.Integer, sa.ForeignKey("accounts.id"), nullable=True),
            sa.Column("account_number", sa.String(50), nullable=True),
            sa.Column("account_name", sa.String(200), nullable=True),
            sa.Column("account_type", sa.String(30), nullable=True),
            sa.Column("taxonomy_category", sa.String(50), nullable=True),
            sa.Column("fs_line", sa.String(100), nullable=True),
            # Pivot dimensions
            sa.Column("adjustment_type", sa.String(50), nullable=True),
            sa.Column("is_posted", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("is_included", sa.Boolean, nullable=False, server_default="1"),
            sa.Column("source", sa.String(50), nullable=True),
            sa.Column("consolidation_group", sa.String(50), nullable=True),
            # Measures
            sa.Column("imported_balance", sa.Numeric(18, 2), nullable=True),
            sa.Column("posted_adjustments", sa.Numeric(18, 2), nullable=True),
            sa.Column("draft_adjustments", sa.Numeric(18, 2), nullable=True),
            sa.Column("excluded_adjustments", sa.Numeric(18, 2), nullable=True),
            sa.Column("adjusted_balance", sa.Numeric(18, 2), nullable=True),
            sa.Column("variance", sa.Numeric(18, 2), nullable=True),
            sa.Column("prior_period_balance", sa.Numeric(18, 2), nullable=True),
            sa.Column("budget_placeholder", sa.Numeric(18, 2), nullable=True),
            # Audit
            sa.Column("computed_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
            sa.Column("notes", sa.Text, nullable=True),
        )
        op.create_index("ix_ab_rows_entity_period", "adjustment_bridge_rows", ["entity_id", "period_end"])
        op.create_index("ix_ab_rows_scenario", "adjustment_bridge_rows", ["scenario_id"])

    if "adjustment_bridge_views" not in existing_tables:
        op.create_table(
            "adjustment_bridge_views",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("entity_id", sa.Integer, sa.ForeignKey("entities.id"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("is_default", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("row_dimensions", sa.Text, nullable=True),
            sa.Column("column_dimensions", sa.Text, nullable=True),
            sa.Column("slicer_config", sa.Text, nullable=True),
            sa.Column("sort_config", sa.Text, nullable=True),
            sa.Column("visible_measures", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        )


def downgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "adjustment_bridge_views" in existing_tables:
        op.drop_table("adjustment_bridge_views")
    if "adjustment_bridge_rows" in existing_tables:
        op.drop_table("adjustment_bridge_rows")
