"""Sprint P2: ReportingView presentation-only model

Adds reporting_views and reporting_view_rows tables. The new ReportingView
is presentation-layer only; classification stays in the Sprint O Taxonomy
models. Legacy ReportingTaxonomyView remains in place during transition.

Revision ID: sprint_p2_reporting_view
Revises: sprint_o1_taxonomy_foundation
Create Date: 2026-06-20
"""
from alembic import op
import sqlalchemy as sa


revision = "sprint_p2_reporting_view"
down_revision = "sprint_o1_taxonomy_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reporting_views",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("taxonomy_id", sa.Integer(), sa.ForeignKey("taxonomies.id"), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("parent_view_id", sa.Integer(), sa.ForeignKey("reporting_views.id"), nullable=True),
        sa.Column("column_config", sa.JSON(), nullable=True),
        sa.Column("format_config", sa.JSON(), nullable=True),
        sa.Column("comparative_config", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("code", name="uq_reporting_view_code"),
    )
    op.create_index("ix_reporting_views_taxonomy_id", "reporting_views", ["taxonomy_id"])

    op.create_table(
        "reporting_view_rows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("view_id", sa.Integer(), sa.ForeignKey("reporting_views.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("section_label", sa.String(120), nullable=True),
        sa.Column("row_type", sa.String(30), nullable=False, server_default="taxonomy_node"),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("taxonomy_node_id", sa.Integer(), sa.ForeignKey("taxonomy_nodes.id"), nullable=True),
        sa.Column("formula", sa.Text(), nullable=True),
        sa.Column("indent_level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_bold", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_italic", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("underline_style", sa.String(20), nullable=True),
        sa.Column("sign_behavior", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_reporting_view_rows_view_id", "reporting_view_rows", ["view_id"])


def downgrade() -> None:
    op.drop_index("ix_reporting_view_rows_view_id", table_name="reporting_view_rows")
    op.drop_table("reporting_view_rows")
    op.drop_index("ix_reporting_views_taxonomy_id", table_name="reporting_views")
    op.drop_table("reporting_views")
